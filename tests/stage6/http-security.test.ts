import { describe, expect, it, vi } from "vitest";

import type { Stage6ServerConfig } from "@/stage6/server/config";
import { Stage6ServerExecutionError } from "@/stage6/server/errors";
import { createStage6AgentPostHandler } from "@/stage6/server/handler";
import {
  FixedWindowRateLimiter,
  KeyedConcurrencyLimiter,
  projectStage6Telemetry,
  readJsonBodyWithLimit,
  resolveForwardedSourceKey,
  STAGE6_DEFAULT_HTTP_LIMITS,
  STAGE6_SERVER_GUARD_VERSION,
} from "@/stage6";
import { makeRoundRequest } from "./transport-contract.test";

describe("Stage 6 HTTP and observability guards", () => {
  it("returns before reading a body or calling an executor while the gate is closed", async () => {
    const execute = vi.fn();
    const handler = createStage6AgentPostHandler({
      config: config("closed"),
      execute,
    });
    const request = new Request("http://localhost/api/agent", {
      method: "POST",
      headers: { "content-type": "text/plain" },
      body: "API_KEY=must-not-be-read",
    });

    const response = await handler(request);
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(body).toMatchObject({
      outcomeKind: "error",
      error: { code: "live_api_gate_closed", retryable: false },
    });
    expect(JSON.stringify(body)).not.toContain("API_KEY");
    expect(execute).not.toHaveBeenCalled();
  });

  it("enforces content type, byte size, and strict request parsing", async () => {
    const invalidType = await readJsonBodyWithLimit(
      new Request("http://localhost", { method: "POST", body: "{}" }),
      100,
    );
    expect(invalidType).toEqual({ ok: false, code: "invalid_content_type" });

    const tooLarge = await readJsonBodyWithLimit(
      jsonRequest({ value: "x".repeat(100) }),
      20,
    );
    expect(tooLarge).toEqual({ ok: false, code: "payload_too_large" });

    const valid = await readJsonBodyWithLimit(jsonRequest({ ok: true }), 100);
    expect(valid).toEqual({ ok: true, value: { ok: true } });
  });

  it("limits fixed-window rate and keyed concurrency deterministically", () => {
    let now = 1_000;
    const rate = new FixedWindowRateLimiter(2, 60_000, () => now);
    expect(rate.check("session").allowed).toBe(true);
    expect(rate.check("session").allowed).toBe(true);
    expect(rate.check("session").allowed).toBe(false);
    now += 60_000;
    expect(rate.check("session").allowed).toBe(true);

    const concurrency = new KeyedConcurrencyLimiter(2, 1);
    const releaseA = concurrency.tryAcquire("session-a");
    expect(releaseA).not.toBeNull();
    expect(concurrency.tryAcquire("session-a")).toBeNull();
    const releaseB = concurrency.tryAcquire("session-b");
    expect(releaseB).not.toBeNull();
    expect(concurrency.tryAcquire("session-c")).toBeNull();
    releaseA?.();
    expect(concurrency.tryAcquire("session-a")).not.toBeNull();
    releaseB?.();
  });

  it("bounds rate-limit keys and rejects spoofed source labels", () => {
    const rate = new FixedWindowRateLimiter(2, 60_000, () => 1_000, 1);
    expect(rate.check("first").allowed).toBe(true);
    expect(rate.check("second").allowed).toBe(false);

    expect(
      resolveForwardedSourceKey(
        new Request("http://localhost", {
          headers: { "x-forwarded-for": "203.0.113.7, 10.0.0.1" },
        }),
      ),
    ).toBe("203.0.113.7");
    expect(
      resolveForwardedSourceKey(
        new Request("http://localhost", {
          headers: { "x-forwarded-for": "attacker-controlled-label" },
        }),
      ),
    ).toBe("unidentified-source");
  });

  it("projects telemetry through an explicit allowlist", () => {
    const input = {
      requestId: "request-1",
      operationId: "operation-1",
      stageInstanceId: "stage-1",
      inputFingerprintDigest: `sha256:${"a".repeat(64)}`,
      capability: "extractUserPrinciple",
      requestedMode: "live" as const,
      resolvedMode: "unavailable" as const,
      fallbackReason: "fake_failure",
      resultType: "error",
      schemaValidationStatus: "not_run" as const,
      safetyValidationStatus: "not_run" as const,
      promptVersion: "0.1.0",
      adapterVersion: null,
      resultSchemaVersion: "0.1.0",
      contentBundleVersion: "0.1.0",
      untrustedUserText: "private user text",
      internalExcerpt: "private source text",
      apiKey: "secret",
    };

    const projected = projectStage6Telemetry(input);
    const serialized = JSON.stringify(projected);
    expect(serialized).not.toContain("private user text");
    expect(serialized).not.toContain("private source text");
    expect(serialized).not.toContain("secret");
    expect(projected).toMatchObject({
      requestId: "request-1",
      inputTokens: 0,
      outputTokens: 0,
    });
  });

  it("never exposes executor exceptions or invalid artifacts", async () => {
    const handler = createStage6AgentPostHandler({
      config: config("open"),
      execute: async () => {
        throw new Error("provider raw body and API_KEY=secret");
      },
    });
    const response = await handler(jsonRequest(makeRoundRequest()));
    const body = await response.text();

    expect(response.status).toBe(503);
    expect(body).toContain("internal_error");
    expect(body).not.toContain("provider raw body");
    expect(body).not.toContain("secret");
  });

  it.each([
    ["invalid_request", 400],
    ["idempotency_conflict", 409],
    ["budget_state_mismatch", 409],
    ["request_cancelled", 409],
    ["content_gate_unavailable", 503],
  ] as const)("maps %s to a stable HTTP response", async (code, status) => {
    const handler = createStage6AgentPostHandler({
      config: config("open"),
      execute: async () => {
        throw new Stage6ServerExecutionError(
          code,
          "internal execution detail that must not be reflected",
        );
      },
    });

    const response = await handler(jsonRequest(makeRoundRequest()));
    const body = await response.json();

    expect(response.status).toBe(status);
    expect(body).toMatchObject({
      outcomeKind: "error",
      error: { code, retryable: false },
    });
    expect(JSON.stringify(body)).not.toContain("internal execution detail");
  });
});

function config(liveGate: "closed" | "open"): Stage6ServerConfig {
  return {
    guardVersion: STAGE6_SERVER_GUARD_VERSION,
    liveGate,
    providerPolicyAccepted: liveGate === "open",
    limits: STAGE6_DEFAULT_HTTP_LIMITS,
  };
}

function jsonRequest(value: unknown): Request {
  return new Request("http://localhost/api/agent", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(value),
  });
}

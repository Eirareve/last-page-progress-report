import { describe, expect, it, vi } from "vitest";

import type { Stage6ProviderAttemptRequest } from "@/stage6";
import { buildPortraitShiftSummaryPrompt } from "@/stage6";
import {
  parseDeepSeekServerConfig,
} from "@/stage6/deepseek/config";
import { DeepSeekOpenAICompatibleTransport } from "@/stage6/deepseek/transport";
import { makePortraitSummaryInput } from "../fixtures/agent";

const TEST_API_KEY = "sk-test-only-not-a-secret-123456";

describe("DeepSeek OpenAI-compatible transport", () => {
  it("sends JSON mode to the approved endpoint without serializing the credential", async () => {
    const requests: Array<{
      input: URL | RequestInfo;
      init?: RequestInit;
    }> = [];
    const fetchSpy = vi.fn(async (input: URL | RequestInfo, init?: RequestInit) => {
      requests.push({ input, init });
      return successResponse({ answer: "ok" });
    });
    const transport = makeTransport(fetchSpy as typeof fetch);

    const outcome = await transport.execute(
      makeRequest(),
      new AbortController().signal,
    );

    expect(outcome).toMatchObject({
      outcomeKind: "candidate",
      candidate: { answer: "ok" },
      observation: {
        inputTokens: 12,
        outputTokens: 3,
        estimatedCostUsdMicros: 8,
      },
    });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [{ input: url, init }] = requests;
    expect(url).toBe("https://api.deepseek.com/chat/completions");
    expect(new Headers(init?.headers).get("authorization")).toBe(
      `Bearer ${TEST_API_KEY}`,
    );
    const bodyText = String(init?.body);
    const body = JSON.parse(bodyText) as Record<string, unknown>;
    expect(body).toMatchObject({
      model: "deepseek-v4-pro",
      response_format: { type: "json_object" },
      thinking: { type: "disabled" },
      stream: false,
    });
    expect(bodyText).toContain("Draft 7 JSON Schema");
    expect(bodyText).not.toContain(TEST_API_KEY);
  });

  it.each([
    [429, "rate_limited"],
    [408, "timeout"],
    [500, "network_error"],
    [401, "invalid_output"],
  ] as const)("maps HTTP %i to %s without reading the provider error body", async (status, code) => {
    const transport = makeTransport(
      (async () =>
        new Response("provider raw error that must not escape", { status })) as typeof fetch,
    );

    const outcome = await transport.execute(
      makeRequest(),
      new AbortController().signal,
    );

    expect(outcome).toMatchObject({ outcomeKind: "error", code });
    expect(JSON.stringify(outcome)).not.toContain("provider raw error");
  });

  it.each([
    new Response("not-json", { status: 200 }),
    new Response(JSON.stringify({ choices: [] }), { status: 200 }),
    successResponse(null),
  ])("rejects malformed or empty provider output", async (response) => {
    const transport = makeTransport(
      (async () => response.clone()) as typeof fetch,
    );

    await expect(
      transport.execute(makeRequest(), new AbortController().signal),
    ).resolves.toMatchObject({ outcomeKind: "error", code: "invalid_output" });
  });

  it("rejects an oversized response before parsing it", async () => {
    const transport = makeTransport(
      (async () =>
        new Response("{}", {
          status: 200,
          headers: { "content-length": String(256 * 1024 + 1) },
        })) as typeof fetch,
    );

    await expect(
      transport.execute(makeRequest(), new AbortController().signal),
    ).resolves.toMatchObject({ outcomeKind: "error", code: "invalid_output" });
  });

  it.each([
    { trustedData: { internalExcerpt: "blocked" } },
    { untrustedData: { credentials: "blocked" } },
    { outputJsonSchema: { type: "object", properties: { api_key: {} } } },
    { previousCandidate: { secret: "blocked" }, attemptKind: "structured_repair" },
  ])("does not call the provider when forbidden data enters any payload path", async (override) => {
    const fetchSpy = vi.fn();
    const transport = makeTransport(fetchSpy as typeof fetch);
    const request = {
      ...makeRequest(),
      ...override,
      prompt: {
        ...makeRequest().prompt,
        ...(override.trustedData === undefined
          ? {}
          : { trustedData: override.trustedData }),
        ...(override.untrustedData === undefined
          ? {}
          : { untrustedData: override.untrustedData }),
      },
    } as Stage6ProviderAttemptRequest;

    await expect(
      transport.execute(request, new AbortController().signal),
    ).resolves.toMatchObject({ outcomeKind: "error", code: "invalid_output" });
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

function makeTransport(fetchImplementation: typeof fetch) {
  return new DeepSeekOpenAICompatibleTransport({
    config: parseDeepSeekServerConfig({ DEEPSEEK_API_KEY: TEST_API_KEY }),
    fetchImplementation,
  });
}

function makeRequest(): Stage6ProviderAttemptRequest {
  return {
    attemptKind: "primary",
    prompt: buildPortraitShiftSummaryPrompt(makePortraitSummaryInput()),
    outputJsonSchema: {
      type: "object",
      properties: { answer: { type: "string" } },
      required: ["answer"],
      additionalProperties: false,
    },
  };
}

function successResponse(candidate: unknown): Response {
  return new Response(
    JSON.stringify({
      model: "deepseek-v4-pro",
      choices: [{ message: { content: candidate === null ? null : JSON.stringify(candidate) } }],
      usage: { prompt_tokens: 12, completion_tokens: 3, total_tokens: 15 },
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
}

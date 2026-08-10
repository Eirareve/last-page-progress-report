import { describe, expect, it } from "vitest";

import {
  stage6LiveRequestSchema,
  stage6LiveResponseSchema,
  type Stage6LiveRequest,
  STAGE6_TRANSPORT_VERSION,
} from "@/stage6";
import { makeRoundAnalysisPortInput } from "../fixtures/agent";
import { makeApplicationRequestContext } from "../fixtures/application";

describe("Stage 6 HTTP transport contract", () => {
  it("accepts a live round request without client-supplied evidence prose", () => {
    const request = makeRoundRequest();

    expect(stage6LiveRequestSchema.safeParse(request).success).toBe(true);
    expect(JSON.stringify(request.input.generateCharlieResponse)).not.toContain(
      "verifiedFacts",
    );
  });

  it("rejects client evidence prose, Mock mode, and stale bindings", () => {
    const request = makeRoundRequest();
    const withEvidence = structuredClone(request) as Record<string, unknown>;
    const input = withEvidence.input as Record<string, unknown>;
    const responseInput = input.generateCharlieResponse as Record<string, unknown>;
    responseInput.evidenceContext = { verifiedFacts: [{ text: "untrusted" }] };
    expect(stage6LiveRequestSchema.safeParse(withEvidence).success).toBe(false);

    const mockMode = structuredClone(request);
    mockMode.operationContext.requestedMode = "mock" as "live";
    expect(stage6LiveRequestSchema.safeParse(mockMode).success).toBe(false);

    const stale = structuredClone(request);
    stale.operationContext.bindings.revisions.preciseRevisionId = "other-revision";
    expect(stage6LiveRequestSchema.safeParse(stale).success).toBe(false);
  });

  it("uses a strict, stable closed-gate response", () => {
    const response = stage6LiveResponseSchema.parse({
      stage6TransportVersion: STAGE6_TRANSPORT_VERSION,
      outcomeKind: "error",
      requestId: null,
      error: {
        code: "live_api_gate_closed",
        message: "Live model execution is not enabled",
        retryable: false,
      },
    });

    expect(response.outcomeKind).toBe("error");
    expect(
      stage6LiveResponseSchema.safeParse({ ...response, providerError: "secret" })
        .success,
    ).toBe(false);
  });
});

export function makeRoundRequest(): Extract<
  Stage6LiveRequest,
  { executionKind: "round_analysis" }
> {
  const portInput = makeRoundAnalysisPortInput();
  const { evidenceContext: _evidenceContext, ...generateCharlieResponse } =
    portInput.generateCharlieResponse;
  void _evidenceContext;
  const context = makeApplicationRequestContext("executeRoundAnalysis", {
    requestedMode: "live",
    bindings: {
      revisions: portInput.revisions,
      content: portInput.contentBinding,
    },
  });
  const {
    promptVersion: _promptVersion,
    adapterVersion: _adapterVersion,
    ...operationContext
  } = context;
  void _promptVersion;
  void _adapterVersion;
  return {
    stage6TransportVersion: STAGE6_TRANSPORT_VERSION,
    executionKind: "round_analysis" as const,
    sessionId: "session-stage6-1",
    priorBudgetUsage: { budgetVersion: "0.1.0" as const, logicalCalls: [] },
    operationContext: { ...operationContext, requestedMode: "live" },
    input: { ...portInput, generateCharlieResponse },
  };
}

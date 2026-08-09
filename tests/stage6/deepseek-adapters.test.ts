import { describe, expect, it, vi } from "vitest";

import { DeterministicMockAgentAdapter, MOCK_AGENT_ADAPTER_VERSION } from "@/agent";
import { DEFAULT_CHARLIE_SIGNATURE_REVIEW_SAFETY_POLICY } from "@/final-review";
import {
  DEEPSEEK_OPENAI_ADAPTER_VERSION,
  STAGE6_PROMPT_VERSION,
} from "@/stage6";
import { DeepSeekLiveAgentAdapter } from "@/stage6/deepseek/agent-adapter";
import { parseDeepSeekServerConfig } from "@/stage6/deepseek/config";
import { DeepSeekLiveFinalReviewService } from "@/stage6/deepseek/final-review";
import { DeepSeekOpenAICompatibleTransport } from "@/stage6/deepseek/transport";
import {
  makeRequestContext,
  makeRoundAnalysisPortInput,
} from "../fixtures/agent";
import {
  makeCharlieSignatureReviewContext,
  makeCharlieSignatureReviewInput,
  makePlaceholderFinalReviewEvidenceContext,
} from "../fixtures/final-review-stage3";

const TEST_API_KEY = "sk-test-only-not-a-secret-123456";

describe("DeepSeek Stage 6 adapters", () => {
  it("accepts a strict round candidate while keeping provider identity server-side", async () => {
    const roundInput = makeRoundAnalysisPortInput();
    const mock = new DeterministicMockAgentAdapter();
    const fixture = await mock.executeRoundAnalysis(
      roundInput,
      makeRequestContext({ adapterVersion: MOCK_AGENT_ADAPTER_VERSION }),
    );
    expect(fixture.outcomeKind).toBe("candidate");
    if (fixture.outcomeKind !== "candidate") throw new Error("fixture failed");
    const fetchSpy = vi.fn(async () => providerResponse(fixture.candidate));
    const config = parseDeepSeekServerConfig({ DEEPSEEK_API_KEY: TEST_API_KEY });
    const transport = new DeepSeekOpenAICompatibleTransport({
      config,
      fetchImplementation: fetchSpy as typeof fetch,
    });
    const adapter = new DeepSeekLiveAgentAdapter({ transport, config });

    const outcome = await adapter.executeRoundAnalysis(
      roundInput,
      makeRequestContext({
        requestedMode: "live",
        adapterVersion: DEEPSEEK_OPENAI_ADAPTER_VERSION,
        promptVersion: STAGE6_PROMPT_VERSION,
      }),
    );

    expect(outcome.outcomeKind).toBe("candidate");
    expect(outcome.observation).toMatchObject({
      provider: "deepseek",
      modelName: "deepseek-v4-pro",
    });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("rejects a mismatched live context before making a provider request", async () => {
    const fetchSpy = vi.fn();
    const config = parseDeepSeekServerConfig({ DEEPSEEK_API_KEY: TEST_API_KEY });
    const transport = new DeepSeekOpenAICompatibleTransport({
      config,
      fetchImplementation: fetchSpy as typeof fetch,
    });
    const adapter = new DeepSeekLiveAgentAdapter({ transport, config });

    const outcome = await adapter.executeRoundAnalysis(
      makeRoundAnalysisPortInput(),
      makeRequestContext({ requestedMode: "live", adapterVersion: "wrong" }),
    );

    expect(outcome).toMatchObject({
      outcomeKind: "error",
      error: { code: "schema_validation_failed" },
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("keeps live Final Review unavailable for placeholder evidence without a Mock fallback", async () => {
    const input = makeCharlieSignatureReviewInput();
    const requestCandidate = vi.fn();
    const service = new DeepSeekLiveFinalReviewService({
      candidatePort: {
        adapterVersion: DEEPSEEK_OPENAI_ADAPTER_VERSION,
        requestCandidate,
      },
    });

    const outcome = await service.reviewCharlieSignature(
      input,
      makeCharlieSignatureReviewContext({
        requestedMode: "live",
        adapterVersion: DEEPSEEK_OPENAI_ADAPTER_VERSION,
        promptVersion: STAGE6_PROMPT_VERSION,
      }),
      {
        evidenceContext: makePlaceholderFinalReviewEvidenceContext(input),
        safetyPolicy: DEFAULT_CHARLIE_SIGNATURE_REVIEW_SAFETY_POLICY,
      },
    );

    expect(outcome).toMatchObject({
      outcomeKind: "unavailable",
      error: { code: "content_not_found" },
    });
    expect(requestCandidate).not.toHaveBeenCalled();
  });
});

function providerResponse(candidate: unknown): Response {
  return new Response(
    JSON.stringify({
      model: "deepseek-v4-pro",
      choices: [{ message: { content: JSON.stringify(candidate) } }],
      usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
    }),
    { status: 200 },
  );
}

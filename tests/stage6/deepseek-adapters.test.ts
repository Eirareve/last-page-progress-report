import { describe, expect, it, vi } from "vitest";

import {
  plainSemanticReviewCandidateBundleSchema,
  roundAnalysisCandidateBundleSchema,
  validatePlainSemanticReviewCandidateBundle,
  validateRoundAnalysisCandidateBundle,
} from "@/agent";
import { deriveStage3EntityId } from "@/application";
import { sha256NfcUtf8 } from "@/domain";
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
  AGENT_TEST_CREATED_AT,
  AGENT_TEST_VALIDATION_CONTEXT,
  makeRequestContext,
  makePlainSemanticPortInput,
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
    const fetchSpy = vi.fn(async () => providerResponse(roundSemanticCandidate()));
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

    if (outcome.outcomeKind !== "candidate") {
      throw new Error(JSON.stringify(outcome.error));
    }
    expect(outcome.outcomeKind).toBe("candidate");
    expect(outcome.observation).toMatchObject({
      provider: "deepseek",
      modelName: "deepseek-v4-pro",
    });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const candidate = roundAnalysisCandidateBundleSchema.parse(outcome.candidate);
    expect(candidate.revisions).toEqual(roundInput.revisions);
    expect(candidate.principle.supportingExcerpt).toBe("context matters");
  });

  it("computes RoundAnalysis revision anchors and hashes from the trusted input", async () => {
    const roundInput = makeRoundAnalysisPortInput();
    const providerCandidate = roundSemanticCandidate({
      documentDiff: {
        kind: "diff",
        diff: {
          operation: "replace",
          startCodePoint: 0,
          endCodePoint: 7,
          newText: "Exact",
          reason: "Make the wording direct.",
          evidenceIds: [],
        },
      },
    });
    const fetchSpy = vi.fn(async () => providerResponse(providerCandidate));
    const config = parseDeepSeekServerConfig({ DEEPSEEK_API_KEY: TEST_API_KEY });
    const adapter = new DeepSeekLiveAgentAdapter({
      config,
      transport: new DeepSeekOpenAICompatibleTransport({
        config,
        fetchImplementation: fetchSpy as typeof fetch,
      }),
    });

    const outcome = await adapter.executeRoundAnalysis(
      roundInput,
      makeRequestContext({
        requestedMode: "live",
        adapterVersion: DEEPSEEK_OPENAI_ADAPTER_VERSION,
        promptVersion: STAGE6_PROMPT_VERSION,
      }),
    );

    if (outcome.outcomeKind !== "candidate") {
      throw new Error(JSON.stringify(outcome.error));
    }
    expect(outcome.outcomeKind).toBe("candidate");
    const candidate = roundAnalysisCandidateBundleSchema.parse(outcome.candidate);
    expect(candidate.documentDiff.kind).toBe("diff");
    if (candidate.documentDiff.kind !== "diff") throw new Error("diff missing");
    expect(candidate.documentDiff.diff).toMatchObject({
      baseRevisionId: roundInput.proposeDocumentDiff.baseRevisionId,
      oldText: "Precise",
      oldTextHash: await sha256NfcUtf8("Precise"),
      principleIds: ["stage3:v1:user_principle:0:operation-1"],
    });
    expect(candidate.documentDiff.diff.targetAnchor).toMatchObject({
      baseRevisionId: roundInput.proposeDocumentDiff.baseRevisionId,
      baselineTextSha256: await sha256NfcUtf8(
        roundInput.proposeDocumentDiff.currentText,
      ),
    });
    await expect(
      validateRoundAnalysisCandidateBundle(
        candidate,
        roundInput,
        AGENT_TEST_VALIDATION_CONTEXT,
      ),
    ).resolves.toMatchObject({ ok: true });
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

  it("projects fragment identifiers from the trusted operation context", async () => {
    const plainInput = {
      ...makePlainSemanticPortInput(),
      targetPlainRevisionId: deriveStage3EntityId({
        operationId: "trusted-operation",
        entityKind: "plain_revision",
        ordinal: 0,
      }),
    };
    const fetchSpy = vi.fn(async () => providerResponse(plainSemanticCandidate()));
    const config = parseDeepSeekServerConfig({ DEEPSEEK_API_KEY: TEST_API_KEY });
    const transport = new DeepSeekOpenAICompatibleTransport({
      config,
      fetchImplementation: fetchSpy as typeof fetch,
    });
    const adapter = new DeepSeekLiveAgentAdapter({ transport, config });

    const outcome = await adapter.executePlainSemanticReview(
      plainInput,
      makeRequestContext({
        operationId: "trusted-operation",
        requestedMode: "live",
        capability: "executePlainSemanticReview",
        adapterVersion: DEEPSEEK_OPENAI_ADAPTER_VERSION,
        promptVersion: STAGE6_PROMPT_VERSION,
      }),
    );

    expect(outcome.outcomeKind).toBe("candidate");
    if (outcome.outcomeKind !== "candidate") throw new Error("live call failed");
    const projectedCandidate = plainSemanticReviewCandidateBundleSchema.parse(
      outcome.candidate,
    );
    expect(projectedCandidate.semanticReview.semanticFragments[0].fragmentId).toBe(
      "stage3:v1:semantic_fragment:0:trusted-operation",
    );
    expect(projectedCandidate.restorationOutcomes[0].fragmentId).toBe(
      "stage3:v1:semantic_fragment:0:trusted-operation",
    );
    await expect(
      validatePlainSemanticReviewCandidateBundle(
        projectedCandidate,
        plainInput,
        plainProjection("trusted-operation", 1),
      ),
    ).resolves.toMatchObject({ ok: true });
  });

  it("computes Plain restoration anchors, previews, and hashes locally", async () => {
    const plainInput = {
      ...makePlainSemanticPortInput(),
      targetPlainRevisionId: deriveStage3EntityId({
        operationId: "restoration-operation",
        entityKind: "plain_revision",
        ordinal: 0,
      }),
    };
    const providerCandidate = plainSemanticCandidate({
      kind: "proposal",
      target: { kind: "point", offsetCodePoint: 18 },
      replacementText: " Clarified.",
    });
    const fetchSpy = vi.fn(async () => providerResponse(providerCandidate));
    const config = parseDeepSeekServerConfig({ DEEPSEEK_API_KEY: TEST_API_KEY });
    const adapter = new DeepSeekLiveAgentAdapter({
      config,
      transport: new DeepSeekOpenAICompatibleTransport({
        config,
        fetchImplementation: fetchSpy as typeof fetch,
      }),
    });
    const context = makeRequestContext({
      operationId: "restoration-operation",
      requestedMode: "live",
      capability: "executePlainSemanticReview",
      adapterVersion: DEEPSEEK_OPENAI_ADAPTER_VERSION,
      promptVersion: STAGE6_PROMPT_VERSION,
    });

    const outcome = await adapter.executePlainSemanticReview(plainInput, context);

    expect(outcome.outcomeKind).toBe("candidate");
    if (outcome.outcomeKind !== "candidate") throw new Error("live call failed");
    const candidate = plainSemanticReviewCandidateBundleSchema.parse(
      outcome.candidate,
    );
    expect(candidate.restorationOutcomes[0]).toMatchObject({
      kind: "proposal",
      proposal: {
        baselinePreciseRevisionId: plainInput.sourcePreciseRevisionId,
        baselinePlainRevisionId: plainInput.targetPlainRevisionId,
        sourcePlainTextHash: await sha256NfcUtf8("Precise test text."),
        previewText: {
          before: "Precise test text.",
          after: "Precise test text.Clarified.",
        },
      },
    });
    await expect(
      validatePlainSemanticReviewCandidateBundle(
        candidate,
        plainInput,
        plainProjection("restoration-operation", 1),
      ),
    ).resolves.toMatchObject({ ok: true });
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

function roundSemanticCandidate(overrides: Record<string, unknown> = {}) {
  return {
    principle: {
      claim: "Context matters.",
      reasons: ["The decision depends on its circumstances."],
      qualifiers: [],
      exceptions: [],
      supportingExcerptStartCodePoint: 8,
      supportingExcerptEndCodePoint: 23,
      evidenceIds: [],
    },
    tensions: [],
    charlieResponse: {
      position: "Uncertainty remains.",
      acknowledgesUserPoint: "Context can change a decision.",
      reservation: "A stable rule may still be needed.",
      question: "What exception would change this?",
      evidenceIds: [],
    },
    documentDiff: {
      kind: "no_change",
      reason: "No local edit is needed.",
    },
    ...overrides,
  };
}

function plainSemanticCandidate(
  restoration: Record<string, unknown> = {
    kind: "unavailable",
    reason: "fragment_not_restorable",
  },
) {
  return {
    plainText: "Precise test text.",
    preserved: ["The meaning is preserved."],
    lost: [],
    ambiguities: [],
    consequences: [],
    semanticFragments: [
      {
        phrase: "Precise test text.",
        reason: "The whole sentence carries the meaning.",
        consequence: "Removing it would remove the statement.",
        restoration,
      },
    ],
  };
}

function plainProjection(operationId: string, fragmentCount: number) {
  return {
    safetyPolicy: AGENT_TEST_VALIDATION_CONTEXT.safetyPolicy,
    plainRevisionId: deriveStage3EntityId({
      operationId,
      entityKind: "plain_revision",
      ordinal: 0,
    }),
    semanticFragmentIds: Array.from({ length: fragmentCount }, (_, ordinal) =>
      deriveStage3EntityId({
        operationId,
        entityKind: "semantic_fragment",
        ordinal,
      }),
    ),
    semanticRestorationProposalIds: Array.from(
      { length: fragmentCount },
      (_, ordinal) =>
        deriveStage3EntityId({
          operationId,
          entityKind: "semantic_restoration_proposal",
          ordinal,
        }),
    ),
    semanticRestorationProposalCreatedAt: AGENT_TEST_CREATED_AT,
  };
}

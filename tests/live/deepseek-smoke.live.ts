import { expect, it } from "vitest";

import {
  PLAIN_SEMANTIC_CANDIDATE_BUNDLE_SCHEMA_VERSION,
  ROUND_ANALYSIS_CANDIDATE_BUNDLE_SCHEMA_VERSION,
  plainSemanticReviewCandidateBundleSchema,
  validatePlainSemanticReviewCandidateBundle,
  validateRoundAnalysisCandidateBundle,
} from "@/agent";
import { deriveStage3EntityId } from "@/application";
import { loadConfiguredGatedContent } from "@/content/server";
import {
  createGatedFinalReviewEvidenceResolver,
  DEFAULT_CHARLIE_SIGNATURE_REVIEW_SAFETY_POLICY,
  FINAL_REVIEW_SCHEMA_VERSION,
} from "@/final-review";
import {
  DEEPSEEK_OPENAI_ADAPTER_VERSION,
  DEEPSEEK_PROVIDER_PROJECTION_SCHEMA_VERSION,
  STAGE6_PROMPT_VERSION,
} from "@/stage6";
import { DeepSeekLiveAgentAdapter } from "@/stage6/deepseek/agent-adapter";
import { parseDeepSeekServerConfig } from "@/stage6/deepseek/config";
import {
  DeepSeekCharlieSignatureReviewCandidatePort,
  DeepSeekLiveFinalReviewService,
} from "@/stage6/deepseek/final-review";
import { DeepSeekOpenAICompatibleTransport } from "@/stage6/deepseek/transport";
import {
  AGENT_TEST_CREATED_AT,
  AGENT_TEST_VALIDATION_CONTEXT,
  makePlainSemanticPortInput,
  makeRequestContext,
  makeRoundAnalysisPortInput,
} from "../fixtures/agent";
import {
  makeCharlieSignatureReviewContext,
  makeCharlieSignatureReviewInput,
} from "../fixtures/final-review-stage3";

const LIVE_TIMEOUT_MS = 120_000;

it("runs a real RoundAnalysis candidate through strict post-validation", async () => {
  const { adapter, config } = liveAgent();
  const input = makeRoundAnalysisPortInput();
  const context = makeRequestContext({
    requestedMode: "live",
    adapterVersion: DEEPSEEK_OPENAI_ADAPTER_VERSION,
    promptVersion: STAGE6_PROMPT_VERSION,
  });

  const outcome = await adapter.executeRoundAnalysis(input, context);
  if (outcome.outcomeKind === "error") {
    reportFailure(
      "round_analysis",
      config,
      ROUND_ANALYSIS_CANDIDATE_BUNDLE_SCHEMA_VERSION,
      outcome.observation,
      outcome.error.code,
      outcome.error.summary,
    );
  }
  expect(outcome.outcomeKind).toBe("candidate");
  if (outcome.outcomeKind !== "candidate") throw new Error("Round live call failed");
  const validation = await validateRoundAnalysisCandidateBundle(
    outcome.candidate,
    input,
    AGENT_TEST_VALIDATION_CONTEXT,
  );
  if (!validation.ok) {
    reportFailure(
      "round_analysis_post_validation",
      config,
      ROUND_ANALYSIS_CANDIDATE_BUNDLE_SCHEMA_VERSION,
      outcome.observation,
      validation.error.code,
      validation.error.summary,
    );
  }
  expect(validation.ok).toBe(true);
  report(
    "round_analysis",
    config,
    ROUND_ANALYSIS_CANDIDATE_BUNDLE_SCHEMA_VERSION,
    outcome.observation,
    false,
    "validated_result",
  );
}, LIVE_TIMEOUT_MS);

it("runs a real Plain/Semantic candidate through trusted ID and safety validation", async () => {
  const { adapter, config } = liveAgent();
  const input = makePlainSemanticPortInput();
  const context = makeRequestContext({
    requestedMode: "live",
    capability: "executePlainSemanticReview",
    adapterVersion: DEEPSEEK_OPENAI_ADAPTER_VERSION,
    promptVersion: STAGE6_PROMPT_VERSION,
  });

  const outcome = await adapter.executePlainSemanticReview(input, context);
  if (outcome.outcomeKind === "error") {
    reportFailure(
      "plain_semantic_review",
      config,
      PLAIN_SEMANTIC_CANDIDATE_BUNDLE_SCHEMA_VERSION,
      outcome.observation,
      outcome.error.code,
      outcome.error.summary,
    );
  }
  expect(outcome.outcomeKind).toBe("candidate");
  if (outcome.outcomeKind !== "candidate") throw new Error("Plain live call failed");
  const candidate = plainSemanticReviewCandidateBundleSchema.parse(
    outcome.candidate,
  );
  const fragmentCount = candidate.semanticReview.semanticFragments.length;
  const validation = await validatePlainSemanticReviewCandidateBundle(
    candidate,
    input,
    {
      safetyPolicy: AGENT_TEST_VALIDATION_CONTEXT.safetyPolicy,
      plainRevisionId: deriveStage3EntityId({
        operationId: context.operationId,
        entityKind: "plain_revision",
        ordinal: 0,
      }),
      semanticFragmentIds: Array.from({ length: fragmentCount }, (_, ordinal) =>
        deriveStage3EntityId({
          operationId: context.operationId,
          entityKind: "semantic_fragment",
          ordinal,
        }),
      ),
      semanticRestorationProposalIds: Array.from(
        { length: fragmentCount },
        (_, ordinal) =>
          deriveStage3EntityId({
            operationId: context.operationId,
            entityKind: "semantic_restoration_proposal",
            ordinal,
          }),
      ),
      semanticRestorationProposalCreatedAt: AGENT_TEST_CREATED_AT,
    },
  );
  if (!validation.ok) {
    reportFailure(
      "plain_semantic_post_validation",
      config,
      PLAIN_SEMANTIC_CANDIDATE_BUNDLE_SCHEMA_VERSION,
      outcome.observation,
      validation.error.code,
      validation.error.summary,
    );
  }
  expect(validation.ok).toBe(true);
  report(
    "plain_semantic_review",
    config,
    PLAIN_SEMANTIC_CANDIDATE_BUNDLE_SCHEMA_VERSION,
    outcome.observation,
    false,
    "validated_result",
  );
}, LIVE_TIMEOUT_MS);

it("runs a real FinalReviewService decision through verified public evidence validation", async () => {
  const config = parseDeepSeekServerConfig(process.env);
  const transport = new DeepSeekOpenAICompatibleTransport({ config });
  const gatedContent = await loadConfiguredGatedContent(
    "first_request",
    { APP_ENV: "development", CONTENT_MODE: "verified", AGENT_MODE: "live" },
  );
  const evidenceId = gatedContent.access.evidenceCards[0]?.id;
  if (evidenceId === undefined) throw new Error("Verified evidence is unavailable");
  const binding = gatedContent.access.binding;
  const requestContentBinding = {
    contentBundleId: binding.contentBundleId,
    contentBundleVersion: binding.contentBundleVersion,
    contentBundleChecksum: binding.contentBundleChecksum,
  };
  const input = makeCharlieSignatureReviewInput({
    allowedEvidenceIds: [evidenceId],
    contentBundleId: binding.contentBundleId,
    contentBundleVersion: binding.contentBundleVersion,
    contentBundleChecksum: binding.contentBundleChecksum,
  });
  const resolution = await createGatedFinalReviewEvidenceResolver(
    gatedContent,
  ).resolveEvidence(input);
  expect(resolution.resolutionKind).toBe("resolved");
  if (resolution.resolutionKind !== "resolved") {
    throw new Error("Verified Final Review evidence did not resolve");
  }
  const context = makeCharlieSignatureReviewContext({
    requestedMode: "live",
    adapterVersion: DEEPSEEK_OPENAI_ADAPTER_VERSION,
    promptVersion: STAGE6_PROMPT_VERSION,
    bindings: {
      revisions: {
        preciseRevisionId: input.preciseRevisionId,
        plainRevisionId: input.plainRevisionId,
      },
      content: requestContentBinding,
    },
  });
  const service = new DeepSeekLiveFinalReviewService({
    candidatePort: new DeepSeekCharlieSignatureReviewCandidatePort({
      transport,
      config,
    }),
  });

  const outcome = await service.reviewCharlieSignature(input, context, {
    evidenceContext: resolution.evidenceContext,
    safetyPolicy: DEFAULT_CHARLIE_SIGNATURE_REVIEW_SAFETY_POLICY,
  });
  if (outcome.outcomeKind !== "reviewed") {
    reportFailure(
      "charlie_signature_review",
      config,
      FINAL_REVIEW_SCHEMA_VERSION,
      outcome.observation,
      outcome.error.code,
      outcome.error.message,
    );
  }
  expect(outcome.outcomeKind).toBe("reviewed");
  report(
    "charlie_signature_review",
    config,
    FINAL_REVIEW_SCHEMA_VERSION,
    outcome.observation,
    true,
    "final_review_result",
  );
}, LIVE_TIMEOUT_MS);

function liveAgent() {
  const config = parseDeepSeekServerConfig(process.env);
  const transport = new DeepSeekOpenAICompatibleTransport({ config });
  return {
    config,
    adapter: new DeepSeekLiveAgentAdapter({ transport, config }),
  };
}

function report(
  capability: string,
  config: ReturnType<typeof parseDeepSeekServerConfig>,
  resultSchemaVersion: string,
  observation: Readonly<{
    networkRetries: number;
    structuredRepairs: number;
    inputTokens: number;
    outputTokens: number;
    latencyMs: number;
    estimatedCostUsdMicros: number;
  }>,
  usedPublicProjectData: boolean,
  outcome: "validated_result" | "final_review_result",
) {
  const usageProvided = observation.inputTokens > 0 || observation.outputTokens > 0;
  console.info(JSON.stringify({
    rcId: process.env.RC_ID ?? null,
    provider: config.provider,
    modelName: config.modelName,
    capability,
    outcome,
    failureCode: null,
    usedPublicProjectData,
    invocationCount:
      1 + observation.networkRetries + observation.structuredRepairs,
    retryCount: observation.networkRetries,
    repairCount: observation.structuredRepairs,
    inputTokens: usageProvided ? observation.inputTokens : "not_provided",
    outputTokens: usageProvided ? observation.outputTokens : "not_provided",
    latencyMs: observation.latencyMs,
    estimatedCostUsdMicros: usageProvided
      ? observation.estimatedCostUsdMicros
      : "not_provided",
    promptVersion: STAGE6_PROMPT_VERSION,
    adapterVersion: DEEPSEEK_OPENAI_ADAPTER_VERSION,
    resultSchemaVersion,
    providerProjectionSchemaVersion:
      DEEPSEEK_PROVIDER_PROJECTION_SCHEMA_VERSION,
  }));
}

function reportFailure(
  capability: string,
  config: ReturnType<typeof parseDeepSeekServerConfig>,
  resultSchemaVersion: string,
  observation: Readonly<{
    networkRetries: number;
    structuredRepairs: number;
    inputTokens: number;
    outputTokens: number;
    latencyMs: number;
    estimatedCostUsdMicros: number;
  }>,
  failureCode: string,
  failureSummary: string,
) {
  const usageProvided = observation.inputTokens > 0 || observation.outputTokens > 0;
  console.info(JSON.stringify({
    rcId: process.env.RC_ID ?? null,
    provider: config.provider,
    modelName: config.modelName,
    capability,
    outcome: "failed",
    failureCode,
    failureSummary,
    invocationCount:
      1 + observation.networkRetries + observation.structuredRepairs,
    retryCount: observation.networkRetries,
    repairCount: observation.structuredRepairs,
    inputTokens: usageProvided ? observation.inputTokens : "not_provided",
    outputTokens: usageProvided ? observation.outputTokens : "not_provided",
    latencyMs: observation.latencyMs,
    estimatedCostUsdMicros: usageProvided
      ? observation.estimatedCostUsdMicros
      : "not_provided",
    promptVersion: STAGE6_PROMPT_VERSION,
    adapterVersion: DEEPSEEK_OPENAI_ADAPTER_VERSION,
    resultSchemaVersion,
    providerProjectionSchemaVersion:
      DEEPSEEK_PROVIDER_PROJECTION_SCHEMA_VERSION,
  }));
}

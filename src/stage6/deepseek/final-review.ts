import type {
  CharlieSignatureReviewCandidatePort,
  CharlieSignatureReviewCandidatePortOutcome,
  CharlieSignatureReviewInput,
  CharlieSignatureReviewRequestContext,
  CharlieSignatureReviewServiceOutcome,
  FinalReviewService,
  FinalReviewTrustedExecutionInput,
  ResolvedFinalReviewEvidenceContext,
} from "../../final-review";
import {
  charlieSignatureReviewCandidatePortOutcomeSchema,
  charlieSignatureReviewCandidateSchema,
  charlieSignatureReviewInputSchema,
  charlieSignatureReviewRequestContextSchema,
  charlieSignatureReviewSafetyPolicySchema,
  charlieSignatureReviewServiceOutcomeSchema,
  createCharlieSignatureReviewError,
  resolvedFinalReviewEvidenceContextSchema,
  validateCharlieSignatureReviewCandidate,
} from "../../final-review";
import {
  buildCharlieSignatureReviewPrompt,
} from "../prompts";
import {
  executeStage6StructuredCall,
} from "../provider-execution";
import {
  DEEPSEEK_OPENAI_ADAPTER_VERSION,
  STAGE6_PROMPT_VERSION,
} from "../versions";
import type { DeepSeekServerConfig } from "./config";
import type { DeepSeekOpenAICompatibleTransport } from "./transport";

export class DeepSeekCharlieSignatureReviewCandidatePort
  implements CharlieSignatureReviewCandidatePort
{
  readonly adapterVersion = DEEPSEEK_OPENAI_ADAPTER_VERSION;
  readonly #transport: DeepSeekOpenAICompatibleTransport;
  readonly #config: DeepSeekServerConfig;

  constructor(input: {
    transport: DeepSeekOpenAICompatibleTransport;
    config: DeepSeekServerConfig;
  }) {
    this.#transport = input.transport;
    this.#config = input.config;
  }

  async requestCandidate(
    input: CharlieSignatureReviewInput,
    context: CharlieSignatureReviewRequestContext,
    evidenceContext: ResolvedFinalReviewEvidenceContext,
  ): Promise<CharlieSignatureReviewCandidatePortOutcome> {
    if (
      context.requestedMode !== "live" ||
      context.adapterVersion !== this.adapterVersion ||
      context.promptVersion !== STAGE6_PROMPT_VERSION
    ) {
      return unavailable(
        "schema_validation_failed",
        "Final Review RequestContext does not match the DeepSeek live adapter",
      );
    }
    const outcome = await executeStage6StructuredCall({
      transport: this.#transport,
      prompt: buildCharlieSignatureReviewPrompt({ review: input, evidenceContext }),
      candidateSchema: charlieSignatureReviewCandidateSchema,
      timeoutMs: this.#config.requestTimeoutMs,
      abortSignal: context.abortSignal,
    });
    return outcome.outcomeKind === "candidate"
      ? charlieSignatureReviewCandidatePortOutcomeSchema.parse({
          portOutcomeKind: "candidate",
          candidate: outcome.candidate,
          observation: outcome.observation,
        })
      : charlieSignatureReviewCandidatePortOutcomeSchema.parse({
          portOutcomeKind: "error",
          error: createCharlieSignatureReviewError(
            finalReviewErrorCode(outcome.code),
            outcome.summary,
          ),
          observation: outcome.observation,
        });
  }
}
export class DeepSeekLiveFinalReviewService implements FinalReviewService {
  readonly executionMode = "live" as const;
  readonly adapterVersion = DEEPSEEK_OPENAI_ADAPTER_VERSION;
  readonly #candidatePort: CharlieSignatureReviewCandidatePort;

  constructor(input: { candidatePort: CharlieSignatureReviewCandidatePort }) {
    this.#candidatePort = input.candidatePort;
  }

  async reviewCharlieSignature(
    inputValue: CharlieSignatureReviewInput,
    context: CharlieSignatureReviewRequestContext,
    trustedExecution: FinalReviewTrustedExecutionInput,
  ): Promise<CharlieSignatureReviewServiceOutcome> {
    const input = charlieSignatureReviewInputSchema.safeParse(inputValue);
    const { abortSignal: _abortSignal, ...serializableContext } = context;
    void _abortSignal;
    const parsedContext = charlieSignatureReviewRequestContextSchema.safeParse(
      serializableContext,
    );
    const evidence = resolvedFinalReviewEvidenceContextSchema.safeParse(
      trustedExecution.evidenceContext,
    );
    const safety = charlieSignatureReviewSafetyPolicySchema.safeParse(
      trustedExecution.safetyPolicy,
    );
    if (
      !input.success ||
      !parsedContext.success ||
      !evidence.success ||
      !safety.success
    ) {
      return serviceUnavailable(
        "schema_validation_failed",
        "Live Final Review input failed strict validation",
      );
    }
    if (
      parsedContext.data.requestedMode !== "live" ||
      parsedContext.data.adapterVersion !== this.adapterVersion ||
      this.#candidatePort.adapterVersion !== this.adapterVersion
    ) {
      return serviceUnavailable(
        "execution_unavailable",
        "Live Final Review adapter identity is unavailable",
      );
    }
    if (evidence.data.evidenceMode !== "verified") {
      return serviceUnavailable(
        "content_not_found",
        "Live Final Review requires verified public evidence",
      );
    }
    if (!evidenceMatchesInput(evidence.data, input.data)) {
      return serviceUnavailable(
        "content_version_mismatch",
        "Resolved Final Review evidence does not match the bound input",
      );
    }

    const candidate = await this.#candidatePort.requestCandidate(
      input.data,
      context,
      evidence.data,
    );
    if (candidate.portOutcomeKind === "error") {
      return charlieSignatureReviewServiceOutcomeSchema.parse({
        outcomeKind: "unavailable",
        error: candidate.error,
        observation: candidate.observation,
      });
    }
    const validation = validateCharlieSignatureReviewCandidate({
      reviewInput: input.data,
      context,
      candidate: candidate.candidate,
      trustedEvidenceIds: evidence.data.evidenceItems.map(
        (item) => item.evidenceCard.id,
      ),
      safetyPolicy: safety.data,
    });
    return validation.validationKind === "validated"
      ? charlieSignatureReviewServiceOutcomeSchema.parse({
          outcomeKind: "reviewed",
          result: validation.result,
          observation: candidate.observation,
        })
      : charlieSignatureReviewServiceOutcomeSchema.parse({
          outcomeKind: "unavailable",
          error: validation.error,
          observation: candidate.observation,
        });
  }
}

function unavailable(
  code: Parameters<typeof createCharlieSignatureReviewError>[0],
  message: string,
): CharlieSignatureReviewCandidatePortOutcome {
  return charlieSignatureReviewCandidatePortOutcomeSchema.parse({
    portOutcomeKind: "error",
    error: createCharlieSignatureReviewError(code, message),
    observation: zeroObservation(),
  });
}

function serviceUnavailable(
  code: Parameters<typeof createCharlieSignatureReviewError>[0],
  message: string,
): CharlieSignatureReviewServiceOutcome {
  return charlieSignatureReviewServiceOutcomeSchema.parse({
    outcomeKind: "unavailable",
    error: createCharlieSignatureReviewError(code, message),
    observation: zeroObservation(),
  });
}

function finalReviewErrorCode(
  code:
    | "timeout"
    | "rate_limited"
    | "network_error"
    | "invalid_output"
    | "schema_validation_failed"
    | "safety_validation_failed"
    | "stale_revision"
    | "content_gate_not_passed"
    | "content_not_found"
    | "content_mode_not_verified"
    | "content_version_mismatch"
    | "evidence_not_allowed"
    | "idempotency_conflict"
    | "budget_exhausted"
    | "fallback_unavailable",
): Parameters<typeof createCharlieSignatureReviewError>[0] {
  switch (code) {
    case "timeout":
    case "rate_limited":
    case "network_error":
    case "invalid_output":
    case "schema_validation_failed":
    case "stale_revision":
    case "content_not_found":
    case "content_version_mismatch":
    case "idempotency_conflict":
    case "budget_exhausted":
      return code;
    case "safety_validation_failed":
    case "evidence_not_allowed":
      return "safety_validation_failed";
    case "content_gate_not_passed":
    case "content_mode_not_verified":
    case "fallback_unavailable":
      return "execution_unavailable";
  }
}

function evidenceMatchesInput(
  evidence: Extract<ResolvedFinalReviewEvidenceContext, { evidenceMode: "verified" }>,
  input: CharlieSignatureReviewInput,
): boolean {
  const ids = evidence.evidenceItems.map((item) => item.evidenceCard.id);
  return (
    evidence.contentBundleId === input.contentBundleId &&
    evidence.contentBundleVersion === input.contentBundleVersion &&
    evidence.contentBundleChecksum === input.contentBundleChecksum &&
    ids.length === input.allowedEvidenceIds.length &&
    ids.every((id, index) => id === input.allowedEvidenceIds[index])
  );
}

function zeroObservation() {
  return {
    networkRetries: 0,
    structuredRepairs: 0,
    inputTokens: 0,
    outputTokens: 0,
    latencyMs: 0,
    estimatedCostUsdMicros: 0,
  };
}

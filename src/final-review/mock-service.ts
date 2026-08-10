import type {
  CharlieSignatureReviewInput,
  CharlieSignatureReviewRequestContext,
  CharlieSignatureReviewServiceOutcome,
  FinalReviewTrustedExecutionInput,
  MockFinalReviewFixture,
  ResolvedFinalReviewEvidenceContext,
} from "./contracts";
import { createCharlieSignatureReviewError } from "./errors";
import { ZERO_FINAL_REVIEW_EXECUTION_OBSERVATION } from "./observation";
import type { FinalReviewService } from "./ports";
import {
  charlieSignatureReviewInputSchema,
  charlieSignatureReviewRequestContextSchema,
  charlieSignatureReviewServiceOutcomeSchema,
  charlieSignatureReviewSafetyPolicySchema,
  resolvedFinalReviewEvidenceContextSchema,
} from "./schemas";
import {
  validateCharlieSignatureReviewCandidate,
} from "./validator";
import { MOCK_FINAL_REVIEW_ADAPTER_VERSION } from "./versions";

export class DeterministicMockFinalReviewService
  implements FinalReviewService
{
  readonly executionMode = "mock" as const;
  readonly adapterVersion = MOCK_FINAL_REVIEW_ADAPTER_VERSION;

  readonly #fixture: MockFinalReviewFixture;
  constructor(input: {
    fixture: MockFinalReviewFixture;
  }) {
    if (input.fixture.fixtureId.trim().length === 0) {
      throw new TypeError("Mock Final Review fixtureId must be non-blank");
    }
    this.#fixture = structuredClone(input.fixture);
  }

  async reviewCharlieSignature(
    reviewInputValue: CharlieSignatureReviewInput,
    context: CharlieSignatureReviewRequestContext,
    trustedExecution: FinalReviewTrustedExecutionInput,
  ): Promise<CharlieSignatureReviewServiceOutcome> {
    const reviewInput = charlieSignatureReviewInputSchema.safeParse(
      reviewInputValue,
    );
    const { abortSignal, ...serializableContext } = context;
    void abortSignal;
    const parsedContext = charlieSignatureReviewRequestContextSchema.safeParse(
      serializableContext,
    );
    if (!reviewInput.success || !parsedContext.success) {
      return charlieSignatureReviewServiceOutcomeSchema.parse({
        outcomeKind: "unavailable",
        observation: ZERO_FINAL_REVIEW_EXECUTION_OBSERVATION,
        error: createCharlieSignatureReviewError(
          "schema_validation_failed",
          "Mock Final Review input or RequestContext failed schema validation",
        ),
      });
    }
    if (parsedContext.data.requestedMode !== "mock") {
      return createLiveUnavailableFinalReviewOutcome(
        context,
        createCharlieSignatureReviewError(
          "execution_unavailable",
          "The deterministic Mock Final Review service cannot execute a live request",
        ),
      );
    }
    if (parsedContext.data.adapterVersion !== this.adapterVersion) {
      return charlieSignatureReviewServiceOutcomeSchema.parse({
        outcomeKind: "unavailable",
        observation: ZERO_FINAL_REVIEW_EXECUTION_OBSERVATION,
        error: createCharlieSignatureReviewError(
          "schema_validation_failed",
          "Mock Final Review RequestContext adapterVersion is unsupported",
        ),
      });
    }

    const evidenceContext = resolvedFinalReviewEvidenceContextSchema.safeParse(
      trustedExecution.evidenceContext,
    );
    const safetyPolicy = charlieSignatureReviewSafetyPolicySchema.safeParse(
      trustedExecution.safetyPolicy,
    );
    if (!evidenceContext.success || !safetyPolicy.success) {
      return charlieSignatureReviewServiceOutcomeSchema.parse({
        outcomeKind: "unavailable",
        observation: ZERO_FINAL_REVIEW_EXECUTION_OBSERVATION,
        error: createCharlieSignatureReviewError(
          "schema_validation_failed",
          "Final Review trusted execution input failed validation",
        ),
      });
    }
    if (
      !evidenceContextMatchesInput(
        evidenceContext.data,
        reviewInput.data,
      )
    ) {
      return charlieSignatureReviewServiceOutcomeSchema.parse({
        outcomeKind: "unavailable",
        observation: ZERO_FINAL_REVIEW_EXECUTION_OBSERVATION,
        error: createCharlieSignatureReviewError(
          "content_version_mismatch",
          "Resolved Final Review evidence does not match the business input",
        ),
      });
    }

    const validation = validateCharlieSignatureReviewCandidate({
      reviewInput: reviewInput.data,
      context,
      candidate: this.#fixture.candidate,
      trustedEvidenceIds:
        evidenceContext.data.evidenceMode === "verified"
          ? evidenceContext.data.evidenceItems.map(
              (item) => item.evidenceCard.id,
            )
          : evidenceContext.data.placeholderEvidenceIds,
      safetyPolicy: safetyPolicy.data,
    });
    return validation.validationKind === "validated"
      ? charlieSignatureReviewServiceOutcomeSchema.parse({
          outcomeKind: "reviewed",
          result: validation.result,
          observation: ZERO_FINAL_REVIEW_EXECUTION_OBSERVATION,
        })
      : charlieSignatureReviewServiceOutcomeSchema.parse({
          outcomeKind: "unavailable",
          error: validation.error,
          observation: ZERO_FINAL_REVIEW_EXECUTION_OBSERVATION,
        });
  }
}

function evidenceContextMatchesInput(
  evidenceContext: ResolvedFinalReviewEvidenceContext,
  reviewInput: CharlieSignatureReviewInput,
): boolean {
  const resolvedIds =
    evidenceContext.evidenceMode === "verified"
      ? evidenceContext.evidenceItems.map((item) => item.evidenceCard.id)
      : evidenceContext.placeholderEvidenceIds;
  return (
    evidenceContext.contentBundleId === reviewInput.contentBundleId &&
    evidenceContext.contentBundleVersion === reviewInput.contentBundleVersion &&
    evidenceContext.contentBundleChecksum === reviewInput.contentBundleChecksum &&
    resolvedIds.length === reviewInput.allowedEvidenceIds.length &&
    resolvedIds.every(
      (evidenceId, index) =>
        evidenceId === reviewInput.allowedEvidenceIds[index],
    )
  );
}

export function createLiveUnavailableFinalReviewOutcome(
  context: CharlieSignatureReviewRequestContext,
  error: ReturnType<typeof createCharlieSignatureReviewError>,
  observation = ZERO_FINAL_REVIEW_EXECUTION_OBSERVATION,
): CharlieSignatureReviewServiceOutcome {
  const { abortSignal, ...serializableContext } = context;
  void abortSignal;
  const parsedContext = charlieSignatureReviewRequestContextSchema.parse(
    serializableContext,
  );
  if (parsedContext.requestedMode !== "live") {
    throw new TypeError(
      "Live Final Review unavailability requires requestedMode=live",
    );
  }
  return charlieSignatureReviewServiceOutcomeSchema.parse({
    outcomeKind: "unavailable",
    error,
    observation,
  });
}

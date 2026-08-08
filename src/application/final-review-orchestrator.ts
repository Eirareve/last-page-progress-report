import {
  charlieSignatureReviewServiceOutcomeSchema,
  charlieSignatureReviewSafetyPolicySchema,
  charlieSignatureReviewInputSchema,
  charlieSignatureReviewRequestContextSchema,
  createCharlieSignatureReviewError,
  resolvedFinalReviewEvidenceContextSchema,
  projectFinalReviewExecutionReceipt,
  ZERO_FINAL_REVIEW_EXECUTION_OBSERVATION,
  validateCharlieSignatureReviewCandidate,
  validateCharlieSignatureReviewResultBinding,
  type CharlieSignatureReviewInput,
  type CharlieSignatureReviewRequestContext,
  type CharlieSignatureReviewSafetyPolicy,
  type CharlieSignatureReviewServiceOutcome,
  type FinalReviewExecutionObservation,
  type FinalReviewService,
  type ResolvedFinalReviewEvidenceContext,
} from "../final-review";
import { resolveFinalReviewExecutionRoute } from "./execution-mode";
import {
  applicationEventHeader,
  evaluateObservedExecutionBudget,
  runOrchestrationPreflight,
} from "./orchestration-common";
import {
  buildFinalReviewInputMaterials,
  stage3RequestFingerprintMatches,
} from "./semantic-input";
import { FINAL_REVIEW_SCHEMA_VERSION } from "../final-review";
import type {
  CharlieSignatureReviewOrchestrationOutcome,
  OrchestrationOperationBoundary,
} from "./orchestration.contracts";
import {
  charlieSignatureReviewFailedEventSchema,
  charlieSignatureReviewResolvedEventSchema,
  finalReviewFailedTerminalArtifactSchema,
  finalReviewResolvedTerminalArtifactSchema,
} from "./orchestration.schemas";
import { APPLICATION_ORCHESTRATION_CONTRACT_VERSION } from "./schemas";

export async function orchestrateCharlieSignatureReview(input: {
  boundary: OrchestrationOperationBoundary;
  service: FinalReviewService & { readonly executionMode: "mock" | "live" };
  reviewInput: CharlieSignatureReviewInput;
  reviewContext: CharlieSignatureReviewRequestContext;
  /** Full resolver-produced evidence projection, never copied from business input. */
  evidenceContext: ResolvedFinalReviewEvidenceContext;
  safetyPolicy: CharlieSignatureReviewSafetyPolicy;
}): Promise<CharlieSignatureReviewOrchestrationOutcome> {
  const preflight = runOrchestrationPreflight({
    boundary: input.boundary,
    expectedOperationCapability: "executeCharlieSignatureReview",
    expectedBudgetSlot: "signature_review",
    capabilityContexts: {
      reviewCharlieSignature: input.reviewContext,
    },
  });
  if (!preflight.ok) return preflight.rejection;

  const parsedReviewInput = charlieSignatureReviewInputSchema.safeParse(
    input.reviewInput,
  );
  if (!parsedReviewInput.success) {
    return {
      outcomeKind: "preflight_rejected",
      reason: "invalid_context",
      detail: "Charlie signature review business input failed validation",
    };
  }
  const reviewBindingError = validateReviewInputBindings(
    parsedReviewInput.data,
    input.reviewContext,
  );
  if (reviewBindingError !== null) {
    return {
      outcomeKind: "preflight_rejected",
      reason: "invalid_context",
      detail: reviewBindingError,
    };
  }
  const parsedEvidenceContext =
    resolvedFinalReviewEvidenceContextSchema.safeParse(input.evidenceContext);
  const parsedSafetyPolicy = charlieSignatureReviewSafetyPolicySchema.safeParse(
    input.safetyPolicy,
  );
  const { abortSignal, ...serializableReviewContext } = input.reviewContext;
  const parsedReviewContext =
    charlieSignatureReviewRequestContextSchema.safeParse(
      serializableReviewContext,
    );
  if (
    !parsedEvidenceContext.success ||
    !parsedSafetyPolicy.success ||
    !parsedReviewContext.success
  ) {
    return {
      outcomeKind: "preflight_rejected",
      reason: "invalid_context",
      detail:
        "Final Review resolver evidence or safety policy failed strict runtime validation",
    };
  }
  // Freeze one trusted semantic snapshot before hashing. The service receives
  // these exact frozen values, and post-validation reads the same values.
  const reviewInput = deepFrozenJsonSnapshot(parsedReviewInput.data);
  const evidenceContext = deepFrozenJsonSnapshot(parsedEvidenceContext.data);
  const safetyPolicy = deepFrozenJsonSnapshot(parsedSafetyPolicy.data);
  const frozenSerializableReviewContext = deepFrozenJsonSnapshot(
    parsedReviewContext.data,
  );
  const reviewContext = Object.freeze({
    ...frozenSerializableReviewContext,
    ...(abortSignal === undefined ? {} : { abortSignal }),
  }) as CharlieSignatureReviewRequestContext;
  const trustedExecution = Object.freeze({ evidenceContext, safetyPolicy });
  const trustedEvidenceIds =
    evidenceContext.evidenceMode === "verified"
      ? evidenceContext.evidenceItems.map(({ evidenceCard }) => evidenceCard.id)
      : evidenceContext.placeholderEvidenceIds;
  if (
    evidenceContext.contentBundleId !== reviewInput.contentBundleId ||
    evidenceContext.contentBundleVersion !==
      reviewInput.contentBundleVersion ||
    evidenceContext.contentBundleChecksum !==
      reviewInput.contentBundleChecksum ||
    new Set(trustedEvidenceIds).size !== trustedEvidenceIds.length ||
    trustedEvidenceIds.length !==
      reviewInput.allowedEvidenceIds.length ||
    trustedEvidenceIds.some(
      (evidenceId, index) =>
        evidenceId.trim().length === 0 ||
        evidenceId !== reviewInput.allowedEvidenceIds[index],
    )
  ) {
    return {
      outcomeKind: "preflight_rejected",
      reason: "invalid_context",
      detail:
        "Resolver evidence must bind current content and exactly match the ordered Final Review allowlist",
    };
  }

  const semanticMaterials = buildFinalReviewInputMaterials({
    reviewInput,
    evidenceContext,
    safetyPolicy,
  });
  const semanticFingerprintsValid = await Promise.all([
    stage3RequestFingerprintMatches({
      context: preflight.operationContext,
      semanticMaterial: semanticMaterials.operation,
      agentContractVersion: null,
      resultSchemaVersion: FINAL_REVIEW_SCHEMA_VERSION,
    }),
    stage3RequestFingerprintMatches({
      context: reviewContext,
      semanticMaterial: semanticMaterials.reviewCharlieSignature,
      agentContractVersion: null,
      resultSchemaVersion: FINAL_REVIEW_SCHEMA_VERSION,
    }),
  ]);
  if (semanticFingerprintsValid.some((valid) => !valid)) {
    return {
      outcomeKind: "preflight_rejected",
      reason: "invalid_context",
      detail:
        "Final Review RequestContext fingerprint does not match its canonical semantic input",
    };
  }

  const startedAt = preflight.observedAt;
  const route = resolveFinalReviewExecutionRoute({
    requestedMode: preflight.operationContext.requestedMode,
    availability: input.boundary.availability,
  });
  let budgetEvaluation = preflight.budgetEvaluation;
  let budgetUsage = preflight.budgetUsage;
  let serviceCalled = false;
  let serviceOutcome: CharlieSignatureReviewServiceOutcome = unavailableOutcome(
    "execution_unavailable",
    "Charlie signature review execution did not start",
  );
  if (preflight.budgetEvaluation.decision !== "proceed") {
    serviceOutcome = unavailableOutcome(
      "budget_exhausted",
      "Charlie signature review execution budget was exhausted",
    );
  } else if (route.resolvedMode === "unavailable") {
    serviceOutcome = unavailableOutcome(
      "execution_unavailable",
      "The requested Final Review execution route is unavailable",
    );
  } else if (route.resolvedMode !== input.service.executionMode) {
    return {
      outcomeKind: "preflight_rejected",
      reason: "invalid_context",
      detail: `Resolved ${route.resolvedMode} route requires a matching Final Review service`,
    };
  } else if (
    preflight.operationContext.adapterVersion !== input.service.adapterVersion ||
    reviewContext.adapterVersion !== input.service.adapterVersion
  ) {
    return {
      outcomeKind: "preflight_rejected",
      reason: "invalid_context",
      detail:
        "Final Review service adapterVersion must match the operation and review RequestContexts",
    };
  } else {
    let rawOutcome: unknown;
    let callFailed = false;
    serviceCalled = true;
    try {
      rawOutcome = await input.service.reviewCharlieSignature(
        reviewInput,
        reviewContext,
        trustedExecution,
      );
    } catch {
      callFailed = true;
      serviceOutcome = unavailableOutcome(
        "execution_unavailable",
        "Charlie signature review service threw without a structured execution outcome",
      );
    }
    if (!callFailed) {
      const parsedOutcome = charlieSignatureReviewServiceOutcomeSchema.safeParse(
        rawOutcome,
      );
      if (!parsedOutcome.success) {
        serviceOutcome = unavailableOutcome(
          "invalid_output",
          "Charlie signature review service returned an invalid execution outcome",
        );
      } else {
        serviceOutcome = parsedOutcome.data;
        try {
          const observed = evaluateObservedExecutionBudget({
            boundary: input.boundary,
            observation: serviceOutcome.observation,
          });
          budgetEvaluation = observed.evaluation;
          budgetUsage = observed.usage;
        } catch {
          serviceOutcome = unavailableOutcome(
            "invalid_output",
            "Charlie signature review execution observation was invalid",
            serviceOutcome.observation,
          );
        }
        if (budgetEvaluation.decision !== "proceed") {
          serviceOutcome = unavailableOutcome(
            "budget_exhausted",
            budgetEvaluation.decision === "reject"
              ? "Charlie signature review actual execution exceeded the absolute budget"
              : "Charlie signature review actual execution exceeded the base budget and cannot fall back to another role",
            serviceOutcome.observation,
          );
        } else if (serviceOutcome.outcomeKind === "reviewed") {
          serviceOutcome = revalidateReviewedOutcome(
            reviewInput,
            reviewContext,
            serviceOutcome,
            trustedEvidenceIds,
            safetyPolicy,
          );
        }
      }
    }
  }
  const completedAt = preflight.clock.now();
  const receiptContext = serviceCalled
    ? reviewContext
    : {
        ...reviewContext,
        adapterVersion: null,
        promptVersion: null,
      };
  const receipt = projectFinalReviewExecutionReceipt({
    context: receiptContext,
    serviceOutcome,
    startedAt,
    completedAt,
    resolvedMode:
      serviceOutcome.outcomeKind === "reviewed"
        ? route.resolvedMode
        : "unavailable",
  });

  if (serviceOutcome.outcomeKind === "reviewed") {
    const event = charlieSignatureReviewResolvedEventSchema.parse({
      ...applicationEventHeader({
        operationContext: preflight.operationContext,
        outcome: "succeeded",
        completedAt,
      }),
      eventType: "CHARLIE_SIGNATURE_REVIEW_RESOLVED",
      result: serviceOutcome.result,
      receipts: [receipt],
    });
    return finalReviewResolvedTerminalArtifactSchema.parse({
      applicationOrchestrationContractVersion:
        APPLICATION_ORCHESTRATION_CONTRACT_VERSION,
      terminalKind: "final_review_resolved",
      outcomeKind: "resolved",
      event,
      budgetEvaluation,
      budgetUsage,
    });
  }

  const event = charlieSignatureReviewFailedEventSchema.parse({
    ...applicationEventHeader({
      operationContext: preflight.operationContext,
      outcome: "failed",
      completedAt,
    }),
    eventType: "CHARLIE_SIGNATURE_REVIEW_FAILED",
    error: serviceOutcome.error,
    receipts: [receipt],
  });
  return finalReviewFailedTerminalArtifactSchema.parse({
    applicationOrchestrationContractVersion:
      APPLICATION_ORCHESTRATION_CONTRACT_VERSION,
    terminalKind: "final_review_failed",
    outcomeKind: "failed",
    event,
    budgetEvaluation,
    budgetUsage,
  });
}

function validateReviewInputBindings(
  reviewInput: CharlieSignatureReviewInput,
  context: CharlieSignatureReviewRequestContext,
): string | null {
  const content = context.bindings.content;
  if (
    context.bindings.revisions.preciseRevisionId !==
      reviewInput.preciseRevisionId ||
    context.bindings.revisions.plainRevisionId !== reviewInput.plainRevisionId ||
    content.contentBundleId !== reviewInput.contentBundleId ||
    content.contentBundleVersion !== reviewInput.contentBundleVersion ||
    content.contentBundleChecksum !== reviewInput.contentBundleChecksum
  ) {
    return "Final Review business input must match its capability RequestContext bindings";
  }
  return null;
}

function revalidateReviewedOutcome(
  reviewInput: CharlieSignatureReviewInput,
  context: CharlieSignatureReviewRequestContext,
  outcome: Extract<CharlieSignatureReviewServiceOutcome, { outcomeKind: "reviewed" }>,
  trustedEvidenceIds: readonly string[],
  safetyPolicy: CharlieSignatureReviewSafetyPolicy,
): CharlieSignatureReviewServiceOutcome {
  const reported = outcome.result;
  const binding = validateCharlieSignatureReviewResultBinding({
    reviewInput,
    context,
    result: reported,
  });
  if (binding.bindingValidationKind === "invalid") {
    return {
      outcomeKind: "unavailable",
      error: binding.error,
      observation: outcome.observation,
    };
  }
  const validation = validateCharlieSignatureReviewCandidate({
    reviewInput,
    context,
    trustedEvidenceIds,
    safetyPolicy,
    candidate: {
      status: reported.status,
      finalReviewSchemaVersion: reported.finalReviewSchemaVersion,
      reason: reported.reason,
      evidenceIds: reported.evidenceIds,
    },
  });
  return validation.validationKind === "validated"
    ? {
        outcomeKind: "reviewed",
        result: validation.result,
        observation: outcome.observation,
      }
    : {
        outcomeKind: "unavailable",
        error: validation.error,
        observation: outcome.observation,
      };
}

function unavailableOutcome(
  code: Parameters<typeof createCharlieSignatureReviewError>[0],
  message: string,
  observation: FinalReviewExecutionObservation =
    ZERO_FINAL_REVIEW_EXECUTION_OBSERVATION,
): Extract<CharlieSignatureReviewServiceOutcome, { outcomeKind: "unavailable" }> {
  return {
    outcomeKind: "unavailable",
    error: createCharlieSignatureReviewError(code, message),
    observation,
  };
}

function deepFrozenJsonSnapshot<T>(value: T): T {
  return deepFreezeJsonValue(structuredClone(value));
}

function deepFreezeJsonValue<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) {
    return value;
  }
  for (const child of Object.values(value as Record<string, unknown>)) {
    deepFreezeJsonValue(child);
  }
  return Object.freeze(value);
}

import {
  AGENT_CONTRACT_VERSION,
  AGENT_RESULT_SCHEMA_VERSIONS,
  PLAIN_SEMANTIC_BUNDLE_SCHEMA_VERSION,
  ZERO_AGENT_EXECUTION_OBSERVATION,
  agentCapabilityError,
  agentCapabilityErrorSchema,
  plainSemanticReviewCandidateBundleSchema,
  validatePlainSemanticReviewCandidateBundle,
  type AgentCandidateValidationContext,
  type AgentCapabilityError,
  type AgentExecutionObservation,
  type PlainSemanticReviewPortInput,
  type ProviderNeutralAgentPort,
  type ValidatedPlainSemanticBundle,
} from "../agent";
import type { RequestContext } from "../runtime";
import { deriveStage3EntityId } from "./entity-id";
import { resolveAgentExecutionRoute } from "./execution-mode";
import { plainSemanticRuntimePortInputSchema } from "./port-input.schemas";
import {
  buildPlainSemanticInputMaterials,
  stage3RequestFingerprintMatches,
} from "./semantic-input";
import {
  applicationEventHeader,
  adapterVersionMatchesContexts,
  evaluateObservedExecutionBudget,
  fallbackBindingMatches,
  fallbackExecutionIdentityIsValid,
  fallbackObservationIsZero,
  parseRequestContext,
  recordAgentCapabilityReceipt,
  roleFallbackMayHandleAgentError,
  runOrchestrationPreflight,
} from "./orchestration-common";
import type {
  ExplicitCandidateFallback,
  FallbackExecutionIdentity,
  OrchestrationOperationBoundary,
  PlainSemanticOrchestrationOutcome,
} from "./orchestration.contracts";
import {
  plainSemanticBundleFailedEventSchema,
  plainSemanticBundleResolvedEventSchema,
  plainSemanticFailedTerminalArtifactSchema,
  plainSemanticResolvedTerminalArtifactSchema,
} from "./orchestration.schemas";

export async function orchestratePlainSemanticReview(input: {
  boundary: OrchestrationOperationBoundary;
  port: ProviderNeutralAgentPort;
  portInput: PlainSemanticReviewPortInput;
  validationContext: Pick<
    AgentCandidateValidationContext,
    "safetyPolicy"
  >;
  capabilityContext: RequestContext;
  fallback: ExplicitCandidateFallback;
}): Promise<PlainSemanticOrchestrationOutcome> {
  const parsedPortInput = plainSemanticRuntimePortInputSchema.safeParse(
    input.portInput,
  );
  if (!parsedPortInput.success) {
    return {
      outcomeKind: "preflight_rejected",
      reason: "invalid_context",
      detail: "Plain/Semantic PortInput failed strict runtime validation",
    };
  }
  const portInput = parsedPortInput.data;
  const preflight = runOrchestrationPreflight({
    boundary: input.boundary,
    expectedOperationCapability: "executePlainSemanticReview",
    expectedBudgetSlot: "plain_semantic",
    capabilityContexts: {
      compareSemanticDrift: input.capabilityContext,
    },
  });
  if (!preflight.ok) return preflight.rejection;

  const bindingError = validatePlainSemanticBindings(
    preflight.operationContext,
    portInput,
  );
  if (bindingError !== null) {
    return {
      outcomeKind: "preflight_rejected",
      reason: "invalid_context",
      detail: bindingError,
    };
  }

  const semanticMaterials = buildPlainSemanticInputMaterials({
    portInput,
    safetyPolicy: input.validationContext.safetyPolicy,
  });
  const semanticFingerprintsValid = await Promise.all([
    stage3RequestFingerprintMatches({
      context: preflight.operationContext,
      semanticMaterial: semanticMaterials.operation,
      agentContractVersion: AGENT_CONTRACT_VERSION,
      resultSchemaVersion: PLAIN_SEMANTIC_BUNDLE_SCHEMA_VERSION,
    }),
    stage3RequestFingerprintMatches({
      context: input.capabilityContext,
      semanticMaterial: semanticMaterials.compareSemanticDrift,
      agentContractVersion: AGENT_CONTRACT_VERSION,
      resultSchemaVersion: AGENT_RESULT_SCHEMA_VERSIONS.compareSemanticDrift,
    }),
  ]);
  if (semanticFingerprintsValid.some((valid) => !valid)) {
    return {
      outcomeKind: "preflight_rejected",
      reason: "invalid_context",
      detail:
        "Plain/Semantic RequestContext fingerprint does not match its canonical semantic input",
    };
  }

  const startedAt = preflight.observedAt;
  if (preflight.budgetEvaluation.decision === "reject") {
    return failedOutcome(
      preflight,
      input.capabilityContext,
      agentCapabilityError(
        "compareSemanticDrift",
        "budget_exhausted",
        "Plain/Semantic absolute execution budget was exhausted",
      ),
      startedAt,
      startedAt,
      "budget_exhausted",
    );
  }

  const route = resolveAgentExecutionRoute({
    requestedMode: preflight.operationContext.requestedMode,
    availability: input.boundary.availability,
  });
  if (
    preflight.budgetEvaluation.decision === "proceed" &&
    route.resolvedMode !== "unavailable" &&
    route.resolvedMode !== input.port.executionMode
  ) {
    return {
      outcomeKind: "preflight_rejected",
      reason: "invalid_context",
      detail: `Resolved ${route.resolvedMode} route requires a matching Agent port`,
    };
  }
  const usePrimary =
    preflight.budgetEvaluation.decision === "proceed" &&
    route.resolvedMode !== "unavailable";

  if (
    usePrimary &&
    !adapterVersionMatchesContexts({
      adapterVersion: input.port.adapterVersion,
      operationContext: input.boundary.operationContext,
      capabilityContexts: [input.capabilityContext],
    })
  ) {
    return {
      outcomeKind: "preflight_rejected",
      reason: "invalid_context",
      detail:
        "Agent port adapterVersion must match the bundle and capability RequestContexts",
    };
  }

  let primaryCandidate: unknown;
  let executionObservation: AgentExecutionObservation | undefined;
  let budgetEvaluation = preflight.budgetEvaluation;
  let budgetUsage = preflight.budgetUsage;
  let primaryError: AgentCapabilityError | null = null;
  if (usePrimary) {
    let envelope: Awaited<
      ReturnType<ProviderNeutralAgentPort["executePlainSemanticReview"]>
    > | undefined;
    try {
      envelope = await input.port.executePlainSemanticReview(
        portInput,
        input.boundary.operationContext,
      );
    } catch {
      executionObservation = ZERO_AGENT_EXECUTION_OBSERVATION;
      primaryError = agentCapabilityError(
        "compareSemanticDrift",
        "network_error",
        "Plain/Semantic adapter call failed",
      );
    }
    if (primaryError === null) {
      if (
        envelope === undefined ||
        typeof envelope !== "object" ||
        !("observation" in envelope)
      ) {
        return failedOutcome(
          preflight,
          input.capabilityContext,
          agentCapabilityError(
            "compareSemanticDrift",
            "invalid_output",
            "Plain/Semantic adapter returned an invalid execution envelope",
          ),
          startedAt,
          preflight.clock.now(),
          "invalid_execution_observation",
          budgetEvaluation,
          budgetUsage,
          primaryExecutionIdentity(input.port, input.capabilityContext),
        );
      }
      try {
        const observed = evaluateObservedExecutionBudget({
          boundary: input.boundary,
          observation: envelope.observation,
        });
        executionObservation = observed.observation;
        budgetEvaluation = observed.evaluation;
        budgetUsage = observed.usage;
      } catch {
        return failedOutcome(
          preflight,
          input.capabilityContext,
          agentCapabilityError(
            "compareSemanticDrift",
            "invalid_output",
            "Plain/Semantic execution observation was invalid",
          ),
          startedAt,
          preflight.clock.now(),
          "invalid_execution_observation",
          budgetEvaluation,
          budgetUsage,
          primaryExecutionIdentity(input.port, input.capabilityContext),
        );
      }
      if (budgetEvaluation.decision === "reject") {
        return failedOutcome(
          preflight,
          input.capabilityContext,
          agentCapabilityError(
            "compareSemanticDrift",
            "budget_exhausted",
            "Plain/Semantic actual execution exceeded the absolute budget",
          ),
          startedAt,
          preflight.clock.now(),
          "budget_exhausted",
          budgetEvaluation,
          budgetUsage,
          primaryExecutionIdentity(input.port, input.capabilityContext),
          executionObservation,
        );
      }
      if (budgetEvaluation.decision === "degrade") {
        primaryError = agentCapabilityError(
          "compareSemanticDrift",
          "budget_exhausted",
          "Plain/Semantic actual execution exceeded the base budget and requires an explicit fallback",
        );
      } else if (envelope.outcomeKind === "candidate") {
        primaryCandidate = envelope.candidate;
      } else if (envelope.outcomeKind === "error") {
        const technicalError = agentCapabilityErrorSchema.safeParse(
          envelope.error,
        );
        primaryError = technicalError.success
          ? agentCapabilityError(
              "compareSemanticDrift",
              technicalError.data.code,
              technicalError.data.summary,
            )
          : agentCapabilityError(
              "compareSemanticDrift",
              "invalid_output",
              "Plain/Semantic adapter returned a malformed technical error",
            );
      } else {
        primaryError = agentCapabilityError(
          "compareSemanticDrift",
          "invalid_output",
          "Plain/Semantic adapter returned an unknown execution outcome",
        );
      }
    }
  }
  let bundle: ValidatedPlainSemanticBundle | null = null;
  let resolvedMode: "live" | "mock" | "static_template" = "mock";
  let fallbackReason: string | null = null;
  let receiptObservation = executionObservation;
  let receiptExecutionIdentity: FallbackExecutionIdentity = usePrimary
    ? primaryExecutionIdentity(input.port, input.capabilityContext)
    : NULL_EXECUTION_IDENTITY;
  if (usePrimary && primaryError === null) {
    const primary = validatePlainCandidate(
      primaryCandidate,
      portInput,
      input.validationContext.safetyPolicy,
      preflight.operationContext.operationId,
    );
    if (primary.ok) {
      bundle = primary.value;
      resolvedMode = route.resolvedMode;
      fallbackReason = route.fallbackReason;
    } else if (!primary.ok) {
      primaryError = primary.error;
    }
  }

  if (
    bundle === null &&
    input.fallback.kind === "candidate" &&
    roleFallbackMayHandleAgentError(primaryError)
  ) {
    if (
      !fallbackBindingMatches(input.fallback.binding, input.capabilityContext) ||
      !fallbackObservationIsZero(input.fallback.observation) ||
      !fallbackExecutionIdentityIsValid(input.fallback.executionIdentity)
    ) {
      primaryError = agentCapabilityError(
        "compareSemanticDrift",
        "stale_revision",
        "Fallback Candidate binding, static observation, or execution identity does not match the current capability execution",
      );
    } else {
      receiptObservation = input.fallback.observation;
      receiptExecutionIdentity = input.fallback.executionIdentity;
      const fallback = validatePlainCandidate(
        input.fallback.candidate,
        portInput,
        input.validationContext.safetyPolicy,
        preflight.operationContext.operationId,
      );
      if (fallback.ok) {
        bundle = fallback.value;
        resolvedMode = input.fallback.resolvedMode;
        fallbackReason = nonBlankReason(input.fallback.fallbackReason);
      } else {
        primaryError = fallback.error;
      }
    }
  }

  if (bundle === null) {
    return failedOutcome(
      preflight,
      input.capabilityContext,
      primaryError ??
        agentCapabilityError(
          "compareSemanticDrift",
          preflight.budgetEvaluation.decision === "degrade"
            ? "budget_exhausted"
            : "fallback_unavailable",
          preflight.budgetEvaluation.decision === "degrade"
            ? "Plain/Semantic base budget requires an explicit fallback"
            : "No validated Plain/Semantic bundle or permitted fallback was available",
      ),
      startedAt,
      preflight.clock.now(),
      nonBlankReason(input.fallback.fallbackReason),
      budgetEvaluation,
      budgetUsage,
      receiptExecutionIdentity,
      receiptObservation,
    );
  }

  const completedAt = preflight.clock.now();
  const receipt = recordAgentCapabilityReceipt({
    context: input.capabilityContext,
    resolvedMode,
    outcome: "succeeded",
    fallbackReason,
    resultSchemaVersion: AGENT_RESULT_SCHEMA_VERSIONS.compareSemanticDrift,
    agentContractVersion: AGENT_CONTRACT_VERSION,
    startedAt,
    completedAt,
    executionIdentity: receiptExecutionIdentity,
    ...(receiptObservation === undefined
      ? {}
      : { observation: receiptObservation }),
  });
  const event = plainSemanticBundleResolvedEventSchema.parse({
    ...applicationEventHeader({
      operationContext: preflight.operationContext,
      outcome: "succeeded",
      completedAt,
    }),
    eventType: "PLAIN_SEMANTIC_BUNDLE_RESOLVED",
    bundle,
    receipts: [receipt],
  });
  return plainSemanticResolvedTerminalArtifactSchema.parse({
    applicationOrchestrationContractVersion: "0.1.0",
    terminalKind: "plain_semantic_resolved",
    outcomeKind: "resolved",
    event,
    budgetEvaluation,
    budgetUsage,
  });
}

function failedOutcome(
  preflight: Extract<ReturnType<typeof runOrchestrationPreflight>, { ok: true }>,
  context: RequestContext,
  error: AgentCapabilityError,
  startedAt: string,
  completedAt: string,
  fallbackReason: string,
  budgetEvaluation = preflight.budgetEvaluation,
  budgetUsage = preflight.budgetUsage,
  executionIdentity: FallbackExecutionIdentity = NULL_EXECUTION_IDENTITY,
  observation?: AgentExecutionObservation,
): PlainSemanticOrchestrationOutcome {
  const receipt = recordAgentCapabilityReceipt({
    context,
    resolvedMode: "unavailable",
    outcome: "failed",
    fallbackReason: nonBlankReason(fallbackReason),
    resultSchemaVersion: AGENT_RESULT_SCHEMA_VERSIONS.compareSemanticDrift,
    agentContractVersion: AGENT_CONTRACT_VERSION,
    startedAt,
    completedAt,
    executionIdentity,
    ...(observation === undefined ? {} : { observation }),
  });
  const event = plainSemanticBundleFailedEventSchema.parse({
    ...applicationEventHeader({
      operationContext: preflight.operationContext,
      outcome: "failed",
      completedAt,
    }),
    eventType: "PLAIN_SEMANTIC_BUNDLE_FAILED",
    error,
    receipts: [receipt],
  });
  return plainSemanticFailedTerminalArtifactSchema.parse({
    applicationOrchestrationContractVersion: "0.1.0",
    terminalKind: "plain_semantic_failed",
    outcomeKind: "failed",
    event,
    budgetEvaluation,
    budgetUsage,
  });
}

function validatePlainSemanticBindings(
  context: ReturnType<typeof parseRequestContext>,
  input: PlainSemanticReviewPortInput,
): string | null {
  const expectedPlainRevisionId = deriveStage3EntityId({
    operationId: context.operationId,
    entityKind: "plain_revision",
    ordinal: 0,
  });
  const content = context.bindings.content;
  if (
    content.contentBundleId === null ||
    content.contentBundleVersion === null ||
    content.contentBundleChecksum === null ||
    content.contentBundleId !== input.contentBinding.contentBundleId ||
    content.contentBundleVersion !== input.contentBinding.contentBundleVersion ||
    content.contentBundleChecksum !== input.contentBinding.contentBundleChecksum ||
    context.bindings.revisions.preciseRevisionId !==
      input.sourcePreciseRevisionId ||
    context.bindings.revisions.plainRevisionId !== input.targetPlainRevisionId ||
    input.targetPlainRevisionId !== expectedPlainRevisionId
  ) {
    return "Plain/Semantic input bindings must match its operation RequestContext";
  }
  return null;
}

function validatePlainCandidate(
  candidate: unknown,
  input: PlainSemanticReviewPortInput,
  safetyPolicy: AgentCandidateValidationContext["safetyPolicy"],
  operationId: string,
) {
  const parsed = plainSemanticReviewCandidateBundleSchema.safeParse(candidate);
  const fragmentCount = parsed.success
    ? parsed.data.semanticReview.semanticFragments.length
    : 0;
  return validatePlainSemanticReviewCandidateBundle(candidate, input, {
    safetyPolicy,
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
  });
}

function nonBlankReason(reason: string): string {
  return reason.trim().length > 0 ? reason : "fallback_unavailable";
}

const NULL_EXECUTION_IDENTITY: FallbackExecutionIdentity = Object.freeze({
  adapterVersion: null,
  promptVersion: null,
});

function primaryExecutionIdentity(
  port: ProviderNeutralAgentPort,
  context: RequestContext,
): FallbackExecutionIdentity {
  return {
    adapterVersion: port.adapterVersion,
    promptVersion: context.promptVersion,
  } as const;
}

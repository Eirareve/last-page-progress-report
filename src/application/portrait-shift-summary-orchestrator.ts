import {
  AGENT_CONTRACT_VERSION,
  AGENT_RESULT_SCHEMA_VERSIONS,
  ZERO_AGENT_EXECUTION_OBSERVATION,
  agentCapabilityError,
  agentCapabilityErrorSchema,
  summarizePortraitShiftInputSchema,
  validateSummarizePortraitShiftCandidate,
  type AgentCandidateValidationContext,
  type AgentCapabilityError,
  type AgentEvidenceContext,
  type AgentExecutionObservation,
  type ProviderNeutralAgentPort,
  type SummarizePortraitShiftInput,
  type SummarizePortraitShiftValidatedResult,
} from "../agent";
import type { RequestContext } from "../runtime";
import { resolveAgentExecutionRoute } from "./execution-mode";
import {
  buildPortraitSummaryInputMaterials,
  stage3RequestFingerprintMatches,
} from "./semantic-input";
import {
  applicationEventHeader,
  adapterVersionMatchesContexts,
  evaluateObservedExecutionBudget,
  fallbackBindingMatches,
  fallbackExecutionIdentityIsValid,
  fallbackObservationIsZero,
  recordAgentCapabilityReceipt,
  roleFallbackMayHandleAgentError,
  runOrchestrationPreflight,
} from "./orchestration-common";
import type {
  ExplicitCandidateFallback,
  FallbackExecutionIdentity,
  OrchestrationOperationBoundary,
  PortraitShiftSummaryOrchestrationOutcome,
} from "./orchestration.contracts";
import {
  portraitShiftSummaryFailureArtifactSchema,
  portraitShiftSummarySucceededEventSchema,
  portraitSummaryFailedTerminalArtifactSchema,
  portraitSummaryResolvedTerminalArtifactSchema,
} from "./orchestration.schemas";

export async function orchestratePortraitShiftSummary(input: {
  boundary: OrchestrationOperationBoundary;
  port: ProviderNeutralAgentPort;
  summaryInput: SummarizePortraitShiftInput;
  validationContext: Pick<AgentCandidateValidationContext, "safetyPolicy">;
  evidenceContext: AgentEvidenceContext;
  capabilityContext: RequestContext;
  fallback: ExplicitCandidateFallback;
}): Promise<PortraitShiftSummaryOrchestrationOutcome> {
  const parsedSummaryInput = summarizePortraitShiftInputSchema.safeParse(
    input.summaryInput,
  );
  if (!parsedSummaryInput.success) {
    return {
      outcomeKind: "preflight_rejected",
      reason: "invalid_context",
      detail: "Portrait summary PortInput failed strict runtime validation",
    };
  }
  const summaryInput = parsedSummaryInput.data;
  const preflight = runOrchestrationPreflight({
    boundary: input.boundary,
    expectedOperationCapability: "executePortraitShiftSummary",
    expectedBudgetSlot: "portrait_shift_summary",
    capabilityContexts: {
      summarizePortraitShift: input.capabilityContext,
    },
  });
  if (!preflight.ok) return preflight.rejection;

  const bindingError = validatePortraitSummaryBindings(
    preflight.operationContext,
    summaryInput,
    input.evidenceContext,
  );
  if (bindingError !== null) {
    return {
      outcomeKind: "preflight_rejected",
      reason: "invalid_context",
      detail: bindingError,
    };
  }

  const semanticMaterials = buildPortraitSummaryInputMaterials({
    summaryInput,
    evidenceContext: input.evidenceContext,
    safetyPolicy: input.validationContext.safetyPolicy,
  });
  const semanticFingerprintsValid = await Promise.all([
    stage3RequestFingerprintMatches({
      context: preflight.operationContext,
      semanticMaterial: semanticMaterials.operation,
      agentContractVersion: AGENT_CONTRACT_VERSION,
      resultSchemaVersion: AGENT_RESULT_SCHEMA_VERSIONS.summarizePortraitShift,
    }),
    stage3RequestFingerprintMatches({
      context: input.capabilityContext,
      semanticMaterial: semanticMaterials.summarizePortraitShift,
      agentContractVersion: AGENT_CONTRACT_VERSION,
      resultSchemaVersion: AGENT_RESULT_SCHEMA_VERSIONS.summarizePortraitShift,
    }),
  ]);
  if (semanticFingerprintsValid.some((valid) => !valid)) {
    return {
      outcomeKind: "preflight_rejected",
      reason: "invalid_context",
      detail:
        "Portrait summary RequestContext fingerprint does not match its canonical semantic input",
    };
  }

  const startedAt = preflight.observedAt;
  if (preflight.budgetEvaluation.decision === "reject") {
    return failedOutcome(
      preflight,
      input.capabilityContext,
      agentCapabilityError(
        "summarizePortraitShift",
        "budget_exhausted",
        "Portrait summary absolute execution budget was exhausted",
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
      ReturnType<ProviderNeutralAgentPort["summarizePortraitShift"]>
    > | undefined;
    try {
      envelope = await input.port.summarizePortraitShift(
        summaryInput,
        input.boundary.operationContext,
      );
    } catch {
      executionObservation = ZERO_AGENT_EXECUTION_OBSERVATION;
      primaryError = agentCapabilityError(
        "summarizePortraitShift",
        "network_error",
        "Portrait summary adapter call failed",
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
            "summarizePortraitShift",
            "invalid_output",
            "Portrait summary adapter returned an invalid execution envelope",
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
            "summarizePortraitShift",
            "invalid_output",
            "Portrait summary execution observation was invalid",
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
            "summarizePortraitShift",
            "budget_exhausted",
            "Portrait summary actual execution exceeded the absolute budget",
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
          "summarizePortraitShift",
          "budget_exhausted",
          "Portrait summary actual execution exceeded the base budget and requires an explicit fallback",
        );
      } else if (envelope.outcomeKind === "candidate") {
        primaryCandidate = envelope.candidate;
      } else if (envelope.outcomeKind === "error") {
        const technicalError = agentCapabilityErrorSchema.safeParse(
          envelope.error,
        );
        primaryError = technicalError.success
          ? agentCapabilityError(
              "summarizePortraitShift",
              technicalError.data.code,
              technicalError.data.summary,
            )
          : agentCapabilityError(
              "summarizePortraitShift",
              "invalid_output",
              "Portrait summary adapter returned a malformed technical error",
            );
      } else {
        primaryError = agentCapabilityError(
          "summarizePortraitShift",
          "invalid_output",
          "Portrait summary adapter returned an unknown execution outcome",
        );
      }
    }
  }
  let result: SummarizePortraitShiftValidatedResult | null = null;
  let resolvedMode: "live" | "mock" | "static_template" = "mock";
  let fallbackReason: string | null = null;
  let receiptObservation = executionObservation;
  let receiptExecutionIdentity: FallbackExecutionIdentity = usePrimary
    ? primaryExecutionIdentity(input.port, input.capabilityContext)
    : NULL_EXECUTION_IDENTITY;
  if (usePrimary && primaryError === null) {
    const primary = validateSummarizePortraitShiftCandidate(
      primaryCandidate,
      summaryInput,
      input.validationContext,
    );
    if (primary.ok) {
      result = primary.value;
      resolvedMode = route.resolvedMode;
      fallbackReason = route.fallbackReason;
    } else if (!primary.ok) {
      primaryError = primary.error;
    }
  }

  if (
    result === null &&
    input.fallback.kind === "candidate" &&
    roleFallbackMayHandleAgentError(primaryError)
  ) {
    if (
      !fallbackBindingMatches(input.fallback.binding, input.capabilityContext) ||
      !fallbackObservationIsZero(input.fallback.observation) ||
      !fallbackExecutionIdentityIsValid(input.fallback.executionIdentity)
    ) {
      primaryError = agentCapabilityError(
        "summarizePortraitShift",
        "stale_revision",
        "Fallback Candidate binding, static observation, or execution identity does not match the current capability execution",
      );
    } else {
      receiptObservation = input.fallback.observation;
      receiptExecutionIdentity = input.fallback.executionIdentity;
      const fallback = validateSummarizePortraitShiftCandidate(
        input.fallback.candidate,
        summaryInput,
        input.validationContext,
      );
      if (fallback.ok) {
        result = fallback.value;
        resolvedMode = input.fallback.resolvedMode;
        fallbackReason = nonBlankReason(input.fallback.fallbackReason);
      } else {
        primaryError = fallback.error;
      }
    }
  }

  if (result === null) {
    return failedOutcome(
      preflight,
      input.capabilityContext,
      primaryError ??
        agentCapabilityError(
          "summarizePortraitShift",
          preflight.budgetEvaluation.decision === "degrade"
            ? "budget_exhausted"
            : "fallback_unavailable",
          preflight.budgetEvaluation.decision === "degrade"
            ? "Portrait summary base budget requires an explicit fallback"
            : "No validated portrait summary or permitted fallback was available",
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
    resultSchemaVersion: AGENT_RESULT_SCHEMA_VERSIONS.summarizePortraitShift,
    agentContractVersion: AGENT_CONTRACT_VERSION,
    startedAt,
    completedAt,
    executionIdentity: receiptExecutionIdentity,
    ...(receiptObservation === undefined
      ? {}
      : { observation: receiptObservation }),
  });
  const event = portraitShiftSummarySucceededEventSchema.parse({
    ...applicationEventHeader({
      operationContext: preflight.operationContext,
      outcome: "succeeded",
      completedAt,
    }),
    eventType: "PORTRAIT_SHIFT_SUMMARY_SUCCEEDED",
    result,
    receipts: [receipt],
  });
  return portraitSummaryResolvedTerminalArtifactSchema.parse({
    applicationOrchestrationContractVersion: "0.1.0",
    terminalKind: "portrait_summary_resolved",
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
): PortraitShiftSummaryOrchestrationOutcome {
  const receipt = recordAgentCapabilityReceipt({
    context,
    resolvedMode: "unavailable",
    outcome: "failed",
    fallbackReason: nonBlankReason(fallbackReason),
    resultSchemaVersion: AGENT_RESULT_SCHEMA_VERSIONS.summarizePortraitShift,
    agentContractVersion: AGENT_CONTRACT_VERSION,
    startedAt,
    completedAt,
    executionIdentity,
    ...(observation === undefined ? {} : { observation }),
  });
  const failure = portraitShiftSummaryFailureArtifactSchema.parse({
    applicationOrchestrationContractVersion: "0.1.0",
    operationId: preflight.operationContext.operationId,
    requestId: preflight.operationContext.requestId,
    capability: preflight.operationContext.capability,
    stage: preflight.operationContext.stage,
    stageInstanceId: preflight.operationContext.stageInstanceId,
    inputFingerprint: preflight.operationContext.inputFingerprint,
    bindings: preflight.operationContext.bindings,
    outcome: "failed",
    completedAt,
    artifactKind: "portrait_shift_summary_failure",
    error,
    receipts: [receipt],
  });
  return portraitSummaryFailedTerminalArtifactSchema.parse({
    applicationOrchestrationContractVersion: "0.1.0",
    terminalKind: "portrait_summary_failed",
    outcomeKind: "failed",
    failure,
    budgetEvaluation,
    budgetUsage,
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

function validatePortraitSummaryBindings(
  context: Parameters<typeof runOrchestrationPreflight>[0]["boundary"]["operationContext"],
  summaryInput: SummarizePortraitShiftInput,
  evidenceContext: AgentEvidenceContext,
): string | null {
  const currentRevisionIds = new Set(
    [
      context.bindings.revisions.preciseRevisionId,
      context.bindings.revisions.plainRevisionId,
    ].filter((revisionId): revisionId is string => revisionId !== null),
  );
  const allowedRevisionIds = new Set(summaryInput.allowedRevisionIds);
  if (
    summaryInput.allowedRevisionIds.some(
      (revisionId) => !currentRevisionIds.has(revisionId),
    ) ||
    summaryInput.comparison.relatedRevisionIds.some(
      (revisionId) =>
        !currentRevisionIds.has(revisionId) ||
        !allowedRevisionIds.has(revisionId),
    )
  ) {
    return "Portrait summary revisions must be drawn from the current RequestContext revisions";
  }

  const relatedEvidenceIds = summaryInput.comparison.relatedEvidenceIds;
  if (evidenceContext.contentMode === "placeholder") {
    if (
      summaryInput.allowedEvidenceIds.length > 0 ||
      relatedEvidenceIds.length > 0
    ) {
      return "Placeholder portrait summaries cannot persist evidence identifiers";
    }
    return null;
  }

  const verifiedFactIds = new Set(
    evidenceContext.verifiedFacts.map(({ id }) => id),
  );
  const trustedAllowedIds = new Set(evidenceContext.allowedEvidenceIds);
  const summaryAllowedIds = new Set(summaryInput.allowedEvidenceIds);
  if (
    summaryInput.allowedEvidenceIds.some(
      (evidenceId) =>
        !verifiedFactIds.has(evidenceId) || !trustedAllowedIds.has(evidenceId),
    ) ||
    relatedEvidenceIds.some(
      (evidenceId) =>
        !verifiedFactIds.has(evidenceId) || !summaryAllowedIds.has(evidenceId),
    )
  ) {
    return "Portrait summary evidence must be drawn from verified, explicitly allowed facts";
  }
  return null;
}

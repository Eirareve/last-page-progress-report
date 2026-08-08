import {
  AGENT_CONTRACT_VERSION,
  AGENT_RESULT_SCHEMA_VERSIONS,
  ROUND_ANALYSIS_CANDIDATE_BUNDLE_SCHEMA_VERSION,
  ROUND_ANALYSIS_BUNDLE_SCHEMA_VERSION,
  ZERO_AGENT_EXECUTION_OBSERVATION,
  agentContentBindingSchema,
  agentCapabilityError,
  agentCapabilityErrorSchema,
  agentRevisionBindingSchema,
  contentBindingsEqual,
  detectTensionInputSchema,
  generateCharlieResponseInputSchema,
  proposeDocumentDiffInputSchema,
  revisionBindingsEqual,
  validateDetectTensionCandidate,
  validateExtractUserPrincipleCandidate,
  validateGenerateCharlieResponseCandidate,
  validateProposeDocumentDiffCandidate,
  validatedRoundAnalysisBundleSchema,
  type AgentCandidateValidationContext,
  type AgentCapabilityError,
  type AgentExecutionObservation,
  type AgentOperationResult,
  type ProviderNeutralAgentPort,
  type RoundAnalysisPortInput,
} from "../agent";
import type { CapabilityExecutionReceipt } from "../provenance";
import type { RequestContext } from "../runtime";
import { resolveAgentExecutionRoute } from "./execution-mode";
import { deriveStage3EntityId } from "./entity-id";
import { roundAnalysisRuntimePortInputSchema } from "./port-input.schemas";
import {
  buildRoundAnalysisSemanticMaterials,
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
  CapabilityResolution,
  FallbackExecutionIdentity,
  OrchestrationOperationBoundary,
  RoundAnalysisCapability,
  RoundAnalysisFallbackPlan,
  RoundAnalysisOrchestrationOutcome,
} from "./orchestration.contracts";
import {
  roundAnalysisBundleFailedEventSchema,
  roundAnalysisBundleResolvedEventSchema,
  roundAnalysisFailedTerminalArtifactSchema,
  roundAnalysisResolvedTerminalArtifactSchema,
} from "./orchestration.schemas";
import { APPLICATION_ORCHESTRATION_CONTRACT_VERSION } from "./schemas";

const ROUND_CAPABILITIES = [
  "extractUserPrinciple",
  "detectTension",
  "generateCharlieResponse",
  "proposeDocumentDiff",
] as const satisfies readonly RoundAnalysisCapability[];

type RoundCapabilityContexts = Readonly<
  Record<RoundAnalysisCapability, RequestContext>
>;

type RoundResolution = Readonly<{
  capability: RoundAnalysisCapability;
  resolvedMode: "live" | "mock" | "static_template" | "unavailable";
  outcome: "succeeded" | "failed" | "skipped";
  fallbackReason: string | null;
  executionIdentity: Readonly<{
    adapterVersion: string | null;
    promptVersion: string | null;
  }>;
  resolutionSource: "primary" | "fallback" | "unavailable";
  observation?: AgentExecutionObservation;
}>;

export async function orchestrateRoundAnalysis(input: {
  boundary: OrchestrationOperationBoundary;
  port: ProviderNeutralAgentPort;
  portInput: RoundAnalysisPortInput;
  validationContext: Pick<AgentCandidateValidationContext, "safetyPolicy">;
  capabilityContexts: RoundCapabilityContexts;
  fallbacks: RoundAnalysisFallbackPlan;
}): Promise<RoundAnalysisOrchestrationOutcome> {
  const parsedPortInput = roundAnalysisRuntimePortInputSchema.safeParse(
    input.portInput,
  );
  if (!parsedPortInput.success) {
    return {
      outcomeKind: "preflight_rejected",
      reason: "invalid_context",
      detail: "Round Analysis PortInput failed strict runtime validation",
    };
  }
  const portInput = parsedPortInput.data;
  let budgetSlot: "round_1" | "round_2" | "round_3";
  try {
    budgetSlot = roundBudgetSlot(portInput.extractUserPrinciple.roundId);
  } catch (error) {
    return {
      outcomeKind: "preflight_rejected",
      reason: "invalid_context",
      detail: error instanceof Error ? error.message : "Invalid round identifier",
    };
  }
  const preflight = runOrchestrationPreflight({
    boundary: input.boundary,
    expectedOperationCapability: "executeRoundAnalysis",
    expectedBudgetSlot: budgetSlot,
    capabilityContexts: input.capabilityContexts,
  });
  if (!preflight.ok) return preflight.rejection;

  const bindingError = validateRoundOperationBindings(
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
  const evidenceBoundaryError = validateRoundEvidenceInputBoundary(portInput);
  if (evidenceBoundaryError !== null) {
    return {
      outcomeKind: "preflight_rejected",
      reason: "invalid_context",
      detail: evidenceBoundaryError,
    };
  }

  const semanticMaterials = buildRoundAnalysisSemanticMaterials({
    portInput,
    safetyPolicy: input.validationContext.safetyPolicy,
  });
  const semanticFingerprintsValid = await Promise.all([
    stage3RequestFingerprintMatches({
      context: preflight.operationContext,
      semanticMaterial: semanticMaterials.operation,
      agentContractVersion: AGENT_CONTRACT_VERSION,
      resultSchemaVersion: ROUND_ANALYSIS_BUNDLE_SCHEMA_VERSION,
    }),
    ...ROUND_CAPABILITIES.map((capability) =>
      stage3RequestFingerprintMatches({
        context: input.capabilityContexts[capability],
        semanticMaterial: semanticMaterials[capability],
        agentContractVersion: AGENT_CONTRACT_VERSION,
        resultSchemaVersion: AGENT_RESULT_SCHEMA_VERSIONS[capability],
      }),
    ),
  ]);
  if (semanticFingerprintsValid.some((valid) => !valid)) {
    return {
      outcomeKind: "preflight_rejected",
      reason: "invalid_context",
      detail:
        "Round Analysis RequestContext fingerprint does not match its canonical semantic input",
    };
  }

  const startedAt = preflight.observedAt;
  const trustedValidationContext: AgentCandidateValidationContext = {
    safetyPolicy: input.validationContext.safetyPolicy,
    principleId: deriveStage3EntityId({
      operationId: preflight.operationContext.operationId,
      entityKind: "user_principle",
      ordinal: 0,
    }),
    charliePositionId: deriveStage3EntityId({
      operationId: preflight.operationContext.operationId,
      entityKind: "charlie_position",
      ordinal: 0,
    }),
    charlieResponseId: deriveStage3EntityId({
      operationId: preflight.operationContext.operationId,
      entityKind: "charlie_response",
      ordinal: 0,
    }),
    documentDiffId: deriveStage3EntityId({
      operationId: preflight.operationContext.operationId,
      entityKind: "document_diff",
      ordinal: 0,
    }),
    documentDiffCreatedAt: startedAt,
  };
  if (preflight.budgetEvaluation.decision === "reject") {
    return failedOutcome(
      preflight,
      input.capabilityContexts,
      agentCapabilityError(
        "extractUserPrinciple",
        "budget_exhausted",
        "Round Analysis absolute execution budget was exhausted",
      ),
      [],
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
      capabilityContexts: Object.values(input.capabilityContexts),
    })
  ) {
    return {
      outcomeKind: "preflight_rejected",
      reason: "invalid_context",
      detail:
        "Agent port adapterVersion must match the bundle and every subcapability RequestContext",
    };
  }

  let primaryRaw: unknown;
  let executionObservation: AgentExecutionObservation | undefined;
  let budgetEvaluation = preflight.budgetEvaluation;
  let budgetUsage = preflight.budgetUsage;
  let primaryCallError: AgentCapabilityError | null = null;
  if (usePrimary) {
    let envelope: Awaited<
      ReturnType<ProviderNeutralAgentPort["executeRoundAnalysis"]>
    > | undefined;
    try {
      envelope = await input.port.executeRoundAnalysis(
        portInput,
        input.boundary.operationContext,
      );
    } catch {
      executionObservation = ZERO_AGENT_EXECUTION_OBSERVATION;
      primaryCallError = agentCapabilityError(
        "extractUserPrinciple",
        "network_error",
        "Round Analysis adapter call failed",
      );
    }
    if (primaryCallError === null) {
      if (
        envelope === undefined ||
        typeof envelope !== "object" ||
        !("observation" in envelope)
      ) {
        return failedOutcome(
          preflight,
          input.capabilityContexts,
          agentCapabilityError(
            "extractUserPrinciple",
            "invalid_output",
            "Round Analysis adapter returned an invalid execution envelope",
          ),
          [],
          startedAt,
          preflight.clock.now(),
          "invalid_execution_observation",
          budgetEvaluation,
          budgetUsage,
          input.port.adapterVersion,
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
          input.capabilityContexts,
          agentCapabilityError(
            "extractUserPrinciple",
            "invalid_output",
            "Round Analysis execution observation was invalid",
          ),
          [],
          startedAt,
          preflight.clock.now(),
          "invalid_execution_observation",
          budgetEvaluation,
          budgetUsage,
          input.port.adapterVersion,
        );
      }
      if (budgetEvaluation.decision === "reject") {
        return failedOutcome(
          preflight,
          input.capabilityContexts,
          agentCapabilityError(
            "extractUserPrinciple",
            "budget_exhausted",
            "Round Analysis actual execution exceeded the absolute budget",
          ),
          [],
          startedAt,
          preflight.clock.now(),
          "budget_exhausted",
          budgetEvaluation,
          budgetUsage,
          input.port.adapterVersion,
        );
      }
      if (budgetEvaluation.decision === "degrade") {
        primaryCallError = agentCapabilityError(
          "extractUserPrinciple",
          "budget_exhausted",
          "Round Analysis actual execution exceeded the base budget and requires an explicit fallback",
        );
      } else if (envelope.outcomeKind === "candidate") {
        primaryRaw = envelope.candidate;
      } else if (envelope.outcomeKind === "error") {
        const technicalError = agentCapabilityErrorSchema.safeParse(
          envelope.error,
        );
        primaryCallError = technicalError.success
          ? agentCapabilityError(
              "extractUserPrinciple",
              technicalError.data.code,
              technicalError.data.summary,
            )
          : agentCapabilityError(
              "extractUserPrinciple",
              "invalid_output",
              "Round Analysis adapter returned a malformed technical error",
            );
      } else {
        primaryCallError = agentCapabilityError(
          "extractUserPrinciple",
          "invalid_output",
          "Round Analysis adapter returned an unknown execution outcome",
        );
      }
    }
  }
  const parsedPrimary = usePrimary
    ? extractRoundCandidateEnvelope(primaryRaw)
    : null;
  const primaryBindingValid =
    parsedPrimary?.success === true &&
    parsedPrimary.roundId === portInput.extractUserPrinciple.roundId &&
    contentBindingsEqual(
      parsedPrimary.contentBinding,
      portInput.contentBinding,
    ) &&
    revisionBindingsEqual(
      parsedPrimary.revisions,
      portInput.revisions,
    );
  const commonPrimaryError = primaryCallError ??
    (usePrimary && !primaryBindingValid
      ? agentCapabilityError(
          "extractUserPrinciple",
          parsedPrimary?.success === true ? "stale_revision" : "schema_validation_failed",
          "Round Analysis Candidate bundle failed schema or binding validation",
        )
      : !usePrimary
        ? agentCapabilityError(
            "extractUserPrinciple",
            preflight.budgetEvaluation.decision === "degrade"
              ? "budget_exhausted"
              : "fallback_unavailable",
            preflight.budgetEvaluation.decision === "degrade"
              ? "Round Analysis base budget requires an explicit fallback"
              : "The requested Round Analysis route is unavailable",
          )
        : null);

  const resolutions: RoundResolution[] = [];
  const principle = await resolveCapability({
    capability: "extractUserPrinciple",
    hasPrimary: primaryBindingValid,
    primaryCandidate:
      primaryBindingValid && parsedPrimary?.success
        ? parsedPrimary.principle
        : undefined,
    primaryError: commonPrimaryError,
    primaryAttempted: usePrimary,
    primaryObservation: executionObservation,
    primaryExecutionIdentity: primaryIdentity(
      input.port,
      input.capabilityContexts.extractUserPrinciple,
    ),
    route,
    fallback: input.fallbacks.extractUserPrinciple,
    capabilityContext: input.capabilityContexts.extractUserPrinciple,
    expectedRoundId: portInput.extractUserPrinciple.roundId,
    validate: (candidate) =>
      validateExtractUserPrincipleCandidate(
        candidate,
        portInput.extractUserPrinciple,
        trustedValidationContext,
      ),
  });
  resolutions.push(toResolution("extractUserPrinciple", principle));
  if (!principle.ok) {
    return failedOutcome(
      preflight,
      input.capabilityContexts,
      principle.error,
      resolutions,
      startedAt,
      preflight.clock.now(),
      principle.fallbackReason,
      budgetEvaluation,
      budgetUsage,
      usePrimary ? input.port.adapterVersion : undefined,
    );
  }

  const tensionInput = detectTensionInputSchema.parse({
    ...portInput.detectTension,
    currentPrinciple: principle.value.principle,
  });
  const tension = await resolveCapability({
    capability: "detectTension",
    hasPrimary: primaryBindingValid,
    primaryCandidate:
      primaryBindingValid && parsedPrimary?.success
        ? parsedPrimary.tension
        : undefined,
    primaryError: remapError(commonPrimaryError, "detectTension"),
    primaryAttempted: usePrimary,
    primaryObservation: executionObservation,
    primaryExecutionIdentity: primaryIdentity(
      input.port,
      input.capabilityContexts.detectTension,
    ),
    route,
    fallback: input.fallbacks.detectTension,
    capabilityContext: input.capabilityContexts.detectTension,
    expectedRoundId: portInput.extractUserPrinciple.roundId,
    validate: (candidate) =>
      validateDetectTensionCandidate(
        candidate,
        tensionInput,
        trustedValidationContext,
      ),
  });
  resolutions.push(toResolution("detectTension", tension));
  if (!tension.ok) {
    return failedOutcome(
      preflight,
      input.capabilityContexts,
      tension.error,
      resolutions,
      startedAt,
      preflight.clock.now(),
      tension.fallbackReason,
      budgetEvaluation,
      budgetUsage,
      usePrimary ? input.port.adapterVersion : undefined,
    );
  }

  const responseInput = generateCharlieResponseInputSchema.parse({
    ...portInput.generateCharlieResponse,
    principle: principle.value.principle,
    tensions: tension.value.tensions,
  });
  const response = await resolveCapability({
    capability: "generateCharlieResponse",
    hasPrimary: primaryBindingValid,
    primaryCandidate:
      primaryBindingValid && parsedPrimary?.success
        ? parsedPrimary.charlieResponse
        : undefined,
    primaryError: remapError(commonPrimaryError, "generateCharlieResponse"),
    primaryAttempted: usePrimary,
    primaryObservation: executionObservation,
    primaryExecutionIdentity: primaryIdentity(
      input.port,
      input.capabilityContexts.generateCharlieResponse,
    ),
    route,
    fallback: input.fallbacks.generateCharlieResponse,
    capabilityContext: input.capabilityContexts.generateCharlieResponse,
    expectedRoundId: portInput.extractUserPrinciple.roundId,
    validate: (candidate) =>
      validateGenerateCharlieResponseCandidate(
        candidate,
        responseInput,
        trustedValidationContext,
      ),
  });
  resolutions.push(toResolution("generateCharlieResponse", response));
  if (!response.ok) {
    return failedOutcome(
      preflight,
      input.capabilityContexts,
      response.error,
      resolutions,
      startedAt,
      preflight.clock.now(),
      response.fallbackReason,
      budgetEvaluation,
      budgetUsage,
      usePrimary ? input.port.adapterVersion : undefined,
    );
  }

  const diffInput = proposeDocumentDiffInputSchema.parse({
    ...portInput.proposeDocumentDiff,
    principle: principle.value.principle,
    charlieResponse: response.value.charlieResponse,
  });
  const documentDiff = await resolveCapability({
    capability: "proposeDocumentDiff",
    hasPrimary: primaryBindingValid,
    primaryCandidate:
      primaryBindingValid && parsedPrimary?.success
        ? parsedPrimary.documentDiff
        : undefined,
    primaryError: remapError(commonPrimaryError, "proposeDocumentDiff"),
    primaryAttempted: usePrimary,
    primaryObservation: executionObservation,
    primaryExecutionIdentity: primaryIdentity(
      input.port,
      input.capabilityContexts.proposeDocumentDiff,
    ),
    route,
    fallback: input.fallbacks.proposeDocumentDiff,
    capabilityContext: input.capabilityContexts.proposeDocumentDiff,
    expectedRoundId: portInput.extractUserPrinciple.roundId,
    validate: (candidate) =>
      validateProposeDocumentDiffCandidate(
        candidate,
        diffInput,
        trustedValidationContext,
      ),
  });
  resolutions.push(toResolution("proposeDocumentDiff", documentDiff));
  if (!documentDiff.ok) {
    return failedOutcome(
      preflight,
      input.capabilityContexts,
      documentDiff.error,
      resolutions,
      startedAt,
      preflight.clock.now(),
      documentDiff.fallbackReason,
      budgetEvaluation,
      budgetUsage,
      usePrimary ? input.port.adapterVersion : undefined,
    );
  }

  const bundle = validatedRoundAnalysisBundleSchema.parse({
    agentContractVersion: AGENT_CONTRACT_VERSION,
    roundAnalysisBundleSchemaVersion: ROUND_ANALYSIS_BUNDLE_SCHEMA_VERSION,
    roundId: portInput.extractUserPrinciple.roundId,
    contentBinding: portInput.contentBinding,
    revisions: portInput.revisions,
    principle: principle.value,
    tension: tension.value,
    charlieResponse: response.value,
    documentDiff: documentDiff.value,
  });
  const completedAt = preflight.clock.now();
  const receipts = recordRoundReceipts(
    input.capabilityContexts,
    resolutions,
    startedAt,
    completedAt,
  );
  const event = roundAnalysisBundleResolvedEventSchema.parse({
    ...applicationEventHeader({
      operationContext: preflight.operationContext,
      outcome: "succeeded",
      completedAt,
    }),
    eventType: "ROUND_ANALYSIS_BUNDLE_RESOLVED",
    bundle,
    receipts,
  });
  return roundAnalysisResolvedTerminalArtifactSchema.parse({
    applicationOrchestrationContractVersion:
      APPLICATION_ORCHESTRATION_CONTRACT_VERSION,
    terminalKind: "round_analysis_resolved",
    outcomeKind: "resolved",
    event,
    budgetEvaluation,
    budgetUsage,
  });
}

async function resolveCapability<T>(input: {
  capability: RoundAnalysisCapability;
  hasPrimary: boolean;
  primaryCandidate: unknown;
  primaryError: AgentCapabilityError | null;
  primaryAttempted: boolean;
  primaryObservation?: AgentExecutionObservation;
  primaryExecutionIdentity: Readonly<{
    adapterVersion: string | null;
    promptVersion: string | null;
  }>;
  route: ReturnType<typeof resolveAgentExecutionRoute>;
  fallback: RoundAnalysisFallbackPlan[RoundAnalysisCapability];
  capabilityContext: RequestContext;
  expectedRoundId: string;
  validate: (candidate: unknown) =>
    | AgentOperationResult<T>
    | Promise<AgentOperationResult<T>>;
}): Promise<CapabilityResolution<T>> {
  let error = input.primaryError;
  if (input.hasPrimary) {
    const primary = await input.validate(input.primaryCandidate);
    if (primary.ok && input.route.resolvedMode !== "unavailable") {
      return {
        ok: true,
        value: primary.value,
        resolvedMode: input.route.resolvedMode,
        fallbackReason: input.route.fallbackReason,
        executionIdentity: input.primaryExecutionIdentity,
        resolutionSource: "primary",
        ...(input.primaryObservation === undefined
          ? {}
          : { observation: input.primaryObservation }),
      };
    }
    if (!primary.ok) error = primary.error;
  }

  if (error !== null && !roleFallbackMayHandleAgentError(error)) {
    return {
      ok: false,
      error,
      fallbackReason: "fallback_forbidden_for_terminal_binding_error",
      executionIdentity: input.primaryAttempted
        ? input.primaryExecutionIdentity
        : NULL_EXECUTION_IDENTITY,
      resolutionSource: "unavailable",
      ...(input.primaryObservation === undefined
        ? {}
        : { observation: input.primaryObservation }),
    };
  }

  if (input.fallback.kind === "candidate") {
    if (
      input.fallback.binding.roundId !== input.expectedRoundId ||
      !fallbackBindingMatches(input.fallback.binding, input.capabilityContext) ||
      !fallbackObservationIsZero(input.fallback.observation) ||
      !fallbackExecutionIdentityIsValid(input.fallback.executionIdentity)
    ) {
      return {
        ok: false,
        error: agentCapabilityError(
          input.capability,
          "stale_revision",
          "Fallback Candidate binding, static observation, or execution identity does not match the current capability execution",
        ),
        fallbackReason: "fallback_binding_mismatch",
        executionIdentity: input.primaryAttempted
          ? input.primaryExecutionIdentity
          : NULL_EXECUTION_IDENTITY,
        resolutionSource: "unavailable",
        ...(input.primaryObservation === undefined
          ? {}
          : { observation: input.primaryObservation }),
      };
    }
    const fallback = await input.validate(input.fallback.candidate);
    if (fallback.ok) {
      return {
        ok: true,
        value: fallback.value,
        resolvedMode: input.fallback.resolvedMode,
        fallbackReason: nonBlankReason(input.fallback.fallbackReason),
        executionIdentity: input.fallback.executionIdentity,
        resolutionSource: "fallback",
        observation: input.fallback.observation,
      };
    }
    return {
      ok: false,
      error: fallback.error,
      fallbackReason: nonBlankReason(input.fallback.fallbackReason),
      executionIdentity: input.fallback.executionIdentity,
      resolutionSource: "fallback",
      observation: input.fallback.observation,
    };
  }

  return {
    ok: false,
    error:
      error ??
      agentCapabilityError(
        input.capability,
        "fallback_unavailable",
        "No validated Candidate or permitted fallback was available",
      ),
    fallbackReason: nonBlankReason(input.fallback.fallbackReason),
    executionIdentity: input.primaryAttempted
      ? input.primaryExecutionIdentity
      : NULL_EXECUTION_IDENTITY,
    resolutionSource: "unavailable",
    ...(input.primaryObservation === undefined
      ? {}
      : { observation: input.primaryObservation }),
  };
}

function failedOutcome(
  preflight: Extract<ReturnType<typeof runOrchestrationPreflight>, { ok: true }>,
  contexts: RoundCapabilityContexts,
  error: AgentCapabilityError,
  completedResolutions: readonly RoundResolution[],
  startedAt: string,
  completedAt: string,
  fallbackReason: string,
  budgetEvaluation = preflight.budgetEvaluation,
  budgetUsage = preflight.budgetUsage,
  primaryAdapterVersion?: string,
): RoundAnalysisOrchestrationOutcome {
  const resolutions = ROUND_CAPABILITIES.map((capability) =>
    completedResolutions.find((item) => item.capability === capability) ?? {
      capability,
      resolvedMode: "unavailable" as const,
      outcome: capability === error.capability ? "failed" as const : "skipped" as const,
      fallbackReason: nonBlankReason(fallbackReason),
      executionIdentity:
        primaryAdapterVersion === undefined
          ? NULL_EXECUTION_IDENTITY
          : {
              adapterVersion: primaryAdapterVersion,
              promptVersion: contexts[capability].promptVersion,
            },
      resolutionSource: "unavailable" as const,
    },
  );
  const event = roundAnalysisBundleFailedEventSchema.parse({
    ...applicationEventHeader({
      operationContext: preflight.operationContext,
      outcome: "failed",
      completedAt,
    }),
    eventType: "ROUND_ANALYSIS_BUNDLE_FAILED",
    error,
    receipts: recordRoundReceipts(
      contexts,
      resolutions,
      startedAt,
      completedAt,
    ),
  });
  return roundAnalysisFailedTerminalArtifactSchema.parse({
    applicationOrchestrationContractVersion:
      APPLICATION_ORCHESTRATION_CONTRACT_VERSION,
    terminalKind: "round_analysis_failed",
    outcomeKind: "failed",
    event,
    budgetEvaluation,
    budgetUsage,
  });
}

function recordRoundReceipts(
  contexts: RoundCapabilityContexts,
  resolutions: readonly RoundResolution[],
  startedAt: string,
  completedAt: string,
): CapabilityExecutionReceipt[] {
  const firstPrimaryIndex = resolutions.findIndex(
    ({ resolutionSource }) => resolutionSource === "primary",
  );
  return resolutions.map((resolution, index) => {
    const observation =
      resolution.resolutionSource === "fallback" ||
      (resolution.resolutionSource === "primary" && index === firstPrimaryIndex) ||
      (resolution.resolutionSource === "unavailable" && firstPrimaryIndex === -1)
        ? resolution.observation
        : undefined;
    return recordAgentCapabilityReceipt({
      context: contexts[resolution.capability],
      resolvedMode: resolution.resolvedMode,
      outcome: resolution.outcome,
      fallbackReason: resolution.fallbackReason,
      resultSchemaVersion: AGENT_RESULT_SCHEMA_VERSIONS[resolution.capability],
      agentContractVersion: AGENT_CONTRACT_VERSION,
      startedAt,
      completedAt,
      executionIdentity: resolution.executionIdentity,
      ...(observation === undefined ? {} : { observation }),
    });
  });
}

function toResolution<T>(
  capability: RoundAnalysisCapability,
  resolution: CapabilityResolution<T>,
): RoundResolution {
  return resolution.ok
    ? {
        capability,
        resolvedMode: resolution.resolvedMode,
        outcome: "succeeded",
        fallbackReason: resolution.fallbackReason,
        executionIdentity: resolution.executionIdentity,
        resolutionSource: resolution.resolutionSource,
        ...(resolution.observation === undefined
          ? {}
          : { observation: resolution.observation }),
      }
    : {
        capability,
        resolvedMode: "unavailable",
        outcome: "failed",
        fallbackReason: resolution.fallbackReason,
        executionIdentity: resolution.executionIdentity,
        resolutionSource: resolution.resolutionSource,
        ...(resolution.observation === undefined
          ? {}
          : { observation: resolution.observation }),
      };
}

function remapError(
  error: AgentCapabilityError | null,
  capability: RoundAnalysisCapability,
): AgentCapabilityError | null {
  return error === null
    ? null
    : agentCapabilityError(
        capability,
        error.code,
        error.summary,
      );
}

function validateRoundOperationBindings(
  context: ReturnType<typeof parseRequestContext>,
  input: RoundAnalysisPortInput,
): string | null {
  const content = context.bindings.content;
  const roundId = input.extractUserPrinciple.roundId;
  const preciseRevisionId = input.revisions.preciseRevisionId;
  const plainRevisionId = input.revisions.plainRevisionId;
  const expectedDiffBaseRevision =
    input.proposeDocumentDiff.documentTarget === "precise_text"
      ? preciseRevisionId
      : input.proposeDocumentDiff.documentTarget === "plain_text"
        ? plainRevisionId
        : input.proposeDocumentDiff.baseRevisionId === preciseRevisionId ||
            input.proposeDocumentDiff.baseRevisionId === plainRevisionId
          ? input.proposeDocumentDiff.baseRevisionId
          : null;
  const expectedDiffCurrentText =
    input.proposeDocumentDiff.documentTarget === "precise_text"
      ? input.detectTension.preciseText
      : input.proposeDocumentDiff.documentTarget === "plain_text"
        ? input.detectTension.plainText
        : input.proposeDocumentDiff.baseRevisionId === preciseRevisionId
          ? input.detectTension.preciseText
          : input.proposeDocumentDiff.baseRevisionId === plainRevisionId
            ? input.detectTension.plainText
            : null;
  if (
    content.contentBundleId === null ||
    content.contentBundleVersion === null ||
    content.contentBundleChecksum === null ||
    content.contentBundleId !== input.contentBinding.contentBundleId ||
    content.contentBundleVersion !== input.contentBinding.contentBundleVersion ||
    content.contentBundleChecksum !== input.contentBinding.contentBundleChecksum ||
    context.bindings.revisions.preciseRevisionId !== preciseRevisionId ||
    context.bindings.revisions.plainRevisionId !== plainRevisionId ||
    input.detectTension.roundId !== roundId ||
    input.generateCharlieResponse.roundId !== roundId ||
    input.detectTension.preciseRevisionId !== preciseRevisionId ||
    input.detectTension.plainRevisionId !== plainRevisionId ||
    input.generateCharlieResponse.preciseRevisionId !== preciseRevisionId ||
    input.generateCharlieResponse.preciseText !== input.detectTension.preciseText ||
    expectedDiffBaseRevision === null ||
    input.proposeDocumentDiff.baseRevisionId !== expectedDiffBaseRevision ||
    expectedDiffCurrentText === null ||
    input.proposeDocumentDiff.currentText !== expectedDiffCurrentText
  ) {
    return "Round Analysis top-level and subcapability inputs must share round, content, and revision bindings with the operation RequestContext";
  }
  return null;
}

function validateRoundEvidenceInputBoundary(
  input: RoundAnalysisPortInput,
): string | null {
  const evidenceContext = input.generateCharlieResponse.evidenceContext;
  const childAllowlists = [
    input.extractUserPrinciple.allowedEvidenceIds,
    input.detectTension.allowedEvidenceIds,
    input.proposeDocumentDiff.allowedEvidenceIds,
  ];
  if (evidenceContext.contentMode === "placeholder") {
    if (
      evidenceContext.allowedEvidenceIds.length > 0 ||
      childAllowlists.some((identifiers) => identifiers.length > 0)
    ) {
      return "Placeholder Round Analysis cannot send persistable evidence identifiers to any child capability";
    }
    return null;
  }

  const verifiedFactIds = new Set(
    evidenceContext.verifiedFacts.map(({ id }) => id),
  );
  const trustedAllowedIds = new Set(evidenceContext.allowedEvidenceIds);
  if (
    evidenceContext.allowedEvidenceIds.some(
      (evidenceId) => !verifiedFactIds.has(evidenceId),
    ) ||
    childAllowlists.some((identifiers) =>
      identifiers.some(
        (evidenceId) =>
          !verifiedFactIds.has(evidenceId) ||
          !trustedAllowedIds.has(evidenceId),
      ),
    )
  ) {
    return "Verified Round Analysis child evidence allowlists must be subsets of resolver-verified and trusted evidence identifiers";
  }
  return null;
}

function roundBudgetSlot(roundId: string): "round_1" | "round_2" | "round_3" {
  switch (roundId) {
    case "round1":
      return "round_1";
    case "round2":
      return "round_2";
    case "round3":
      return "round_3";
    default:
      throw new TypeError(`Unsupported Round Analysis roundId: ${roundId}`);
  }
}

type RoundCandidateEnvelope =
  | Readonly<{
      success: true;
      roundId: string;
      contentBinding: ReturnType<typeof agentContentBindingSchema.parse>;
      revisions: ReturnType<typeof agentRevisionBindingSchema.parse>;
      principle: unknown;
      tension: unknown;
      charlieResponse: unknown;
      documentDiff: unknown;
    }>
  | Readonly<{ success: false }>;

function extractRoundCandidateEnvelope(raw: unknown): RoundCandidateEnvelope {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return { success: false };
  }
  const record = raw as Record<string, unknown>;
  const allowedKeys = new Set([
    "agentContractVersion",
    "roundAnalysisCandidateBundleSchemaVersion",
    "roundId",
    "contentBinding",
    "revisions",
    "principle",
    "tension",
    "charlieResponse",
    "documentDiff",
  ]);
  if (Object.keys(record).some((key) => !allowedKeys.has(key))) {
    return { success: false };
  }
  const contentBinding = agentContentBindingSchema.safeParse(
    record.contentBinding,
  );
  const revisions = agentRevisionBindingSchema.safeParse(record.revisions);
  if (
    record.agentContractVersion !== AGENT_CONTRACT_VERSION ||
    record.roundAnalysisCandidateBundleSchemaVersion !==
      ROUND_ANALYSIS_CANDIDATE_BUNDLE_SCHEMA_VERSION ||
    typeof record.roundId !== "string" ||
    !contentBinding.success ||
    !revisions.success
  ) {
    return { success: false };
  }
  return {
    success: true,
    roundId: record.roundId,
    contentBinding: contentBinding.data,
    revisions: revisions.data,
    principle: record.principle,
    tension: record.tension,
    charlieResponse: record.charlieResponse,
    documentDiff: record.documentDiff,
  };
}

function nonBlankReason(reason: string): string {
  return reason.trim().length > 0 ? reason : "fallback_unavailable";
}

const NULL_EXECUTION_IDENTITY: FallbackExecutionIdentity = Object.freeze({
  adapterVersion: null,
  promptVersion: null,
});

function primaryIdentity(
  port: ProviderNeutralAgentPort,
  context: RequestContext,
): FallbackExecutionIdentity {
  return {
    adapterVersion: port.adapterVersion,
    promptVersion: context.promptVersion,
  } as const;
}

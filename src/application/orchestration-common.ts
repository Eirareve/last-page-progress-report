import {
  agentExecutionObservationSchema,
  type AgentCapabilityError,
  type AgentExecutionObservation,
} from "../agent";
import type { CapabilityExecutionReceipt } from "../provenance";
import {
  guardOperationResult,
  operationBindingsSchema,
  runtimeSha256DigestSchema,
  serializableRequestContextSchema,
  type CapabilityIdentifier,
  type RequestContext,
} from "../runtime";
import {
  evaluateStage3Budget,
  upsertLogicalCallBudgetUsage,
} from "./budget";
import type {
  Stage3BudgetEvaluation,
  Stage3BudgetSlot,
  Stage3BudgetUsage,
} from "./contracts";
import { deriveStage3EntityId } from "./entity-id";
import type {
  ApplicationClock,
  ApplicationPreflightRejection,
  FallbackExecutionIdentity,
  OrchestrationOperationBoundary,
} from "./orchestration.contracts";
import { recordCapabilityExecutionReceipt } from "./receipts";
import {
  APPLICATION_ORCHESTRATION_CONTRACT_VERSION,
  logicalCallBudgetUsageSchema,
  stage3BudgetUsageSchema,
} from "./schemas";

export const SYSTEM_APPLICATION_CLOCK: ApplicationClock = Object.freeze({
  now: () => new Date().toISOString(),
});

export type SuccessfulOrchestrationPreflight = Readonly<{
  ok: true;
  operationContext: ReturnType<typeof parseRequestContext>;
  capabilityContexts: Readonly<Record<string, ReturnType<typeof parseRequestContext>>>;
  budgetEvaluation: Stage3BudgetEvaluation;
  budgetUsage: Stage3BudgetUsage;
  observedAt: string;
  clock: ApplicationClock;
}>;

export type OrchestrationPreflightResult =
  | SuccessfulOrchestrationPreflight
  | Readonly<{ ok: false; rejection: ApplicationPreflightRejection }>;

export function runOrchestrationPreflight(input: {
  boundary: OrchestrationOperationBoundary;
  expectedOperationCapability: CapabilityIdentifier;
  expectedBudgetSlot: Stage3BudgetSlot;
  capabilityContexts: Readonly<Record<string, RequestContext>>;
}): OrchestrationPreflightResult {
  const clock = input.boundary.clock ?? SYSTEM_APPLICATION_CLOCK;
  const observedAt = clock.now();
  let operationContext: ReturnType<typeof parseRequestContext>;
  let capabilityContexts: Record<string, ReturnType<typeof parseRequestContext>>;
  try {
    operationContext = parseRequestContext(input.boundary.operationContext);
    if (operationContext.capability !== input.expectedOperationCapability) {
      throw new TypeError(
        `Operation RequestContext capability must be ${input.expectedOperationCapability}`,
      );
    }
    capabilityContexts = Object.fromEntries(
      Object.entries(input.capabilityContexts).map(([capability, context]) => {
        const parsed = parseRequestContext(context);
        if (parsed.capability !== capability) {
          throw new TypeError(
            `Subcapability RequestContext key ${capability} does not match ${parsed.capability}`,
          );
        }
        requireSharedOperationBoundary(operationContext, parsed);
        return [capability, parsed];
      }),
    );
    const childFingerprints = Object.values(capabilityContexts).map(
      ({ inputFingerprint }) => inputFingerprint,
    );
    if (
      new Set(childFingerprints).size !== childFingerprints.length ||
      childFingerprints.includes(operationContext.inputFingerprint)
    ) {
      throw new TypeError(
        "Bundle and subcapability RequestContexts require distinct capability-bound input fingerprints",
      );
    }
  } catch (error) {
    return reject("invalid_context", errorMessage(error));
  }

  const guard = guardOperationResult({
    activeOperation: input.boundary.activeOperation,
    currentStage: input.boundary.currentStage,
    result: {
      operationId: operationContext.operationId,
      requestId: operationContext.requestId,
      capability: operationContext.capability,
      stage: operationContext.stage,
      stageInstanceId: operationContext.stageInstanceId,
      inputFingerprint: operationContext.inputFingerprint,
      bindings: operationContext.bindings,
      outcome: "succeeded",
      completedAt: observedAt,
    },
  });
  if (!guard.accepted) {
    return reject("operation_guard_rejected", guard.reason);
  }

  let budgetEvaluation: Stage3BudgetEvaluation;
  let budgetUsage: Stage3BudgetUsage;
  try {
    const prior = stage3BudgetUsageSchema.parse(input.boundary.budget.priorUsage);
    const planned = logicalCallBudgetUsageSchema.parse(
      input.boundary.budget.plannedCall,
    );
    if (planned.budgetSlot !== input.expectedBudgetSlot) {
      throw new TypeError(
        `Expected budget slot ${input.expectedBudgetSlot}, received ${planned.budgetSlot}`,
      );
    }
    if (planned.capability !== operationContext.capability) {
      throw new TypeError(
        "Planned logical-call capability must match the bundle operation capability",
      );
    }
    budgetUsage = upsertLogicalCallBudgetUsage({
      priorUsage: prior,
      plannedCall: planned,
    });
    budgetEvaluation = evaluateStage3Budget(budgetUsage);
  } catch (error) {
    return reject("invalid_budget", errorMessage(error));
  }

  return {
    ok: true,
    operationContext,
    capabilityContexts: Object.freeze(capabilityContexts),
    budgetEvaluation,
    budgetUsage,
    observedAt,
    clock,
  };
}

export function applicationEventHeader(input: {
  operationContext: ReturnType<typeof parseRequestContext>;
  outcome: "succeeded" | "failed";
  completedAt: string;
}) {
  return {
    applicationOrchestrationContractVersion:
      APPLICATION_ORCHESTRATION_CONTRACT_VERSION,
    eventId: deriveStage3EntityId({
      operationId: input.operationContext.operationId,
      entityKind: "application_event",
      ordinal: 0,
    }),
    operationId: input.operationContext.operationId,
    requestId: input.operationContext.requestId,
    capability: input.operationContext.capability,
    stage: input.operationContext.stage,
    stageInstanceId: input.operationContext.stageInstanceId,
    inputFingerprint: input.operationContext.inputFingerprint,
    bindings: input.operationContext.bindings,
    outcome: input.outcome,
    completedAt: input.completedAt,
  } as const;
}

export function recordAgentCapabilityReceipt(input: {
  context: RequestContext;
  resolvedMode: "live" | "mock" | "static_template" | "unavailable";
  outcome: "succeeded" | "failed" | "skipped";
  fallbackReason: string | null;
  resultSchemaVersion: string;
  agentContractVersion: string;
  startedAt: string;
  completedAt: string;
  observation?: AgentExecutionObservation;
  executionIdentity?: FallbackExecutionIdentity;
}): CapabilityExecutionReceipt {
  return recordCapabilityExecutionReceipt({
    ...input,
    ...(input.observation === undefined
      ? {}
      : {
          tokenUsage: {
            inputTokens: input.observation.inputTokens,
            outputTokens: input.observation.outputTokens,
            totalTokens:
              input.observation.inputTokens + input.observation.outputTokens,
          },
          ...(input.observation.provider === undefined
            ? {}
            : { provider: input.observation.provider }),
          ...(input.observation.modelName === undefined
            ? {}
            : { modelName: input.observation.modelName }),
          durationMs: input.observation.latencyMs,
        }),
  });
}

export function evaluateObservedExecutionBudget(input: {
  boundary: OrchestrationOperationBoundary;
  observation: unknown;
}): Readonly<{
  observation: AgentExecutionObservation;
  evaluation: Stage3BudgetEvaluation;
  usage: Stage3BudgetUsage;
}> {
  const rawObservation = input.observation;
  if (
    typeof rawObservation !== "object" ||
    rawObservation === null ||
    !("latencyMs" in rawObservation) ||
    typeof rawObservation.latencyMs !== "number" ||
    !Number.isFinite(rawObservation.latencyMs) ||
    rawObservation.latencyMs < 0
  ) {
    throw new TypeError("Execution observation latencyMs must be finite and nonnegative");
  }
  // Final Review permits fractional milliseconds; the integer budget ledger
  // conservatively rounds them upward while its receipt keeps the raw value.
  const observation = agentExecutionObservationSchema.parse({
    ...rawObservation,
    latencyMs: Math.ceil(rawObservation.latencyMs),
  });
  const prior = stage3BudgetUsageSchema.parse(input.boundary.budget.priorUsage);
  const planned = logicalCallBudgetUsageSchema.parse(
    input.boundary.budget.plannedCall,
  );
  const actual = logicalCallBudgetUsageSchema.parse({
    logicalCallId: planned.logicalCallId,
    budgetSlot: planned.budgetSlot,
    capability: planned.capability,
    networkRetries: observation.networkRetries,
    structuredRepairs: observation.structuredRepairs,
    inputTokens: observation.inputTokens,
    outputTokens: observation.outputTokens,
    latencyMs: observation.latencyMs,
    estimatedCostUsdMicros: observation.estimatedCostUsdMicros,
  });
  const usage = upsertLogicalCallBudgetUsage({
    priorUsage: prior,
    plannedCall: actual,
  });
  return {
    observation,
    evaluation: evaluateStage3Budget(usage),
    usage,
  };
}

export function parseRequestContext(context: RequestContext) {
  const serializable = Object.fromEntries(
    Object.entries(context).filter(([key]) => key !== "abortSignal"),
  );
  return serializableRequestContextSchema.parse(serializable);
}

export function fallbackBindingMatches(
  fallback: {
    inputFingerprint: string;
    bindings: unknown;
  },
  context: RequestContext,
): boolean {
  const fingerprint = runtimeSha256DigestSchema.safeParse(
    fallback.inputFingerprint,
  );
  const bindings = operationBindingsSchema.safeParse(fallback.bindings);
  const parsedContext = parseRequestContext(context);
  return (
    fingerprint.success &&
    bindings.success &&
    fingerprint.data === parsedContext.inputFingerprint &&
    JSON.stringify(bindings.data) === JSON.stringify(parsedContext.bindings)
  );
}

export function fallbackObservationIsZero(observation: unknown): boolean {
  const parsed = agentExecutionObservationSchema.safeParse(observation);
  return (
    parsed.success &&
    parsed.data.networkRetries === 0 &&
    parsed.data.structuredRepairs === 0 &&
    parsed.data.inputTokens === 0 &&
    parsed.data.outputTokens === 0 &&
    parsed.data.latencyMs === 0 &&
    parsed.data.estimatedCostUsdMicros === 0
  );
}

export function adapterVersionMatchesContexts(input: {
  adapterVersion: string;
  operationContext: RequestContext;
  capabilityContexts: readonly RequestContext[];
}): boolean {
  return (
    input.adapterVersion.trim().length > 0 &&
    input.operationContext.adapterVersion === input.adapterVersion &&
    input.capabilityContexts.every(
      ({ adapterVersion }) => adapterVersion === input.adapterVersion,
    )
  );
}

export function fallbackExecutionIdentityIsValid(
  identity: FallbackExecutionIdentity,
): boolean {
  return (
    identity.adapterVersion !== null &&
    identity.adapterVersion.trim().length > 0 &&
    (identity.promptVersion === null || identity.promptVersion.trim().length > 0)
  );
}

export function roleFallbackMayHandleAgentError(
  error: AgentCapabilityError | null,
): boolean {
  return (
    error === null ||
    ![
      "stale_revision",
      "content_gate_not_passed",
      "content_not_found",
      "content_mode_not_verified",
      "content_version_mismatch",
      "evidence_not_allowed",
      "idempotency_conflict",
    ].includes(error.code)
  );
}

function requireSharedOperationBoundary(
  operation: ReturnType<typeof parseRequestContext>,
  capability: ReturnType<typeof parseRequestContext>,
): void {
  const same =
    capability.operationId === operation.operationId &&
    capability.requestId === operation.requestId &&
    capability.requestedMode === operation.requestedMode &&
    capability.attempt === operation.attempt &&
    capability.stage === operation.stage &&
    capability.stageInstanceId === operation.stageInstanceId &&
    JSON.stringify(capability.bindings) === JSON.stringify(operation.bindings);
  if (!same) {
    throw new TypeError(
      "Subcapability RequestContext must share operation/request/stage/bindings with its bundle operation",
    );
  }
}

function reject(
  reason: ApplicationPreflightRejection["reason"],
  detail: string,
): OrchestrationPreflightResult {
  return {
    ok: false,
    rejection: { outcomeKind: "preflight_rejected", reason, detail },
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Invalid orchestration input";
}

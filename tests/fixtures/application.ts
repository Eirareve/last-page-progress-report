import type {
  ApplicationClock,
  LogicalCallBudgetUsage,
  OrchestrationOperationBoundary,
  Stage3BudgetSlot,
} from "@/application";
import { logicalCallBudgetUsageSchema } from "@/application";
import type {
  ActiveOperation,
  CapabilityIdentifier,
  RequestContext,
} from "@/runtime";
import {
  activeOperationSchema,
  serializableRequestContextSchema,
} from "@/runtime";

export const APPLICATION_DIGEST_A = `sha256:${"a".repeat(64)}` as const;
export const APPLICATION_DIGEST_B = `sha256:${"b".repeat(64)}` as const;
export const APPLICATION_STARTED_AT = "2026-01-02T03:04:05.000Z";
export const APPLICATION_COMPLETED_AT = "2026-01-02T03:04:06.250Z";

export function applicationDigest(character: string): `sha256:${string}` {
  if (!/^[0-9a-f]$/.test(character)) {
    throw new TypeError("Test digest seed must be one lowercase hex character");
  }
  return `sha256:${character.repeat(64)}`;
}

export function makeApplicationRequestContext(
  capability: CapabilityIdentifier = "extractUserPrinciple",
  overrides: Partial<RequestContext> = {},
): RequestContext {
  return serializableRequestContextSchema.parse({
    operationId: "operation-application-1",
    requestId: "request-application-1",
    requestedMode: "live",
    capability,
    attempt: 1,
    inputFingerprint: APPLICATION_DIGEST_A,
    promptVersion: "0.1.0",
    adapterVersion: "0.1.0",
    stage: "ROUND_1_PAST_SELF",
    stageInstanceId: "stage-instance-application-1",
    bindings: {
      revisions: {
        preciseRevisionId: "precise-r1",
        plainRevisionId: null,
      },
      content: {
        contentBundleId: "content-main",
        contentBundleVersion: "0.1.0",
        contentBundleChecksum: APPLICATION_DIGEST_B,
      },
    },
    ...overrides,
  });
}

export function makeLogicalCallBudgetUsage(
  budgetSlot: Stage3BudgetSlot,
  overrides: Partial<LogicalCallBudgetUsage> = {},
): LogicalCallBudgetUsage {
  return logicalCallBudgetUsageSchema.parse({
    logicalCallId: `logical-call-${budgetSlot}`,
    budgetSlot,
    capability: capabilityForSlot(budgetSlot),
    networkRetries: 0,
    structuredRepairs: 0,
    inputTokens: 6_000,
    outputTokens: 1_100,
    latencyMs: 15_000,
    estimatedCostUsdMicros: 50_000,
    ...overrides,
  });
}

export function makeApplicationOperationBoundary(input: {
  operationContext: RequestContext;
  budgetSlot: Stage3BudgetSlot;
  priorLogicalCalls?: readonly LogicalCallBudgetUsage[];
  plannedCallOverrides?: Partial<LogicalCallBudgetUsage>;
  activeOperationOverrides?: Partial<ActiveOperation>;
  availability?: OrchestrationOperationBoundary["availability"];
  clock?: ApplicationClock;
}): OrchestrationOperationBoundary {
  const context = serializableRequestContextSchema.parse(input.operationContext);
  const activeOperation = activeOperationSchema.parse({
    operationId: context.operationId,
    requestId: context.requestId,
    capability: context.capability,
    stage: context.stage,
    stageInstanceId: context.stageInstanceId,
    inputFingerprint: context.inputFingerprint,
    bindings: context.bindings,
    attempt: context.attempt,
    status: "running",
    startedAt: APPLICATION_STARTED_AT,
    ...(input.activeOperationOverrides ?? {}),
  });
  return {
    activeOperation,
    currentStage: context.stage,
    operationContext: input.operationContext,
    budget: {
      priorUsage: {
        budgetVersion: "0.1.0",
        logicalCalls: [...(input.priorLogicalCalls ?? [])],
      },
      plannedCall: makeLogicalCallBudgetUsage(input.budgetSlot, {
        capability: context.capability,
        ...input.plannedCallOverrides,
      }),
    },
    availability: input.availability ?? { live: false, mock: true },
    ...(input.clock === undefined ? {} : { clock: input.clock }),
  };
}

export function makeSequenceClock(...values: readonly string[]): ApplicationClock {
  let index = 0;
  return {
    now() {
      const value = values[index];
      if (value === undefined) {
        throw new Error("Application test Clock was exhausted");
      }
      index += 1;
      return value;
    },
  };
}

function capabilityForSlot(slot: Stage3BudgetSlot): CapabilityIdentifier {
  switch (slot) {
    case "round_1":
    case "round_2":
    case "round_3":
      return "executeRoundAnalysis";
    case "plain_semantic":
      return "executePlainSemanticReview";
    case "portrait_shift_summary":
      return "summarizePortraitShift";
    case "signature_review":
      return "reviewCharlieSignature";
  }
}

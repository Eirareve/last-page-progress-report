import {
  AGENT_CONTRACT_VERSION,
  MOCK_AGENT_ADAPTER_VERSION,
} from "../agent";
import {
  computeStage3RequestFingerprint,
  logicalCallBudgetUsageSchema,
  type OrchestrationOperationBoundary,
  type Stage3BudgetSlot,
} from "../application";
import type { Stage4PersistenceSidecars, Stage4SessionState } from "../fsm";
import {
  activeOperationSchema,
  serializableRequestContextSchema,
  type CapabilityIdentifier,
  type Clock,
  type IdGenerator,
  type RequestContext,
} from "../runtime";

export type Stage5OperationIdentity = Readonly<{
  operationId: string;
  requestId: string;
}>;

export function newOperationIdentity(
  idGenerator: IdGenerator,
): Stage5OperationIdentity {
  return {
    operationId: idGenerator.next("operation"),
    requestId: idGenerator.next("request"),
  };
}

export async function createAgentRequestContext(input: {
  state: Stage4SessionState;
  capability: CapabilityIdentifier;
  identity: Stage5OperationIdentity;
  semanticMaterial: unknown;
  resultSchemaVersion: string;
  plainRevisionId?: string | null;
}): Promise<RequestContext> {
  const base = serializableRequestContextSchema.parse({
    operationId: input.identity.operationId,
    requestId: input.identity.requestId,
    requestedMode: "mock",
    capability: input.capability,
    attempt: 1,
    inputFingerprint: `sha256:${"0".repeat(64)}`,
    promptVersion: null,
    adapterVersion: MOCK_AGENT_ADAPTER_VERSION,
    stage: input.state.stage,
    stageInstanceId: input.state.stageInstanceId,
    bindings: {
      revisions: {
        preciseRevisionId: input.state.manuscript.preciseRevisionId,
        plainRevisionId:
          input.plainRevisionId === undefined
            ? input.state.manuscript.plainRevisionId
            : input.plainRevisionId,
      },
      content: operationContentBinding(input.state),
    },
  });
  const inputFingerprint = await computeStage3RequestFingerprint({
    context: base,
    semanticMaterial: input.semanticMaterial,
    agentContractVersion: AGENT_CONTRACT_VERSION,
    resultSchemaVersion: input.resultSchemaVersion,
  });
  return serializableRequestContextSchema.parse({ ...base, inputFingerprint });
}

export function createOperationBoundary(input: {
  context: RequestContext;
  slot: Stage3BudgetSlot;
  sidecars: Stage4PersistenceSidecars;
  clock: Clock;
}): OrchestrationOperationBoundary {
  const startedAt = input.clock.now();
  const priorCall = input.sidecars.budgetUsage.logicalCalls.find(
    ({ budgetSlot }) => budgetSlot === input.slot,
  );
  const activeOperation = activeOperationSchema.parse({
    operationId: input.context.operationId,
    requestId: input.context.requestId,
    capability: input.context.capability,
    stage: input.context.stage,
    stageInstanceId: input.context.stageInstanceId,
    inputFingerprint: input.context.inputFingerprint,
    bindings: input.context.bindings,
    attempt: input.context.attempt,
    status: "running",
    startedAt,
  });
  return {
    activeOperation,
    currentStage: input.context.stage,
    operationContext: input.context,
    budget: {
      priorUsage: input.sidecars.budgetUsage,
      plannedCall: logicalCallBudgetUsageSchema.parse({
        logicalCallId:
          priorCall?.logicalCallId ?? `logical-call-${input.context.operationId}`,
        budgetSlot: input.slot,
        capability: input.context.capability,
        networkRetries: priorCall?.networkRetries ?? 0,
        structuredRepairs: priorCall?.structuredRepairs ?? 0,
        inputTokens: priorCall?.inputTokens ?? 0,
        outputTokens: priorCall?.outputTokens ?? 0,
        latencyMs: priorCall?.latencyMs ?? 0,
        estimatedCostUsdMicros: priorCall?.estimatedCostUsdMicros ?? 0,
      }),
    },
    availability: { live: false, mock: true },
    clock: input.clock,
  };
}

export function operationContentBinding(state: Stage4SessionState) {
  return {
    contentBundleId: state.contentBinding.contentBundleId,
    contentBundleVersion: state.contentBinding.contentBundleVersion,
    contentBundleChecksum: state.contentBinding.contentBundleChecksum,
  };
}

export function operationRevisionBinding(state: Stage4SessionState) {
  return {
    preciseRevisionId: state.manuscript.preciseRevisionId,
    plainRevisionId: state.manuscript.plainRevisionId,
  };
}

export function operationResultHeader(
  operation: ReturnType<typeof activeOperationSchema.parse>,
  clock: Clock,
) {
  return {
    operationId: operation.operationId,
    requestId: operation.requestId,
    stage: operation.stage,
    stageInstanceId: operation.stageInstanceId,
    inputFingerprint: operation.inputFingerprint,
    bindings: operation.bindings,
    completedAt: clock.now(),
  };
}

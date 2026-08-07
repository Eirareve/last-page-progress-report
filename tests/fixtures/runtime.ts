import {
  capabilityExecutionReceiptSchema,
  contractVersionVectorSchema,
  type CapabilityExecutionReceipt,
  type ContractVersionVector,
} from "@/provenance";
import {
  activeOperationSchema,
  operationResultGuardInputSchema,
  type ActiveOperation,
  type OperationResultGuardInput,
} from "@/runtime";

export const STARTED_AT = "2026-08-06T16:00:00.000Z";
export const COMPLETED_AT = "2026-08-06T16:00:01.000Z";
export const DIGEST_A = `sha256:${"a".repeat(64)}` as const;
export const DIGEST_B = `sha256:${"b".repeat(64)}` as const;
export const DIGEST_C = `sha256:${"c".repeat(64)}` as const;

export function makeActiveOperation(
  overrides: Partial<ActiveOperation> = {},
): ActiveOperation {
  return activeOperationSchema.parse({
    operationId: "operation-1",
    requestId: "request-1",
    capability: "draftForecast",
    stage: "ROUND_2_FORECAST",
    stageInstanceId: "stage-instance-1",
    inputFingerprint: DIGEST_A,
    bindings: {
      revisions: {
        preciseRevisionId: "precise-r1",
        plainRevisionId: "plain-r1",
      },
      content: {
        contentBundleId: "content-main",
        contentBundleVersion: "0.1.0",
        contentBundleChecksum: DIGEST_B,
      },
    },
    attempt: 1,
    status: "running",
    startedAt: STARTED_AT,
    ...overrides,
  });
}

export function makeOperationResult(
  activeOperation: ActiveOperation = makeActiveOperation(),
  overrides: Partial<OperationResultGuardInput> = {},
): OperationResultGuardInput {
  return operationResultGuardInputSchema.parse({
    operationId: activeOperation.operationId,
    requestId: activeOperation.requestId,
    capability: activeOperation.capability,
    stage: activeOperation.stage,
    stageInstanceId: activeOperation.stageInstanceId,
    inputFingerprint: activeOperation.inputFingerprint,
    bindings: activeOperation.bindings,
    outcome: "succeeded",
    completedAt: COMPLETED_AT,
    ...overrides,
  });
}

export function makeCapabilityExecutionReceipt(
  overrides: Partial<CapabilityExecutionReceipt> = {},
): CapabilityExecutionReceipt {
  return capabilityExecutionReceiptSchema.parse({
    capability: "draftForecast",
    operationId: "operation-1",
    requestId: "request-1",
    requestedMode: "live",
    resolvedMode: "live",
    outcome: "succeeded",
    fallbackReason: null,
    promptVersion: "0.1.0",
    adapterVersion: "0.1.0",
    resultSchemaVersion: "0.1.0",
    agentContractVersion: "0.1.0",
    inputFingerprintDigest: DIGEST_A,
    startedAt: STARTED_AT,
    completedAt: COMPLETED_AT,
    ...overrides,
  });
}

export function makeContractVersionVector(
  overrides: Partial<ContractVersionVector> = {},
): ContractVersionVector {
  return contractVersionVectorSchema.parse({
    scopeContractVersion: "0.1.0",
    domainContractVersion: "0.1.0",
    runtimeContractVersion: "0.1.0",
    provenanceContractVersion: "0.1.0",
    namingContractVersion: "0.1.0",
    finalizationContractVersion: "0.1.0",
    stateMachineContractVersion: "0.1.0",
    sessionSchemaVersion: "0.1.0",
    stableTextAnchorSchemaVersion: "0.1.0",
    contentSchemaVersion: "0.1.0",
    agentContractVersion: "0.1.0",
    finalReviewSchemaVersion: "0.1.0",
    finalEnvelopeSchemaVersion: "0.1.0",
    ...overrides,
  });
}

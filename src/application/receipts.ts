import type { CapabilityExecutionReceipt } from "../provenance/contracts";
import { capabilityExecutionReceiptSchema } from "../provenance/schemas";
import type {
  ExecutionOutcome,
  RequestContext,
  ResolvedExecutionMode,
} from "../runtime/contracts";
import { serializableRequestContextSchema } from "../runtime/schemas";

type OptionalReceiptObservation = Pick<
  CapabilityExecutionReceipt,
  "tokenUsage" | "modelName" | "provider" | "resultDigest"
>;

export type RecordCapabilityExecutionReceiptInput =
  OptionalReceiptObservation & {
    context: RequestContext;
    resolvedMode: ResolvedExecutionMode;
    outcome: ExecutionOutcome;
    fallbackReason: string | null;
    resultSchemaVersion: string;
    agentContractVersion?: string;
    startedAt: string;
    completedAt: string;
    durationMs?: number;
    executionIdentity?: Readonly<{
      adapterVersion: string | null;
      promptVersion: string | null;
    }>;
  };

/** Records trusted runtime observations; Candidate data is never accepted. */
export function recordCapabilityExecutionReceipt(
  input: RecordCapabilityExecutionReceiptInput,
): CapabilityExecutionReceipt {
  const serializableContext = Object.fromEntries(
    Object.entries(input.context).filter(([key]) => key !== "abortSignal"),
  );
  const context = serializableRequestContextSchema.parse(serializableContext);
  const durationMs =
    input.durationMs ??
    Date.parse(input.completedAt) - Date.parse(input.startedAt);
  const optionalAgentVersion =
    input.agentContractVersion === undefined
      ? {}
      : { agentContractVersion: input.agentContractVersion };
  const optionalObservedFields = {
    ...(input.tokenUsage === undefined ? {} : { tokenUsage: input.tokenUsage }),
    ...(input.modelName === undefined ? {} : { modelName: input.modelName }),
    ...(input.provider === undefined ? {} : { provider: input.provider }),
    ...(input.resultDigest === undefined ? {} : { resultDigest: input.resultDigest }),
  };

  return capabilityExecutionReceiptSchema.parse({
    capability: context.capability,
    operationId: context.operationId,
    requestId: context.requestId,
    requestedMode: context.requestedMode,
    resolvedMode: input.resolvedMode,
    outcome: input.outcome,
    fallbackReason: input.fallbackReason,
    promptVersion:
      input.executionIdentity === undefined
        ? context.promptVersion
        : input.executionIdentity.promptVersion,
    adapterVersion:
      input.executionIdentity === undefined
        ? context.adapterVersion
        : input.executionIdentity.adapterVersion,
    resultSchemaVersion: input.resultSchemaVersion,
    ...optionalAgentVersion,
    inputFingerprintDigest: context.inputFingerprint,
    startedAt: input.startedAt,
    completedAt: input.completedAt,
    durationMs,
    ...optionalObservedFields,
  });
}

export function recordDeterministicCapabilityReceipt(input: {
  context: RequestContext;
  agentContractVersion: string;
  resultSchemaVersion: string;
  startedAt: string;
  completedAt: string;
  resultDigest?: CapabilityExecutionReceipt["resultDigest"];
}): CapabilityExecutionReceipt {
  return recordCapabilityExecutionReceipt({
    context: input.context,
    resolvedMode: "deterministic",
    outcome: "succeeded",
    fallbackReason: null,
    resultSchemaVersion: input.resultSchemaVersion,
    agentContractVersion: input.agentContractVersion,
    startedAt: input.startedAt,
    completedAt: input.completedAt,
    ...(input.resultDigest === undefined
      ? {}
      : { resultDigest: input.resultDigest }),
  });
}

/** Records a deterministic application-owned function outside the Agent contract. */
export function recordApplicationDeterministicCapabilityReceipt(input: {
  context: RequestContext;
  resultSchemaVersion: string;
  startedAt: string;
  completedAt: string;
  resultDigest?: CapabilityExecutionReceipt["resultDigest"];
}): CapabilityExecutionReceipt {
  return recordCapabilityExecutionReceipt({
    context: input.context,
    resolvedMode: "deterministic",
    outcome: "succeeded",
    fallbackReason: null,
    resultSchemaVersion: input.resultSchemaVersion,
    startedAt: input.startedAt,
    completedAt: input.completedAt,
    ...(input.resultDigest === undefined
      ? {}
      : { resultDigest: input.resultDigest }),
  });
}

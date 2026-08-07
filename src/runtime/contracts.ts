import type { z } from "zod";

import type {
  activeOperationSchema,
  agentModeSchema,
  capabilityIdentifierSchema,
  contentBindingSchema,
  deploymentCapabilityBaselineSchema,
  executionOutcomeSchema,
  idempotencyCleanupDispositionSchema,
  idempotencyRecordStatusSchema,
  inputFingerprintMaterialSchema,
  operationBindingsSchema,
  operationResultGuardInputSchema,
  operationStatusSchema,
  resolvedExecutionModeSchema,
  retryPolicySchema,
  revisionBindingSchema,
  runtimeErrorSummarySchema,
  runtimeSha256DigestSchema,
  runtimeStateSchema,
  serializableRequestContextSchema,
  sessionConfigurationSchema,
  stateTransitionIdempotencyRecordSchema,
} from "./schemas";

export type AgentMode = z.infer<typeof agentModeSchema>;
export type ResolvedExecutionMode = z.infer<
  typeof resolvedExecutionModeSchema
>;
export type ExecutionOutcome = z.infer<typeof executionOutcomeSchema>;
export type CapabilityIdentifier = z.infer<typeof capabilityIdentifierSchema>;
export type OperationStatus = z.infer<typeof operationStatusSchema>;
export type RevisionBinding = z.infer<typeof revisionBindingSchema>;
export type ContentBinding = z.infer<typeof contentBindingSchema>;
export type OperationBindings = z.infer<typeof operationBindingsSchema>;
export type InputFingerprintMaterial = z.infer<
  typeof inputFingerprintMaterialSchema
>;
export type SessionConfiguration = z.infer<typeof sessionConfigurationSchema>;
export type RetryPolicy = z.infer<typeof retryPolicySchema>;
export type ActiveOperation = z.infer<typeof activeOperationSchema>;
export type OperationResultGuardInput = z.infer<
  typeof operationResultGuardInputSchema
>;
export type SerializableRequestContext = z.infer<
  typeof serializableRequestContextSchema
>;

/** AbortSignal is deliberately confined to the in-memory invocation boundary. */
export type RequestContext = SerializableRequestContext & {
  readonly abortSignal?: AbortSignal;
};

export type RuntimeState = z.infer<typeof runtimeStateSchema>;
export type IdempotencyRecordStatus = z.infer<
  typeof idempotencyRecordStatusSchema
>;
export type IdempotencyCleanupDisposition = z.infer<
  typeof idempotencyCleanupDispositionSchema
>;
export type StateTransitionIdempotencyRecord = z.infer<
  typeof stateTransitionIdempotencyRecordSchema
>;
export type RuntimeErrorSummary = z.infer<typeof runtimeErrorSummarySchema>;
export type DeploymentCapabilityBaseline = z.infer<
  typeof deploymentCapabilityBaselineSchema
>;
export type RuntimeSha256Digest = z.infer<typeof runtimeSha256DigestSchema>;

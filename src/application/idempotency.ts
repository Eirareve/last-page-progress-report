import type { StateTransitionIdempotencyRecord } from "../runtime/contracts";
import {
  evaluateStateTransitionIdempotency,
  markStateTransitionApplied,
  startStateTransitionIdempotencyRecord,
} from "../runtime/idempotency";
import { runtimeSha256DigestSchema } from "../runtime/schemas";

export type IdempotentTransitionExecution<T> = Readonly<{
  value: T;
  appliedRevision: number;
  appliedAt: string;
}>;

export type IdempotentApplicationTransitionResult<T> =
  | Readonly<{
      kind: "executed";
      value: T;
      pendingRecord: StateTransitionIdempotencyRecord;
      appliedRecord: StateTransitionIdempotencyRecord;
    }>
  | Readonly<{
      kind: "in_flight" | "replay" | "conflict" | "record_scope_mismatch";
      record: StateTransitionIdempotencyRecord;
    }>;

/**
 * Pure orchestration wrapper. It performs no Session or persistence write; the
 * caller must atomically persist the returned business state and appliedRecord.
 */
export async function runIdempotentApplicationTransition<T>(input: {
  existingRecord: StateTransitionIdempotencyRecord | null;
  sessionId: string;
  transitionKey: string;
  inputFingerprint: string;
  createdAt: string;
  expiresAt: string | null;
  execute: (
    pendingRecord: StateTransitionIdempotencyRecord,
  ) => Promise<IdempotentTransitionExecution<T>> | IdempotentTransitionExecution<T>;
}): Promise<IdempotentApplicationTransitionResult<T>> {
  const inputFingerprint = runtimeSha256DigestSchema.parse(input.inputFingerprint);
  const decision = evaluateStateTransitionIdempotency({
    existingRecord: input.existingRecord,
    sessionId: input.sessionId,
    transitionKey: input.transitionKey,
    inputFingerprint,
  });
  if (decision.kind !== "new") {
    return { kind: decision.kind, record: decision.record };
  }

  const pendingRecord = startStateTransitionIdempotencyRecord({
    sessionId: input.sessionId,
    transitionKey: input.transitionKey,
    inputFingerprint,
    createdAt: input.createdAt,
    expiresAt: input.expiresAt,
  });
  const execution = await input.execute(pendingRecord);
  const appliedRecord = markStateTransitionApplied({
    record: pendingRecord,
    appliedRevision: execution.appliedRevision,
    appliedAt: execution.appliedAt,
  });
  return {
    kind: "executed",
    value: execution.value,
    pendingRecord,
    appliedRecord,
  };
}

import type {
  RuntimeSha256Digest,
  StateTransitionIdempotencyRecord,
} from "./contracts";
import { stateTransitionIdempotencyRecordSchema } from "./schemas";

export type StateTransitionIdempotencyDecision =
  | { kind: "new" }
  | { kind: "in_flight"; record: StateTransitionIdempotencyRecord }
  | { kind: "replay"; record: StateTransitionIdempotencyRecord }
  | { kind: "conflict"; record: StateTransitionIdempotencyRecord }
  | { kind: "record_scope_mismatch"; record: StateTransitionIdempotencyRecord };

export function evaluateStateTransitionIdempotency(input: {
  existingRecord: StateTransitionIdempotencyRecord | null;
  sessionId: string;
  transitionKey: string;
  inputFingerprint: RuntimeSha256Digest;
}): StateTransitionIdempotencyDecision {
  const record = input.existingRecord;
  if (record === null) {
    return { kind: "new" };
  }
  if (
    record.sessionId !== input.sessionId ||
    record.transitionKey !== input.transitionKey
  ) {
    return { kind: "record_scope_mismatch", record };
  }
  if (record.inputFingerprint !== input.inputFingerprint) {
    return { kind: "conflict", record };
  }
  return record.status === "applied"
    ? { kind: "replay", record }
    : { kind: "in_flight", record };
}

export function startStateTransitionIdempotencyRecord(input: {
  sessionId: string;
  transitionKey: string;
  inputFingerprint: RuntimeSha256Digest;
  createdAt: string;
  expiresAt: string | null;
}): StateTransitionIdempotencyRecord {
  return stateTransitionIdempotencyRecordSchema.parse({
    sessionId: input.sessionId,
    transitionKey: input.transitionKey,
    inputFingerprint: input.inputFingerprint,
    status: "pending",
    appliedRevision: null,
    createdAt: input.createdAt,
    updatedAt: input.createdAt,
    expiresAt: input.expiresAt,
    cleanupDisposition: "with_recoverable_session",
    compactedIntoDigest: null,
  });
}

export function markStateTransitionApplied(input: {
  record: StateTransitionIdempotencyRecord;
  appliedRevision: number;
  appliedAt: string;
}): StateTransitionIdempotencyRecord {
  if (input.record.status === "applied") {
    if (input.record.appliedRevision !== input.appliedRevision) {
      throw new Error(
        "An applied idempotency record cannot be rebound to another revision",
      );
    }
    return input.record;
  }
  return stateTransitionIdempotencyRecordSchema.parse({
    ...input.record,
    status: "applied",
    appliedRevision: input.appliedRevision,
    updatedAt: input.appliedAt,
  });
}

export function isStateTransitionIdempotencyRecordExpired(
  record: StateTransitionIdempotencyRecord,
  observedAt: string,
): boolean {
  return (
    record.expiresAt !== null &&
    Date.parse(observedAt) >= Date.parse(record.expiresAt)
  );
}

import type { z } from "zod";

import { DomainInvariantError, type ManuscriptState } from "./manuscript";
import {
  currentCharlieSignatureStatusSchema,
  finalDispositionSchema,
  futureCharlieSignatureStatusSchema,
  signatureReviewAttemptStateSchema,
  signatureReviewCheckpointSchema,
  signatureReviewCheckpointStatusSchema,
  signatureReviewFingerprintMaterialSchema,
  signatureReviewRequestedModeSchema,
  signatureReviewSnapshotSchema,
  signatureReviewStateSchema,
} from "../schemas/signature.schema";
import { sha256DigestSchema } from "../text/stable-text-anchor.schema";

export type CurrentCharlieSignatureStatus = z.infer<
  typeof currentCharlieSignatureStatusSchema
>;
export type SignatureReviewSnapshot = z.infer<
  typeof signatureReviewSnapshotSchema
>;
export type SignatureReviewAttemptState = z.infer<
  typeof signatureReviewAttemptStateSchema
>;
export type SignatureReviewRequestedMode = z.infer<
  typeof signatureReviewRequestedModeSchema
>;
export type SignatureReviewFingerprintMaterial = z.infer<
  typeof signatureReviewFingerprintMaterialSchema
>;
export type SignatureReviewCheckpointStatus = z.infer<
  typeof signatureReviewCheckpointStatusSchema
>;
export type SignatureReviewCheckpoint = z.infer<
  typeof signatureReviewCheckpointSchema
>;
export type SignatureReviewState = z.infer<typeof signatureReviewStateSchema>;
export type FutureCharlieSignatureStatus = z.infer<
  typeof futureCharlieSignatureStatusSchema
>;
export type FinalDisposition = z.infer<typeof finalDispositionSchema>;

export type SignatureReviewInputFingerprintBuilder = (
  material: SignatureReviewFingerprintMaterial,
) => string | Promise<string>;

export type SignatureReviewRequestResult = {
  state: SignatureReviewState;
  inputFingerprint: string;
};

export async function beginSignatureReview(input: {
  state: SignatureReviewState;
  manuscript: Pick<
    ManuscriptState,
    | "preciseRevisionId"
    | "plainRevisionId"
    | "plainText"
    | "pendingDiff"
    | "revisionIntent"
  >;
  fingerprintMaterial: SignatureReviewFingerprintMaterial;
  buildInputFingerprint: SignatureReviewInputFingerprintBuilder;
  requestId: string;
}): Promise<SignatureReviewRequestResult> {
  const state = signatureReviewStateSchema.parse(input.state);
  if (
    state.currentCharlieSignatureStatus !== "hidden" ||
    state.currentCharlieSignatureReview !== null ||
    state.signatureReviewAttemptState !== null
  ) {
    throw new DomainInvariantError(
      "signature_review_already_decided_or_requested",
      "Only a signature review that has never been requested can begin",
    );
  }
  requireReviewReadyManuscript(input.manuscript, input.fingerprintMaterial);
  const requestId = requireNonEmpty(input.requestId, "signature_request_id_required");
  const material = signatureReviewFingerprintMaterialSchema.parse(
    input.fingerprintMaterial,
  );
  const inputFingerprint = await buildAndValidateFingerprint(
    material,
    input.buildInputFingerprint,
  );
  const maxAttempts = material.requestedMode === "live" ? 2 : 1;
  const attemptState = signatureReviewAttemptStateSchema.parse({
    requestedMode: material.requestedMode,
    inputFingerprint,
    attemptCount: 1,
    maxAttempts,
    lastRequestId: requestId,
    lastFailureCode: null,
  });
  const nextState = signatureReviewStateSchema.parse({
    currentCharlieSignatureStatus: "pending",
    currentCharlieSignatureReview: null,
    signatureReviewAttemptState: attemptState,
  });
  return { state: nextState, inputFingerprint };
}

export function applySignatureReviewSnapshot(input: {
  state: SignatureReviewState;
  snapshot: SignatureReviewSnapshot;
}): SignatureReviewState {
  const state = signatureReviewStateSchema.parse(input.state);
  const snapshot = signatureReviewSnapshotSchema.parse(input.snapshot);
  const attempt = state.signatureReviewAttemptState;
  if (state.currentCharlieSignatureStatus !== "pending" || attempt === null) {
    throw new DomainInvariantError(
      "signature_review_not_pending",
      "A signature review snapshot can only resolve the pending request",
    );
  }
  if (
    snapshot.inputFingerprint !== attempt.inputFingerprint ||
    snapshot.requestId !== attempt.lastRequestId
  ) {
    throw new DomainInvariantError(
      "signature_review_attempt_mismatch",
      "The signature review snapshot does not match the latest attempt",
    );
  }

  return signatureReviewStateSchema.parse({
    currentCharlieSignatureStatus: snapshot.status,
    currentCharlieSignatureReview: snapshot,
    signatureReviewAttemptState: {
      ...attempt,
      lastFailureCode:
        snapshot.snapshotKind === "unavailable" ? snapshot.failureCode : null,
    },
  });
}

export async function retryUnavailableSignatureReview(input: {
  state: SignatureReviewState;
  fingerprintMaterial: SignatureReviewFingerprintMaterial;
  buildInputFingerprint: SignatureReviewInputFingerprintBuilder;
  requestId: string;
}): Promise<SignatureReviewRequestResult> {
  const state = signatureReviewStateSchema.parse(input.state);
  const attempt = state.signatureReviewAttemptState;
  const review = state.currentCharlieSignatureReview;
  if (
    state.currentCharlieSignatureStatus !== "unavailable" ||
    attempt === null ||
    review?.snapshotKind !== "unavailable"
  ) {
    throw new DomainInvariantError(
      "signature_review_retry_not_unavailable",
      "Only an unavailable technical review can be retried",
    );
  }
  if (attempt.requestedMode !== "live") {
    throw new DomainInvariantError(
      "signature_review_retry_mock_forbidden",
      "Deterministic mock review does not permit manual retry",
    );
  }
  if (!review.retryable) {
    throw new DomainInvariantError(
      "signature_review_failure_not_retryable",
      "This technical failure is not retryable",
    );
  }
  if (attempt.attemptCount >= attempt.maxAttempts) {
    throw new DomainInvariantError(
      "signature_review_attempts_exhausted",
      "The live signature review manual retry budget is exhausted",
    );
  }

  const material = signatureReviewFingerprintMaterialSchema.parse(
    input.fingerprintMaterial,
  );
  requireRetryMaterialMatchesSnapshot(material, review, attempt.requestedMode);
  const inputFingerprint = await buildAndValidateFingerprint(
    material,
    input.buildInputFingerprint,
  );
  if (inputFingerprint !== attempt.inputFingerprint) {
    throw new DomainInvariantError(
      "signature_review_fingerprint_changed",
      "A manual retry must retain the original semantic input fingerprint",
    );
  }
  const requestId = requireNonEmpty(input.requestId, "signature_request_id_required");
  if (requestId === attempt.lastRequestId) {
    throw new DomainInvariantError(
      "signature_review_request_id_reused",
      "A manual retry requires a new request identifier",
    );
  }

  const nextState = signatureReviewStateSchema.parse({
    currentCharlieSignatureStatus: "pending",
    currentCharlieSignatureReview: null,
    signatureReviewAttemptState: {
      ...attempt,
      attemptCount: attempt.attemptCount + 1,
      lastRequestId: requestId,
    },
  });
  return { state: nextState, inputFingerprint };
}

export function skipUnrequestedSignatureReview(
  stateInput: SignatureReviewState,
): SignatureReviewState {
  const state = signatureReviewStateSchema.parse(stateInput);
  if (
    state.currentCharlieSignatureStatus !== "hidden" ||
    state.currentCharlieSignatureReview !== null ||
    state.signatureReviewAttemptState !== null
  ) {
    throw new DomainInvariantError(
      "signature_review_skip_after_request_forbidden",
      "not_requested is only valid before any signature review request",
    );
  }
  return signatureReviewStateSchema.parse({
    currentCharlieSignatureStatus: "not_requested",
    currentCharlieSignatureReview: null,
    signatureReviewAttemptState: null,
  });
}

export function canManuallyRetrySignatureReview(
  stateInput: SignatureReviewState,
): boolean {
  const state = signatureReviewStateSchema.parse(stateInput);
  const review = state.currentCharlieSignatureReview;
  const attempt = state.signatureReviewAttemptState;
  return (
    state.currentCharlieSignatureStatus === "unavailable" &&
    review?.snapshotKind === "unavailable" &&
    review.retryable &&
    attempt?.requestedMode === "live" &&
    attempt.attemptCount < attempt.maxAttempts
  );
}

async function buildAndValidateFingerprint(
  material: SignatureReviewFingerprintMaterial,
  builder: SignatureReviewInputFingerprintBuilder,
): Promise<string> {
  return sha256DigestSchema.parse(await builder(material));
}

function requireReviewReadyManuscript(
  manuscript: Pick<
    ManuscriptState,
    | "preciseRevisionId"
    | "plainRevisionId"
    | "plainText"
    | "pendingDiff"
    | "revisionIntent"
  >,
  materialInput: SignatureReviewFingerprintMaterial,
): void {
  const material = signatureReviewFingerprintMaterialSchema.parse(materialInput);
  if (manuscript.plainText === null || manuscript.plainRevisionId === null) {
    throw new DomainInvariantError(
      "signature_review_plain_revision_missing",
      "A signature review requires a prepared precise/plain revision pair",
    );
  }
  if (
    manuscript.pendingDiff !== null ||
    manuscript.revisionIntent !== null ||
    manuscript.preciseRevisionId !==
      material.bindings.revisions.preciseRevisionId ||
    manuscript.plainRevisionId !== material.bindings.revisions.plainRevisionId
  ) {
    throw new DomainInvariantError(
      "signature_review_revision_binding_mismatch",
      "The fingerprint material must bind the ready manuscript revisions",
    );
  }
}

function requireRetryMaterialMatchesSnapshot(
  material: SignatureReviewFingerprintMaterial,
  review: Extract<SignatureReviewSnapshot, { snapshotKind: "unavailable" }>,
  requestedMode: SignatureReviewRequestedMode,
): void {
  if (
    material.requestedMode !== requestedMode ||
    material.bindings.revisions.preciseRevisionId !== review.preciseRevisionId ||
    material.bindings.revisions.plainRevisionId !== review.plainRevisionId ||
    material.bindings.content.contentBundleId !== review.contentBundleId ||
    material.bindings.content.contentBundleVersion !==
      review.contentBundleVersion ||
    material.bindings.content.contentBundleChecksum !==
      review.contentBundleChecksum ||
    material.finalReviewSchemaVersion !== review.finalReviewSchemaVersion
  ) {
    throw new DomainInvariantError(
      "signature_review_retry_binding_mismatch",
      "A manual retry cannot change revision, content, mode, or result schema bindings",
    );
  }
}

function requireNonEmpty(value: string, code: string): string {
  const normalized = value.trim();
  if (normalized.length === 0) {
    throw new DomainInvariantError(code, "A non-empty value is required");
  }
  return normalized;
}

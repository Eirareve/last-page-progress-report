import {
  applySignatureReviewSnapshot,
  beginSignatureReview,
  signatureReviewSnapshotSchema,
  type ManuscriptState,
  type SignatureReviewFingerprintMaterial,
  type SignatureReviewRequestedMode,
  type SignatureReviewSnapshot,
  type SignatureReviewState,
} from "@/domain";
import { computeInputFingerprint } from "@/runtime";
import { makeManuscript } from "./domain";

export const SIGNATURE_REVIEW_SCHEMA_VERSION = "0.1.0";
export const SIGNATURE_CONTENT_CHECKSUM = `sha256:${"c".repeat(64)}` as const;
export const SIGNATURE_SEMANTIC_INPUT_DIGEST =
  `sha256:${"d".repeat(64)}` as const;
export const SIGNATURE_RESULT_DIGEST = `sha256:${"e".repeat(64)}` as const;
export const SIGNATURE_REVIEWED_AT = "2026-08-06T13:05:00.000Z";

export function makeHiddenSignatureReviewState(): SignatureReviewState {
  return {
    currentCharlieSignatureStatus: "hidden",
    currentCharlieSignatureReview: null,
    signatureReviewAttemptState: null,
  };
}

export function makeSignatureFingerprintMaterial(input?: {
  manuscript?: ManuscriptState;
  requestedMode?: SignatureReviewRequestedMode;
  semanticInputDigest?: `sha256:${string}`;
}): SignatureReviewFingerprintMaterial {
  const manuscript = input?.manuscript ?? makeManuscript();
  if (manuscript.plainRevisionId === null) {
    throw new TypeError("Signature fingerprint material requires a plain revision");
  }
  return {
    capability: "reviewCharlieSignature",
    requestedMode: input?.requestedMode ?? "live",
    bindings: {
      revisions: {
        preciseRevisionId: manuscript.preciseRevisionId,
        plainRevisionId: manuscript.plainRevisionId,
      },
      content: {
        contentBundleId: "content-bundle-1",
        contentBundleVersion: "content-bundle-0.1.0",
        contentBundleChecksum: SIGNATURE_CONTENT_CHECKSUM,
      },
    },
    finalReviewSchemaVersion: SIGNATURE_REVIEW_SCHEMA_VERSION,
    semanticInputDigest:
      input?.semanticInputDigest ?? SIGNATURE_SEMANTIC_INPUT_DIGEST,
  };
}

/** Domain-to-Runtime adapter: Domain never imports Runtime itself. */
export function buildSignatureInputFingerprint(
  material: SignatureReviewFingerprintMaterial,
) {
  return computeInputFingerprint({
    capability: material.capability,
    requestedMode: material.requestedMode,
    bindings: material.bindings,
    agentContractVersion: null,
    resultSchemaVersion: material.finalReviewSchemaVersion,
    semanticInputDigest: material.semanticInputDigest,
  });
}

export async function makePendingSignatureReview(input?: {
  manuscript?: ManuscriptState;
  requestedMode?: SignatureReviewRequestedMode;
  requestId?: string;
}): Promise<{
  manuscript: ManuscriptState;
  material: SignatureReviewFingerprintMaterial;
  state: SignatureReviewState;
}> {
  const manuscript = input?.manuscript ?? makeManuscript();
  const material = makeSignatureFingerprintMaterial({
    manuscript,
    requestedMode: input?.requestedMode,
  });
  const requested = await beginSignatureReview({
    state: makeHiddenSignatureReviewState(),
    manuscript,
    fingerprintMaterial: material,
    buildInputFingerprint: buildSignatureInputFingerprint,
    requestId: input?.requestId ?? "signature-request-1",
  });
  return { manuscript, material, state: requested.state };
}

export function makeReviewedSignatureSnapshot(input: {
  state: SignatureReviewState;
  manuscript?: ManuscriptState;
  status?: "signed" | "declined";
}): SignatureReviewSnapshot {
  const manuscript = input.manuscript ?? makeManuscript();
  const attempt = requireAttempt(input.state);
  if (manuscript.plainRevisionId === null) {
    throw new TypeError("Reviewed snapshot requires a plain revision");
  }
  return signatureReviewSnapshotSchema.parse({
    snapshotKind: "reviewed",
    status: input.status ?? "signed",
    reason: "The current text preserves the reviewed qualifications.",
    preciseRevisionId: manuscript.preciseRevisionId,
    plainRevisionId: manuscript.plainRevisionId,
    contentBundleId: "content-bundle-1",
    contentBundleVersion: "content-bundle-0.1.0",
    contentBundleChecksum: SIGNATURE_CONTENT_CHECKSUM,
    finalReviewSchemaVersion: SIGNATURE_REVIEW_SCHEMA_VERSION,
    evidenceIds: ["evidence-1"],
    inputFingerprint: attempt.inputFingerprint,
    requestId: attempt.lastRequestId,
    reviewedAt: SIGNATURE_REVIEWED_AT,
    resultDigest: SIGNATURE_RESULT_DIGEST,
  });
}

export function makeUnavailableSignatureSnapshot(input: {
  state: SignatureReviewState;
  manuscript?: ManuscriptState;
  retryable?: boolean;
  failureCode?: string;
}): SignatureReviewSnapshot {
  const manuscript = input.manuscript ?? makeManuscript();
  const attempt = requireAttempt(input.state);
  if (manuscript.plainRevisionId === null) {
    throw new TypeError("Unavailable snapshot requires a plain revision");
  }
  return signatureReviewSnapshotSchema.parse({
    snapshotKind: "unavailable",
    status: "unavailable",
    failureCode: input.failureCode ?? "network_error",
    summary: "The review service did not return a validated role decision.",
    retryable: input.retryable ?? true,
    preciseRevisionId: manuscript.preciseRevisionId,
    plainRevisionId: manuscript.plainRevisionId,
    contentBundleId: "content-bundle-1",
    contentBundleVersion: "content-bundle-0.1.0",
    contentBundleChecksum: SIGNATURE_CONTENT_CHECKSUM,
    finalReviewSchemaVersion: SIGNATURE_REVIEW_SCHEMA_VERSION,
    evidenceIds: ["evidence-1"],
    inputFingerprint: attempt.inputFingerprint,
    requestId: attempt.lastRequestId,
    unavailableAt: SIGNATURE_REVIEWED_AT,
  });
}

export async function makeTerminalSignatureReview(input?: {
  requestedMode?: SignatureReviewRequestedMode;
  status?: "signed" | "declined" | "unavailable";
  retryable?: boolean;
}): Promise<{
  manuscript: ManuscriptState;
  material: SignatureReviewFingerprintMaterial;
  state: SignatureReviewState;
}> {
  const pending = await makePendingSignatureReview({
    requestedMode: input?.requestedMode,
  });
  const snapshot =
    input?.status === "unavailable"
      ? makeUnavailableSignatureSnapshot({
          state: pending.state,
          manuscript: pending.manuscript,
          retryable: input.retryable,
        })
      : makeReviewedSignatureSnapshot({
          state: pending.state,
          manuscript: pending.manuscript,
          status: input?.status ?? "signed",
        });
  return {
    ...pending,
    state: applySignatureReviewSnapshot({ state: pending.state, snapshot }),
  };
}

function requireAttempt(state: SignatureReviewState) {
  const attempt = state.signatureReviewAttemptState;
  if (attempt === null || attempt.lastRequestId === null) {
    throw new TypeError("Fixture requires a launched signature attempt");
  }
  return attempt;
}

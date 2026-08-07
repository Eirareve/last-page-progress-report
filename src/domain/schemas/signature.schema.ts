import { z } from "zod";

import { sha256DigestSchema } from "../text/stable-text-anchor.schema";

export const signatureReviewRequestedModeSchema = z.enum(["mock", "live"]);

export const signatureReviewFingerprintMaterialSchema = z.strictObject({
  capability: z.literal("reviewCharlieSignature"),
  requestedMode: signatureReviewRequestedModeSchema,
  bindings: z.strictObject({
    revisions: z.strictObject({
      preciseRevisionId: z.string().min(1),
      plainRevisionId: z.string().min(1),
    }),
    content: z.strictObject({
      contentBundleId: z.string().min(1),
      contentBundleVersion: z.string().min(1),
      contentBundleChecksum: sha256DigestSchema,
    }),
  }),
  finalReviewSchemaVersion: z.string().min(1),
  semanticInputDigest: sha256DigestSchema,
});

export const currentCharlieSignatureStatusSchema = z.enum([
  "hidden",
  "pending",
  "signed",
  "declined",
  "unavailable",
  "not_requested",
]);

const signatureBindingShape = {
  preciseRevisionId: z.string().min(1),
  plainRevisionId: z.string().min(1),
  contentBundleId: z.string().min(1),
  contentBundleVersion: z.string().min(1),
  contentBundleChecksum: sha256DigestSchema,
  finalReviewSchemaVersion: z.string().min(1),
  evidenceIds: z
    .array(z.string().min(1))
    .refine((ids) => new Set(ids).size === ids.length, {
      message: "Signature review evidenceIds must be unique",
    }),
  inputFingerprint: sha256DigestSchema,
  requestId: z.string().min(1),
} as const;

const reviewedSignatureSnapshotSchema = z.strictObject({
  ...signatureBindingShape,
  snapshotKind: z.literal("reviewed"),
  status: z.enum(["signed", "declined"]),
  reason: z.string().min(1),
  reviewedAt: z.iso.datetime(),
  resultDigest: sha256DigestSchema.nullable(),
});

const unavailableSignatureSnapshotSchema = z.strictObject({
  ...signatureBindingShape,
  snapshotKind: z.literal("unavailable"),
  status: z.literal("unavailable"),
  failureCode: z.string().min(1),
  summary: z.string().min(1),
  retryable: z.boolean(),
  unavailableAt: z.iso.datetime(),
});

export const signatureReviewSnapshotSchema = z.discriminatedUnion(
  "snapshotKind",
  [reviewedSignatureSnapshotSchema, unavailableSignatureSnapshotSchema],
);

const signatureReviewAttemptShape = {
  inputFingerprint: sha256DigestSchema,
  attemptCount: z.number().int().min(0),
  lastRequestId: z.string().min(1).nullable(),
  lastFailureCode: z.string().min(1).nullable(),
} as const;

const mockSignatureReviewAttemptStateSchema = z.strictObject({
  ...signatureReviewAttemptShape,
  requestedMode: z.literal("mock"),
  maxAttempts: z.literal(1),
});

const liveSignatureReviewAttemptStateSchema = z.strictObject({
  ...signatureReviewAttemptShape,
  requestedMode: z.literal("live"),
  maxAttempts: z.literal(2),
});

export const signatureReviewAttemptStateSchema = z
  .discriminatedUnion("requestedMode", [
    mockSignatureReviewAttemptStateSchema,
    liveSignatureReviewAttemptStateSchema,
  ])
  .superRefine((state, context) => {
    if (state.attemptCount > state.maxAttempts) {
      context.addIssue({
        code: "custom",
        message: "attemptCount cannot exceed maxAttempts",
        path: ["attemptCount"],
      });
    }
    if ((state.attemptCount === 0) !== (state.lastRequestId === null)) {
      context.addIssue({
        code: "custom",
        message: "Only an unattempted review may omit lastRequestId",
        path: ["lastRequestId"],
      });
    }
    if (state.attemptCount === 0 && state.lastFailureCode !== null) {
      context.addIssue({
        code: "custom",
        message: "An unattempted review cannot contain a failure code",
        path: ["lastFailureCode"],
      });
    }
  });

export const signatureReviewCheckpointStatusSchema = z.enum([
  "hidden",
  "signed",
  "declined",
  "unavailable",
  "not_requested",
]);

export const signatureReviewCheckpointSchema = z
  .strictObject({
    status: signatureReviewCheckpointStatusSchema,
    review: signatureReviewSnapshotSchema.nullable(),
  })
  .superRefine((checkpoint, context) => {
    const reviewRequired = ["signed", "declined", "unavailable"].includes(
      checkpoint.status,
    );
    if (reviewRequired !== (checkpoint.review !== null)) {
      context.addIssue({
        code: "custom",
        message: "Checkpoint status and review snapshot presence must agree",
        path: ["review"],
      });
    }
    if (checkpoint.review && checkpoint.review.status !== checkpoint.status) {
      context.addIssue({
        code: "custom",
        message: "Checkpoint status must match its review snapshot",
        path: ["status"],
      });
    }
  });

export const signatureReviewStateSchema = z
  .strictObject({
    currentCharlieSignatureStatus: currentCharlieSignatureStatusSchema,
    currentCharlieSignatureReview: signatureReviewSnapshotSchema.nullable(),
    signatureReviewAttemptState: signatureReviewAttemptStateSchema.nullable(),
  })
  .superRefine((state, context) => {
    const terminalReviewStatus = [
      "signed",
      "declined",
      "unavailable",
    ].includes(state.currentCharlieSignatureStatus);
    if (terminalReviewStatus !== (state.currentCharlieSignatureReview !== null)) {
      context.addIssue({
        code: "custom",
        message: "Signature status and review snapshot presence must agree",
        path: ["currentCharlieSignatureReview"],
      });
    }

    const attemptRequired =
      state.currentCharlieSignatureStatus === "pending" || terminalReviewStatus;
    if (attemptRequired !== (state.signatureReviewAttemptState !== null)) {
      context.addIssue({
        code: "custom",
        message: "Requested signature review status requires attempt state",
        path: ["signatureReviewAttemptState"],
      });
    }

    if (
      state.currentCharlieSignatureStatus === "pending" &&
      state.signatureReviewAttemptState?.attemptCount === 0
    ) {
      context.addIssue({
        code: "custom",
        message: "A pending signature review requires a launched attempt",
        path: ["signatureReviewAttemptState", "attemptCount"],
      });
    }

    const review = state.currentCharlieSignatureReview;
    const attempt = state.signatureReviewAttemptState;
    if (review && attempt) {
      if (
        review.status !== state.currentCharlieSignatureStatus ||
        review.inputFingerprint !== attempt.inputFingerprint ||
        review.requestId !== attempt.lastRequestId
      ) {
        context.addIssue({
          code: "custom",
          message: "Signature review must match its status and latest attempt",
          path: ["currentCharlieSignatureReview"],
        });
      }
    }
  });

export const futureCharlieSignatureStatusSchema = z.literal("blank");

export const finalDispositionSchema = z.enum([
  "future_reference",
  "present_record",
  "unfinished",
]);

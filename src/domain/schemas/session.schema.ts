import { z } from "zod";

import {
  charliePositionSchema,
  charlieResponseSchema,
  contentItemSchema,
  dissentRecordSchema,
  evidenceCardSchema,
  userPrincipleSchema,
} from "./evidence.schema";
import { experienceStageSchema, roundStateSchema } from "./experience.schema";
import { manuscriptStateSchema } from "./manuscript.schema";
import { portraitDescriptorSchema, portraitPreludeSchema } from "./portrait.schema";
import {
  bouquetEntrySchema,
  semanticDriftSchema,
  semanticFragmentSchema,
  semanticPlacementBatchSchema,
  semanticRestorationProposalSchema,
} from "./semantic.schema";
import {
  currentCharlieSignatureStatusSchema,
  finalDispositionSchema,
  futureCharlieSignatureStatusSchema,
  signatureReviewAttemptStateSchema,
  signatureReviewCheckpointSchema,
  signatureReviewSnapshotSchema,
} from "./signature.schema";
import { sha256DigestSchema } from "../text/stable-text-anchor.schema";
import { SESSION_SCHEMA_VERSION } from "../versions";

export const sessionLifecycleStatusSchema = z.enum([
  "in_progress",
  "finalizing",
  "complete",
]);

export const sessionContentBindingSchema = z.strictObject({
  contentBundleId: z.string().min(1),
  contentBundleVersion: z.string().min(1),
  contentBundleChecksum: sha256DigestSchema,
  contentSchemaVersion: z.string().min(1),
  targetEnvironment: z.string().min(1),
});

export const sessionStateSchema = z
  .strictObject({
    sessionSchemaVersion: z.literal(SESSION_SCHEMA_VERSION),
    sessionId: z.string().min(1),
    stateRevision: z.number().int().min(0),
    lifecycleStatus: sessionLifecycleStatusSchema,
    stage: experienceStageSchema,
    stageInstanceId: z.string().min(1),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
    expiresAt: z.iso.datetime(),
    completedAt: z.iso.datetime().nullable(),
    contentBinding: sessionContentBindingSchema,
    configuration: z.unknown(),
    runtime: z.unknown(),
    provenance: z.unknown(),
    portraitDescriptors: z.array(portraitDescriptorSchema).length(3),
    portraits: portraitPreludeSchema,
    manuscript: manuscriptStateSchema,
    rounds: z.strictObject({
      round1: roundStateSchema,
      round2: roundStateSchema,
      round3: roundStateSchema,
    }),
    userPrinciples: z.array(userPrincipleSchema),
    charliePositions: z.array(charliePositionSchema),
    charlieResponses: z.array(charlieResponseSchema),
    openDissents: z.array(dissentRecordSchema),
    evidenceUsed: z.array(evidenceCardSchema),
    contentItemsUsed: z.array(contentItemSchema),
    semanticDrift: semanticDriftSchema.nullable(),
    semanticPlacementBatch: semanticPlacementBatchSchema.nullable(),
    semanticFragments: z.array(semanticFragmentSchema),
    semanticRestorationProposals: z.array(semanticRestorationProposalSchema),
    bouquet: z.array(bouquetEntrySchema),
    currentCharlieSignatureStatus: currentCharlieSignatureStatusSchema,
    currentCharlieSignatureReview: signatureReviewSnapshotSchema.nullable(),
    signatureReviewAttemptState: signatureReviewAttemptStateSchema.nullable(),
    signatureReviewCheckpoint: signatureReviewCheckpointSchema.nullable(),
    futureCharlieSignatureStatus: futureCharlieSignatureStatusSchema,
    finalDisposition: finalDispositionSchema.nullable(),
    portraitShiftSummary: z.string().min(1).nullable(),
    finalEnvelope: z.unknown().nullable(),
  })
  .superRefine((session, context) => {
    const isComplete = session.lifecycleStatus === "complete";
    const hasCompleteSnapshot =
      session.stage === "COMPLETE" &&
      session.completedAt !== null &&
      session.finalEnvelope !== null;
    const hasAnyCompleteMarker =
      session.stage === "COMPLETE" ||
      session.completedAt !== null ||
      session.finalEnvelope !== null;
    if (
      (isComplete && !hasCompleteSnapshot) ||
      (!isComplete && hasAnyCompleteMarker)
    ) {
      context.addIssue({
        code: "custom",
        message: "Only a complete Session can contain a completed envelope snapshot",
        path: ["lifecycleStatus"],
      });
    }
    if (
      (session.lifecycleStatus === "finalizing") !==
      (session.stage === "FINALIZING")
    ) {
      context.addIssue({
        code: "custom",
        message: "A finalizing Session must be in FINALIZING",
        path: ["stage"],
      });
    }

    const drift = session.semanticDrift;
    if (drift?.status === "current") {
      if (
        drift.preciseRevisionId !== session.manuscript.preciseRevisionId ||
        drift.plainRevisionId !== session.manuscript.plainRevisionId
      ) {
        context.addIssue({
          code: "custom",
          message: "A current SemanticDrift must match both manuscript revisions",
          path: ["semanticDrift"],
        });
      }
    }
    if (drift?.status === "placement_in_progress") {
      const batch = session.semanticPlacementBatch;
      if (
        !batch ||
        drift.preciseRevisionId !== batch.baselinePreciseRevisionId ||
        drift.plainRevisionId !== batch.baselinePlainRevisionId
      ) {
        context.addIssue({
          code: "custom",
          message: "A placement baseline drift must match its placement batch",
          path: ["semanticDrift"],
        });
      }
    }
    if (
      session.semanticPlacementBatch &&
      session.semanticPlacementBatch.status !== "invalidated" &&
      session.semanticPlacementBatch.workingPlainRevisionId !==
        session.manuscript.plainRevisionId
    ) {
      context.addIssue({
        code: "custom",
        message: "An active or completed batch must bind the working plain revision",
        path: ["semanticPlacementBatch", "workingPlainRevisionId"],
      });
    }

    const review = session.currentCharlieSignatureReview;
    const checkpoint = session.signatureReviewCheckpoint;
    const revisionIntent = session.manuscript.revisionIntent;
    const activeReviewRequired = ["signed", "declined", "unavailable"].includes(
      session.currentCharlieSignatureStatus,
    );
    if (activeReviewRequired !== (review !== null)) {
      context.addIssue({
        code: "custom",
        message: "Signature status and review snapshot presence must agree",
        path: ["currentCharlieSignatureReview"],
      });
    }
    if (review) {
      if (
        review.status !== session.currentCharlieSignatureStatus ||
        review.preciseRevisionId !== session.manuscript.preciseRevisionId ||
        review.plainRevisionId !== session.manuscript.plainRevisionId ||
        review.contentBundleId !== session.contentBinding.contentBundleId ||
        review.contentBundleVersion !== session.contentBinding.contentBundleVersion ||
        review.contentBundleChecksum !== session.contentBinding.contentBundleChecksum
      ) {
        context.addIssue({
          code: "custom",
          message: "A signature snapshot must match its status and current bindings",
          path: ["currentCharlieSignatureReview"],
        });
      }
    }

    if ((checkpoint !== null) !== (revisionIntent !== null)) {
      context.addIssue({
        code: "custom",
        message: "Signature checkpoint and manuscript revision intent must coexist",
        path: ["signatureReviewCheckpoint"],
      });
    }
    if (session.stage === "MANUSCRIPT_REVISION" && checkpoint === null) {
      context.addIssue({
        code: "custom",
        message: "MANUSCRIPT_REVISION requires a signature checkpoint",
        path: ["signatureReviewCheckpoint"],
      });
    }
    if (checkpoint !== null) {
      if (session.stage !== "MANUSCRIPT_REVISION") {
        context.addIssue({
          code: "custom",
          message: "A signature checkpoint is only valid in MANUSCRIPT_REVISION",
          path: ["stage"],
        });
      }
      if (
        session.currentCharlieSignatureStatus !== "hidden" ||
        session.currentCharlieSignatureReview !== null
      ) {
        context.addIssue({
          code: "custom",
          message: "The active signature must be hidden while a checkpoint is held",
          path: ["currentCharlieSignatureStatus"],
        });
      }
      if (
        revisionIntent !== null &&
        (revisionIntent.sourcePreciseRevisionId !==
          session.manuscript.preciseRevisionId ||
          revisionIntent.sourcePreciseText !== session.manuscript.preciseText)
      ) {
        context.addIssue({
          code: "custom",
          message: "Revision intent must bind the unchanged checkpoint manuscript",
          path: ["manuscript", "revisionIntent"],
        });
      }
    }

    const effectiveStatus = checkpoint?.status ?? session.currentCharlieSignatureStatus;
    const effectiveReview = checkpoint?.review ?? review;
    const attempt = session.signatureReviewAttemptState;
    const effectiveReviewRequired = ["signed", "declined", "unavailable"].includes(
      effectiveStatus,
    );
    const attemptRequired =
      effectiveStatus === "pending" || effectiveReviewRequired;
    if (attemptRequired !== (attempt !== null)) {
      context.addIssue({
        code: "custom",
        message: "Requested signature state and attempt state must coexist",
        path: ["signatureReviewAttemptState"],
      });
    }
    if (effectiveStatus === "pending" && attempt?.attemptCount === 0) {
      context.addIssue({
        code: "custom",
        message: "A pending signature review requires a launched attempt",
        path: ["signatureReviewAttemptState", "attemptCount"],
      });
    }
    if (effectiveReview && attempt) {
      if (
        effectiveReview.status !== effectiveStatus ||
        effectiveReview.inputFingerprint !== attempt.inputFingerprint ||
        effectiveReview.requestId !== attempt.lastRequestId
      ) {
        context.addIssue({
          code: "custom",
          message: "Signature review must bind the latest persisted attempt",
          path: ["signatureReviewAttemptState"],
        });
      }
      if (
        (effectiveReview.snapshotKind === "unavailable" &&
          attempt.lastFailureCode !== effectiveReview.failureCode) ||
        (effectiveReview.snapshotKind === "reviewed" &&
          attempt.lastFailureCode !== null)
      ) {
        context.addIssue({
          code: "custom",
          message: "Attempt failure metadata must match the active review",
          path: ["signatureReviewAttemptState", "lastFailureCode"],
        });
      }
      if (
        effectiveReview.preciseRevisionId !== session.manuscript.preciseRevisionId ||
        effectiveReview.plainRevisionId !== session.manuscript.plainRevisionId ||
        effectiveReview.contentBundleId !== session.contentBinding.contentBundleId ||
        effectiveReview.contentBundleVersion !==
          session.contentBinding.contentBundleVersion ||
        effectiveReview.contentBundleChecksum !==
          session.contentBinding.contentBundleChecksum
      ) {
        context.addIssue({
          code: "custom",
          message: "Checkpointed signature review must match current bindings",
          path: ["signatureReviewCheckpoint"],
        });
      }
      const allowedEvidenceIds = new Set(
        session.evidenceUsed.map((evidence) => evidence.id),
      );
      if (
        effectiveReview.evidenceIds.some(
          (evidenceId) => !allowedEvidenceIds.has(evidenceId),
        )
      ) {
        context.addIssue({
          code: "custom",
          message: "Signature review evidence must come from Session evidence",
          path: ["currentCharlieSignatureReview", "evidenceIds"],
        });
      }
    }
  });

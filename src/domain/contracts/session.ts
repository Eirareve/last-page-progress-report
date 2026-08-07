import type { z } from "zod";

import {
  DomainInvariantError,
  submitManuscriptRevision as submitPreciseManuscriptRevision,
  type RevisionEntry,
} from "./manuscript";
import {
  manuscriptRevisionIntentSchema,
} from "../schemas/manuscript.schema";
import {
  semanticDriftSchema,
  semanticPlacementBatchSchema,
  semanticRestorationProposalSchema,
} from "../schemas/semantic.schema";
import {
  signatureReviewCheckpointSchema,
  signatureReviewStateSchema,
} from "../schemas/signature.schema";
import {
  sessionContentBindingSchema,
  sessionLifecycleStatusSchema,
  sessionStateSchema,
} from "../schemas/session.schema";

export type SessionLifecycleStatus = z.infer<
  typeof sessionLifecycleStatusSchema
>;
export type SessionContentBinding = z.infer<typeof sessionContentBindingSchema>;

type SessionStateValue = z.infer<typeof sessionStateSchema>;

export type SessionState<
  TConfiguration = unknown,
  TRuntime = unknown,
  TProvenance = unknown,
  TFinalEnvelope = unknown,
> = Omit<
  SessionStateValue,
  "configuration" | "runtime" | "provenance" | "finalEnvelope"
> & {
  configuration: TConfiguration;
  runtime: TRuntime;
  provenance: TProvenance;
  finalEnvelope: TFinalEnvelope | null;
};

export type SignatureRevisionDomainState = Pick<
  SessionState,
  | "contentBinding"
  | "manuscript"
  | "semanticDrift"
  | "semanticPlacementBatch"
  | "semanticFragments"
  | "semanticRestorationProposals"
  | "bouquet"
  | "currentCharlieSignatureStatus"
  | "currentCharlieSignatureReview"
  | "signatureReviewAttemptState"
  | "signatureReviewCheckpoint"
>;

export type EnterManuscriptRevisionResult = {
  kind: "entered_manuscript_revision";
  nextStage: "MANUSCRIPT_REVISION";
  state: SignatureRevisionDomainState;
};

export type CancelManuscriptRevisionResult = {
  kind: "cancelled_manuscript_revision";
  nextStage: "FINAL_SIGNATURE";
  state: SignatureRevisionDomainState;
};

export type SubmitSignatureBoundManuscriptRevisionResult =
  | {
      kind: "no_change";
      nextStage: "FINAL_SIGNATURE";
      state: SignatureRevisionDomainState;
      revisionEntry: null;
    }
  | {
      kind: "changed";
      nextStage: "PLAIN_REWRITE";
      state: SignatureRevisionDomainState;
      revisionEntry: RevisionEntry;
    };

export function enterManuscriptRevisionFromSignature(input: {
  state: SignatureRevisionDomainState;
  draftPreciseText?: string;
}): EnterManuscriptRevisionResult {
  const { state } = input;
  const activeSignature = signatureReviewStateSchema.parse({
    currentCharlieSignatureStatus: state.currentCharlieSignatureStatus,
    currentCharlieSignatureReview: state.currentCharlieSignatureReview,
    signatureReviewAttemptState: state.signatureReviewAttemptState,
  });
  if (activeSignature.currentCharlieSignatureStatus === "pending") {
    throw new DomainInvariantError(
      "signature_review_pending_return_forbidden",
      "A pending signature review must be cancelled before manuscript revision",
    );
  }
  if (
    state.signatureReviewCheckpoint !== null ||
    state.manuscript.revisionIntent !== null
  ) {
    throw new DomainInvariantError(
      "manuscript_revision_already_active",
      "The signature review already has an active manuscript revision checkpoint",
    );
  }
  if (state.manuscript.pendingDiff !== null) {
    throw new DomainInvariantError(
      "pending_diff_blocks_manuscript_revision",
      "A pending Diff must be resolved before returning to manuscript revision",
    );
  }
  requireSnapshotBindingsMatchState(state);

  const checkpoint = signatureReviewCheckpointSchema.parse({
    status: activeSignature.currentCharlieSignatureStatus,
    review: activeSignature.currentCharlieSignatureReview,
  });
  const revisionIntent = manuscriptRevisionIntentSchema.parse({
    sourcePreciseRevisionId: state.manuscript.preciseRevisionId,
    sourcePreciseText: state.manuscript.preciseText,
    draftPreciseText: input.draftPreciseText ?? state.manuscript.preciseText,
    returnTarget: "FINAL_SIGNATURE",
  });

  return {
    kind: "entered_manuscript_revision",
    nextStage: "MANUSCRIPT_REVISION",
    state: {
      ...state,
      manuscript: { ...state.manuscript, revisionIntent },
      currentCharlieSignatureStatus: "hidden",
      currentCharlieSignatureReview: null,
      signatureReviewAttemptState: state.signatureReviewAttemptState,
      signatureReviewCheckpoint: checkpoint,
    },
  };
}

export function cancelSignatureBoundManuscriptRevision(input: {
  state: SignatureRevisionDomainState;
}): CancelManuscriptRevisionResult {
  const checkpoint = requireActiveRevisionCheckpoint(input.state);
  return {
    kind: "cancelled_manuscript_revision",
    nextStage: "FINAL_SIGNATURE",
    state: restoreSignatureCheckpoint(
      {
        ...input.state,
        manuscript: { ...input.state.manuscript, revisionIntent: null },
      },
      checkpoint,
    ),
  };
}

export async function submitSignatureBoundManuscriptRevision(input: {
  state: SignatureRevisionDomainState;
  draftPreciseText: string;
  nextRevisionId: string;
  submittedAt: string;
  reason: string;
}): Promise<SubmitSignatureBoundManuscriptRevisionResult> {
  const checkpoint = requireActiveRevisionCheckpoint(input.state);
  const submitted = await submitPreciseManuscriptRevision({
    manuscript: input.state.manuscript,
    draftPreciseText: input.draftPreciseText,
    nextRevisionId: input.nextRevisionId,
    submittedAt: input.submittedAt,
    reason: input.reason,
  });

  if (submitted.kind === "no_change") {
    return {
      kind: "no_change",
      nextStage: "FINAL_SIGNATURE",
      revisionEntry: null,
      state: restoreSignatureCheckpoint(
        { ...input.state, manuscript: submitted.manuscript },
        checkpoint,
      ),
    };
  }

  return {
    kind: "changed",
    nextStage: "PLAIN_REWRITE",
    revisionEntry: submitted.revisionEntry,
    state: {
      ...input.state,
      manuscript: submitted.manuscript,
      semanticDrift:
        input.state.semanticDrift === null
          ? null
          : semanticDriftSchema.parse({
              ...input.state.semanticDrift,
              status: "stale",
            }),
      semanticPlacementBatch:
        input.state.semanticPlacementBatch === null
          ? null
          : semanticPlacementBatchSchema.parse({
              ...input.state.semanticPlacementBatch,
              status: "invalidated",
              completedAt: null,
              invalidatedReason: "precise_revision_changed",
            }),
      semanticFragments: [],
      semanticRestorationProposals:
        input.state.semanticRestorationProposals.map((proposal) =>
          semanticRestorationProposalSchema.parse({
            ...proposal,
            status: "stale",
            appliedAt: null,
            staleReason: "precise_revision_changed",
          }),
        ),
      bouquet: [],
      currentCharlieSignatureStatus: "hidden",
      currentCharlieSignatureReview: null,
      signatureReviewAttemptState: null,
      signatureReviewCheckpoint: null,
    },
  };
}

function requireActiveRevisionCheckpoint(
  state: SignatureRevisionDomainState,
): NonNullable<SignatureRevisionDomainState["signatureReviewCheckpoint"]> {
  const checkpoint = state.signatureReviewCheckpoint;
  const intent = state.manuscript.revisionIntent;
  if (checkpoint === null || intent === null) {
    throw new DomainInvariantError(
      "manuscript_revision_checkpoint_missing",
      "An active manuscript revision requires its signature checkpoint",
    );
  }
  if (
    state.currentCharlieSignatureStatus !== "hidden" ||
    state.currentCharlieSignatureReview !== null
  ) {
    throw new DomainInvariantError(
      "manuscript_revision_signature_not_hidden",
      "The active signature must remain hidden during manuscript revision",
    );
  }
  if (
    intent.sourcePreciseRevisionId !== state.manuscript.preciseRevisionId ||
    intent.sourcePreciseText !== state.manuscript.preciseText
  ) {
    throw new DomainInvariantError(
      "manuscript_revision_source_changed",
      "The checkpoint source revision changed before submission",
    );
  }
  requireSnapshotBindingsMatchState({
    ...state,
    currentCharlieSignatureStatus: checkpoint.status,
    currentCharlieSignatureReview: checkpoint.review,
  });
  signatureReviewStateSchema.parse({
    currentCharlieSignatureStatus: checkpoint.status,
    currentCharlieSignatureReview: checkpoint.review,
    signatureReviewAttemptState: state.signatureReviewAttemptState,
  });
  return checkpoint;
}

function restoreSignatureCheckpoint(
  state: SignatureRevisionDomainState,
  checkpoint: NonNullable<
    SignatureRevisionDomainState["signatureReviewCheckpoint"]
  >,
): SignatureRevisionDomainState {
  signatureReviewStateSchema.parse({
    currentCharlieSignatureStatus: checkpoint.status,
    currentCharlieSignatureReview: checkpoint.review,
    signatureReviewAttemptState: state.signatureReviewAttemptState,
  });
  return {
    ...state,
    currentCharlieSignatureStatus: checkpoint.status,
    currentCharlieSignatureReview: checkpoint.review,
    signatureReviewAttemptState: state.signatureReviewAttemptState,
    signatureReviewCheckpoint: null,
  };
}

function requireSnapshotBindingsMatchState(
  state: SignatureRevisionDomainState,
): void {
  const review = state.currentCharlieSignatureReview;
  if (
    review !== null &&
    (review.preciseRevisionId !== state.manuscript.preciseRevisionId ||
      review.plainRevisionId !== state.manuscript.plainRevisionId ||
      review.contentBundleId !== state.contentBinding.contentBundleId ||
      review.contentBundleVersion !== state.contentBinding.contentBundleVersion ||
      review.contentBundleChecksum !== state.contentBinding.contentBundleChecksum)
  ) {
    throw new DomainInvariantError(
      "signature_review_binding_mismatch",
      "The active signature review does not match manuscript or content bindings",
    );
  }
}

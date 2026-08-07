import { describe, expect, it, vi } from "vitest";

import {
  DomainInvariantError,
  applySignatureReviewSnapshot,
  beginSignatureReview,
  bouquetEntrySchema,
  canManuallyRetrySignatureReview,
  cancelSignatureBoundManuscriptRevision,
  enterManuscriptRevisionFromSignature,
  manuscriptStateSchema,
  retryUnavailableSignatureReview,
  semanticDriftSchema,
  semanticFragmentSchema,
  semanticPlacementBatchSchema,
  semanticRestorationProposalSchema,
  sessionStateSchema,
  signatureReviewAttemptStateSchema,
  signatureReviewSnapshotSchema,
  signatureReviewStateSchema,
  skipUnrequestedSignatureReview,
  submitSignatureBoundManuscriptRevision,
  type SessionState,
  type SignatureRevisionDomainState,
} from "@/domain";
import { makeRestorationProposal, makeSemanticFragment } from "../fixtures/domain";
import { makeFinalizableState } from "../fixtures/finalization";
import {
  SIGNATURE_CONTENT_CHECKSUM,
  buildSignatureInputFingerprint,
  makeHiddenSignatureReviewState,
  makePendingSignatureReview,
  makeSignatureFingerprintMaterial,
  makeTerminalSignatureReview,
  makeUnavailableSignatureSnapshot,
} from "../fixtures/signature";

describe("signature review attempt contract", () => {
  it("freezes live at two attempts and deterministic mock at one", () => {
    const common = {
      inputFingerprint: `sha256:${"1".repeat(64)}`,
      attemptCount: 1,
      lastRequestId: "request-1",
      lastFailureCode: null,
    } as const;
    expect(
      signatureReviewAttemptStateSchema.parse({
        ...common,
        requestedMode: "live",
        maxAttempts: 2,
      }).maxAttempts,
    ).toBe(2);
    expect(
      signatureReviewAttemptStateSchema.parse({
        ...common,
        requestedMode: "mock",
        maxAttempts: 1,
      }).maxAttempts,
    ).toBe(1);
    expect(
      signatureReviewAttemptStateSchema.safeParse({
        ...common,
        requestedMode: "live",
        maxAttempts: 3,
      }).success,
    ).toBe(false);
    expect(
      signatureReviewAttemptStateSchema.safeParse({
        ...common,
        requestedMode: "mock",
        maxAttempts: 2,
      }).success,
    ).toBe(false);
  });

  it("creates attempt one from a deterministic builder and restores it after refresh", async () => {
    const manuscript = makeFinalizableState().manuscript;
    const material = makeSignatureFingerprintMaterial({ manuscript });
    const builder = vi.fn(buildSignatureInputFingerprint);
    const requested = await beginSignatureReview({
      state: makeHiddenSignatureReviewState(),
      manuscript,
      fingerprintMaterial: material,
      buildInputFingerprint: builder,
      requestId: "request-live-1",
    });

    expect(builder).toHaveBeenCalledOnce();
    expect(requested.state).toMatchObject({
      currentCharlieSignatureStatus: "pending",
      signatureReviewAttemptState: {
        requestedMode: "live",
        attemptCount: 1,
        maxAttempts: 2,
        lastRequestId: "request-live-1",
      },
    });
    const refreshed = signatureReviewStateSchema.parse(
      structuredClone(requested.state),
    );
    expect(refreshed.signatureReviewAttemptState).toEqual(
      requested.state.signatureReviewAttemptState,
    );
  });

  it.each(["signed", "declined"] as const)(
    "does not re-request a terminal %s decision for the same fingerprint",
    async (status) => {
      const terminal = await makeTerminalSignatureReview({ status });
      await expect(
        beginSignatureReview({
          state: terminal.state,
          manuscript: terminal.manuscript,
          fingerprintMaterial: terminal.material,
          buildInputFingerprint: buildSignatureInputFingerprint,
          requestId: "request-repeated",
        }),
      ).rejects.toMatchObject({
        code: "signature_review_already_decided_or_requested",
      });
      await expect(
        retryUnavailableSignatureReview({
          state: terminal.state,
          fingerprintMaterial: terminal.material,
          buildInputFingerprint: buildSignatureInputFingerprint,
          requestId: "request-repeated",
        }),
      ).rejects.toMatchObject({ code: "signature_review_retry_not_unavailable" });
    },
  );

  it("permits exactly one live manual retry after a retryable unavailable failure", async () => {
    const unavailable = await makeTerminalSignatureReview({
      requestedMode: "live",
      status: "unavailable",
      retryable: true,
    });
    const refreshed = signatureReviewStateSchema.parse(
      structuredClone(unavailable.state),
    );
    expect(canManuallyRetrySignatureReview(refreshed)).toBe(true);

    const retried = await retryUnavailableSignatureReview({
      state: refreshed,
      fingerprintMaterial: unavailable.material,
      buildInputFingerprint: buildSignatureInputFingerprint,
      requestId: "signature-request-2",
    });
    expect(retried.state).toMatchObject({
      currentCharlieSignatureStatus: "pending",
      currentCharlieSignatureReview: null,
      signatureReviewAttemptState: {
        attemptCount: 2,
        maxAttempts: 2,
        lastRequestId: "signature-request-2",
        lastFailureCode: "network_error",
      },
    });
    expect(retried.inputFingerprint).toBe(
      unavailable.state.signatureReviewAttemptState?.inputFingerprint,
    );

    const secondFailure = applySignatureReviewSnapshot({
      state: retried.state,
      snapshot: makeUnavailableSignatureSnapshot({
        state: retried.state,
        manuscript: unavailable.manuscript,
      }),
    });
    const beforeExhaustedRetry = structuredClone(secondFailure);
    expect(canManuallyRetrySignatureReview(secondFailure)).toBe(false);
    await expect(
      retryUnavailableSignatureReview({
        state: secondFailure,
        fingerprintMaterial: unavailable.material,
        buildInputFingerprint: buildSignatureInputFingerprint,
        requestId: "signature-request-3",
      }),
    ).rejects.toMatchObject({ code: "signature_review_attempts_exhausted" });
    expect(secondFailure).toEqual(beforeExhaustedRetry);
    expect(secondFailure.currentCharlieSignatureStatus).toBe("unavailable");
  });

  it("rejects manual retry for mock and non-retryable technical failures", async () => {
    const mockUnavailable = await makeTerminalSignatureReview({
      requestedMode: "mock",
      status: "unavailable",
    });
    expect(mockUnavailable.state.signatureReviewAttemptState?.maxAttempts).toBe(1);
    await expect(
      retryUnavailableSignatureReview({
        state: mockUnavailable.state,
        fingerprintMaterial: mockUnavailable.material,
        buildInputFingerprint: buildSignatureInputFingerprint,
        requestId: "mock-request-2",
      }),
    ).rejects.toMatchObject({ code: "signature_review_retry_mock_forbidden" });

    const nonRetryable = await makeTerminalSignatureReview({
      requestedMode: "live",
      status: "unavailable",
      retryable: false,
    });
    await expect(
      retryUnavailableSignatureReview({
        state: nonRetryable.state,
        fingerprintMaterial: nonRetryable.material,
        buildInputFingerprint: buildSignatureInputFingerprint,
        requestId: "live-request-2",
      }),
    ).rejects.toMatchObject({
      code: "signature_review_failure_not_retryable",
    });
  });

  it("uses not_requested only for a user skip before any request", async () => {
    const skipped = skipUnrequestedSignatureReview(
      makeHiddenSignatureReviewState(),
    );
    expect(skipped).toEqual({
      currentCharlieSignatureStatus: "not_requested",
      currentCharlieSignatureReview: null,
      signatureReviewAttemptState: null,
    });
    expect(() => skipUnrequestedSignatureReview(skipped)).toThrowError(
      DomainInvariantError,
    );

    const unavailable = await makeTerminalSignatureReview({
      status: "unavailable",
    });
    expect(() => skipUnrequestedSignatureReview(unavailable.state)).toThrowError(
      DomainInvariantError,
    );
  });

  it("rejects non-sha fingerprints and pending attempt zero", () => {
    const pendingZero = {
      currentCharlieSignatureStatus: "pending",
      currentCharlieSignatureReview: null,
      signatureReviewAttemptState: {
        requestedMode: "live",
        inputFingerprint: `sha256:${"2".repeat(64)}`,
        attemptCount: 0,
        maxAttempts: 2,
        lastRequestId: null,
        lastFailureCode: null,
      },
    } as const;
    expect(signatureReviewStateSchema.safeParse(pendingZero).success).toBe(false);

    const snapshot = {
      snapshotKind: "unavailable",
      status: "unavailable",
      preciseRevisionId: "precise-r1",
      plainRevisionId: "plain-r1",
      contentBundleId: "content-bundle-1",
      contentBundleVersion: "content-bundle-0.1.0",
      contentBundleChecksum: SIGNATURE_CONTENT_CHECKSUM,
      finalReviewSchemaVersion: "0.1.0",
      evidenceIds: [],
      inputFingerprint: "not-a-digest",
      requestId: "request-1",
      failureCode: "network_error",
      summary: "Unavailable",
      retryable: true,
      unavailableAt: "2026-08-06T13:00:00.000Z",
    } as const;
    expect(signatureReviewSnapshotSchema.safeParse(snapshot).success).toBe(false);
  });
});

describe("signature-bound manuscript revision checkpoint", () => {
  it("moves review into a MANUSCRIPT_REVISION-only checkpoint and keeps attempts", async () => {
    const session = await makeSignedSignatureSession();
    const before = structuredClone(session);
    const entered = enterManuscriptRevisionFromSignature({
      state: pickRevisionDomainState(session),
    });

    expect(entered.nextStage).toBe("MANUSCRIPT_REVISION");
    expect(entered.state.currentCharlieSignatureStatus).toBe("hidden");
    expect(entered.state.currentCharlieSignatureReview).toBeNull();
    expect(entered.state.signatureReviewCheckpoint).toEqual({
      status: "signed",
      review: before.currentCharlieSignatureReview,
    });
    expect(entered.state.signatureReviewAttemptState).toEqual(
      before.signatureReviewAttemptState,
    );
    expect(session).toEqual(before);

    const inRevisionStage = {
      ...session,
      ...entered.state,
      stage: entered.nextStage,
    };
    expect(sessionStateSchema.safeParse(inRevisionStage).success).toBe(true);
    expect(
      sessionStateSchema.safeParse({
        ...inRevisionStage,
        stage: "FINAL_SIGNATURE",
      }).success,
    ).toBe(false);
  });

  it("requires the checkpoint field and rejects a pending review return", async () => {
    const session = await makeSignedSignatureSession();
    const missingCheckpoint: Record<string, unknown> = { ...session };
    Reflect.deleteProperty(missingCheckpoint, "signatureReviewCheckpoint");
    expect(sessionStateSchema.safeParse(missingCheckpoint).success).toBe(false);

    const pending = await makePendingSignatureReview();
    expect(() =>
      enterManuscriptRevisionFromSignature({
        state: {
          ...pickRevisionDomainState(session),
          currentCharlieSignatureStatus:
            pending.state.currentCharlieSignatureStatus,
          currentCharlieSignatureReview:
            pending.state.currentCharlieSignatureReview,
          signatureReviewAttemptState:
            pending.state.signatureReviewAttemptState,
        },
      }),
    ).toThrowError(/pending signature review/i);
  });

  it("cancel restores the checkpoint without consuming budget or creating a revision", async () => {
    const session = await makeSignedSignatureSession();
    const entered = enterManuscriptRevisionFromSignature({
      state: pickRevisionDomainState(session),
      draftPreciseText: `${session.manuscript.preciseText} draft`,
    });
    const cancelled = cancelSignatureBoundManuscriptRevision({
      state: entered.state,
    });

    expect(cancelled.nextStage).toBe("FINAL_SIGNATURE");
    expect(cancelled.state.currentCharlieSignatureStatus).toBe("signed");
    expect(cancelled.state.currentCharlieSignatureReview).toEqual(
      session.currentCharlieSignatureReview,
    );
    expect(cancelled.state.signatureReviewAttemptState).toEqual(
      session.signatureReviewAttemptState,
    );
    expect(cancelled.state.signatureReviewCheckpoint).toBeNull();
    expect(cancelled.state.manuscript.revisionIntent).toBeNull();
    expect(cancelled.state.manuscript.revisionHistory).toEqual(
      session.manuscript.revisionHistory,
    );
    expect(cancelled.state.semanticDrift).toEqual(session.semanticDrift);
  });

  it("a normalized no-change submit restores the checkpoint and leaves budget intact", async () => {
    const session = await makeSignedSignatureSession();
    const entered = enterManuscriptRevisionFromSignature({
      state: pickRevisionDomainState(session),
    });
    const submitted = await submitSignatureBoundManuscriptRevision({
      state: entered.state,
      draftPreciseText: session.manuscript.preciseText,
      nextRevisionId: "precise-unused",
      submittedAt: "2026-08-06T13:10:00.000Z",
      reason: "No actual text change",
    });

    expect(submitted.kind).toBe("no_change");
    expect(submitted.nextStage).toBe("FINAL_SIGNATURE");
    expect(submitted.revisionEntry).toBeNull();
    expect(submitted.state.manuscript.preciseRevisionId).toBe(
      session.manuscript.preciseRevisionId,
    );
    expect(submitted.state.manuscript.revisionHistory).toEqual(
      session.manuscript.revisionHistory,
    );
    expect(submitted.state.currentCharlieSignatureStatus).toBe("signed");
    expect(submitted.state.currentCharlieSignatureReview).toEqual(
      session.currentCharlieSignatureReview,
    );
    expect(submitted.state.signatureReviewAttemptState).toEqual(
      session.signatureReviewAttemptState,
    );
    expect(submitted.state.signatureReviewCheckpoint).toBeNull();
  });

  it("actual precise change atomically discards the checkpoint and invalidates revision-bound semantics", async () => {
    const session = await makeSignedSignatureSessionWithSemanticPlacement();
    const oldFingerprint = session.signatureReviewAttemptState?.inputFingerprint;
    const before = structuredClone(session);
    const entered = enterManuscriptRevisionFromSignature({
      state: pickRevisionDomainState(session),
    });
    const submitted = await submitSignatureBoundManuscriptRevision({
      state: entered.state,
      draftPreciseText: `${session.manuscript.preciseText} A changed qualification.`,
      nextRevisionId: "precise-r2",
      submittedAt: "2026-08-06T13:10:00.000Z",
      reason: "User-authorized precise manuscript revision",
    });

    expect(submitted.kind).toBe("changed");
    expect(submitted.nextStage).toBe("PLAIN_REWRITE");
    expect(submitted.revisionEntry).toMatchObject({
      revisionId: "precise-r2",
      documentTarget: "precise_text",
      changeKind: "manuscript_revision",
    });
    expect(submitted.state).toMatchObject({
      currentCharlieSignatureStatus: "hidden",
      currentCharlieSignatureReview: null,
      signatureReviewAttemptState: null,
      signatureReviewCheckpoint: null,
      semanticDrift: { status: "stale" },
      semanticPlacementBatch: {
        status: "invalidated",
        completedAt: null,
        invalidatedReason: "precise_revision_changed",
      },
      semanticFragments: [],
      bouquet: [],
    });
    expect(submitted.state.manuscript).toMatchObject({
      preciseRevisionId: "precise-r2",
      plainText: null,
      plainRevisionId: null,
      revisionIntent: null,
    });
    expect(
      submitted.state.semanticRestorationProposals.every(
        (proposal) =>
          proposal.status === "stale" &&
          proposal.staleReason === "precise_revision_changed" &&
          proposal.appliedAt === null,
      ),
    ).toBe(true);
    expect(session).toEqual(before);

    const changedSession = {
      ...session,
      ...submitted.state,
      stage: submitted.nextStage,
    };
    expect(sessionStateSchema.safeParse(changedSession).success).toBe(true);

    await expect(
      beginSignatureReview({
        state: {
          currentCharlieSignatureStatus:
            submitted.state.currentCharlieSignatureStatus,
          currentCharlieSignatureReview:
            submitted.state.currentCharlieSignatureReview,
          signatureReviewAttemptState:
            submitted.state.signatureReviewAttemptState,
        },
        manuscript: submitted.state.manuscript,
        fingerprintMaterial: makeSignatureFingerprintMaterial({
          manuscript: session.manuscript,
        }),
        buildInputFingerprint: buildSignatureInputFingerprint,
        requestId: "premature-request",
      }),
    ).rejects.toMatchObject({ code: "signature_review_plain_revision_missing" });

    const regeneratedManuscript = manuscriptStateSchema.parse({
      ...submitted.state.manuscript,
      plainText: "Past and future still matter after the revision.",
      plainRevisionId: "plain-r2",
    });
    const regeneratedMaterial = makeSignatureFingerprintMaterial({
      manuscript: regeneratedManuscript,
    });
    const nextRequest = await beginSignatureReview({
      state: makeHiddenSignatureReviewState(),
      manuscript: regeneratedManuscript,
      fingerprintMaterial: regeneratedMaterial,
      buildInputFingerprint: buildSignatureInputFingerprint,
      requestId: "signature-request-new-revisions",
    });
    expect(nextRequest.inputFingerprint).not.toBe(oldFingerprint);
    expect(nextRequest.state.signatureReviewAttemptState).toMatchObject({
      attemptCount: 1,
      maxAttempts: 2,
      inputFingerprint: nextRequest.inputFingerprint,
    });
  });
});

async function makeSignedSignatureSession(): Promise<SessionState> {
  const session = makeFinalizableState();
  const terminal = await makeTerminalSignatureReview({
    requestedMode: "live",
    status: "signed",
  });
  return sessionStateSchema.parse({
    ...session,
    stage: "FINAL_SIGNATURE",
    stageInstanceId: "stage-instance-final-signature",
    contentBinding: {
      ...session.contentBinding,
      contentBundleChecksum: SIGNATURE_CONTENT_CHECKSUM,
    },
    configuration: { requestedAgentMode: "live" },
    runtime: {
      ...session.runtime,
      stageInstanceId: "stage-instance-final-signature",
    },
    evidenceUsed: [
      {
        id: "evidence-1",
        roundId: "round1",
        title: "Verified evidence",
        publicSummary: "A public summary used by the signature review.",
        verifiedFactIds: ["fact-1"],
        interpretationIds: [],
      },
    ],
    currentCharlieSignatureStatus:
      terminal.state.currentCharlieSignatureStatus,
    currentCharlieSignatureReview: terminal.state.currentCharlieSignatureReview,
    signatureReviewAttemptState: terminal.state.signatureReviewAttemptState,
    signatureReviewCheckpoint: null,
  });
}

async function makeSignedSignatureSessionWithSemanticPlacement(): Promise<
  SessionState
> {
  const session = await makeSignedSignatureSession();
  const restoredFragment = makeSemanticFragment({
    id: "fragment-restored",
    preciseRevisionId: "precise-r1",
    plainRevisionId: "plain-r0",
  });
  const proposed = await makeRestorationProposal({
    proposalId: "proposal-restored",
    fragment: restoredFragment,
    targetPlainRevisionId: "plain-r0",
    currentPlainText: session.manuscript.plainText ?? "",
    offsetCodePoint: 0,
    replacementText: "Important reference: ",
  });
  const appliedProposal = semanticRestorationProposalSchema.parse({
    ...proposed,
    status: "applied",
    confirmedAt: "2026-08-06T12:03:00.000Z",
    appliedAt: "2026-08-06T12:04:00.000Z",
    staleReason: null,
  });
  const appliedRestoredFragment = semanticFragmentSchema.parse({
    ...restoredFragment,
    placement: "restored_to_plain_text",
    resolvedAt: "2026-08-06T12:04:00.000Z",
    restorationProposalId: appliedProposal.proposalId,
  });
  const bouquetFragment = semanticFragmentSchema.parse({
    ...makeSemanticFragment({
      id: "fragment-bouquet",
      preciseRevisionId: "precise-r1",
      plainRevisionId: "plain-r0",
    }),
    placement: "placed_in_bouquet",
    resolvedAt: "2026-08-06T12:04:00.000Z",
  });
  const placementBatch = semanticPlacementBatchSchema.parse({
    batchId: "batch-complete",
    baselinePreciseRevisionId: "precise-r1",
    baselinePlainRevisionId: "plain-r0",
    workingPlainRevisionId: "plain-r1",
    fragmentIds: [appliedRestoredFragment.id, bouquetFragment.id],
    decisions: [
      {
        fragmentId: appliedRestoredFragment.id,
        placement: "restored_to_plain_text",
        status: "applied",
        restorationProposalId: appliedProposal.proposalId,
        confirmedAt: "2026-08-06T12:03:00.000Z",
        appliedPlainRevisionId: "plain-r1",
      },
      {
        fragmentId: bouquetFragment.id,
        placement: "placed_in_bouquet",
        status: "confirmed",
        restorationProposalId: null,
        confirmedAt: "2026-08-06T12:04:00.000Z",
        appliedPlainRevisionId: null,
      },
    ],
    confirmedRestorationProposalIds: [appliedProposal.proposalId],
    status: "completed",
    createdAt: "2026-08-06T12:02:00.000Z",
    completedAt: "2026-08-06T12:05:00.000Z",
    invalidatedReason: null,
  });
  const drift = semanticDriftSchema.parse({
    ...session.semanticDrift,
    preciseRevisionId: "precise-r1",
    plainRevisionId: "plain-r1",
    status: "current",
    fragmentIds: [appliedRestoredFragment.id, bouquetFragment.id],
  });
  const bouquet = [
    bouquetEntrySchema.parse({
      id: "bouquet-entry-1",
      fragmentId: bouquetFragment.id,
      phrase: bouquetFragment.phrase,
      reason: bouquetFragment.reason,
      consequence: bouquetFragment.consequence,
      sourcePreciseRevisionId: bouquetFragment.sourcePreciseRevisionId,
      sourcePlainRevisionId: bouquetFragment.sourcePlainRevisionId,
      placedAt: "2026-08-06T12:04:00.000Z",
    }),
  ];

  return sessionStateSchema.parse({
    ...session,
    semanticDrift: drift,
    semanticPlacementBatch: placementBatch,
    semanticFragments: [appliedRestoredFragment, bouquetFragment],
    semanticRestorationProposals: [appliedProposal],
    bouquet,
  });
}

function pickRevisionDomainState(
  session: SessionState,
): SignatureRevisionDomainState {
  return {
    contentBinding: session.contentBinding,
    manuscript: session.manuscript,
    semanticDrift: session.semanticDrift,
    semanticPlacementBatch: session.semanticPlacementBatch,
    semanticFragments: session.semanticFragments,
    semanticRestorationProposals: session.semanticRestorationProposals,
    bouquet: session.bouquet,
    currentCharlieSignatureStatus: session.currentCharlieSignatureStatus,
    currentCharlieSignatureReview: session.currentCharlieSignatureReview,
    signatureReviewAttemptState: session.signatureReviewAttemptState,
    signatureReviewCheckpoint: session.signatureReviewCheckpoint,
  };
}

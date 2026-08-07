import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  acceptPendingDiff,
  applyConfirmedSemanticRestoration,
  attachSemanticRestorationProposal,
  beginPlacementConsistencyCheck,
  codePointLength,
  completePlacementConsistencyCheck,
  computePortraitShift,
  computeSemanticRestorationProposalHash,
  confirmSemanticRestorationProposal,
  createSemanticPlacementBatch,
  createStableTextPointAnchor,
  createStableTextRangeAnchor,
  documentDiffSchema,
  normalizeTextNfc,
  portraitShiftComparisonSchema,
  rejectPendingDiff,
  resolveStableTextAnchor,
  selectSemanticFragmentPlacement,
  semanticRestorationProposalSchema,
  sha256NfcUtf8,
  submitManuscriptRevision,
} from "@/domain";
import {
  APPLIED_AT,
  CONFIRMED_AT,
  CREATED_AT,
  makeManuscript,
  makeProposedAnnotationDiff,
  makeProposedDeleteDiff,
  makeProposedInsertDiff,
  makeProposedReplaceDiff,
  makeRestorationProposal,
  makeSemanticDrift,
  makeSemanticFragment,
} from "../fixtures/domain";

describe("StableTextAnchor contract", () => {
  it("normalizes NFC before hashing UTF-8 bytes with SHA-256", async () => {
    const composed = "é";
    const decomposed = "e\u0301";
    const expected = createHash("sha256")
      .update(Buffer.from(composed, "utf8"))
      .digest("hex");

    expect(normalizeTextNfc(decomposed)).toBe(composed);
    expect(await sha256NfcUtf8(decomposed)).toBe(`sha256:${expected}`);
    expect(await sha256NfcUtf8(decomposed)).toBe(
      await sha256NfcUtf8(composed),
    );
  });

  it("indexes normalized text by Unicode code point rather than UTF-16 unit", async () => {
    const text = "A😀e\u0301Z";
    const anchor = await createStableTextRangeAnchor({
      textDocument: "precise_text",
      baseRevisionId: "precise-r1",
      baselineText: text,
      startCodePoint: 1,
      endCodePoint: 2,
    });
    const point = await createStableTextPointAnchor({
      textDocument: "precise_text",
      baseRevisionId: "precise-r1",
      baselineText: text,
      offsetCodePoint: 2,
    });

    expect(codePointLength(text)).toBe(4);
    expect(text.length).toBeGreaterThan(codePointLength(text));
    expect(anchor.expectedText).toBe("😀");
    expect(anchor.prefixText).toBe("A");
    expect(anchor.suffixText).toBe("éZ");
    expect(point.offsetCodePoint).toBe(2);
  });

  it("rebases only when frozen text and context identify one exact target", async () => {
    const baseline = "left TARGET right";
    const anchor = await createStableTextRangeAnchor({
      textDocument: "plain_text",
      baseRevisionId: "plain-r1",
      baselineText: baseline,
      startCodePoint: 5,
      endCodePoint: 11,
    });
    const current = "prefix left TARGET right suffix";

    await expect(
      resolveStableTextAnchor({
        anchor,
        currentText: current,
        currentRevisionId: "plain-r2",
        allowDeterministicRebase: true,
      }),
    ).resolves.toEqual({
      kind: "resolved",
      startCodePoint: codePointLength("prefix left "),
      endCodePoint: codePointLength("prefix left TARGET"),
      rebased: true,
    });
  });

  it("marks an ambiguous exact rebase stale instead of guessing", async () => {
    const anchor = await createStableTextRangeAnchor({
      textDocument: "plain_text",
      baseRevisionId: "plain-r1",
      baselineText: "X",
      startCodePoint: 0,
      endCodePoint: 1,
    });

    await expect(
      resolveStableTextAnchor({
        anchor,
        currentText: "X X",
        currentRevisionId: "plain-r2",
        allowDeterministicRebase: true,
      }),
    ).resolves.toEqual({ kind: "stale", reason: "no_unique_match" });
  });
});

describe("portrait comparison contract", () => {
  it("represents no_unique_answer without fabricating a stage set", () => {
    const comparison = computePortraitShift({
      initialChoice: "peak",
      finalChoice: "no_unique_answer",
      relatedEvidenceIds: ["evidence-2", "evidence-1", "evidence-1"],
      relatedRevisionIds: ["revision-2", "revision-1"],
    });

    expect(comparison).toEqual({
      comparisonKind: "no_unique_answer",
      initialChoice: "peak",
      finalChoice: "no_unique_answer",
      initialIncludedStages: ["peak"],
      finalIncludedStages: null,
      changed: true,
      newlyIncludedStages: [],
      excludedStages: [],
      relatedEvidenceIds: ["evidence-1", "evidence-2"],
      relatedRevisionIds: ["revision-1", "revision-2"],
    });
    expect(
      portraitShiftComparisonSchema.safeParse({
        ...comparison,
        finalIncludedStages: ["early", "peak", "futureFacing"],
      }).success,
    ).toBe(false);
  });
});

describe("DocumentDiff contract", () => {
  const text = "Keep future choice.";
  const futureStart = codePointLength("Keep ");
  const futureEnd = futureStart + codePointLength("future");

  it("enforces the operation, target, anchor-kind, and field matrix", async () => {
    const insert = await makeProposedInsertDiff({
      text,
      revisionId: "precise-r1",
      offsetCodePoint: futureStart,
    });
    const replace = await makeProposedReplaceDiff({
      text,
      revisionId: "precise-r1",
      startCodePoint: futureStart,
      endCodePoint: futureEnd,
    });
    const deletion = await makeProposedDeleteDiff({
      text,
      revisionId: "precise-r1",
      startCodePoint: futureStart,
      endCodePoint: futureEnd,
    });
    const annotation = await makeProposedAnnotationDiff({
      text,
      revisionId: "precise-r1",
      documentTarget: "margin_note",
      anchorDocument: "precise_text",
      offsetCodePoint: futureStart,
    });

    for (const diff of [insert, replace, deletion, annotation]) {
      expect(documentDiffSchema.safeParse(diff).success).toBe(true);
    }

    expect(
      documentDiffSchema.safeParse({ ...insert, documentTarget: "margin_note" })
        .success,
    ).toBe(false);
    expect(
      documentDiffSchema.safeParse({ ...insert, targetAnchor: replace.targetAnchor })
        .success,
    ).toBe(false);
    expect(
      documentDiffSchema.safeParse({ ...replace, targetAnchor: insert.targetAnchor })
        .success,
    ).toBe(false);
    expect(
      documentDiffSchema.safeParse({ ...insert, documentTarget: "plain_text" })
        .success,
    ).toBe(false);
    expect(documentDiffSchema.safeParse({ ...insert, oldText: "future" }).success).toBe(
      false,
    );
  });

  it("does not change the manuscript until a proposed Diff is accepted", async () => {
    const diff = await makeProposedReplaceDiff({
      text,
      revisionId: "precise-r1",
      startCodePoint: futureStart,
      endCodePoint: futureEnd,
      newText: "present",
    });
    const manuscript = makeManuscript({
      preciseText: text,
      preciseRevisionId: "precise-r1",
      plainText: null,
      plainRevisionId: null,
      pendingDiff: diff,
    });

    expect(manuscript.preciseText).toBe(text);
    expect(manuscript.preciseRevisionId).toBe("precise-r1");
    expect(manuscript.revisionHistory).toEqual([]);
    expect(manuscript.diffAudit).toEqual([]);

    const accepted = await acceptPendingDiff({
      manuscript,
      diffId: diff.id,
      confirmedAt: CONFIRMED_AT,
      nextRevisionId: "precise-r2",
    });

    expect(accepted.manuscript.preciseText).toBe("Keep present choice.");
    expect(accepted.manuscript.preciseRevisionId).toBe("precise-r2");
    expect(accepted.manuscript.pendingDiff).toBeNull();
    expect(accepted.manuscript.revisionHistory).toHaveLength(1);
    expect(accepted.manuscript.diffAudit).toEqual([
      expect.objectContaining({ id: diff.id, status: "accepted" }),
    ]);
    await expect(
      acceptPendingDiff({
        manuscript: accepted.manuscript,
        diffId: diff.id,
        confirmedAt: CONFIRMED_AT,
        nextRevisionId: "precise-r3",
      }),
    ).rejects.toMatchObject({ code: "pending_diff_mismatch" });
  });

  it("records rejection once without creating a manuscript revision", async () => {
    const diff = await makeProposedDeleteDiff({
      text,
      revisionId: "precise-r1",
      startCodePoint: futureStart,
      endCodePoint: futureEnd,
    });
    const manuscript = makeManuscript({
      preciseText: text,
      preciseRevisionId: "precise-r1",
      plainText: null,
      plainRevisionId: null,
      pendingDiff: diff,
    });
    const rejected = rejectPendingDiff({
      manuscript,
      diffId: diff.id,
      confirmedAt: CONFIRMED_AT,
    });

    expect(rejected.manuscript.preciseText).toBe(text);
    expect(rejected.manuscript.preciseRevisionId).toBe("precise-r1");
    expect(rejected.manuscript.revisionHistory).toEqual([]);
    expect(rejected.manuscript.diffAudit).toEqual([
      expect.objectContaining({ id: diff.id, status: "rejected" }),
    ]);
    expect(() =>
      rejectPendingDiff({
        manuscript: rejected.manuscript,
        diffId: diff.id,
        confirmedAt: CONFIRMED_AT,
      }),
    ).toThrowError();
  });

  it("rejects revision, anchor, and old-text hash mismatches", async () => {
    const staleRevisionDiff = await makeProposedReplaceDiff({
      text,
      revisionId: "precise-old",
      startCodePoint: futureStart,
      endCodePoint: futureEnd,
    });
    await expect(
      acceptPendingDiff({
        manuscript: makeManuscript({
          preciseText: text,
          preciseRevisionId: "precise-r1",
          plainText: null,
          plainRevisionId: null,
          pendingDiff: staleRevisionDiff,
        }),
        diffId: staleRevisionDiff.id,
        confirmedAt: CONFIRMED_AT,
        nextRevisionId: "precise-r2",
      }),
    ).rejects.toMatchObject({ code: "base_revision_mismatch" });

    const valid = await makeProposedReplaceDiff({
      text,
      revisionId: "precise-r1",
      startCodePoint: futureStart,
      endCodePoint: futureEnd,
    });
    const wrongOldTextHash = documentDiffSchema.parse({
      ...valid,
      oldTextHash: `sha256:${"0".repeat(64)}`,
    });
    await expect(
      acceptPendingDiff({
        manuscript: makeManuscript({
          preciseText: text,
          preciseRevisionId: "precise-r1",
          plainText: null,
          plainRevisionId: null,
          pendingDiff: wrongOldTextHash,
        }),
        diffId: wrongOldTextHash.id,
        confirmedAt: CONFIRMED_AT,
        nextRevisionId: "precise-r2",
      }),
    ).rejects.toMatchObject({ code: "old_text_mismatch" });

    await expect(
      acceptPendingDiff({
        manuscript: makeManuscript({
          preciseText: "Keep changed choice.",
          preciseRevisionId: "precise-r1",
          plainText: null,
          plainRevisionId: null,
          pendingDiff: valid,
        }),
        diffId: valid.id,
        confirmedAt: CONFIRMED_AT,
        nextRevisionId: "precise-r2",
      }),
    ).rejects.toMatchObject({ code: "stale_anchor" });
  });

  it("audits accepted annotations without creating a text revision", async () => {
    const diff = await makeProposedAnnotationDiff({
      text,
      revisionId: "precise-r1",
      documentTarget: "margin_note",
      anchorDocument: "precise_text",
    });
    const manuscript = makeManuscript({
      preciseText: text,
      preciseRevisionId: "precise-r1",
      plainText: null,
      plainRevisionId: null,
      pendingDiff: diff,
    });
    const accepted = await acceptPendingDiff({
      manuscript,
      diffId: diff.id,
      confirmedAt: CONFIRMED_AT,
      nextRevisionId: "unused-revision-id",
    });

    expect(accepted.revisionEntry).toBeNull();
    expect(accepted.manuscript.revisionHistory).toEqual([]);
    expect(accepted.manuscript.diffAudit).toEqual([
      expect.objectContaining({ id: diff.id, status: "accepted" }),
    ]);
  });

  it("does not create revisions for semantic no-change submissions or empty Diffs", async () => {
    const manuscript = makeManuscript({
      preciseText: "Café",
      preciseRevisionId: "precise-r1",
      plainText: null,
      plainRevisionId: null,
    });
    const submitted = await submitManuscriptRevision({
      manuscript,
      draftPreciseText: "Cafe\u0301",
      nextRevisionId: "precise-r2",
      submittedAt: CONFIRMED_AT,
      reason: "NFC-equivalent edit",
    });

    expect(submitted.kind).toBe("no_change");
    expect(submitted.manuscript.preciseRevisionId).toBe("precise-r1");
    expect(submitted.manuscript.revisionHistory).toEqual([]);

    const noChangeDiff = await makeProposedReplaceDiff({
      text,
      revisionId: "precise-r1",
      startCodePoint: futureStart,
      endCodePoint: futureEnd,
      newText: "future",
    });
    await expect(
      acceptPendingDiff({
        manuscript: makeManuscript({
          preciseText: text,
          preciseRevisionId: "precise-r1",
          plainText: null,
          plainRevisionId: null,
          pendingDiff: noChangeDiff,
        }),
        diffId: noChangeDiff.id,
        confirmedAt: CONFIRMED_AT,
        nextRevisionId: "precise-r2",
      }),
    ).rejects.toMatchObject({ code: "no_change_diff" });
  });
});

describe("semantic placement contract", () => {
  it("directly confirms margin/bouquet choices but treats restoration as direction only", () => {
    const margin = makeSemanticFragment({ id: "fragment-margin" });
    const bouquet = makeSemanticFragment({ id: "fragment-bouquet" });
    const restoration = makeSemanticFragment({ id: "fragment-restoration" });
    const started = createSemanticPlacementBatch({
      batchId: "batch-direct",
      drift: makeSemanticDrift({
        fragmentIds: [margin.id, bouquet.id, restoration.id],
      }),
      fragments: [margin, bouquet, restoration],
      createdAt: CREATED_AT,
    });

    const marginResult = selectSemanticFragmentPlacement({
      batch: started.batch,
      fragment: margin,
      placement: "saved_as_margin_note",
      selectedAt: CONFIRMED_AT,
    });
    const bouquetResult = selectSemanticFragmentPlacement({
      batch: marginResult.batch,
      fragment: bouquet,
      placement: "placed_in_bouquet",
      selectedAt: CONFIRMED_AT,
      bouquetEntryId: "bouquet-entry-1",
    });
    const directionResult = selectSemanticFragmentPlacement({
      batch: bouquetResult.batch,
      fragment: restoration,
      placement: "restored_to_plain_text",
      selectedAt: CONFIRMED_AT,
    });

    expect(marginResult.fragment).toMatchObject({
      placement: "saved_as_margin_note",
      resolvedAt: CONFIRMED_AT,
      restorationProposalId: null,
    });
    expect(bouquetResult.fragment).toMatchObject({
      placement: "placed_in_bouquet",
      resolvedAt: CONFIRMED_AT,
      restorationProposalId: null,
    });
    expect(bouquetResult.bouquetEntry).toMatchObject({
      id: "bouquet-entry-1",
      fragmentId: bouquet.id,
    });
    expect(directionResult.fragment).toEqual(restoration);
    expect(directionResult.batch.decisions).toContainEqual(
      expect.objectContaining({
        fragmentId: restoration.id,
        placement: "restored_to_plain_text",
        status: "direction_selected",
        restorationProposalId: null,
        confirmedAt: null,
      }),
    );
  });

  it("binds a proposal hash and marks tampering stale before confirmation", async () => {
    const fragment = makeSemanticFragment();
    const started = createSemanticPlacementBatch({
      batchId: "batch-hash",
      drift: makeSemanticDrift(),
      fragments: [fragment],
      createdAt: CREATED_AT,
    });
    const direction = selectSemanticFragmentPlacement({
      batch: started.batch,
      fragment,
      placement: "restored_to_plain_text",
      selectedAt: CONFIRMED_AT,
    });
    const proposal = await makeRestorationProposal({
      fragment,
      targetPlainRevisionId: "plain-r1",
      currentPlainText: "Future choice.",
      offsetCodePoint: codePointLength("Future"),
      replacementText: " deliberate",
    });

    expect(await computeSemanticRestorationProposalHash(proposal)).toBe(
      proposal.proposalHash,
    );

    const tampered = semanticRestorationProposalSchema.parse({
      ...proposal,
      replacementText: " silently changed",
    });
    const attached = await attachSemanticRestorationProposal({
      batch: direction.batch,
      fragment,
      proposal: tampered,
    });

    expect(attached).toMatchObject({
      kind: "stale",
      reason: "proposal_hash_mismatch",
      proposal: { status: "stale", staleReason: "proposal_hash_mismatch" },
    });
    expect(attached.batch.decisions).toContainEqual(
      expect.objectContaining({
        fragmentId: fragment.id,
        status: "direction_selected",
        restorationProposalId: null,
      }),
    );
  });

  it("requires an attached current proposal, explicit confirmation, and no pending Diff", async () => {
    const plainText = "Future choice.";
    const fragment = makeSemanticFragment();
    const started = createSemanticPlacementBatch({
      batchId: "batch-confirm",
      drift: makeSemanticDrift(),
      fragments: [fragment],
      createdAt: CREATED_AT,
    });
    const direction = selectSemanticFragmentPlacement({
      batch: started.batch,
      fragment,
      placement: "restored_to_plain_text",
      selectedAt: CONFIRMED_AT,
    });
    const proposal = await makeRestorationProposal({
      fragment,
      targetPlainRevisionId: "plain-r1",
      currentPlainText: plainText,
      offsetCodePoint: codePointLength("Future"),
      replacementText: " deliberate",
    });
    const attached = await attachSemanticRestorationProposal({
      batch: direction.batch,
      fragment,
      proposal,
    });
    expect(attached.kind).toBe("valid");
    if (attached.kind !== "valid") {
      throw new Error("Expected a valid attached proposal");
    }

    await expect(
      applyConfirmedSemanticRestoration({
        manuscript: makeManuscript({ plainText, plainRevisionId: "plain-r1" }),
        batch: attached.batch,
        fragment,
        proposal: attached.proposal,
        nextPlainRevisionId: "plain-r2",
        appliedAt: APPLIED_AT,
      }),
    ).rejects.toMatchObject({ code: "restoration_proposal_not_confirmed" });

    const confirmed = await confirmSemanticRestorationProposal({
      batch: attached.batch,
      proposal: attached.proposal,
      currentPlainText: plainText,
      currentPlainRevisionId: "plain-r1",
      confirmedAt: CONFIRMED_AT,
    });
    expect(confirmed.kind).toBe("valid");
    if (confirmed.kind !== "valid") {
      throw new Error("Expected a valid confirmed proposal");
    }

    const unrelatedDiff = await makeProposedInsertDiff({
      text: "Past and future both matter.",
      revisionId: "precise-r1",
      offsetCodePoint: 0,
    });
    await expect(
      applyConfirmedSemanticRestoration({
        manuscript: makeManuscript({
          plainText,
          plainRevisionId: "plain-r1",
          pendingDiff: unrelatedDiff,
        }),
        batch: confirmed.batch,
        fragment,
        proposal: confirmed.proposal,
        nextPlainRevisionId: "plain-r2",
        appliedAt: APPLIED_AT,
      }),
    ).rejects.toMatchObject({ code: "pending_diff_during_restoration" });

    const applied = await applyConfirmedSemanticRestoration({
      manuscript: makeManuscript({ plainText, plainRevisionId: "plain-r1" }),
      batch: confirmed.batch,
      fragment,
      proposal: confirmed.proposal,
      nextPlainRevisionId: "plain-r2",
      appliedAt: APPLIED_AT,
    });

    expect(applied.kind).toBe("applied");
    if (applied.kind !== "applied") {
      throw new Error("Expected the confirmed restoration to apply");
    }
    expect(applied.manuscript.plainText).toBe("Future deliberate choice.");
    expect(applied.manuscript.plainRevisionId).toBe("plain-r2");
    expect(applied.manuscript.pendingDiff).toBeNull();
    expect(applied.revisionEntry.changeKind).toBe("semantic_restoration");
    expect(applied.fragment).toMatchObject({
      placement: "restored_to_plain_text",
      restorationProposalId: proposal.proposalId,
    });
    expect(applied.proposal.status).toBe("applied");
    expect(applied.batch).toMatchObject({
      status: "in_progress",
      workingPlainRevisionId: "plain-r2",
    });
  });

  it("marks a proposal stale when the current source text no longer matches", async () => {
    const plainText = "Future choice.";
    const fragment = makeSemanticFragment();
    const started = createSemanticPlacementBatch({
      batchId: "batch-stale",
      drift: makeSemanticDrift(),
      fragments: [fragment],
      createdAt: CREATED_AT,
    });
    const direction = selectSemanticFragmentPlacement({
      batch: started.batch,
      fragment,
      placement: "restored_to_plain_text",
      selectedAt: CONFIRMED_AT,
    });
    const proposal = await makeRestorationProposal({
      fragment,
      targetPlainRevisionId: "plain-r1",
      currentPlainText: plainText,
      offsetCodePoint: codePointLength("Future"),
      replacementText: " deliberate",
    });
    const attached = await attachSemanticRestorationProposal({
      batch: direction.batch,
      fragment,
      proposal,
    });
    if (attached.kind !== "valid") {
      throw new Error("Expected a valid attached proposal");
    }

    const stale = await confirmSemanticRestorationProposal({
      batch: attached.batch,
      proposal: attached.proposal,
      currentPlainText: `${plainText} changed`,
      currentPlainRevisionId: "plain-r1",
      confirmedAt: CONFIRMED_AT,
    });

    expect(stale).toMatchObject({
      kind: "stale",
      reason: "source_plain_text_hash_mismatch",
      proposal: {
        status: "stale",
        staleReason: "source_plain_text_hash_mismatch",
      },
    });
  });

  it("supports consecutive restorations and emits one final current drift", async () => {
    const baselinePlainText = "Alpha beta.";
    const firstFragment = makeSemanticFragment({ id: "fragment-first" });
    const secondFragment = makeSemanticFragment({ id: "fragment-second" });
    const baselineDrift = makeSemanticDrift({
      fragmentIds: [firstFragment.id, secondFragment.id],
    });
    const started = createSemanticPlacementBatch({
      batchId: "batch-continuous",
      drift: baselineDrift,
      fragments: [firstFragment, secondFragment],
      createdAt: CREATED_AT,
    });
    let manuscript = makeManuscript({
      plainText: baselinePlainText,
      plainRevisionId: "plain-r1",
    });

    const firstDirection = selectSemanticFragmentPlacement({
      batch: started.batch,
      fragment: firstFragment,
      placement: "restored_to_plain_text",
      selectedAt: CONFIRMED_AT,
    });
    const firstProposal = await makeRestorationProposal({
      proposalId: "proposal-first",
      fragment: firstFragment,
      targetPlainRevisionId: "plain-r1",
      currentPlainText: baselinePlainText,
      offsetCodePoint: codePointLength("Alpha"),
      replacementText: " carefully",
    });
    const firstAttached = await attachSemanticRestorationProposal({
      batch: firstDirection.batch,
      fragment: firstFragment,
      proposal: firstProposal,
    });
    if (firstAttached.kind !== "valid") {
      throw new Error("Expected the first proposal to attach");
    }
    const firstConfirmed = await confirmSemanticRestorationProposal({
      batch: firstAttached.batch,
      proposal: firstAttached.proposal,
      currentPlainText: baselinePlainText,
      currentPlainRevisionId: "plain-r1",
      confirmedAt: CONFIRMED_AT,
    });
    if (firstConfirmed.kind !== "valid") {
      throw new Error("Expected the first proposal to confirm");
    }
    const firstApplied = await applyConfirmedSemanticRestoration({
      manuscript,
      batch: firstConfirmed.batch,
      fragment: firstFragment,
      proposal: firstConfirmed.proposal,
      nextPlainRevisionId: "plain-r2",
      appliedAt: APPLIED_AT,
    });
    if (firstApplied.kind !== "applied") {
      throw new Error("Expected the first proposal to apply");
    }
    manuscript = firstApplied.manuscript;

    const secondDirection = selectSemanticFragmentPlacement({
      batch: firstApplied.batch,
      fragment: secondFragment,
      placement: "restored_to_plain_text",
      selectedAt: "2026-08-06T12:03:00.000Z",
    });
    const secondOffset = codePointLength(manuscript.plainText ?? "") - 1;
    const secondProposal = await makeRestorationProposal({
      proposalId: "proposal-second",
      fragment: secondFragment,
      baselinePlainRevisionId: "plain-r1",
      targetPlainRevisionId: "plain-r2",
      currentPlainText: manuscript.plainText ?? "",
      offsetCodePoint: secondOffset,
      replacementText: " together",
    });
    const secondAttached = await attachSemanticRestorationProposal({
      batch: secondDirection.batch,
      fragment: secondFragment,
      proposal: secondProposal,
    });
    if (secondAttached.kind !== "valid") {
      throw new Error("Expected the second proposal to attach");
    }
    const secondConfirmed = await confirmSemanticRestorationProposal({
      batch: secondAttached.batch,
      proposal: secondAttached.proposal,
      currentPlainText: manuscript.plainText ?? "",
      currentPlainRevisionId: "plain-r2",
      confirmedAt: "2026-08-06T12:04:00.000Z",
    });
    if (secondConfirmed.kind !== "valid") {
      throw new Error("Expected the second proposal to confirm");
    }
    const secondApplied = await applyConfirmedSemanticRestoration({
      manuscript,
      batch: secondConfirmed.batch,
      fragment: secondFragment,
      proposal: secondConfirmed.proposal,
      nextPlainRevisionId: "plain-r3",
      appliedAt: "2026-08-06T12:05:00.000Z",
    });
    if (secondApplied.kind !== "applied") {
      throw new Error("Expected the second proposal to apply");
    }

    expect(secondApplied.manuscript.plainText).toBe(
      "Alpha carefully beta together.",
    );
    expect(secondApplied.manuscript.pendingDiff).toBeNull();
    expect(secondApplied.batch.status).toBe("in_progress");
    expect(secondApplied.batch.workingPlainRevisionId).toBe("plain-r3");
    expect(secondApplied.batch.decisions.map((decision) => decision.status)).toEqual([
      "applied",
      "applied",
    ]);

    const checking = beginPlacementConsistencyCheck(secondApplied.batch);
    const nextDrift = makeSemanticDrift({
      preciseRevisionId: "precise-r1",
      plainRevisionId: "plain-r3",
      fragmentIds: [firstFragment.id, secondFragment.id],
      status: "current",
    });
    const unexpectedFragment = {
      ...makeSemanticFragment({ id: "fragment-created-by-consistency-check" }),
      placement: "saved_as_margin_note" as const,
      resolvedAt: "2026-08-06T12:06:00.000Z",
    };
    expect(() =>
      completePlacementConsistencyCheck({
        batch: checking,
        previousDrift: started.drift,
        nextDrift,
        fragments: [
          firstApplied.fragment,
          secondApplied.fragment,
          unexpectedFragment,
        ],
        currentPreciseRevisionId: "precise-r1",
        currentPlainRevisionId: "plain-r3",
        completedAt: "2026-08-06T12:06:00.000Z",
      }),
    ).toThrowError();
    const completed = completePlacementConsistencyCheck({
      batch: checking,
      previousDrift: started.drift,
      nextDrift,
      fragments: [firstApplied.fragment, secondApplied.fragment],
      currentPreciseRevisionId: "precise-r1",
      currentPlainRevisionId: "plain-r3",
      completedAt: "2026-08-06T12:06:00.000Z",
    });

    expect(completed.batch).toMatchObject({
      status: "completed",
      workingPlainRevisionId: "plain-r3",
    });
    expect(completed.drift).toMatchObject({
      status: "current",
      preciseRevisionId: "precise-r1",
      plainRevisionId: "plain-r3",
      fragmentIds: [firstFragment.id, secondFragment.id],
    });
  });
});

import type { z } from "zod";

import {
  normalizeTextNfc,
  resolveStableTextAnchor,
  sha256NfcUtf8,
  sliceByCodePoint,
} from "../text/stable-text-anchor";
import {
  diffProposalResultSchema,
  diffStatusSchema,
  documentDiffSchema,
  documentTargetSchema,
  manuscriptRevisionIntentSchema,
  manuscriptStateSchema,
  revisionEntrySchema,
} from "../schemas/manuscript.schema";

export type DocumentTarget = z.infer<typeof documentTargetSchema>;
export type DiffStatus = z.infer<typeof diffStatusSchema>;
export type DocumentDiff = z.infer<typeof documentDiffSchema>;
export type DiffProposalResult = z.infer<typeof diffProposalResultSchema>;
export type RevisionEntry = z.infer<typeof revisionEntrySchema>;
export type ManuscriptRevisionIntent = z.infer<
  typeof manuscriptRevisionIntentSchema
>;
export type ManuscriptState = z.infer<typeof manuscriptStateSchema>;

export class DomainInvariantError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = "DomainInvariantError";
  }
}

export type ProcessDiffResult = {
  manuscript: ManuscriptState;
  processedDiff: DocumentDiff;
  revisionEntry: RevisionEntry | null;
};

export async function acceptPendingDiff(input: {
  manuscript: ManuscriptState;
  diffId: string;
  confirmedAt: string;
  nextRevisionId: string;
}): Promise<ProcessDiffResult> {
  const diff = requirePendingProposedDiff(input.manuscript, input.diffId);
  const target = resolveTextTarget(input.manuscript, diff);
  const anchor = await resolveStableTextAnchor({
    anchor: diff.targetAnchor,
    currentText: target.text,
    currentRevisionId: target.revisionId,
    allowDeterministicRebase: false,
  });
  if (anchor.kind === "stale") {
    throw new DomainInvariantError("stale_anchor", anchor.reason);
  }

  const processedDiff = documentDiffSchema.parse({
    ...diff,
    status: "accepted",
    confirmedAt: input.confirmedAt,
  });

  if (diff.operation === "annotate") {
    return {
      manuscript: {
        ...input.manuscript,
        diffAudit: [...input.manuscript.diffAudit, processedDiff],
        pendingDiff: null,
      },
      processedDiff,
      revisionEntry: null,
    };
  }

  if (diff.operation !== "insert") {
    const anchoredText = sliceByCodePoint(
      target.text,
      anchor.startCodePoint,
      anchor.endCodePoint,
    );
    if (
      normalizeTextNfc(anchoredText) !== normalizeTextNfc(diff.oldText) ||
      (await sha256NfcUtf8(diff.oldText)) !== diff.oldTextHash
    ) {
      throw new DomainInvariantError(
        "old_text_mismatch",
        "The Diff old text or hash no longer matches the target",
      );
    }
  }

  const replacement =
    diff.operation === "delete"
      ? ""
      : diff.operation === "insert" || diff.operation === "replace"
        ? normalizeTextNfc(diff.newText)
        : "";
  const points = Array.from(normalizeTextNfc(target.text));
  const nextText = [
    ...points.slice(0, anchor.startCodePoint),
    ...Array.from(replacement),
    ...points.slice(anchor.endCodePoint),
  ].join("");

  if (nextText === normalizeTextNfc(target.text)) {
    throw new DomainInvariantError(
      "no_change_diff",
      "A text Diff must not create an empty revision",
    );
  }

  const revisionEntry: RevisionEntry = revisionEntrySchema.parse({
    revisionId: input.nextRevisionId,
    parentRevisionId: target.revisionId,
    documentTarget: diff.documentTarget,
    beforeTextHash: await sha256NfcUtf8(target.text),
    afterTextHash: await sha256NfcUtf8(nextText),
    changeKind: "diff",
    sourceDiffId: diff.id,
    reason: diff.reason,
    createdAt: input.confirmedAt,
  });

  const manuscript = updateTextTarget(
    input.manuscript,
    diff.documentTarget,
    nextText,
    input.nextRevisionId,
  );
  return {
    manuscript: {
      ...manuscript,
      revisionHistory: [...manuscript.revisionHistory, revisionEntry],
      diffAudit: [...manuscript.diffAudit, processedDiff],
      pendingDiff: null,
    },
    processedDiff,
    revisionEntry,
  };
}

export function rejectPendingDiff(input: {
  manuscript: ManuscriptState;
  diffId: string;
  confirmedAt: string;
}): ProcessDiffResult {
  const diff = requirePendingProposedDiff(input.manuscript, input.diffId);
  const processedDiff = documentDiffSchema.parse({
    ...diff,
    status: "rejected",
    confirmedAt: input.confirmedAt,
  });
  return {
    manuscript: {
      ...input.manuscript,
      diffAudit: [...input.manuscript.diffAudit, processedDiff],
      pendingDiff: null,
    },
    processedDiff,
    revisionEntry: null,
  };
}

export async function submitManuscriptRevision(input: {
  manuscript: ManuscriptState;
  draftPreciseText: string;
  nextRevisionId: string;
  submittedAt: string;
  reason: string;
}): Promise<
  | { kind: "no_change"; manuscript: ManuscriptState }
  | { kind: "changed"; manuscript: ManuscriptState; revisionEntry: RevisionEntry }
> {
  const nextText = normalizeTextNfc(input.draftPreciseText);
  const currentText = normalizeTextNfc(input.manuscript.preciseText);
  if (nextText === currentText) {
    return {
      kind: "no_change",
      manuscript: { ...input.manuscript, revisionIntent: null },
    };
  }

  const revisionEntry = revisionEntrySchema.parse({
    revisionId: input.nextRevisionId,
    parentRevisionId: input.manuscript.preciseRevisionId,
    documentTarget: "precise_text",
    beforeTextHash: await sha256NfcUtf8(currentText),
    afterTextHash: await sha256NfcUtf8(nextText),
    changeKind: "manuscript_revision",
    sourceDiffId: null,
    reason: input.reason,
    createdAt: input.submittedAt,
  });

  return {
    kind: "changed",
    manuscript: {
      ...input.manuscript,
      preciseText: nextText,
      preciseRevisionId: input.nextRevisionId,
      plainText: null,
      plainRevisionId: null,
      revisionHistory: [...input.manuscript.revisionHistory, revisionEntry],
      pendingDiff: null,
      revisionIntent: null,
    },
    revisionEntry,
  };
}

function requirePendingProposedDiff(
  manuscript: ManuscriptState,
  diffId: string,
): DocumentDiff {
  const diff = manuscript.pendingDiff;
  if (!diff || diff.id !== diffId) {
    throw new DomainInvariantError("pending_diff_mismatch", "Diff is not pending");
  }
  if (diff.status !== "proposed") {
    throw new DomainInvariantError("diff_already_processed", "Diff was already processed");
  }
  return diff;
}

function resolveTextTarget(
  manuscript: ManuscriptState,
  diff: DocumentDiff,
): { text: string; revisionId: string } {
  const anchorTarget = diff.targetAnchor.textDocument;
  if (anchorTarget === "precise_text") {
    if (diff.baseRevisionId !== manuscript.preciseRevisionId) {
      throw new DomainInvariantError("base_revision_mismatch", "Precise revision mismatch");
    }
    return { text: manuscript.preciseText, revisionId: manuscript.preciseRevisionId };
  }
  if (
    manuscript.plainText === null ||
    manuscript.plainRevisionId === null ||
    diff.baseRevisionId !== manuscript.plainRevisionId
  ) {
    throw new DomainInvariantError("base_revision_mismatch", "Plain revision mismatch");
  }
  return { text: manuscript.plainText, revisionId: manuscript.plainRevisionId };
}

function updateTextTarget(
  manuscript: ManuscriptState,
  target: "precise_text" | "plain_text",
  text: string,
  revisionId: string,
): ManuscriptState {
  return target === "precise_text"
    ? { ...manuscript, preciseText: text, preciseRevisionId: revisionId }
    : { ...manuscript, plainText: text, plainRevisionId: revisionId };
}

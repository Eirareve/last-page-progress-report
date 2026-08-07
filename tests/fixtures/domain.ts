import {
  computeSemanticRestorationProposalHash,
  createStableTextPointAnchor,
  createStableTextRangeAnchor,
  documentDiffSchema,
  manuscriptStateSchema,
  normalizeTextNfc,
  semanticDriftSchema,
  semanticFragmentSchema,
  semanticRestorationProposalSchema,
  sha256NfcUtf8,
  sliceByCodePoint,
  type DocumentDiff,
  type ManuscriptState,
  type SemanticDrift,
  type SemanticFragment,
  type SemanticRestorationProposal,
} from "@/domain";

export const CREATED_AT = "2026-08-06T12:00:00.000Z";
export const CONFIRMED_AT = "2026-08-06T12:01:00.000Z";
export const APPLIED_AT = "2026-08-06T12:02:00.000Z";

export function makeManuscript(input?: {
  preciseText?: string;
  preciseRevisionId?: string;
  plainText?: string | null;
  plainRevisionId?: string | null;
  pendingDiff?: DocumentDiff | null;
}): ManuscriptState {
  const plainText = input?.plainText === undefined ? "Past and future matter." : input.plainText;
  const plainRevisionId =
    input?.plainRevisionId === undefined
      ? plainText === null
        ? null
        : "plain-r1"
      : input.plainRevisionId;

  return manuscriptStateSchema.parse({
    preciseText: input?.preciseText ?? "Past and future both matter.",
    preciseRevisionId: input?.preciseRevisionId ?? "precise-r1",
    plainText,
    plainRevisionId,
    revisionHistory: [],
    diffAudit: [],
    pendingDiff: input?.pendingDiff ?? null,
    revisionIntent: null,
  });
}

type TextDiffFixtureInput = {
  id?: string;
  documentTarget?: "precise_text" | "plain_text";
  text: string;
  revisionId: string;
  startCodePoint: number;
  endCodePoint: number;
  newText?: string;
};

export async function makeProposedInsertDiff(input: {
  id?: string;
  documentTarget?: "precise_text" | "plain_text";
  text: string;
  revisionId: string;
  offsetCodePoint: number;
  newText?: string;
}): Promise<DocumentDiff> {
  const documentTarget = input.documentTarget ?? "precise_text";
  const targetAnchor = await createStableTextPointAnchor({
    textDocument: documentTarget,
    baseRevisionId: input.revisionId,
    baselineText: input.text,
    offsetCodePoint: input.offsetCodePoint,
  });

  return documentDiffSchema.parse({
    id: input.id ?? "diff-insert",
    operation: "insert",
    baseRevisionId: input.revisionId,
    documentTarget,
    targetAnchor,
    newText: input.newText ?? " carefully",
    reason: "Preserve a qualification",
    evidenceIds: [],
    principleIds: [],
    status: "proposed",
    createdAt: CREATED_AT,
    confirmedAt: null,
  });
}

export async function makeProposedReplaceDiff(
  input: TextDiffFixtureInput,
): Promise<DocumentDiff> {
  const documentTarget = input.documentTarget ?? "precise_text";
  const oldText = sliceByCodePoint(
    input.text,
    input.startCodePoint,
    input.endCodePoint,
  );
  const targetAnchor = await createStableTextRangeAnchor({
    textDocument: documentTarget,
    baseRevisionId: input.revisionId,
    baselineText: input.text,
    startCodePoint: input.startCodePoint,
    endCodePoint: input.endCodePoint,
  });

  return documentDiffSchema.parse({
    id: input.id ?? "diff-replace",
    operation: "replace",
    baseRevisionId: input.revisionId,
    documentTarget,
    targetAnchor,
    oldText,
    oldTextHash: await sha256NfcUtf8(oldText),
    newText: input.newText ?? "present",
    reason: "Test a local replacement",
    evidenceIds: [],
    principleIds: [],
    status: "proposed",
    createdAt: CREATED_AT,
    confirmedAt: null,
  });
}

export async function makeProposedDeleteDiff(
  input: Omit<TextDiffFixtureInput, "newText">,
): Promise<DocumentDiff> {
  const documentTarget = input.documentTarget ?? "precise_text";
  const oldText = sliceByCodePoint(
    input.text,
    input.startCodePoint,
    input.endCodePoint,
  );
  const targetAnchor = await createStableTextRangeAnchor({
    textDocument: documentTarget,
    baseRevisionId: input.revisionId,
    baselineText: input.text,
    startCodePoint: input.startCodePoint,
    endCodePoint: input.endCodePoint,
  });

  return documentDiffSchema.parse({
    id: input.id ?? "diff-delete",
    operation: "delete",
    baseRevisionId: input.revisionId,
    documentTarget,
    targetAnchor,
    oldText,
    oldTextHash: await sha256NfcUtf8(oldText),
    reason: "Test a local deletion",
    evidenceIds: [],
    principleIds: [],
    status: "proposed",
    createdAt: CREATED_AT,
    confirmedAt: null,
  });
}

export async function makeProposedAnnotationDiff(input: {
  id?: string;
  documentTarget?: "precise_text" | "plain_text" | "margin_note";
  anchorDocument?: "precise_text" | "plain_text";
  text: string;
  revisionId: string;
  offsetCodePoint?: number;
}): Promise<DocumentDiff> {
  const documentTarget = input.documentTarget ?? "margin_note";
  const anchorDocument = input.anchorDocument ?? "precise_text";
  const targetAnchor = await createStableTextPointAnchor({
    textDocument: anchorDocument,
    baseRevisionId: input.revisionId,
    baselineText: input.text,
    offsetCodePoint: input.offsetCodePoint ?? 0,
  });

  return documentDiffSchema.parse({
    id: input.id ?? "diff-annotate",
    operation: "annotate",
    baseRevisionId: input.revisionId,
    documentTarget,
    targetAnchor,
    annotationText: "Keep this disagreement visible.",
    reason: "Preserve dissent without rewriting the manuscript",
    evidenceIds: [],
    principleIds: [],
    status: "proposed",
    createdAt: CREATED_AT,
    confirmedAt: null,
  });
}

export function makeSemanticDrift(input?: {
  preciseRevisionId?: string;
  plainRevisionId?: string;
  fragmentIds?: string[];
  status?: "current" | "stale" | "placement_in_progress";
}): SemanticDrift {
  return semanticDriftSchema.parse({
    preciseRevisionId: input?.preciseRevisionId ?? "precise-r1",
    plainRevisionId: input?.plainRevisionId ?? "plain-r1",
    analysisVersion: "semantic-analysis-0.1.0",
    status: input?.status ?? "current",
    preserved: ["future remains relevant"],
    lost: ["important reference"],
    ambiguities: [],
    consequences: ["a qualification may disappear"],
    fragmentIds: input?.fragmentIds ?? ["fragment-1"],
  });
}

export function makeSemanticFragment(input?: {
  id?: string;
  phrase?: string;
  preciseRevisionId?: string;
  plainRevisionId?: string;
}): SemanticFragment {
  return semanticFragmentSchema.parse({
    id: input?.id ?? "fragment-1",
    phrase: input?.phrase ?? "important reference",
    reason: "The simpler wording omits a qualification.",
    consequence: "The future reader may treat the text as absolute.",
    sourcePreciseRevisionId: input?.preciseRevisionId ?? "precise-r1",
    sourcePlainRevisionId: input?.plainRevisionId ?? "plain-r1",
    placement: null,
    resolvedAt: null,
    restorationProposalId: null,
  });
}

export async function makeRestorationProposal(input: {
  proposalId?: string;
  fragment: SemanticFragment;
  baselinePreciseRevisionId?: string;
  baselinePlainRevisionId?: string;
  targetPlainRevisionId: string;
  currentPlainText: string;
  offsetCodePoint: number;
  replacementText: string;
}): Promise<SemanticRestorationProposal> {
  const currentPlainText = normalizeTextNfc(input.currentPlainText);
  const replacementText = normalizeTextNfc(input.replacementText);
  const points = Array.from(currentPlainText);
  const afterPreview = [
    ...points.slice(0, input.offsetCodePoint),
    ...Array.from(replacementText),
    ...points.slice(input.offsetCodePoint),
  ].join("");
  const targetAnchor = await createStableTextPointAnchor({
    textDocument: "plain_text",
    baseRevisionId: input.targetPlainRevisionId,
    baselineText: currentPlainText,
    offsetCodePoint: input.offsetCodePoint,
  });
  const hashInput = {
    proposalVersion: "0.1.0" as const,
    fragmentId: input.fragment.id,
    baselinePreciseRevisionId:
      input.baselinePreciseRevisionId ?? input.fragment.sourcePreciseRevisionId,
    baselinePlainRevisionId:
      input.baselinePlainRevisionId ?? input.fragment.sourcePlainRevisionId,
    targetPlainRevisionId: input.targetPlainRevisionId,
    sourcePlainTextHash: await sha256NfcUtf8(currentPlainText),
    targetAnchor,
    replacementText,
    beforePreview: currentPlainText,
    afterPreview,
  };

  return semanticRestorationProposalSchema.parse({
    proposalId: input.proposalId ?? `proposal-${input.fragment.id}`,
    ...hashInput,
    proposalHash: await computeSemanticRestorationProposalHash(hashInput),
    status: "proposed",
    createdAt: CREATED_AT,
    confirmedAt: null,
    appliedAt: null,
    staleReason: null,
  });
}

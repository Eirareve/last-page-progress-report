import type { z } from "zod";

import { DomainInvariantError, type ManuscriptState, type RevisionEntry } from "./manuscript";
import {
  bouquetEntrySchema,
  semanticDriftSchema,
  semanticDriftStatusSchema,
  semanticFragmentPlacementSchema,
  semanticFragmentSchema,
  semanticPlacementBatchSchema,
  semanticPlacementBatchStatusSchema,
  semanticPlacementDecisionSchema,
  semanticRestorationProposalSchema,
  semanticRestorationProposalStatusSchema,
} from "../schemas/semantic.schema";
import { revisionEntrySchema } from "../schemas/manuscript.schema";
import {
  normalizeTextNfc,
  resolveStableTextAnchor,
  sha256NfcUtf8,
} from "../text/stable-text-anchor";

export type SemanticDriftStatus = z.infer<typeof semanticDriftStatusSchema>;
export type SemanticDrift = z.infer<typeof semanticDriftSchema>;
export type SemanticFragmentPlacement = z.infer<
  typeof semanticFragmentPlacementSchema
>;
export type SemanticFragment = z.infer<typeof semanticFragmentSchema>;
export type SemanticRestorationProposalStatus = z.infer<
  typeof semanticRestorationProposalStatusSchema
>;
export type SemanticRestorationProposal = z.infer<
  typeof semanticRestorationProposalSchema
>;
export type SemanticPlacementDecision = z.infer<
  typeof semanticPlacementDecisionSchema
>;
export type SemanticPlacementBatchStatus = z.infer<
  typeof semanticPlacementBatchStatusSchema
>;
export type SemanticPlacementBatch = z.infer<
  typeof semanticPlacementBatchSchema
>;
export type BouquetEntry = z.infer<typeof bouquetEntrySchema>;

export type PlacementSelectionResult = {
  batch: SemanticPlacementBatch;
  fragment: SemanticFragment;
  bouquetEntry: BouquetEntry | null;
};

export type RestorationValidationResult =
  | {
      kind: "valid";
      batch: SemanticPlacementBatch;
      proposal: SemanticRestorationProposal;
    }
  | {
      kind: "stale";
      batch: SemanticPlacementBatch;
      proposal: SemanticRestorationProposal;
      reason: string;
    };

export type RestorationApplicationResult =
  | {
      kind: "applied";
      manuscript: ManuscriptState;
      batch: SemanticPlacementBatch;
      fragment: SemanticFragment;
      proposal: SemanticRestorationProposal;
      revisionEntry: RevisionEntry;
    }
  | {
      kind: "stale";
      manuscript: ManuscriptState;
      batch: SemanticPlacementBatch;
      fragment: SemanticFragment;
      proposal: SemanticRestorationProposal;
      reason: string;
    };

export function createSemanticPlacementBatch(input: {
  batchId: string;
  drift: SemanticDrift;
  fragments: readonly SemanticFragment[];
  createdAt: string;
}): { batch: SemanticPlacementBatch; drift: SemanticDrift } {
  if (input.drift.status !== "current") {
    throw new DomainInvariantError(
      "semantic_drift_not_current",
      "Only a current semantic drift can start a placement batch",
    );
  }
  const fragmentIds = uniqueIds(input.fragments.map((fragment) => fragment.id));
  if (fragmentIds.length !== input.fragments.length) {
    throw new DomainInvariantError(
      "duplicate_semantic_fragment",
      "Semantic fragment IDs must be unique",
    );
  }
  for (const fragment of input.fragments) {
    if (
      fragment.sourcePreciseRevisionId !== input.drift.preciseRevisionId ||
      fragment.sourcePlainRevisionId !== input.drift.plainRevisionId
    ) {
      throw new DomainInvariantError(
        "semantic_fragment_revision_mismatch",
        "Every fragment must be bound to the drift revisions",
      );
    }
    if (fragment.placement !== null) {
      throw new DomainInvariantError(
        "semantic_fragment_already_placed",
        "A new placement batch only accepts unresolved fragments",
      );
    }
  }

  return {
    batch: semanticPlacementBatchSchema.parse({
      batchId: input.batchId,
      baselinePreciseRevisionId: input.drift.preciseRevisionId,
      baselinePlainRevisionId: input.drift.plainRevisionId,
      workingPlainRevisionId: input.drift.plainRevisionId,
      fragmentIds,
      decisions: [],
      confirmedRestorationProposalIds: [],
      status: "in_progress",
      createdAt: input.createdAt,
      completedAt: null,
      invalidatedReason: null,
    }),
    drift: semanticDriftSchema.parse({
      ...input.drift,
      status: "placement_in_progress",
    }),
  };
}

export function selectSemanticFragmentPlacement(input: {
  batch: SemanticPlacementBatch;
  fragment: SemanticFragment;
  placement: SemanticFragmentPlacement;
  selectedAt: string;
  bouquetEntryId?: string;
}): PlacementSelectionResult {
  requireInProgressBatchForFragment(input.batch, input.fragment);
  const previousDecision = input.batch.decisions.find(
    (decision) => decision.fragmentId === input.fragment.id,
  );
  if (previousDecision) {
    if (
      previousDecision.placement === input.placement &&
      ((input.placement === "restored_to_plain_text" &&
        previousDecision.status === "direction_selected") ||
        (input.placement !== "restored_to_plain_text" &&
          previousDecision.status === "confirmed"))
    ) {
      return { batch: input.batch, fragment: input.fragment, bouquetEntry: null };
    }
    throw new DomainInvariantError(
      "semantic_placement_already_selected",
      "A fragment already has a placement decision in this batch",
    );
  }

  if (input.placement === "restored_to_plain_text") {
    const decision: SemanticPlacementDecision = semanticPlacementDecisionSchema.parse({
      fragmentId: input.fragment.id,
      placement: input.placement,
      status: "direction_selected",
      restorationProposalId: null,
      confirmedAt: null,
      appliedPlainRevisionId: null,
    });
    return {
      batch: semanticPlacementBatchSchema.parse({
        ...input.batch,
        decisions: [...input.batch.decisions, decision],
      }),
      fragment: input.fragment,
      bouquetEntry: null,
    };
  }

  const fragment = semanticFragmentSchema.parse({
    ...input.fragment,
    placement: input.placement,
    resolvedAt: input.selectedAt,
    restorationProposalId: null,
  });
  const decision: SemanticPlacementDecision = semanticPlacementDecisionSchema.parse({
    fragmentId: fragment.id,
    placement: input.placement,
    status: "confirmed",
    restorationProposalId: null,
    confirmedAt: input.selectedAt,
    appliedPlainRevisionId: null,
  });
  const bouquetEntry =
    input.placement === "placed_in_bouquet"
      ? bouquetEntrySchema.parse({
          id: requireNonEmpty(input.bouquetEntryId, "bouquet_entry_id_required"),
          fragmentId: fragment.id,
          phrase: fragment.phrase,
          reason: fragment.reason,
          consequence: fragment.consequence,
          sourcePreciseRevisionId: fragment.sourcePreciseRevisionId,
          sourcePlainRevisionId: fragment.sourcePlainRevisionId,
          placedAt: input.selectedAt,
        })
      : null;

  return {
    batch: semanticPlacementBatchSchema.parse({
      ...input.batch,
      decisions: [...input.batch.decisions, decision],
    }),
    fragment,
    bouquetEntry,
  };
}

export async function computeSemanticRestorationProposalHash(
  proposal: Pick<
    SemanticRestorationProposal,
    | "proposalVersion"
    | "fragmentId"
    | "baselinePreciseRevisionId"
    | "baselinePlainRevisionId"
    | "targetPlainRevisionId"
    | "sourcePlainTextHash"
    | "targetAnchor"
    | "replacementText"
    | "beforePreview"
    | "afterPreview"
  >,
): Promise<`sha256:${string}`> {
  const payload = {
    proposalVersion: proposal.proposalVersion,
    fragmentId: proposal.fragmentId,
    baselinePreciseRevisionId: proposal.baselinePreciseRevisionId,
    baselinePlainRevisionId: proposal.baselinePlainRevisionId,
    targetPlainRevisionId: proposal.targetPlainRevisionId,
    sourcePlainTextHash: proposal.sourcePlainTextHash,
    targetAnchor: proposal.targetAnchor,
    replacementText: normalizeTextNfc(proposal.replacementText),
    beforePreview: normalizeTextNfc(proposal.beforePreview),
    afterPreview: normalizeTextNfc(proposal.afterPreview),
  };
  return sha256NfcUtf8(canonicalizeJson(payload));
}

export async function attachSemanticRestorationProposal(input: {
  batch: SemanticPlacementBatch;
  fragment: SemanticFragment;
  proposal: SemanticRestorationProposal;
}): Promise<RestorationValidationResult> {
  requireInProgressBatchForFragment(input.batch, input.fragment);
  const decisionIndex = input.batch.decisions.findIndex(
    (decision) => decision.fragmentId === input.fragment.id,
  );
  const decision = input.batch.decisions[decisionIndex];
  if (
    !decision ||
    decision.placement !== "restored_to_plain_text" ||
    decision.status !== "direction_selected"
  ) {
    throw new DomainInvariantError(
      "restoration_direction_not_selected",
      "The restoration direction must be selected before attaching a proposal",
    );
  }
  if (
    input.proposal.fragmentId !== input.fragment.id ||
    input.proposal.baselinePreciseRevisionId !==
      input.batch.baselinePreciseRevisionId ||
    input.proposal.baselinePlainRevisionId !== input.batch.baselinePlainRevisionId ||
    input.proposal.targetPlainRevisionId !== input.batch.workingPlainRevisionId
  ) {
    return staleRestorationResult(input.batch, input.proposal, "proposal_binding_mismatch");
  }
  if (
    (await computeSemanticRestorationProposalHash(input.proposal)) !==
    input.proposal.proposalHash
  ) {
    return staleRestorationResult(input.batch, input.proposal, "proposal_hash_mismatch");
  }

  const nextDecision: SemanticPlacementDecision = semanticPlacementDecisionSchema.parse({
    ...decision,
    status: "proposal_pending",
    restorationProposalId: input.proposal.proposalId,
  });
  return {
    kind: "valid",
    batch: replaceDecision(input.batch, decisionIndex, nextDecision),
    proposal: input.proposal,
  };
}

export async function confirmSemanticRestorationProposal(input: {
  batch: SemanticPlacementBatch;
  proposal: SemanticRestorationProposal;
  currentPlainText: string;
  currentPlainRevisionId: string;
  confirmedAt: string;
}): Promise<RestorationValidationResult> {
  const decisionIndex = input.batch.decisions.findIndex(
    (decision) =>
      decision.restorationProposalId === input.proposal.proposalId &&
      decision.fragmentId === input.proposal.fragmentId,
  );
  const decision = input.batch.decisions[decisionIndex];
  if (
    input.batch.status !== "in_progress" ||
    !decision ||
    decision.status !== "proposal_pending" ||
    input.proposal.status !== "proposed"
  ) {
    throw new DomainInvariantError(
      "restoration_proposal_not_pending",
      "Only the currently pending frozen proposal can be confirmed",
    );
  }

  const staleReason = await restorationProposalMismatchReason({
    batch: input.batch,
    proposal: input.proposal,
    currentPlainText: input.currentPlainText,
    currentPlainRevisionId: input.currentPlainRevisionId,
  });
  if (staleReason) {
    return staleRestorationResult(input.batch, input.proposal, staleReason);
  }

  const proposal = semanticRestorationProposalSchema.parse({
    ...input.proposal,
    status: "confirmed",
    confirmedAt: input.confirmedAt,
  });
  const nextDecision: SemanticPlacementDecision = semanticPlacementDecisionSchema.parse({
    ...decision,
    status: "proposal_confirmed",
    confirmedAt: input.confirmedAt,
  });
  return {
    kind: "valid",
    batch: semanticPlacementBatchSchema.parse({
      ...replaceDecision(input.batch, decisionIndex, nextDecision),
      confirmedRestorationProposalIds: uniqueIds([
        ...input.batch.confirmedRestorationProposalIds,
        proposal.proposalId,
      ]),
    }),
    proposal,
  };
}

export async function applyConfirmedSemanticRestoration(input: {
  manuscript: ManuscriptState;
  batch: SemanticPlacementBatch;
  fragment: SemanticFragment;
  proposal: SemanticRestorationProposal;
  nextPlainRevisionId: string;
  appliedAt: string;
}): Promise<RestorationApplicationResult> {
  requireInProgressBatchForFragment(input.batch, input.fragment);
  if (
    input.manuscript.plainText === null ||
    input.manuscript.plainRevisionId === null
  ) {
    throw new DomainInvariantError(
      "plain_revision_missing",
      "Semantic restoration requires a working plain revision",
    );
  }
  if (input.manuscript.pendingDiff !== null) {
    throw new DomainInvariantError(
      "pending_diff_during_restoration",
      "Semantic restoration never creates or coexists with a second pending Diff",
    );
  }
  const decisionIndex = input.batch.decisions.findIndex(
    (decision) =>
      decision.fragmentId === input.fragment.id &&
      decision.restorationProposalId === input.proposal.proposalId,
  );
  const decision = input.batch.decisions[decisionIndex];
  if (
    !decision ||
    decision.status !== "proposal_confirmed" ||
    input.proposal.status !== "confirmed"
  ) {
    throw new DomainInvariantError(
      "restoration_proposal_not_confirmed",
      "A concrete current proposal must be confirmed before application",
    );
  }

  const staleReason = await restorationProposalMismatchReason({
    batch: input.batch,
    proposal: input.proposal,
    currentPlainText: input.manuscript.plainText,
    currentPlainRevisionId: input.manuscript.plainRevisionId,
  });
  const resolution = staleReason
    ? null
    : await resolveStableTextAnchor({
        anchor: input.proposal.targetAnchor,
        currentText: input.manuscript.plainText,
        currentRevisionId: input.manuscript.plainRevisionId,
        allowDeterministicRebase: true,
      });
  const effectiveStaleReason =
    staleReason ??
    (resolution?.kind === "stale" ? `anchor_${resolution.reason}` : null);
  if (effectiveStaleReason || !resolution || resolution.kind === "stale") {
    const stale = staleRestorationResult(
      input.batch,
      input.proposal,
      effectiveStaleReason ?? "anchor_stale",
    );
    return {
      kind: "stale",
      manuscript: input.manuscript,
      batch: stale.batch,
      fragment: input.fragment,
      proposal: stale.proposal,
      reason: stale.reason,
    };
  }

  const points = Array.from(normalizeTextNfc(input.manuscript.plainText));
  const nextPlainText = [
    ...points.slice(0, resolution.startCodePoint),
    ...Array.from(normalizeTextNfc(input.proposal.replacementText)),
    ...points.slice(resolution.endCodePoint),
  ].join("");
  if (
    normalizeTextNfc(input.proposal.beforePreview) !==
      normalizeTextNfc(input.manuscript.plainText) ||
    normalizeTextNfc(input.proposal.afterPreview) !== nextPlainText
  ) {
    const stale = staleRestorationResult(
      input.batch,
      input.proposal,
      "proposal_preview_mismatch",
    );
    return {
      kind: "stale",
      manuscript: input.manuscript,
      batch: stale.batch,
      fragment: input.fragment,
      proposal: stale.proposal,
      reason: stale.reason,
    };
  }
  if (nextPlainText === normalizeTextNfc(input.manuscript.plainText)) {
    throw new DomainInvariantError(
      "semantic_restoration_no_change",
      "A restoration cannot create an empty revision",
    );
  }

  const revisionEntry = revisionEntrySchema.parse({
    revisionId: input.nextPlainRevisionId,
    parentRevisionId: input.manuscript.plainRevisionId,
    documentTarget: "plain_text",
    beforeTextHash: await sha256NfcUtf8(input.manuscript.plainText),
    afterTextHash: await sha256NfcUtf8(nextPlainText),
    changeKind: "semantic_restoration",
    sourceDiffId: null,
    reason: `Confirmed semantic restoration for fragment ${input.fragment.id}`,
    createdAt: input.appliedAt,
  });
  const manuscript: ManuscriptState = {
    ...input.manuscript,
    plainText: nextPlainText,
    plainRevisionId: input.nextPlainRevisionId,
    revisionHistory: [...input.manuscript.revisionHistory, revisionEntry],
  };
  const proposal = semanticRestorationProposalSchema.parse({
    ...input.proposal,
    status: "applied",
    appliedAt: input.appliedAt,
  });
  const nextDecision: SemanticPlacementDecision = semanticPlacementDecisionSchema.parse({
    ...decision,
    status: "applied",
    appliedPlainRevisionId: input.nextPlainRevisionId,
  });
  const batch = semanticPlacementBatchSchema.parse({
    ...replaceDecision(input.batch, decisionIndex, nextDecision),
    workingPlainRevisionId: input.nextPlainRevisionId,
  });
  const fragment = semanticFragmentSchema.parse({
    ...input.fragment,
    placement: "restored_to_plain_text",
    resolvedAt: input.appliedAt,
    restorationProposalId: input.proposal.proposalId,
  });

  return {
    kind: "applied",
    manuscript,
    batch,
    fragment,
    proposal,
    revisionEntry,
  };
}

export function beginPlacementConsistencyCheck(
  batch: SemanticPlacementBatch,
): SemanticPlacementBatch {
  if (batch.status !== "in_progress") {
    throw new DomainInvariantError(
      "placement_batch_not_in_progress",
      "Only an in-progress batch can begin consistency checking",
    );
  }
  const completedFragmentIds = new Set(
    batch.decisions
      .filter((decision) => decision.status === "confirmed" || decision.status === "applied")
      .map((decision) => decision.fragmentId),
  );
  if (batch.fragmentIds.some((fragmentId) => !completedFragmentIds.has(fragmentId))) {
    throw new DomainInvariantError(
      "semantic_fragments_unresolved",
      "Every fragment must be directly confirmed or restored before consistency checking",
    );
  }
  return semanticPlacementBatchSchema.parse({
    ...batch,
    status: "checking_consistency",
  });
}

export function completePlacementConsistencyCheck(input: {
  batch: SemanticPlacementBatch;
  previousDrift: SemanticDrift;
  nextDrift: SemanticDrift;
  fragments: readonly SemanticFragment[];
  currentPreciseRevisionId: string;
  currentPlainRevisionId: string;
  completedAt: string;
}): { batch: SemanticPlacementBatch; drift: SemanticDrift } {
  if (input.batch.status !== "checking_consistency") {
    throw new DomainInvariantError(
      "placement_consistency_not_running",
      "The batch must be checking consistency before completion",
    );
  }
  const expectedIds = [...input.batch.fragmentIds].sort();
  const actualIds = uniqueIds(input.fragments.map((fragment) => fragment.id)).sort();
  if (JSON.stringify(expectedIds) !== JSON.stringify(actualIds)) {
    throw new DomainInvariantError(
      "consistency_check_created_fragments",
      "The bounded consistency check cannot add or remove semantic fragments",
    );
  }
  if (input.fragments.some((fragment) => fragment.placement === null)) {
    throw new DomainInvariantError(
      "semantic_fragments_unresolved",
      "All semantic fragments must be resolved",
    );
  }
  if (
    input.previousDrift.preciseRevisionId !==
      input.batch.baselinePreciseRevisionId ||
    input.previousDrift.plainRevisionId !== input.batch.baselinePlainRevisionId ||
    input.nextDrift.status !== "current" ||
    input.nextDrift.preciseRevisionId !== input.currentPreciseRevisionId ||
    input.nextDrift.plainRevisionId !== input.currentPlainRevisionId ||
    input.batch.baselinePreciseRevisionId !== input.currentPreciseRevisionId ||
    input.batch.workingPlainRevisionId !== input.currentPlainRevisionId
  ) {
    throw new DomainInvariantError(
      "semantic_consistency_revision_mismatch",
      "The final current drift must bind the batch's final revision pair",
    );
  }
  return {
    batch: semanticPlacementBatchSchema.parse({
      ...input.batch,
      status: "completed",
      completedAt: input.completedAt,
    }),
    drift: semanticDriftSchema.parse(input.nextDrift),
  };
}

export function markSemanticDriftStale(drift: SemanticDrift): SemanticDrift {
  return drift.status === "stale"
    ? drift
    : semanticDriftSchema.parse({ ...drift, status: "stale" });
}

async function restorationProposalMismatchReason(input: {
  batch: SemanticPlacementBatch;
  proposal: SemanticRestorationProposal;
  currentPlainText: string;
  currentPlainRevisionId: string;
}): Promise<string | null> {
  if (
    input.proposal.baselinePreciseRevisionId !==
      input.batch.baselinePreciseRevisionId ||
    input.proposal.baselinePlainRevisionId !== input.batch.baselinePlainRevisionId ||
    input.currentPlainRevisionId !== input.batch.workingPlainRevisionId
  ) {
    return "proposal_binding_mismatch";
  }
  if (
    (await computeSemanticRestorationProposalHash(input.proposal)) !==
    input.proposal.proposalHash
  ) {
    return "proposal_hash_mismatch";
  }
  if ((await sha256NfcUtf8(input.currentPlainText)) !== input.proposal.sourcePlainTextHash) {
    return "source_plain_text_hash_mismatch";
  }
  const resolution = await resolveStableTextAnchor({
    anchor: input.proposal.targetAnchor,
    currentText: input.currentPlainText,
    currentRevisionId: input.currentPlainRevisionId,
    allowDeterministicRebase: true,
  });
  if (resolution.kind === "stale") {
    return `anchor_${resolution.reason}`;
  }
  const points = Array.from(normalizeTextNfc(input.currentPlainText));
  const nextPlainText = [
    ...points.slice(0, resolution.startCodePoint),
    ...Array.from(normalizeTextNfc(input.proposal.replacementText)),
    ...points.slice(resolution.endCodePoint),
  ].join("");
  if (
    normalizeTextNfc(input.proposal.beforePreview) !==
      normalizeTextNfc(input.currentPlainText) ||
    normalizeTextNfc(input.proposal.afterPreview) !== nextPlainText
  ) {
    return "proposal_preview_mismatch";
  }
  return null;
}

function staleRestorationResult(
  batch: SemanticPlacementBatch,
  proposal: SemanticRestorationProposal,
  reason: string,
): Extract<RestorationValidationResult, { kind: "stale" }> {
  const proposalValue = semanticRestorationProposalSchema.parse({
    ...proposal,
    status: "stale",
    appliedAt: null,
    staleReason: reason,
  });
  const decisionIndex = batch.decisions.findIndex(
    (decision) => decision.fragmentId === proposal.fragmentId,
  );
  const decisions = [...batch.decisions];
  if (decisionIndex >= 0) {
    decisions[decisionIndex] = semanticPlacementDecisionSchema.parse({
      fragmentId: proposal.fragmentId,
      placement: "restored_to_plain_text",
      status: "direction_selected",
      restorationProposalId: null,
      confirmedAt: null,
      appliedPlainRevisionId: null,
    });
  }
  return {
    kind: "stale",
    batch: semanticPlacementBatchSchema.parse({
      ...batch,
      decisions,
      confirmedRestorationProposalIds:
        batch.confirmedRestorationProposalIds.filter(
          (proposalId) => proposalId !== proposal.proposalId,
        ),
    }),
    proposal: proposalValue,
    reason,
  };
}

function requireInProgressBatchForFragment(
  batch: SemanticPlacementBatch,
  fragment: SemanticFragment,
): void {
  if (batch.status !== "in_progress") {
    throw new DomainInvariantError(
      "placement_batch_not_in_progress",
      "Placement decisions require an in-progress batch",
    );
  }
  if (!batch.fragmentIds.includes(fragment.id)) {
    throw new DomainInvariantError(
      "fragment_not_in_batch",
      "The semantic fragment does not belong to this batch",
    );
  }
  if (
    fragment.sourcePreciseRevisionId !== batch.baselinePreciseRevisionId ||
    fragment.sourcePlainRevisionId !== batch.baselinePlainRevisionId
  ) {
    throw new DomainInvariantError(
      "semantic_fragment_revision_mismatch",
      "The fragment does not match the batch baseline revisions",
    );
  }
}

function replaceDecision(
  batch: SemanticPlacementBatch,
  decisionIndex: number,
  decision: SemanticPlacementDecision,
): SemanticPlacementBatch {
  const decisions = [...batch.decisions];
  decisions[decisionIndex] = decision;
  return semanticPlacementBatchSchema.parse({ ...batch, decisions });
}

function uniqueIds(values: readonly string[]): string[] {
  return [...new Set(values)];
}

function requireNonEmpty(value: string | undefined, code: string): string {
  if (!value) {
    throw new DomainInvariantError(code, "A non-empty identifier is required");
  }
  return value;
}

function canonicalizeJson(value: unknown): string {
  if (value === null || typeof value === "boolean" || typeof value === "string") {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new TypeError("Canonical JSON does not permit non-finite numbers");
    }
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalizeJson).join(",")}]`;
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalizeJson(record[key])}`)
      .join(",")}}`;
  }
  throw new TypeError("Canonical JSON only accepts JSON values");
}

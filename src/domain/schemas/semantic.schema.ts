import { z } from "zod";

import { sha256DigestSchema, stableTextAnchorSchema } from "../text/stable-text-anchor.schema";
import { SEMANTIC_RESTORATION_PROPOSAL_VERSION } from "../versions";

export const semanticDriftStatusSchema = z.enum([
  "current",
  "stale",
  "placement_in_progress",
]);

export const semanticDriftSchema = z.strictObject({
  preciseRevisionId: z.string().min(1),
  plainRevisionId: z.string().min(1),
  analysisVersion: z.string().min(1),
  status: semanticDriftStatusSchema,
  preserved: z.array(z.string().min(1)),
  lost: z.array(z.string().min(1)),
  ambiguities: z.array(z.string().min(1)),
  consequences: z.array(z.string().min(1)),
  fragmentIds: z.array(z.string().min(1)),
});

export const semanticFragmentPlacementSchema = z.enum([
  "restored_to_plain_text",
  "saved_as_margin_note",
  "placed_in_bouquet",
]);

export const semanticFragmentSchema = z
  .strictObject({
    id: z.string().min(1),
    phrase: z.string().min(1),
    reason: z.string().min(1),
    consequence: z.string().min(1),
    sourcePreciseRevisionId: z.string().min(1),
    sourcePlainRevisionId: z.string().min(1),
    placement: semanticFragmentPlacementSchema.nullable(),
    resolvedAt: z.iso.datetime().nullable(),
    restorationProposalId: z.string().min(1).nullable(),
  })
  .superRefine((fragment, context) => {
    if (fragment.placement === null) {
      if (fragment.resolvedAt !== null || fragment.restorationProposalId !== null) {
        context.addIssue({
          code: "custom",
          message: "An unresolved fragment cannot have resolution metadata",
          path: ["placement"],
        });
      }
      return;
    }

    if (fragment.resolvedAt === null) {
      context.addIssue({
        code: "custom",
        message: "A placed fragment requires resolvedAt",
        path: ["resolvedAt"],
      });
    }

    if (
      fragment.placement === "restored_to_plain_text" &&
      fragment.restorationProposalId === null
    ) {
      context.addIssue({
        code: "custom",
        message: "A restored fragment requires its confirmed proposal",
        path: ["restorationProposalId"],
      });
    }
    if (
      fragment.placement !== "restored_to_plain_text" &&
      fragment.restorationProposalId !== null
    ) {
      context.addIssue({
        code: "custom",
        message: "Only restored fragments may reference a restoration proposal",
        path: ["restorationProposalId"],
      });
    }
  });

export const semanticRestorationProposalStatusSchema = z.enum([
  "proposed",
  "confirmed",
  "applied",
  "stale",
]);

export const semanticRestorationProposalSchema = z
  .strictObject({
    proposalId: z.string().min(1),
    proposalVersion: z.literal(SEMANTIC_RESTORATION_PROPOSAL_VERSION),
    fragmentId: z.string().min(1),
    baselinePreciseRevisionId: z.string().min(1),
    baselinePlainRevisionId: z.string().min(1),
    targetPlainRevisionId: z.string().min(1),
    sourcePlainTextHash: sha256DigestSchema,
    targetAnchor: stableTextAnchorSchema,
    replacementText: z.string().min(1),
    beforePreview: z.string(),
    afterPreview: z.string(),
    proposalHash: sha256DigestSchema,
    status: semanticRestorationProposalStatusSchema,
    createdAt: z.iso.datetime(),
    confirmedAt: z.iso.datetime().nullable(),
    appliedAt: z.iso.datetime().nullable(),
    staleReason: z.string().min(1).nullable(),
  })
  .superRefine((proposal, context) => {
    if (proposal.targetAnchor.textDocument !== "plain_text") {
      context.addIssue({
        code: "custom",
        message: "Semantic restoration anchors only plain text",
        path: ["targetAnchor", "textDocument"],
      });
    }
    if (proposal.targetAnchor.baseRevisionId !== proposal.targetPlainRevisionId) {
      context.addIssue({
        code: "custom",
        message: "Proposal target revision and anchor base revision must match",
        path: ["targetAnchor", "baseRevisionId"],
      });
    }
    if (proposal.status === "proposed" && proposal.confirmedAt !== null) {
      context.addIssue({
        code: "custom",
        message: "An unconfirmed proposal cannot have confirmedAt",
        path: ["confirmedAt"],
      });
    }
    if (
      (proposal.status === "confirmed" || proposal.status === "applied") &&
      proposal.confirmedAt === null
    ) {
      context.addIssue({
        code: "custom",
        message: "A confirmed proposal requires confirmedAt",
        path: ["confirmedAt"],
      });
    }
    if ((proposal.status === "applied") !== (proposal.appliedAt !== null)) {
      context.addIssue({
        code: "custom",
        message: "Only an applied proposal may have appliedAt",
        path: ["appliedAt"],
      });
    }
    if ((proposal.status === "stale") !== (proposal.staleReason !== null)) {
      context.addIssue({
        code: "custom",
        message: "Only a stale proposal may have staleReason",
        path: ["staleReason"],
      });
    }
  });

const placementDecisionBase = {
  fragmentId: z.string().min(1),
} as const;

const directPlacementDecisionSchema = z.strictObject({
  ...placementDecisionBase,
  placement: z.enum(["saved_as_margin_note", "placed_in_bouquet"]),
  status: z.literal("confirmed"),
  restorationProposalId: z.null(),
  confirmedAt: z.iso.datetime(),
  appliedPlainRevisionId: z.null(),
});

const restorationDirectionDecisionSchema = z.strictObject({
  ...placementDecisionBase,
  placement: z.literal("restored_to_plain_text"),
  status: z.literal("direction_selected"),
  restorationProposalId: z.null(),
  confirmedAt: z.null(),
  appliedPlainRevisionId: z.null(),
});

const restorationProposalPendingDecisionSchema = z.strictObject({
  ...placementDecisionBase,
  placement: z.literal("restored_to_plain_text"),
  status: z.literal("proposal_pending"),
  restorationProposalId: z.string().min(1),
  confirmedAt: z.null(),
  appliedPlainRevisionId: z.null(),
});

const restorationProposalConfirmedDecisionSchema = z.strictObject({
  ...placementDecisionBase,
  placement: z.literal("restored_to_plain_text"),
  status: z.literal("proposal_confirmed"),
  restorationProposalId: z.string().min(1),
  confirmedAt: z.iso.datetime(),
  appliedPlainRevisionId: z.null(),
});

const restorationAppliedDecisionSchema = z.strictObject({
  ...placementDecisionBase,
  placement: z.literal("restored_to_plain_text"),
  status: z.literal("applied"),
  restorationProposalId: z.string().min(1),
  confirmedAt: z.iso.datetime(),
  appliedPlainRevisionId: z.string().min(1),
});

export const semanticPlacementDecisionSchema = z.union([
  directPlacementDecisionSchema,
  restorationDirectionDecisionSchema,
  restorationProposalPendingDecisionSchema,
  restorationProposalConfirmedDecisionSchema,
  restorationAppliedDecisionSchema,
]);

export const semanticPlacementBatchStatusSchema = z.enum([
  "in_progress",
  "checking_consistency",
  "completed",
  "invalidated",
]);

export const semanticPlacementBatchSchema = z
  .strictObject({
    batchId: z.string().min(1),
    baselinePreciseRevisionId: z.string().min(1),
    baselinePlainRevisionId: z.string().min(1),
    workingPlainRevisionId: z.string().min(1),
    fragmentIds: z.array(z.string().min(1)),
    decisions: z.array(semanticPlacementDecisionSchema),
    confirmedRestorationProposalIds: z.array(z.string().min(1)),
    status: semanticPlacementBatchStatusSchema,
    createdAt: z.iso.datetime(),
    completedAt: z.iso.datetime().nullable(),
    invalidatedReason: z.string().min(1).nullable(),
  })
  .superRefine((batch, context) => {
    if (new Set(batch.fragmentIds).size !== batch.fragmentIds.length) {
      context.addIssue({ code: "custom", message: "fragmentIds must be unique", path: ["fragmentIds"] });
    }
    const decisionIds = batch.decisions.map((decision) => decision.fragmentId);
    if (new Set(decisionIds).size !== decisionIds.length) {
      context.addIssue({ code: "custom", message: "Only one decision is allowed per fragment", path: ["decisions"] });
    }
    if (decisionIds.some((id) => !batch.fragmentIds.includes(id))) {
      context.addIssue({ code: "custom", message: "Every decision must belong to the batch", path: ["decisions"] });
    }
    if (
      new Set(batch.confirmedRestorationProposalIds).size !==
      batch.confirmedRestorationProposalIds.length
    ) {
      context.addIssue({
        code: "custom",
        message: "Confirmed restoration proposal IDs must be unique",
        path: ["confirmedRestorationProposalIds"],
      });
    }
    if (batch.status === "completed") {
      const terminalDecisions = batch.decisions.filter(
        (decision) => decision.status === "confirmed" || decision.status === "applied",
      );
      if (terminalDecisions.length !== batch.fragmentIds.length) {
        context.addIssue({
          code: "custom",
          message: "A completed batch requires one completed decision per fragment",
          path: ["status"],
        });
      }
    }
    if ((batch.status === "completed") !== (batch.completedAt !== null)) {
      context.addIssue({
        code: "custom",
        message: "Only a completed batch may have completedAt",
        path: ["completedAt"],
      });
    }
    if ((batch.status === "invalidated") !== (batch.invalidatedReason !== null)) {
      context.addIssue({
        code: "custom",
        message: "Only an invalidated batch may have invalidatedReason",
        path: ["invalidatedReason"],
      });
    }
  });

export const bouquetEntrySchema = z.strictObject({
  id: z.string().min(1),
  fragmentId: z.string().min(1),
  phrase: z.string().min(1),
  reason: z.string().min(1),
  consequence: z.string().min(1),
  sourcePreciseRevisionId: z.string().min(1),
  sourcePlainRevisionId: z.string().min(1),
  placedAt: z.iso.datetime(),
});

import { z } from "zod";

import {
  sha256DigestSchema,
  stableTextAnchorSchema,
} from "../text/stable-text-anchor.schema";

export const documentTargetSchema = z.enum([
  "precise_text",
  "plain_text",
  "margin_note",
]);

export const diffStatusSchema = z.enum(["proposed", "accepted", "rejected"]);

const diffBaseShape = {
  id: z.string().min(1),
  baseRevisionId: z.string().min(1),
  documentTarget: documentTargetSchema,
  targetAnchor: stableTextAnchorSchema,
  reason: z.string().min(1),
  evidenceIds: z.array(z.string().min(1)),
  principleIds: z.array(z.string().min(1)),
  status: diffStatusSchema,
  createdAt: z.iso.datetime(),
  confirmedAt: z.iso.datetime().nullable(),
} as const;

const insertDiffSchema = z.strictObject({
  ...diffBaseShape,
  operation: z.literal("insert"),
  documentTarget: z.enum(["precise_text", "plain_text"]),
  newText: z.string().min(1),
});

const replaceDiffSchema = z.strictObject({
  ...diffBaseShape,
  operation: z.literal("replace"),
  documentTarget: z.enum(["precise_text", "plain_text"]),
  oldText: z.string().min(1),
  oldTextHash: sha256DigestSchema,
  newText: z.string().min(1),
});

const deleteDiffSchema = z.strictObject({
  ...diffBaseShape,
  operation: z.literal("delete"),
  documentTarget: z.enum(["precise_text", "plain_text"]),
  oldText: z.string().min(1),
  oldTextHash: sha256DigestSchema,
});

const annotateDiffSchema = z.strictObject({
  ...diffBaseShape,
  operation: z.literal("annotate"),
  annotationText: z.string().min(1),
});

export const documentDiffSchema = z
  .discriminatedUnion("operation", [
    insertDiffSchema,
    replaceDiffSchema,
    deleteDiffSchema,
    annotateDiffSchema,
  ])
  .superRefine((diff, context) => {
    if (diff.baseRevisionId !== diff.targetAnchor.baseRevisionId) {
      context.addIssue({
        code: "custom",
        message: "Diff and anchor base revisions must match",
        path: ["targetAnchor", "baseRevisionId"],
      });
    }
    if (
      diff.documentTarget !== "margin_note" &&
      diff.targetAnchor.textDocument !== diff.documentTarget
    ) {
      context.addIssue({
        code: "custom",
        message: "Text-target Diff must use an anchor for the same document",
        path: ["targetAnchor", "textDocument"],
      });
    }
    if (diff.status === "proposed" && diff.confirmedAt !== null) {
      context.addIssue({
        code: "custom",
        message: "A proposed Diff cannot have confirmedAt",
        path: ["confirmedAt"],
      });
    }
    if (diff.status !== "proposed" && diff.confirmedAt === null) {
      context.addIssue({
        code: "custom",
        message: "A processed Diff requires confirmedAt",
        path: ["confirmedAt"],
      });
    }
    if (diff.operation === "insert" && diff.targetAnchor.kind !== "point") {
      context.addIssue({
        code: "custom",
        message: "Insert requires a point anchor",
        path: ["targetAnchor", "kind"],
      });
    }
    if (
      (diff.operation === "replace" || diff.operation === "delete") &&
      diff.targetAnchor.kind !== "range"
    ) {
      context.addIssue({
        code: "custom",
        message: "Replace and delete require a range anchor",
        path: ["targetAnchor", "kind"],
      });
    }
  });

export const diffProposalResultSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("diff"), diff: documentDiffSchema }),
  z.strictObject({ kind: z.literal("no_change"), reason: z.string().min(1) }),
]);

export const revisionEntrySchema = z.strictObject({
  revisionId: z.string().min(1),
  parentRevisionId: z.string().min(1),
  documentTarget: z.enum(["precise_text", "plain_text"]),
  beforeTextHash: sha256DigestSchema,
  afterTextHash: sha256DigestSchema,
  changeKind: z.enum([
    "diff",
    "manuscript_revision",
    "semantic_restoration",
    "plain_rewrite",
  ]),
  sourceDiffId: z.string().min(1).nullable(),
  reason: z.string().min(1),
  createdAt: z.iso.datetime(),
});

export const manuscriptRevisionIntentSchema = z.strictObject({
  sourcePreciseRevisionId: z.string().min(1),
  sourcePreciseText: z.string(),
  draftPreciseText: z.string(),
  returnTarget: z.literal("FINAL_SIGNATURE"),
});

export const manuscriptStateSchema = z
  .strictObject({
    preciseText: z.string(),
    preciseRevisionId: z.string().min(1),
    plainText: z.string().nullable(),
    plainRevisionId: z.string().min(1).nullable(),
    revisionHistory: z.array(revisionEntrySchema),
    diffAudit: z.array(documentDiffSchema),
    pendingDiff: documentDiffSchema.nullable(),
    revisionIntent: manuscriptRevisionIntentSchema.nullable(),
  })
  .refine(
    (state) => (state.plainText === null) === (state.plainRevisionId === null),
    {
      message: "plainText and plainRevisionId must be present or absent together",
      path: ["plainRevisionId"],
    },
  );

import { z } from "zod";

import {
  evidenceCardSchema,
  verifiedFactSchema,
} from "../domain/schemas/evidence.schema";
import {
  charlieStageSchema,
  roundIdSchema,
} from "../domain/schemas/experience.schema";

const nonEmptyTextSchema = z
  .string()
  .refine((value) => value.trim().length > 0, {
    message: "Text must contain a non-whitespace character",
  })
  .transform((value) => value.normalize("NFC"));
const uniqueNonEmptyTextArraySchema = z
  .array(nonEmptyTextSchema)
  .refine((values) => new Set(values).size === values.length, {
    message: "Values must be unique",
  });

export const publicAssetPathSchema = nonEmptyTextSchema.refine(
  (path) => {
    if (
      !path.startsWith("/") ||
      path.startsWith("//") ||
      path.includes("\\") ||
      /[?#:%\u0000-\u001f\u007f]/u.test(path)
    ) {
      return false;
    }
    return path
      .split("/")
      .slice(1)
      .every((segment) => segment.length > 0 && segment !== "." && segment !== "..");
  },
  { message: "Public asset paths must be safe root-relative paths" },
);

export const contentSourceLocationSchema = z
  .strictObject({
    editionId: nonEmptyTextSchema,
    sectionType: nonEmptyTextSchema,
    sectionLabel: nonEmptyTextSchema,
    pageStart: z.number().int().positive(),
    pageEnd: z.number().int().positive(),
    locatorNote: nonEmptyTextSchema,
  })
  .refine((location) => location.pageEnd >= location.pageStart, {
    message: "pageEnd must not precede pageStart",
    path: ["pageEnd"],
  });

const verifiedFactAuthoringBaseShape = {
  id: nonEmptyTextSchema,
  contentType: z.literal("VERIFIED_FACT"),
  theme: nonEmptyTextSchema,
  round: roundIdSchema,
  verifiedFact: nonEmptyTextSchema,
  sourceLocation: contentSourceLocationSchema,
  internalExcerpt: nonEmptyTextSchema,
  publicSummary: nonEmptyTextSchema,
  publicPresentationMode: nonEmptyTextSchema,
  allowedInterpretations: uniqueNonEmptyTextArraySchema,
  prohibitedInferences: uniqueNonEmptyTextArraySchema,
  copyrightStatus: nonEmptyTextSchema,
  editionId: nonEmptyTextSchema,
} as const;

const pendingVerifiedFactAuthoringRecordSchema = z.strictObject({
  ...verifiedFactAuthoringBaseShape,
  verificationStatus: z.literal("pending"),
  verifiedBy: z.null(),
  verifiedAt: z.null(),
});

const approvedVerifiedFactAuthoringRecordObjectSchema = z.strictObject({
  ...verifiedFactAuthoringBaseShape,
  verificationStatus: z.literal("approved"),
  verifiedBy: nonEmptyTextSchema,
  verifiedAt: z.iso.datetime(),
});

function editionBindingMatches(record: {
  editionId: string;
  sourceLocation: { editionId: string };
}): boolean {
  return record.editionId === record.sourceLocation.editionId;
}

export const verifiedFactAuthoringRecordSchema = z
  .discriminatedUnion("verificationStatus", [
    pendingVerifiedFactAuthoringRecordSchema,
    approvedVerifiedFactAuthoringRecordObjectSchema,
  ])
  .refine(editionBindingMatches, {
    message: "The fact editionId must match sourceLocation.editionId",
    path: ["sourceLocation", "editionId"],
  });

export const approvedVerifiedFactAuthoringRecordSchema =
  approvedVerifiedFactAuthoringRecordObjectSchema.refine(editionBindingMatches, {
    message: "The fact editionId must match sourceLocation.editionId",
    path: ["sourceLocation", "editionId"],
  });

export const evidenceCardAuthoringRecordSchema = z.strictObject({
  id: nonEmptyTextSchema,
  round: roundIdSchema,
  title: nonEmptyTextSchema,
  factIds: uniqueNonEmptyTextArraySchema.min(1),
  interpretationIds: uniqueNonEmptyTextArraySchema,
  publicText: nonEmptyTextSchema,
  question: nonEmptyTextSchema,
  allowedFollowUps: uniqueNonEmptyTextArraySchema,
  prohibitedClaims: uniqueNonEmptyTextArraySchema,
  attribution: nonEmptyTextSchema,
});

export const domainVerifiedFactProjectionSchema = verifiedFactSchema;
export const domainEvidenceCardProjectionSchema = evidenceCardSchema;

const placeholderEvidenceCardIdSchema = z.enum([
  "past-self-placeholder",
  "future-forecast-placeholder",
  "relationship-placeholder",
]);

const placeholderRoundById = {
  "past-self-placeholder": "round1",
  "future-forecast-placeholder": "round2",
  "relationship-placeholder": "round3",
} as const;

export const placeholderEvidenceCardSchema = z
  .strictObject({
    recordKind: z.literal("placeholder_evidence_card"),
    id: placeholderEvidenceCardIdSchema,
    round: roundIdSchema,
    title: nonEmptyTextSchema,
    publicText: nonEmptyTextSchema,
    question: nonEmptyTextSchema,
    allowedFollowUps: uniqueNonEmptyTextArraySchema,
    prohibitedClaims: uniqueNonEmptyTextArraySchema,
    attribution: z.literal("placeholder"),
    provenance: z.literal("placeholder"),
  })
  .refine((card) => placeholderRoundById[card.id] === card.round, {
    message: "Placeholder evidence-card ID must match its frozen round",
    path: ["round"],
  });

const placeholderPortraitIdSchema = z.enum([
  "early-charlie-placeholder",
  "peak-charlie-placeholder",
  "future-facing-charlie-placeholder",
]);

const placeholderStageById = {
  "early-charlie-placeholder": "early",
  "peak-charlie-placeholder": "peak",
  "future-facing-charlie-placeholder": "futureFacing",
} as const;

export const placeholderPortraitSceneConfigSchema = z
  .strictObject({
    recordKind: z.literal("placeholder_portrait_scene"),
    id: placeholderPortraitIdSchema,
    stage: charlieStageSchema,
    assetPath: publicAssetPathSchema,
    altText: nonEmptyTextSchema,
    provenance: z.literal("placeholder"),
  })
  .refine((scene) => placeholderStageById[scene.id] === scene.stage, {
    message: "Placeholder portrait ID must match its frozen Charlie stage",
    path: ["stage"],
  });

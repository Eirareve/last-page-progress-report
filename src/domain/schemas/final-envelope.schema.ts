import { z } from "zod";

import {
  contentItemSchema,
  dissentRecordSchema,
  evidenceCardSchema,
  originalInteractionSchema,
} from "./evidence.schema";
import { charlieStageSchema } from "./experience.schema";
import { charlieFinalLetterSchema } from "./final-letter.schema";
import { revisionEntrySchema } from "./manuscript.schema";
import {
  finalPortraitChoiceSchema,
  initialPortraitRecordSchema,
  portraitDescriptorCollectionSchema,
  portraitShiftComparisonSchema,
} from "./portrait.schema";
import {
  bouquetEntrySchema,
  semanticDriftSchema,
  semanticFragmentSchema,
} from "./semantic.schema";
import {
  currentCharlieSignatureStatusSchema,
  finalDispositionSchema,
  futureCharlieSignatureStatusSchema,
  signatureReviewSnapshotSchema,
} from "./signature.schema";
import { sha256DigestSchema } from "../text/stable-text-anchor.schema";
import { FINAL_ENVELOPE_SCHEMA_VERSION } from "../versions";
import { sessionContentBindingSchema } from "./session.schema";

export const finalEnvelopePortraitAssetSchema = z.strictObject({
  assetId: z.string().min(1),
  stage: charlieStageSchema,
  assetPath: z.string().startsWith("/"),
  altText: z.string().min(1),
  provenance: z.enum(["placeholder", "verified"]),
});

export const finalEnvelopeContentSnapshotSchema = z.strictObject({
  binding: sessionContentBindingSchema,
  portraitAssets: z
    .array(finalEnvelopePortraitAssetSchema)
    .length(3)
    .superRefine((assets, context) => {
      if (
        new Set(assets.map(({ assetId }) => assetId)).size !== assets.length ||
        new Set(assets.map(({ stage }) => stage)).size !== 3
      ) {
        context.addIssue({
          code: "custom",
          message: "FinalEnvelope portrait assets require unique IDs and full stage coverage",
          path: [],
        });
      }
    }),
  originalInteraction: z.strictObject({
    item: originalInteractionSchema,
    publicDeclaration: z.string().min(1),
    attribution: z.string().min(1),
  }),
});

const finalEnvelopeCommonShape = {
  finalEnvelopeId: z.string().min(1),
  sessionId: z.string().min(1),
  generatedAt: z.iso.datetime(),
  contentSnapshot: finalEnvelopeContentSnapshotSchema,
  sessionConfiguration: z.unknown(),
  manuscript: z.strictObject({
    preciseText: z.string().min(1),
    preciseRevisionId: z.string().min(1),
    plainText: z.string().min(1),
    plainRevisionId: z.string().min(1),
    revisionHistory: z.array(revisionEntrySchema),
  }),
  semantics: z.strictObject({
    drift: semanticDriftSchema,
    fragments: z.array(semanticFragmentSchema),
    bouquet: z.array(bouquetEntrySchema),
  }),
  portraits: z.strictObject({
    descriptors: portraitDescriptorCollectionSchema,
    initialRecord: initialPortraitRecordSchema,
    finalChoice: finalPortraitChoiceSchema,
    finalReason: z.string().nullable(),
    comparison: portraitShiftComparisonSchema,
    shiftSummary: z.string().min(1),
  }),
  openDissents: z.array(dissentRecordSchema),
  signature: z.strictObject({
    currentStatus: currentCharlieSignatureStatusSchema,
    currentReview: signatureReviewSnapshotSchema.nullable(),
    futureStatus: futureCharlieSignatureStatusSchema,
  }),
  finalDisposition: finalDispositionSchema,
  contentAttribution: z.strictObject({
    evidenceCards: z.array(evidenceCardSchema),
    contentItems: z.array(contentItemSchema),
  }),
  executionProvenance: z.unknown(),
  integrityChecksum: sha256DigestSchema,
} as const;

export const legacyFinalEnvelopeV020Schema = z.strictObject({
  ...finalEnvelopeCommonShape,
  finalEnvelopeSchemaVersion: z.literal("0.2.0"),
});

export const finalEnvelopeSchema = z.strictObject({
  ...finalEnvelopeCommonShape,
  finalEnvelopeSchemaVersion: z.literal(FINAL_ENVELOPE_SCHEMA_VERSION),
  letter: charlieFinalLetterSchema,
});

export const supportedFinalEnvelopeSchema = z.discriminatedUnion(
  "finalEnvelopeSchemaVersion",
  [legacyFinalEnvelopeV020Schema, finalEnvelopeSchema],
);

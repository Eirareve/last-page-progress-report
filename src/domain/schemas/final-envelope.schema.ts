import { z } from "zod";

import { contentItemSchema, dissentRecordSchema, evidenceCardSchema } from "./evidence.schema";
import { revisionEntrySchema } from "./manuscript.schema";
import {
  finalPortraitChoiceSchema,
  initialPortraitRecordSchema,
  portraitDescriptorSchema,
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

export const finalEnvelopeSchema = z.strictObject({
  finalEnvelopeId: z.string().min(1),
  finalEnvelopeSchemaVersion: z.literal(FINAL_ENVELOPE_SCHEMA_VERSION),
  sessionId: z.string().min(1),
  generatedAt: z.iso.datetime(),
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
    descriptors: z.array(portraitDescriptorSchema).length(3),
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
});

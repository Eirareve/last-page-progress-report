import { z } from "zod";

import { charlieStageSchema } from "./experience.schema";

export const initialPortraitChoiceSchema = charlieStageSchema;
export const finalPortraitChoiceSchema = z.union([
  charlieStageSchema,
  z.literal("all_three"),
  z.literal("no_unique_answer"),
]);

export const portraitDescriptorSchema = z.strictObject({
  id: z.string().min(1),
  stage: charlieStageSchema,
  label: z.string().min(1),
});
export const initialPortraitRecordSchema = z.strictObject({
  descriptors: z.strictObject({
    early: z.array(z.string().min(1)),
    peak: z.array(z.string().min(1)),
    futureFacing: z.array(z.string().min(1)),
  }),
  initialChoice: initialPortraitChoiceSchema,
  initialReason: z.string().min(1),
});

const portraitComparisonSharedShape = {
  initialChoice: initialPortraitChoiceSchema,
  initialIncludedStages: z.array(charlieStageSchema),
  relatedEvidenceIds: z.array(z.string().min(1)),
  relatedRevisionIds: z.array(z.string().min(1)),
} as const;

export const comparablePortraitShiftSchema = z.strictObject({
  ...portraitComparisonSharedShape,
  comparisonKind: z.literal("comparable"),
  finalChoice: z.union([charlieStageSchema, z.literal("all_three")]),
  finalIncludedStages: z.array(charlieStageSchema).min(1),
  changed: z.boolean(),
  newlyIncludedStages: z.array(charlieStageSchema),
  excludedStages: z.array(charlieStageSchema),
});

export const noUniqueAnswerPortraitShiftSchema = z.strictObject({
  ...portraitComparisonSharedShape,
  comparisonKind: z.literal("no_unique_answer"),
  finalChoice: z.literal("no_unique_answer"),
  finalIncludedStages: z.null(),
  changed: z.literal(true),
  newlyIncludedStages: z.tuple([]),
  excludedStages: z.tuple([]),
});

export const portraitShiftComparisonSchema = z.discriminatedUnion(
  "comparisonKind",
  [comparablePortraitShiftSchema, noUniqueAnswerPortraitShiftSchema],
);

export const portraitPreludeSchema = z.strictObject({
  initialRecord: initialPortraitRecordSchema.nullable(),
  finalChoice: finalPortraitChoiceSchema.nullable(),
  finalReason: z.string().nullable(),
  comparison: portraitShiftComparisonSchema.nullable(),
});

import { z } from "zod";

import { roundIdSchema } from "./experience.schema";

const contentBaseShape = {
  id: z.string().min(1),
  text: z.string().min(1),
} as const;

export const verifiedFactSchema = z.strictObject({
  ...contentBaseShape,
  contentType: z.literal("VERIFIED_FACT"),
  sourceReference: z.string().min(1),
  verifiedByHuman: z.literal(true),
});
export const curatorialInterpretationSchema = z.strictObject({
  ...contentBaseShape,
  contentType: z.literal("CURATORIAL_INTERPRETATION"),
  basedOnVerifiedFactIds: z.array(z.string().min(1)).min(1),
});

export const originalInteractionSchema = z.strictObject({
  ...contentBaseShape,
  contentType: z.literal("ORIGINAL_INTERACTION"),
  purpose: z.enum(["prompt", "manuscript", "ui_copy", "visual_description"]),
});

export const contentItemSchema = z.discriminatedUnion("contentType", [
  verifiedFactSchema,
  curatorialInterpretationSchema,
  originalInteractionSchema,
]);

export const evidenceCardSchema = z.strictObject({
  id: z.string().min(1),
  roundId: roundIdSchema,
  title: z.string().min(1),
  publicSummary: z.string().min(1),
  verifiedFactIds: z.array(z.string().min(1)).min(1),
  interpretationIds: z.array(z.string().min(1)),
});

export const userPrincipleSchema = z.strictObject({
  id: z.string().min(1),
  roundId: roundIdSchema,
  claim: z.string().min(1),
  qualifiers: z.array(z.string().min(1)),
  exceptions: z.array(z.string().min(1)),
  evidenceIds: z.array(z.string().min(1)),
});

export const charliePositionSchema = z.strictObject({
  id: z.string().min(1),
  roundId: roundIdSchema,
  claim: z.string().min(1),
  evidenceIds: z.array(z.string().min(1)),
});

export const charlieResponseSchema = z.strictObject({
  id: z.string().min(1),
  roundId: roundIdSchema,
  responseText: z.string().min(1),
  evidenceIds: z.array(z.string().min(1)),
});

export const dissentRecordSchema = z.strictObject({
  id: z.string().min(1),
  roundId: roundIdSchema,
  charliePositionId: z.string().min(1),
  userPrincipleId: z.string().min(1),
  focus: z.string().min(1),
  status: z.enum(["open", "resolved"]),
});

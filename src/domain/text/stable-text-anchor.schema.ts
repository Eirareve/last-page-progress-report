import { z } from "zod";

export const STABLE_TEXT_ANCHOR_SCHEMA_VERSION = "0.1.0" as const;
export const STABLE_TEXT_ANCHOR_CONTEXT_WINDOW_CODE_POINTS = 32 as const;

export const sha256DigestSchema = z
  .string()
  .regex(/^sha256:[0-9a-f]{64}$/, "Expected a lowercase sha256 digest");

const nfcStringSchema = z
  .string()
  .refine((value) => value === value.normalize("NFC"), "Text must be NFC-normalized");

const stableTextAnchorBaseShape = {
  stableTextAnchorSchemaVersion: z.literal(STABLE_TEXT_ANCHOR_SCHEMA_VERSION),
  textDocument: z.enum(["precise_text", "plain_text"]),
  baseRevisionId: z.string().min(1),
  normalization: z.literal("NFC"),
  indexUnit: z.literal("unicode_code_point"),
  baselineTextSha256: sha256DigestSchema,
  contextWindowCodePoints: z.literal(STABLE_TEXT_ANCHOR_CONTEXT_WINDOW_CODE_POINTS),
  prefixText: nfcStringSchema,
  prefixTextSha256: sha256DigestSchema,
  suffixText: nfcStringSchema,
  suffixTextSha256: sha256DigestSchema,
} as const;

export const stableTextPointAnchorSchema = z
  .strictObject({
    ...stableTextAnchorBaseShape,
    kind: z.literal("point"),
    offsetCodePoint: z.number().int().nonnegative(),
  })
  .refine(
    (anchor) =>
      Array.from(anchor.prefixText).length <= anchor.contextWindowCodePoints &&
      Array.from(anchor.suffixText).length <= anchor.contextWindowCodePoints,
    "Anchor context exceeds the frozen window",
  );

export const stableTextRangeAnchorSchema = z
  .strictObject({
    ...stableTextAnchorBaseShape,
    kind: z.literal("range"),
    startCodePoint: z.number().int().nonnegative(),
    endCodePoint: z.number().int().positive(),
    expectedText: nfcStringSchema.min(1),
    expectedTextSha256: sha256DigestSchema,
  })
  .refine((anchor) => anchor.startCodePoint < anchor.endCodePoint, {
    message: "Range start must be less than end",
    path: ["endCodePoint"],
  })
  .refine(
    (anchor) =>
      Array.from(anchor.expectedText).length ===
      anchor.endCodePoint - anchor.startCodePoint,
    {
      message: "Range length must equal expectedText code-point length",
      path: ["expectedText"],
    },
  )
  .refine(
    (anchor) =>
      Array.from(anchor.prefixText).length <= anchor.contextWindowCodePoints &&
      Array.from(anchor.suffixText).length <= anchor.contextWindowCodePoints,
    "Anchor context exceeds the frozen window",
  );

export const stableTextAnchorSchema = z.discriminatedUnion("kind", [
  stableTextPointAnchorSchema,
  stableTextRangeAnchorSchema,
]);

import { z } from "zod";

import { sha256DigestSchema } from "../text/stable-text-anchor.schema";

export const CHARLIE_FINAL_LETTER_SCHEMA_VERSION = "0.1.0" as const;
export const CHARLIE_VOICE_POLICY_VERSION = "0.1.0" as const;
export const CHARLIE_FINAL_LETTER_ATTRIBUTION =
  "项目原创角色视角文本，非原著引文" as const;

const uniqueIdentifiersSchema = z
  .array(z.string().min(1))
  .refine((values) => new Set(values).size === values.length, {
    message: "Letter evidence identifiers must be unique",
  });

const letterBindingShape = {
  letterSchemaVersion: z.literal(CHARLIE_FINAL_LETTER_SCHEMA_VERSION),
  voicePolicyVersion: z.literal(CHARLIE_VOICE_POLICY_VERSION),
  preciseRevisionId: z.string().min(1),
  plainRevisionId: z.string().min(1),
  contentBundleId: z.string().min(1),
  contentBundleVersion: z.string().min(1),
  contentBundleChecksum: sha256DigestSchema,
  evidenceIds: uniqueIdentifiersSchema,
  attribution: z.literal(CHARLIE_FINAL_LETTER_ATTRIBUTION),
} as const;

const perspectiveBodySchema = z.string().superRefine((value, context) => {
  const length = Array.from(value.normalize("NFC")).length;
  if (length < 250 || length > 400) {
    context.addIssue({
      code: "custom",
      message: "Charlie perspective letter must contain 250 to 400 Unicode characters",
    });
  }
  const paragraphs = value.split(/\n\s*\n/u).filter((item) => item.trim().length > 0);
  if (paragraphs.length < 3 || paragraphs.length > 5) {
    context.addIssue({
      code: "custom",
      message: "Charlie perspective letter must contain 3 to 5 paragraphs",
    });
  }
});

const generationProvenanceSchema = z.strictObject({
  provider: z.string().min(1).nullable(),
  model: z.string().min(1).nullable(),
  adapterVersion: z.string().min(1),
  promptVersion: z.string().min(1).nullable(),
});

export const charlieFinalLetterSchema = z.discriminatedUnion("letterKind", [
  z.strictObject({
    letterKind: z.literal("charlie_perspective"),
    generationStatus: z.literal("generated"),
    sourceMode: z.enum(["mock", "live"]),
    body: perspectiveBodySchema,
    ...letterBindingShape,
    validationResult: z.strictObject({
      bindingValidation: z.literal("passed"),
      evidenceValidation: z.literal("passed"),
      safetyValidation: z.literal("passed"),
    }),
    generationProvenance: generationProvenanceSchema,
  }),
  z.strictObject({
    letterKind: z.literal("archive_note"),
    generationStatus: z.literal("unavailable"),
    sourceMode: z.literal("unavailable"),
    body: z.string().trim().min(1).max(240),
    failureCode: z.string().min(1),
    ...letterBindingShape,
    validationResult: z.null(),
    generationProvenance: generationProvenanceSchema,
  }),
]);

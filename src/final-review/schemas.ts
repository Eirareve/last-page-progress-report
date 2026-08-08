import { z } from "zod";

import {
  curatorialInterpretationSchema,
  dissentRecordSchema,
  evidenceCardSchema,
  verifiedFactSchema,
} from "../domain/schemas/evidence.schema";
import { runtimeSha256DigestSchema } from "../runtime/schemas";
import { serializableRequestContextSchema } from "../runtime/schemas";
import {
  FINAL_REVIEW_MAX_ALLOWED_QUOTE_CODE_UNITS,
  FINAL_REVIEW_MAX_ARRAY_ITEMS,
  FINAL_REVIEW_MAX_INPUT_TEXT_CODE_UNITS,
  FINAL_REVIEW_MAX_REASON_CODE_UNITS,
} from "./limits";
import { FINAL_REVIEW_SCHEMA_VERSION } from "./versions";

const nonBlankStringSchema = z.string().refine(
  (value) => value.trim().length > 0,
  "Expected a non-blank string",
);

function boundedNonBlankStringSchema(maximumCodeUnits: number) {
  return z
    .string()
    .max(maximumCodeUnits)
    .refine(
      (value) => value.trim().length > 0,
      "Expected a non-blank string",
    );
}

const inputTextSchema = boundedNonBlankStringSchema(
  FINAL_REVIEW_MAX_INPUT_TEXT_CODE_UNITS,
);
const reasonSchema = boundedNonBlankStringSchema(
  FINAL_REVIEW_MAX_REASON_CODE_UNITS,
);

const uniqueIdentifiersSchema = z
  .array(nonBlankStringSchema)
  .max(FINAL_REVIEW_MAX_ARRAY_ITEMS)
  .refine((values) => new Set(values).size === values.length, {
    message: "Identifiers must be unique",
  });

export const finalReviewTrustedEvidenceIdsSchema = uniqueIdentifiersSchema;

export const charlieSignatureReviewInputSchema = z
  .strictObject({
    preciseRevisionId: nonBlankStringSchema,
    plainRevisionId: nonBlankStringSchema,
    preciseText: inputTextSchema,
    plainText: inputTextSchema,
    allowedEvidenceIds: uniqueIdentifiersSchema,
    unresolvedDissents: z
      .array(dissentRecordSchema)
      .max(FINAL_REVIEW_MAX_ARRAY_ITEMS),
    contentBundleId: nonBlankStringSchema,
    contentBundleVersion: nonBlankStringSchema,
    contentBundleChecksum: runtimeSha256DigestSchema,
    finalReviewSchemaVersion: z.literal(FINAL_REVIEW_SCHEMA_VERSION),
  })
  .superRefine((input, context) => {
    const dissentIds = input.unresolvedDissents.map((dissent) => dissent.id);
    if (new Set(dissentIds).size !== dissentIds.length) {
      context.addIssue({
        code: "custom",
        message: "Unresolved dissent identifiers must be unique",
        path: ["unresolvedDissents"],
      });
    }
    input.unresolvedDissents.forEach((dissent, index) => {
      if (dissent.status !== "open") {
        context.addIssue({
          code: "custom",
          message: "Only open dissents belong in unresolvedDissents",
          path: ["unresolvedDissents", index, "status"],
        });
      }
      if (dissent.focus.length > FINAL_REVIEW_MAX_INPUT_TEXT_CODE_UNITS) {
        context.addIssue({
          code: "too_big",
          origin: "string",
          maximum: FINAL_REVIEW_MAX_INPUT_TEXT_CODE_UNITS,
          inclusive: true,
          message: "Dissent focus exceeds the Final Review input text cap",
          path: ["unresolvedDissents", index, "focus"],
        });
      }
    });
  });

export const charlieSignatureReviewRequestContextSchema =
  serializableRequestContextSchema.extend({
    capability: z.literal("reviewCharlieSignature"),
  });

const candidateShape = {
  finalReviewSchemaVersion: z.literal(FINAL_REVIEW_SCHEMA_VERSION),
  reason: reasonSchema,
  evidenceIds: uniqueIdentifiersSchema,
} as const;

export const charlieSignatureReviewCandidateSchema = z.discriminatedUnion(
  "status",
  [
    z.strictObject({ status: z.literal("signed"), ...candidateShape }),
    z.strictObject({ status: z.literal("declined"), ...candidateShape }),
  ],
);

export const charlieSignatureReviewValidationResultSchema = z.strictObject({
  validatorVersion: z.literal(FINAL_REVIEW_SCHEMA_VERSION),
  bindingValidation: z.literal("passed"),
  evidenceValidation: z.literal("passed"),
  safetyValidation: z.literal("passed"),
});

const validatedResultShape = {
  reason: reasonSchema,
  preciseRevisionId: nonBlankStringSchema,
  plainRevisionId: nonBlankStringSchema,
  contentBundleId: nonBlankStringSchema,
  contentBundleVersion: nonBlankStringSchema,
  contentBundleChecksum: runtimeSha256DigestSchema,
  evidenceIds: uniqueIdentifiersSchema,
  finalReviewSchemaVersion: z.literal(FINAL_REVIEW_SCHEMA_VERSION),
  validationResult: charlieSignatureReviewValidationResultSchema,
} as const;

export const charlieSignatureReviewResultSchema = z.discriminatedUnion(
  "status",
  [
    z.strictObject({ status: z.literal("signed"), ...validatedResultShape }),
    z.strictObject({ status: z.literal("declined"), ...validatedResultShape }),
  ],
);

const retryableErrorShape = {
  message: reasonSchema,
  retryable: z.literal(true),
} as const;
const terminalErrorShape = {
  message: reasonSchema,
  retryable: z.literal(false),
} as const;

export const charlieSignatureReviewErrorSchema = z.discriminatedUnion("code", [
  z.strictObject({ code: z.literal("timeout"), ...retryableErrorShape }),
  z.strictObject({ code: z.literal("rate_limited"), ...retryableErrorShape }),
  z.strictObject({ code: z.literal("network_error"), ...retryableErrorShape }),
  z.strictObject({
    code: z.literal("execution_unavailable"),
    ...terminalErrorShape,
  }),
  z.strictObject({ code: z.literal("invalid_output"), ...retryableErrorShape }),
  z.strictObject({
    code: z.literal("schema_validation_failed"),
    ...retryableErrorShape,
  }),
  z.strictObject({
    code: z.literal("safety_validation_failed"),
    ...terminalErrorShape,
  }),
  z.strictObject({ code: z.literal("stale_revision"), ...terminalErrorShape }),
  z.strictObject({ code: z.literal("content_not_found"), ...terminalErrorShape }),
  z.strictObject({
    code: z.literal("content_version_mismatch"),
    ...terminalErrorShape,
  }),
  z.strictObject({
    code: z.literal("idempotency_conflict"),
    ...terminalErrorShape,
  }),
  z.strictObject({
    code: z.literal("budget_exhausted"),
    ...terminalErrorShape,
  }),
]);

export const finalReviewExecutionObservationSchema = z.strictObject({
  // Observations report what actually happened. Application budget policy,
  // rather than this telemetry envelope, rejects values above the limit.
  networkRetries: z.number().int().nonnegative(),
  structuredRepairs: z.number().int().nonnegative(),
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  latencyMs: z.number().finite().nonnegative(),
  estimatedCostUsdMicros: z.number().int().nonnegative(),
  provider: boundedNonBlankStringSchema(
    FINAL_REVIEW_MAX_REASON_CODE_UNITS,
  ).optional(),
  modelName: boundedNonBlankStringSchema(
    FINAL_REVIEW_MAX_REASON_CODE_UNITS,
  ).optional(),
});

export const charlieSignatureReviewServiceOutcomeSchema = z.discriminatedUnion(
  "outcomeKind",
  [
    z.strictObject({
      outcomeKind: z.literal("reviewed"),
      result: charlieSignatureReviewResultSchema,
      observation: finalReviewExecutionObservationSchema,
    }),
    z.strictObject({
      outcomeKind: z.literal("unavailable"),
      error: charlieSignatureReviewErrorSchema,
      observation: finalReviewExecutionObservationSchema,
    }),
  ],
);

export const charlieSignatureReviewCandidatePortOutcomeSchema =
  z.discriminatedUnion("portOutcomeKind", [
    z.strictObject({
      portOutcomeKind: z.literal("candidate"),
      candidate: z.unknown(),
      observation: finalReviewExecutionObservationSchema,
    }),
    z.strictObject({
      portOutcomeKind: z.literal("error"),
      error: charlieSignatureReviewErrorSchema,
      observation: finalReviewExecutionObservationSchema,
    }),
  ]);

export const verifiedFinalReviewEvidenceItemSchema = z.strictObject({
  evidenceCard: evidenceCardSchema,
  verifiedFacts: z.array(verifiedFactSchema).max(FINAL_REVIEW_MAX_ARRAY_ITEMS),
  interpretations: z
    .array(curatorialInterpretationSchema)
    .max(FINAL_REVIEW_MAX_ARRAY_ITEMS),
}).superRefine((item, context) => {
  if (item.evidenceCard.verifiedFactIds.length > FINAL_REVIEW_MAX_ARRAY_ITEMS) {
    context.addIssue({
      code: "too_big",
      origin: "array",
      maximum: FINAL_REVIEW_MAX_ARRAY_ITEMS,
      inclusive: true,
      message: "Evidence-card verifiedFactIds exceed the Final Review cap",
      path: ["evidenceCard", "verifiedFactIds"],
    });
  }
  if (item.evidenceCard.interpretationIds.length > FINAL_REVIEW_MAX_ARRAY_ITEMS) {
    context.addIssue({
      code: "too_big",
      origin: "array",
      maximum: FINAL_REVIEW_MAX_ARRAY_ITEMS,
      inclusive: true,
      message: "Evidence-card interpretationIds exceed the Final Review cap",
      path: ["evidenceCard", "interpretationIds"],
    });
  }
  item.interpretations.forEach((interpretation, index) => {
    if (
      interpretation.basedOnVerifiedFactIds.length >
      FINAL_REVIEW_MAX_ARRAY_ITEMS
    ) {
      context.addIssue({
        code: "too_big",
        origin: "array",
        maximum: FINAL_REVIEW_MAX_ARRAY_ITEMS,
        inclusive: true,
        message: "Interpretation fact bindings exceed the Final Review cap",
        path: ["interpretations", index, "basedOnVerifiedFactIds"],
      });
    }
  });
});

export const charlieSignatureReviewSafetyPolicySchema = z.strictObject({
  prohibitedClaims: z.array(reasonSchema).max(FINAL_REVIEW_MAX_ARRAY_ITEMS),
  prohibitedInferences: z.array(reasonSchema).max(FINAL_REVIEW_MAX_ARRAY_ITEMS),
  allowedQuotedText: z
    .array(
      boundedNonBlankStringSchema(
        FINAL_REVIEW_MAX_ALLOWED_QUOTE_CODE_UNITS,
      ),
    )
    .max(FINAL_REVIEW_MAX_ARRAY_ITEMS),
  protectedSourceText: z
    .array(inputTextSchema)
    .max(FINAL_REVIEW_MAX_ARRAY_ITEMS)
    .optional(),
});

const resolvedEvidenceBindingShape = {
  contentBundleId: nonBlankStringSchema,
  contentBundleVersion: nonBlankStringSchema,
  contentBundleChecksum: runtimeSha256DigestSchema,
} as const;

export const resolvedFinalReviewEvidenceContextSchema = z.discriminatedUnion(
  "evidenceMode",
  [
    z.strictObject({
      evidenceMode: z.literal("verified"),
      ...resolvedEvidenceBindingShape,
      evidenceItems: z
        .array(verifiedFinalReviewEvidenceItemSchema)
        .max(FINAL_REVIEW_MAX_ARRAY_ITEMS),
    }),
    z.strictObject({
      evidenceMode: z.literal("placeholder"),
      ...resolvedEvidenceBindingShape,
      placeholderEvidenceIds: uniqueIdentifiersSchema,
      evidenceItems: z.tuple([]),
    }),
  ],
);

export const finalReviewEvidenceResolutionSchema = z.discriminatedUnion(
  "resolutionKind",
  [
    z.strictObject({
      resolutionKind: z.literal("resolved"),
      evidenceContext: resolvedFinalReviewEvidenceContextSchema,
    }),
    z.strictObject({
      resolutionKind: z.literal("error"),
      error: charlieSignatureReviewErrorSchema,
    }),
  ],
);

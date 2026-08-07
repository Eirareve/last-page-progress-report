import { z } from "zod";

import { sha256DigestSchema } from "../domain/text/stable-text-anchor.schema";

export const CONTENT_GATE_EVALUATION_SCHEMA_VERSION = "0.1.0" as const;
export const CONTENT_GATE_ATTESTATION_SCHEMA_VERSION = "0.1.0" as const;

export const targetEnvironmentSchema = z.enum([
  "development",
  "test",
  "production",
]);

export const contentGateEvaluationStatusSchema = z.enum(["passed", "failed"]);

const contentGateBindingShape = {
  evaluationId: z.string().min(1),
  contentBundleId: z.string().min(1),
  contentBundleVersion: z.string().min(1),
  checksum: sha256DigestSchema,
  contentSchemaVersion: z.string().min(1),
  targetEnvironment: targetEnvironmentSchema,
} as const;

export const contentGateBindingSchema = z.strictObject({
  ...contentGateBindingShape,
});

export const passedContentGateEvaluationBindingSchema = z.strictObject({
  contentGateEvaluationSchemaVersion: z.literal(
    CONTENT_GATE_EVALUATION_SCHEMA_VERSION,
  ),
  ...contentGateBindingShape,
  status: z.literal("passed"),
  failureCodes: z.tuple([]),
  evaluatedAt: z.iso.datetime(),
});

export const contentGateEvaluationSchema = z
  .strictObject({
    contentGateEvaluationSchemaVersion: z.literal(
      CONTENT_GATE_EVALUATION_SCHEMA_VERSION,
    ),
    ...contentGateBindingShape,
    status: contentGateEvaluationStatusSchema,
    failureCodes: z.array(z.string().min(1)),
    evaluatedAt: z.iso.datetime(),
  })
  .superRefine((evaluation, context) => {
    if (evaluation.status === "passed" && evaluation.failureCodes.length > 0) {
      context.addIssue({
        code: "custom",
        message: "A passed content gate cannot contain failure codes",
        path: ["failureCodes"],
      });
    }
    if (evaluation.status === "failed" && evaluation.failureCodes.length === 0) {
      context.addIssue({
        code: "custom",
        message: "A failed content gate requires at least one failure code",
        path: ["failureCodes"],
      });
    }
  });

export const contentGateAttestationMethodSchema = z.enum([
  "public_key_signature",
  "shared_key_mac",
]);

/**
 * This is deliberately a verified-result schema, not an untrusted wire
 * candidate. An unverified proof cannot be represented as a
 * ContentGateAttestation and therefore cannot satisfy finalization.
 */
export const contentGateAttestationSchema = z
  .strictObject({
    contentGateAttestationSchemaVersion: z.literal(
      CONTENT_GATE_ATTESTATION_SCHEMA_VERSION,
    ),
    attestationId: z.string().min(1),
    evaluationBinding: passedContentGateEvaluationBindingSchema,
    attestationMethod: contentGateAttestationMethodSchema,
    algorithm: z.string().min(1),
    keyId: z.string().min(1),
    proof: z.string().min(1),
    issuedAt: z.iso.datetime(),
    verifiedAt: z.iso.datetime(),
    verificationStatus: z.literal("verified"),
  })
  .superRefine((attestation, context) => {
    if (
      Date.parse(attestation.issuedAt) <
      Date.parse(attestation.evaluationBinding.evaluatedAt)
    ) {
      context.addIssue({
        code: "custom",
        message: "An attestation cannot precede its content-gate evaluation",
        path: ["issuedAt"],
      });
    }
    if (Date.parse(attestation.verifiedAt) < Date.parse(attestation.issuedAt)) {
      context.addIssue({
        code: "custom",
        message: "verifiedAt cannot precede issuedAt",
        path: ["verifiedAt"],
      });
    }
  });

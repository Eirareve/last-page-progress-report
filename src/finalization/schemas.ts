import { z } from "zod";

import {
  contentGateAttestationMethodSchema,
  contentGateAttestationSchema,
  contentGateEvaluationSchema,
  targetEnvironmentSchema,
} from "../content/schemas";
import { sha256DigestSchema } from "../domain/text/stable-text-anchor.schema";
import { sessionStateSchema } from "../domain/schemas/session.schema";
import {
  capabilityExecutionReceiptSchema,
  contractVersionVectorSchema,
} from "../provenance/schemas";
import {
  capabilityIdentifierSchema,
  runtimeStateSchema,
  sessionConfigurationSchema,
} from "../runtime/schemas";

export const FINALIZATION_CONTRACT_VERSION = "0.1.0" as const;
export const FINAL_ENVELOPE_ATTESTATION_SCHEMA_VERSION = "0.1.0" as const;

export const finalizationBlockerCodeSchema = z.enum([
  "invalid_finalization_stage",
  "round_incomplete",
  "precise_text_missing",
  "precise_revision_missing",
  "plain_text_missing",
  "plain_revision_missing",
  "manuscript_revision_ids_not_distinct",
  "semantic_drift_missing",
  "semantic_drift_not_current",
  "semantic_drift_revision_mismatch",
  "semantic_fragment_set_mismatch",
  "semantic_fragment_unresolved",
  "semantic_restoration_unresolved",
  "semantic_restoration_stale",
  "semantic_restoration_binding_mismatch",
  "semantic_placement_batch_in_progress",
  "semantic_placement_batch_invalidated",
  "semantic_placement_batch_mismatch",
  "pending_diff_present",
  "manuscript_revision_intent_present",
  "active_operation_present",
  "initial_portrait_record_missing",
  "final_portrait_choice_missing",
  "portrait_shift_comparison_missing",
  "portrait_shift_comparison_mismatch",
  "portrait_shift_summary_missing",
  "signature_review_checkpoint_present",
  "current_signature_status_unresolved",
  "signature_review_missing",
  "signature_review_binding_mismatch",
  "future_signature_not_blank",
  "final_disposition_missing",
  "final_envelope_already_present",
  "content_gate_missing",
  "content_gate_failed",
  "content_gate_bundle_mismatch",
  "content_gate_schema_mismatch",
  "content_gate_checksum_mismatch",
  "content_gate_environment_mismatch",
  "content_gate_attestation_missing",
  "content_gate_attestation_invalid",
  "contract_version_missing",
  "contract_version_binding_mismatch",
  "capability_receipt_missing",
]);

export const finalizationBlockerSchema = z.strictObject({
  code: finalizationBlockerCodeSchema,
  path: z.string().min(1),
  subject: z.string().min(1).nullable(),
});

const eligibleFinalizationResultSchema = z.strictObject({
  eligible: z.literal(true),
  blockers: z.tuple([]),
});

const blockedFinalizationResultSchema = z.strictObject({
  eligible: z.literal(false),
  blockers: z.array(finalizationBlockerSchema).min(1),
});

export const finalizationResultSchema = z.discriminatedUnion("eligible", [
  eligibleFinalizationResultSchema,
  blockedFinalizationResultSchema,
]);

export const finalizationContextSchema = z
  .strictObject({
    targetEnvironment: targetEnvironmentSchema,
    contentGateEvaluation: contentGateEvaluationSchema.nullable(),
    requiresContentGateAttestation: z.boolean(),
    contentGateAttestation: contentGateAttestationSchema.nullable(),
    requiredCapabilityReceipts: z.array(capabilityIdentifierSchema),
  })
  .superRefine((context, refinement) => {
    if (
      new Set(context.requiredCapabilityReceipts).size !==
      context.requiredCapabilityReceipts.length
    ) {
      refinement.addIssue({
        code: "custom",
        message: "Required capability receipt identifiers must be unique",
        path: ["requiredCapabilityReceipts"],
      });
    }
  });

export const finalizationProvenanceStateSchema = z.strictObject({
  contractVersionVector: contractVersionVectorSchema,
  capabilityExecutionReceipts: z.array(capabilityExecutionReceiptSchema),
});

/** Concrete composition of the Domain aggregate's generic layer slots. */
export const finalizationSessionStateSchema = sessionStateSchema.and(
  z.object({
    configuration: sessionConfigurationSchema,
    runtime: runtimeStateSchema,
    provenance: finalizationProvenanceStateSchema,
  }),
);

/**
 * Like ContentGateAttestation, this is a projection produced only after a
 * trusted verifier accepts the proof. Signing and verification are outside
 * stage 1.
 */
export const finalEnvelopeAttestationSchema = z
  .strictObject({
    finalEnvelopeAttestationSchemaVersion: z.literal(
      FINAL_ENVELOPE_ATTESTATION_SCHEMA_VERSION,
    ),
    attestationId: z.string().min(1),
    finalEnvelopeId: z.string().min(1),
    integrityChecksum: sha256DigestSchema,
    contentBundleChecksum: sha256DigestSchema,
    finalEnvelopeSchemaVersion: z.string().min(1),
    executionReceiptsDigest: sha256DigestSchema,
    attestationMethod: contentGateAttestationMethodSchema,
    algorithm: z.string().min(1),
    keyId: z.string().min(1),
    proof: z.string().min(1),
    issuedAt: z.iso.datetime(),
    verifiedAt: z.iso.datetime(),
    verificationStatus: z.literal("verified"),
  })
  .refine(
    (attestation) =>
      Date.parse(attestation.verifiedAt) >= Date.parse(attestation.issuedAt),
    {
      message: "verifiedAt cannot precede issuedAt",
      path: ["verifiedAt"],
    },
  );

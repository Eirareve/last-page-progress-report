import { z } from "zod";

import { semanticRestorationValidatedOutcomeSchema } from "../agent";
import { applicationOrchestrationEventSchema, stage3BudgetUsageSchema } from "../application";
import {
  finalEnvelopeSchema,
  finalPortraitChoiceSchema,
  portraitDescriptorSchema,
  portraitShiftComparisonSchema,
  roundIdSchema,
  semanticDriftSchema,
  semanticFragmentPlacementSchema,
  sessionStateSchema,
  signatureReviewFingerprintMaterialSchema,
} from "../domain";
import {
  finalizationContextSchema,
  finalizationProvenanceStateSchema,
} from "../finalization";
import { capabilityExecutionReceiptSchema } from "../provenance";
import {
  activeOperationSchema,
  operationResultGuardInputSchema,
  runtimeStateSchema,
  sessionConfigurationSchema,
} from "../runtime";

const startEventSchema = z.strictObject({ eventType: z.literal("START") });
const setPortraitDescriptorsEventSchema = z.strictObject({
  eventType: z.literal("SET_PORTRAIT_DESCRIPTORS"),
  descriptors: z.array(portraitDescriptorSchema).length(3),
});
const chooseInitialPortraitEventSchema = z.strictObject({
  eventType: z.literal("CHOOSE_INITIAL_PORTRAIT"),
  choice: z.enum(["early", "peak", "futureFacing"]),
});
const submitInitialReasonEventSchema = z.strictObject({
  eventType: z.literal("SUBMIT_INITIAL_REASON"),
  reason: z.string().trim().min(1),
});
const submitResponseEventSchema = z.strictObject({
  eventType: z.literal("SUBMIT_RESPONSE"),
  roundId: roundIdSchema,
  response: z.string().trim().min(1),
});
const submitClarificationEventSchema = z.strictObject({
  eventType: z.literal("SUBMIT_CLARIFICATION"),
  roundId: roundIdSchema,
  clarification: z.string().trim().min(1),
  operation: activeOperationSchema,
});
const continueWithoutClarificationEventSchema = z.strictObject({
  eventType: z.literal("CONTINUE_WITHOUT_CLARIFICATION"),
  roundId: roundIdSchema,
  operation: activeOperationSchema,
});
const diffDecisionBase = {
  diffId: z.string().min(1),
  transitionId: z.string().min(1),
} as const;
const acceptDiffEventSchema = z.strictObject({
  eventType: z.literal("ACCEPT_DIFF"),
  ...diffDecisionBase,
  nextRevisionId: z.string().min(1),
});
const rejectDiffEventSchema = z.strictObject({
  eventType: z.literal("REJECT_DIFF"),
  ...diffDecisionBase,
});
const chooseFragmentPlacementEventSchema = z.strictObject({
  eventType: z.literal("CHOOSE_FRAGMENT_PLACEMENT"),
  fragmentId: z.string().min(1),
  placement: semanticFragmentPlacementSchema,
  bouquetEntryId: z.string().min(1).optional(),
});
const confirmRestorationEventSchema = z.strictObject({
  eventType: z.literal("CONFIRM_SEMANTIC_RESTORATION_PROPOSAL"),
  proposalId: z.string().min(1),
  nextPlainRevisionId: z.string().min(1),
});
const rejectRestorationEventSchema = z.strictObject({
  eventType: z.literal("REJECT_SEMANTIC_RESTORATION_PROPOSAL"),
  proposalId: z.string().min(1),
});
const chooseFinalPortraitEventSchema = z.strictObject({
  eventType: z.literal("CHOOSE_FINAL_PORTRAIT"),
  choice: finalPortraitChoiceSchema,
});
const submitFinalReasonEventSchema = z.strictObject({
  eventType: z.literal("SUBMIT_FINAL_REASON"),
  reason: z.string().trim().min(1),
  operation: activeOperationSchema,
});
const continueWithoutFinalReasonEventSchema = z.strictObject({
  eventType: z.literal("CONTINUE_WITHOUT_FINAL_REASON"),
  operation: activeOperationSchema,
});
const requestSignatureReviewEventSchema = z.strictObject({
  eventType: z.literal("REQUEST_CHARLIE_SIGNATURE_REVIEW"),
  fingerprintMaterial: signatureReviewFingerprintMaterialSchema,
  operation: activeOperationSchema,
});
const retrySignatureReviewEventSchema = z.strictObject({
  eventType: z.literal("RETRY_CHARLIE_SIGNATURE_REVIEW"),
  fingerprintMaterial: signatureReviewFingerprintMaterialSchema,
  operation: activeOperationSchema,
});
const continueWithoutSignatureEventSchema = z.strictObject({
  eventType: z.literal("CONTINUE_WITHOUT_SIGNATURE_REVIEW"),
});
const returnToManuscriptEventSchema = z.strictObject({
  eventType: z.literal("RETURN_TO_MANUSCRIPT_REVIEW"),
});
const submitManuscriptRevisionEventSchema = z.strictObject({
  eventType: z.literal("SUBMIT_MANUSCRIPT_REVISION"),
  draftPreciseText: z.string(),
  nextRevisionId: z.string().min(1),
  reason: z.string().min(1),
});
const cancelManuscriptRevisionEventSchema = z.strictObject({
  eventType: z.literal("CANCEL_MANUSCRIPT_REVISION"),
});
const chooseDispositionEventSchema = z.strictObject({
  eventType: z.literal("CHOOSE_DISPOSITION"),
  disposition: z.enum(["future_reference", "present_record", "unfinished"]),
  finalizationContext: finalizationContextSchema,
  operation: activeOperationSchema,
});

export const stage4UserEventSchema = z.discriminatedUnion("eventType", [
  startEventSchema,
  setPortraitDescriptorsEventSchema,
  chooseInitialPortraitEventSchema,
  submitInitialReasonEventSchema,
  submitResponseEventSchema,
  submitClarificationEventSchema,
  continueWithoutClarificationEventSchema,
  acceptDiffEventSchema,
  rejectDiffEventSchema,
  chooseFragmentPlacementEventSchema,
  confirmRestorationEventSchema,
  rejectRestorationEventSchema,
  chooseFinalPortraitEventSchema,
  submitFinalReasonEventSchema,
  continueWithoutFinalReasonEventSchema,
  requestSignatureReviewEventSchema,
  retrySignatureReviewEventSchema,
  continueWithoutSignatureEventSchema,
  returnToManuscriptEventSchema,
  submitManuscriptRevisionEventSchema,
  cancelManuscriptRevisionEventSchema,
  chooseDispositionEventSchema,
]);

const technicalFailureSchema = z.strictObject({
  code: z.string().min(1),
  summary: z.string().min(1),
  retryable: z.boolean(),
});

export const postPlacementCheckSucceededEventSchema =
  operationResultGuardInputSchema.extend({
    eventType: z.literal("POST_PLACEMENT_CHECK_SUCCEEDED"),
    capability: z.literal("checkPostPlacementConsistency"),
    outcome: z.literal("succeeded"),
    nextDrift: semanticDriftSchema,
  });
export const postPlacementCheckFailedEventSchema =
  operationResultGuardInputSchema.extend({
    eventType: z.literal("POST_PLACEMENT_CHECK_FAILED"),
    capability: z.literal("checkPostPlacementConsistency"),
    outcome: z.literal("failed"),
    error: technicalFailureSchema,
  });
export const portraitShiftComputedEventSchema =
  operationResultGuardInputSchema.extend({
    eventType: z.literal("PORTRAIT_SHIFT_COMPUTED"),
    capability: z.literal("computePortraitShift"),
    outcome: z.literal("succeeded"),
    comparison: portraitShiftComparisonSchema,
    receipt: capabilityExecutionReceiptSchema,
  });
export const finalEnvelopePersistedEventSchema =
  operationResultGuardInputSchema.extend({
    eventType: z.literal("FINAL_ENVELOPE_PERSISTED"),
    capability: z.literal("persistFinalEnvelope"),
    outcome: z.literal("succeeded"),
    envelope: finalEnvelopeSchema,
  });
export const finalEnvelopePersistFailedEventSchema =
  operationResultGuardInputSchema.extend({
    eventType: z.literal("FINAL_ENVELOPE_PERSIST_FAILED"),
    capability: z.literal("persistFinalEnvelope"),
    outcome: z.literal("failed"),
    error: technicalFailureSchema,
  });

export const stage4OperationResultEventSchema = z.union([
  applicationOrchestrationEventSchema,
  postPlacementCheckSucceededEventSchema,
  postPlacementCheckFailedEventSchema,
  portraitShiftComputedEventSchema,
  finalEnvelopePersistedEventSchema,
  finalEnvelopePersistFailedEventSchema,
]);

export const stage4EventSchema = z.union([
  stage4UserEventSchema,
  stage4OperationResultEventSchema,
]);

export const stage4SessionStateSchema = sessionStateSchema.and(
  z.object({
    configuration: sessionConfigurationSchema,
    runtime: runtimeStateSchema,
    provenance: finalizationProvenanceStateSchema,
    finalEnvelope: finalEnvelopeSchema.nullable(),
  }),
);

const privateRoundInputSchema = z.strictObject({
  roundId: roundIdSchema,
  response: z.string().min(1),
  clarification: z.string().min(1).nullable(),
});
export const stage4PrivateInputsSchema = z.strictObject({
  sessionId: z.string().min(1),
  rounds: z.array(privateRoundInputSchema).max(3),
});

export const stage4PersistenceSidecarsSchema = z.strictObject({
  budgetUsage: stage3BudgetUsageSchema,
  privateInputs: stage4PrivateInputsSchema,
  pendingInitialChoice: z
    .enum(["early", "peak", "futureFacing"])
    .nullable(),
  restorationOutcomes: z.array(semanticRestorationValidatedOutcomeSchema),
  runtimeFailures: z.array(technicalFailureSchema),
});

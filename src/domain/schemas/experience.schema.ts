import { z } from "zod";

export const charlieStageSchema = z.enum(["early", "peak", "futureFacing"]);

export const experienceStageSchema = z.enum([
  "WELCOME",
  "PORTRAIT_PRELUDE",
  "PORTRAIT_CHOICE",
  "ROUND_1_PAST_SELF",
  "ROUND_1_DIFF",
  "ROUND_2_FORECAST",
  "ROUND_2_DIFF",
  "ROUND_3_RELATIONSHIP",
  "ROUND_3_DIFF",
  "MANUSCRIPT_REVISION",
  "PLAIN_REWRITE",
  "SEMANTIC_REVIEW",
  "SEMANTIC_PLACEMENT",
  "PORTRAIT_REASSEMBLY",
  "FINAL_SIGNATURE",
  "FINAL_DISPOSITION",
  "FINALIZING",
  "COMPLETE",
]);

export const userExperienceEventSchema = z.enum([
  "START",
  "SET_PORTRAIT_DESCRIPTORS",
  "CHOOSE_INITIAL_PORTRAIT",
  "SUBMIT_INITIAL_REASON",
  "SUBMIT_RESPONSE",
  "SUBMIT_CLARIFICATION",
  "CONTINUE_WITHOUT_CLARIFICATION",
  "ACCEPT_DIFF",
  "REJECT_DIFF",
  "CHOOSE_FRAGMENT_PLACEMENT",
  "CONFIRM_SEMANTIC_RESTORATION_PROPOSAL",
  "REJECT_SEMANTIC_RESTORATION_PROPOSAL",
  "CHOOSE_FINAL_PORTRAIT",
  "SUBMIT_FINAL_REASON",
  "CONTINUE_WITHOUT_FINAL_REASON",
  "REQUEST_CHARLIE_SIGNATURE_REVIEW",
  "CONTINUE_WITHOUT_SIGNATURE_REVIEW",
  "RETRY_CHARLIE_SIGNATURE_REVIEW",
  "RETURN_TO_MANUSCRIPT_REVIEW",
  "SUBMIT_MANUSCRIPT_REVISION",
  "CANCEL_MANUSCRIPT_REVISION",
  "CHOOSE_DISPOSITION",
]);

export const applicationOperationResultEventSchema = z.enum([
  "ROUND_ANALYSIS_BUNDLE_RESOLVED",
  "ROUND_ANALYSIS_BUNDLE_FAILED",
  "PLAIN_SEMANTIC_BUNDLE_RESOLVED",
  "PLAIN_SEMANTIC_BUNDLE_FAILED",
  "POST_PLACEMENT_CHECK_SUCCEEDED",
  "POST_PLACEMENT_CHECK_FAILED",
  "PORTRAIT_SHIFT_COMPUTED",
  "PORTRAIT_SHIFT_SUMMARY_RESOLVED",
  "PORTRAIT_SHIFT_SUMMARY_FAILED",
  "CHARLIE_SIGNATURE_REVIEW_RESOLVED",
  "CHARLIE_SIGNATURE_REVIEW_FAILED",
  "FINAL_ENVELOPE_PERSISTED",
  "FINAL_ENVELOPE_PERSIST_FAILED",
]);

export const experienceEventSchema = z.union([
  userExperienceEventSchema,
  applicationOperationResultEventSchema,
]);

export const stageKindSchema = z.enum([
  "user_interactive",
  "system_transient",
  "terminal",
]);

export const timeoutPolicySchema = z.enum([
  "none",
  "operation_timeout_to_typed_failure",
  "operation_timeout_to_unavailable",
  "transactional_no_partial_commit",
  "operation_timeout_with_rollback",
]);

export const refreshPolicySchema = z.enum([
  "restore_interactive",
  "restore_manuscript_revision_checkpoint",
  "invalidate_operation_then_restore",
  "invalidate_operation_then_retry",
  "invalidate_operation_then_restore_batch",
  "invalidate_operation_then_restore_attempts",
  "invalidate_operation_and_report_incomplete",
  "restore_read_only",
]);

export const stageDescriptorSchema = z.strictObject({
  stage: experienceStageSchema,
  kind: stageKindSchema,
  entryAction: z.string().min(1).nullable(),
  allowedEvents: z.array(experienceEventSchema),
  successTarget: z
    .union([experienceStageSchema, z.array(experienceStageSchema).min(1)])
    .nullable(),
  failureTarget: z
    .union([experienceStageSchema, z.array(experienceStageSchema).min(1)])
    .nullable(),
  timeoutPolicy: timeoutPolicySchema,
  refreshPolicy: refreshPolicySchema,
});

export const roundIdSchema = z.enum(["round1", "round2", "round3"]);

export const roundStateSchema = z.strictObject({
  responseSubmitted: z.boolean(),
  clarificationCount: z.number().int().min(0).max(1),
  completed: z.boolean(),
});

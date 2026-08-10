import type { z } from "zod";

import {
  applicationOperationResultEventSchema,
  charlieStageSchema,
  experienceEventSchema,
  experienceStageSchema,
  refreshPolicySchema,
  roundIdSchema,
  roundStateSchema,
  stageDescriptorSchema,
  stageKindSchema,
  timeoutPolicySchema,
  userExperienceEventSchema,
} from "../schemas/experience.schema";

export type CharlieStage = z.infer<typeof charlieStageSchema>;
export type UserExperienceEvent = z.infer<typeof userExperienceEventSchema>;
export type ApplicationOperationResultEvent = z.infer<
  typeof applicationOperationResultEventSchema
>;
export type ExperienceEvent = z.infer<typeof experienceEventSchema>;
export type ExperienceStage = z.infer<typeof experienceStageSchema>;
export type StageKind = z.infer<typeof stageKindSchema>;
export type TimeoutPolicy = z.infer<typeof timeoutPolicySchema>;
export type RefreshPolicy = z.infer<typeof refreshPolicySchema>;
export type StageDescriptor = z.infer<typeof stageDescriptorSchema>;
export type RoundId = z.infer<typeof roundIdSchema>;
export type RoundState = z.infer<typeof roundStateSchema>;

export const STAGE_DESCRIPTORS = {
  WELCOME: descriptor("WELCOME", "user_interactive", "showWelcome", ["START"], "PORTRAIT_PRELUDE", "WELCOME", "none", "restore_interactive"),
  PORTRAIT_PRELUDE: descriptor("PORTRAIT_PRELUDE", "user_interactive", "loadPortraitPrelude", ["SET_PORTRAIT_DESCRIPTORS"], "PORTRAIT_CHOICE", "PORTRAIT_PRELUDE", "none", "restore_interactive"),
  PORTRAIT_CHOICE: descriptor("PORTRAIT_CHOICE", "user_interactive", "prepareInitialPortraitChoice", ["CHOOSE_INITIAL_PORTRAIT", "SUBMIT_INITIAL_REASON"], "ROUND_1_PAST_SELF", "PORTRAIT_CHOICE", "none", "restore_interactive"),
  ROUND_1_PAST_SELF: roundDescriptor("ROUND_1_PAST_SELF", "prepareRound1", "ROUND_1_DIFF"),
  ROUND_1_DIFF: diffDescriptor("ROUND_1_DIFF", "showRound1Diff", "ROUND_2_FORECAST"),
  ROUND_2_FORECAST: roundDescriptor("ROUND_2_FORECAST", "prepareRound2", "ROUND_2_DIFF"),
  ROUND_2_DIFF: diffDescriptor("ROUND_2_DIFF", "showRound2Diff", "ROUND_3_RELATIONSHIP"),
  ROUND_3_RELATIONSHIP: roundDescriptor("ROUND_3_RELATIONSHIP", "prepareRound3", "ROUND_3_DIFF"),
  ROUND_3_DIFF: diffDescriptor("ROUND_3_DIFF", "showRound3Diff", "PLAIN_REWRITE"),
  MANUSCRIPT_REVISION: descriptor("MANUSCRIPT_REVISION", "user_interactive", "checkpointAndHideSignatureReview", ["SUBMIT_MANUSCRIPT_REVISION", "CANCEL_MANUSCRIPT_REVISION"], ["PLAIN_REWRITE", "FINAL_SIGNATURE"], "MANUSCRIPT_REVISION", "none", "restore_manuscript_revision_checkpoint"),
  PLAIN_REWRITE: descriptor("PLAIN_REWRITE", "system_transient", "startPlainSemanticOrchestration", ["PLAIN_SEMANTIC_BUNDLE_RESOLVED", "PLAIN_SEMANTIC_BUNDLE_FAILED"], "SEMANTIC_REVIEW", "PLAIN_REWRITE", "operation_timeout_to_typed_failure", "invalidate_operation_then_retry"),
  SEMANTIC_REVIEW: descriptor("SEMANTIC_REVIEW", "system_transient", "verifyCommittedPlainSemanticBundle", [], ["SEMANTIC_PLACEMENT", "PORTRAIT_REASSEMBLY", "FINAL_SIGNATURE"], "PLAIN_REWRITE", "transactional_no_partial_commit", "invalidate_operation_then_retry"),
  SEMANTIC_PLACEMENT: descriptor("SEMANTIC_PLACEMENT", "user_interactive", "startOrResumePlacementBatch", ["CHOOSE_FRAGMENT_PLACEMENT", "CONFIRM_SEMANTIC_RESTORATION_PROPOSAL", "REJECT_SEMANTIC_RESTORATION_PROPOSAL", "POST_PLACEMENT_CHECK_SUCCEEDED", "POST_PLACEMENT_CHECK_FAILED"], ["PORTRAIT_REASSEMBLY", "FINAL_SIGNATURE"], "SEMANTIC_PLACEMENT", "operation_timeout_to_typed_failure", "invalidate_operation_then_restore_batch"),
  PORTRAIT_REASSEMBLY: descriptor("PORTRAIT_REASSEMBLY", "user_interactive", "preparePortraitComparison", ["CHOOSE_FINAL_PORTRAIT", "SUBMIT_FINAL_REASON", "CONTINUE_WITHOUT_FINAL_REASON", "PORTRAIT_SHIFT_COMPUTED", "PORTRAIT_SHIFT_SUMMARY_RESOLVED", "PORTRAIT_SHIFT_SUMMARY_FAILED"], "FINAL_SIGNATURE", "PORTRAIT_REASSEMBLY", "operation_timeout_to_typed_failure", "invalidate_operation_then_restore"),
  FINAL_SIGNATURE: descriptor("FINAL_SIGNATURE", "user_interactive", "showReadOnlySignatureReview", ["REQUEST_CHARLIE_SIGNATURE_REVIEW", "CHARLIE_SIGNATURE_REVIEW_RESOLVED", "CHARLIE_SIGNATURE_REVIEW_FAILED", "RETRY_CHARLIE_SIGNATURE_REVIEW", "CONTINUE_WITHOUT_SIGNATURE_REVIEW", "RETURN_TO_MANUSCRIPT_REVIEW"], ["FINAL_DISPOSITION", "MANUSCRIPT_REVISION"], "FINAL_SIGNATURE", "operation_timeout_to_unavailable", "invalidate_operation_then_restore_attempts"),
  FINAL_DISPOSITION: descriptor("FINAL_DISPOSITION", "user_interactive", "prepareDisposition", ["CHOOSE_DISPOSITION"], "FINALIZING", "FINAL_DISPOSITION", "none", "restore_interactive"),
  FINALIZING: descriptor("FINALIZING", "system_transient", "startAtomicEnvelopePersistence", ["FINAL_ENVELOPE_PERSISTED", "FINAL_ENVELOPE_PERSIST_FAILED"], "COMPLETE", "FINAL_DISPOSITION", "operation_timeout_with_rollback", "invalidate_operation_and_report_incomplete"),
  COMPLETE: descriptor("COMPLETE", "terminal", "showReadOnlyEnvelope", [], null, null, "none", "restore_read_only"),
} as const satisfies Record<ExperienceStage, StageDescriptor>;

function descriptor(
  stage: ExperienceStage,
  kind: StageKind,
  entryAction: string,
  allowedEvents: ExperienceEvent[],
  successTarget: ExperienceStage | ExperienceStage[] | null,
  failureTarget: ExperienceStage | ExperienceStage[] | null,
  timeoutPolicy: TimeoutPolicy,
  refreshPolicy: RefreshPolicy,
): StageDescriptor {
  return stageDescriptorSchema.parse({
    stage,
    kind,
    entryAction,
    allowedEvents,
    successTarget,
    failureTarget,
    timeoutPolicy,
    refreshPolicy,
  });
}

function roundDescriptor(
  stage: ExperienceStage,
  entryAction: string,
  successTarget: ExperienceStage,
): StageDescriptor {
  return descriptor(
    stage,
    "user_interactive",
    entryAction,
    [
      "SUBMIT_RESPONSE",
      "SUBMIT_CLARIFICATION",
      "CONTINUE_WITHOUT_CLARIFICATION",
      "ROUND_ANALYSIS_BUNDLE_RESOLVED",
      "ROUND_ANALYSIS_BUNDLE_FAILED",
    ],
    successTarget,
    stage,
    "operation_timeout_to_typed_failure",
    "invalidate_operation_then_restore",
  );
}

function diffDescriptor(
  stage: ExperienceStage,
  entryAction: string,
  successTarget: ExperienceStage,
): StageDescriptor {
  return descriptor(
    stage,
    "user_interactive",
    entryAction,
    ["ACCEPT_DIFF", "REJECT_DIFF"],
    successTarget,
    stage,
    "none",
    "restore_interactive",
  );
}

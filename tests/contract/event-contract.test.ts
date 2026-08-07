import { describe, expect, it } from "vitest";

import {
  experienceEventSchema,
  failureExperienceEventSchema,
  resultExperienceEventSchema,
  stageDescriptorSchema,
  STAGE_DESCRIPTORS,
  systemExperienceEventSchema,
  userExperienceEventSchema,
} from "@/domain";

const USER_EVENTS = [
  "START",
  "SET_PORTRAIT_DESCRIPTORS",
  "CHOOSE_INITIAL_PORTRAIT",
  "SUBMIT_INITIAL_REASON",
  "SUBMIT_RESPONSE",
  "SUBMIT_CLARIFICATION",
  "ACCEPT_DIFF",
  "REJECT_DIFF",
  "CHOOSE_FRAGMENT_PLACEMENT",
  "CHOOSE_FINAL_PORTRAIT",
  "SUBMIT_FINAL_REASON",
  "REQUEST_CHARLIE_SIGNATURE_REVIEW",
  "CONTINUE_WITHOUT_SIGNATURE_REVIEW",
  "RETRY_CHARLIE_SIGNATURE_REVIEW",
  "RETURN_TO_MANUSCRIPT_REVIEW",
  "SUBMIT_MANUSCRIPT_REVISION",
  "CANCEL_MANUSCRIPT_REVISION",
  "CHOOSE_DISPOSITION",
] as const;

const RESULT_EVENTS = [
  "ROUND_ANALYSIS_BUNDLE_RESOLVED",
  "ROUND_ANALYSIS_BUNDLE_FAILED",
  "PLAIN_SEMANTIC_BUNDLE_RESOLVED",
  "PLAIN_SEMANTIC_BUNDLE_FAILED",
  "POST_PLACEMENT_CHECK_SUCCEEDED",
  "PORTRAIT_SHIFT_COMPUTED",
  "PORTRAIT_SHIFT_SUMMARY_SUCCEEDED",
  "CHARLIE_SIGNATURE_REVIEW_RESOLVED",
  "CHARLIE_SIGNATURE_REVIEW_FAILED",
] as const;

const SYSTEM_EVENTS = [
  "ADVANCE",
  "RETRY_NETWORK",
  "REPAIR_STRUCTURED_OUTPUT",
  "USE_MOCK_FALLBACK",
  "USE_STATIC_TEMPLATE",
  "BUILD_FINAL_ENVELOPE",
  "FINALIZE_SESSION",
] as const;

const FAILURE_EVENTS = [
  "AGENT_TIMEOUT",
  "AGENT_RATE_LIMITED",
  "AGENT_NETWORK_ERROR",
  "AGENT_INVALID_OUTPUT",
  "AGENT_PROHIBITED_CLAIM",
  "CONTENT_NOT_FOUND",
  "CONTENT_VERSION_MISMATCH",
  "IMAGE_LOAD_FAILED",
  "PERSISTENCE_FAILED",
] as const;

const LEGACY_AND_NON_FSM_NAMES = [
  "BEGIN_EXPERIENCE",
  "CONTINUE_TO_PORTRAIT_CHOICE",
  "SUBMIT_INITIAL_PORTRAIT_CHOICE",
  "SUBMIT_ROUND_RESPONSE",
  "SUBMIT_ROUND_CLARIFICATION",
  "ROUND_ANALYSIS_SUCCEEDED",
  "ROUND_ANALYSIS_FAILED",
  "PLAIN_SEMANTIC_BUNDLE_SUCCEEDED",
  "SEMANTIC_REVIEW_COMMITTED",
  "SEMANTIC_REVIEW_COMMIT_FAILED",
  "SELECT_FRAGMENT_PLACEMENT",
  "CONFIRM_RESTORATION_PROPOSAL",
  "REGENERATE_STALE_PROPOSAL",
  "RUN_PLACEMENT_CONSISTENCY",
  "PLACEMENT_CONSISTENCY_SUCCEEDED",
  "PLACEMENT_CONSISTENCY_FAILED",
  "SUBMIT_FINAL_PORTRAIT_CHOICE",
  "PORTRAIT_SUMMARY_SUCCEEDED",
  "PORTRAIT_SUMMARY_FAILED",
  "REQUEST_SIGNATURE_REVIEW",
  "SIGNATURE_REVIEW_SUCCEEDED",
  "SIGNATURE_REVIEW_FAILED",
  "RETRY_SIGNATURE_REVIEW",
  "SKIP_SIGNATURE_REVIEW",
  "CONTINUE_TO_DISPOSITION",
  "REQUEST_FINALIZATION_EVALUATION",
  "FINALIZATION_SUCCEEDED",
  "FINALIZATION_FAILED",
  "START_NEW_SESSION",
] as const;

describe("ExperienceEvent contract", () => {
  it("accepts the complete canonical stage-4 inventory by category", () => {
    expect(userExperienceEventSchema.options).toEqual(USER_EVENTS);
    expect(resultExperienceEventSchema.options).toEqual(RESULT_EVENTS);
    expect(systemExperienceEventSchema.options).toEqual(SYSTEM_EVENTS);
    expect(failureExperienceEventSchema.options).toEqual(FAILURE_EVENTS);

    for (const event of [
      ...USER_EVENTS,
      ...RESULT_EVENTS,
      ...SYSTEM_EVENTS,
      ...FAILURE_EVENTS,
    ]) {
      expect(experienceEventSchema.safeParse(event).success, event).toBe(true);
    }
  });

  it("rejects legacy aliases and the application-level new-session command", () => {
    for (const event of LEGACY_AND_NON_FSM_NAMES) {
      expect(experienceEventSchema.safeParse(event).success, event).toBe(false);
    }
  });

  it("keeps every stage descriptor inside the canonical event inventory", () => {
    for (const descriptor of Object.values(STAGE_DESCRIPTORS)) {
      expect(stageDescriptorSchema.safeParse(descriptor).success, descriptor.stage).toBe(
        true,
      );

      for (const event of descriptor.allowedEvents) {
        expect(experienceEventSchema.safeParse(event).success, `${descriptor.stage}:${event}`).toBe(
          true,
        );
      }
    }
  });

  it("keeps bounded operation recovery but forbids live-signature fallback events", () => {
    expect(STAGE_DESCRIPTORS.FINAL_SIGNATURE.allowedEvents).toEqual(
      expect.arrayContaining(["RETRY_NETWORK", "REPAIR_STRUCTURED_OUTPUT"]),
    );
    expect(STAGE_DESCRIPTORS.FINAL_SIGNATURE.allowedEvents).not.toContain(
      "USE_MOCK_FALLBACK",
    );
    expect(STAGE_DESCRIPTORS.FINAL_SIGNATURE.allowedEvents).not.toContain(
      "USE_STATIC_TEMPLATE",
    );
  });
});

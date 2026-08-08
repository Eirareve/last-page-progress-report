import type { AgentMode } from "../runtime/contracts";
import type { ContentGateEvaluation, TargetEnvironment } from "./contracts";
import { isAllowedContentEnvironment, type ContentMode } from "./environment";
import {
  CONTENT_GATE_EVALUATION_SCHEMA_VERSION,
  contentGateEvaluationSchema,
} from "./schemas";

export const CONTENT_GATE_FAILURE_CODES = [
  "invalid_environment_combination",
  "placeholder_forbidden_in_production",
  "content_not_approved",
  "placeholder_content_in_verified_bundle",
  "content_checksum_mismatch",
] as const;

export type ContentGateFailureCode =
  (typeof CONTENT_GATE_FAILURE_CODES)[number];

export type ContentGateInput = Readonly<{
  evaluationId: string;
  evaluatedAt: string;
  targetEnvironment: TargetEnvironment;
  contentMode: ContentMode;
  agentMode: AgentMode;
  contentBundleId: string;
  contentBundleVersion: string;
  contentSchemaVersion: string;
  contentBundleChecksum: string;
  computedContentBundleChecksum: string;
  approvalStatus: "approved" | "placeholder" | "unapproved";
  containsPlaceholderContent: boolean;
}>;

/**
 * The only content-gate decision function. All build/request entrypoints supply
 * their own IDs and timestamps so identical complete inputs remain deterministic.
 */
export function evaluateContentGate(input: ContentGateInput): ContentGateEvaluation {
  const failureCodes: ContentGateFailureCode[] = [];
  const environment = {
    appEnvironment: input.targetEnvironment,
    contentMode: input.contentMode,
    agentMode: input.agentMode,
  } as const;

  if (!isAllowedContentEnvironment(environment)) {
    failureCodes.push("invalid_environment_combination");
  }
  if (
    input.targetEnvironment === "production" &&
    input.contentMode === "placeholder"
  ) {
    failureCodes.push("placeholder_forbidden_in_production");
  }
  if (input.contentMode === "verified" && input.approvalStatus !== "approved") {
    failureCodes.push("content_not_approved");
  }
  if (input.contentMode === "verified" && input.containsPlaceholderContent) {
    failureCodes.push("placeholder_content_in_verified_bundle");
  }
  if (input.contentBundleChecksum !== input.computedContentBundleChecksum) {
    failureCodes.push("content_checksum_mismatch");
  }

  return contentGateEvaluationSchema.parse({
    contentGateEvaluationSchemaVersion:
      CONTENT_GATE_EVALUATION_SCHEMA_VERSION,
    evaluationId: input.evaluationId,
    contentBundleId: input.contentBundleId,
    contentBundleVersion: input.contentBundleVersion,
    checksum: input.contentBundleChecksum,
    contentSchemaVersion: input.contentSchemaVersion,
    targetEnvironment: input.targetEnvironment,
    status: failureCodes.length === 0 ? "passed" : "failed",
    failureCodes,
    evaluatedAt: input.evaluatedAt,
  });
}

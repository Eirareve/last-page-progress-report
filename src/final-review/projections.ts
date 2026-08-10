import type { SignatureReviewSnapshot } from "../domain/contracts/signature";
import { signatureReviewSnapshotSchema } from "../domain/schemas/signature.schema";
import type { CapabilityExecutionReceipt } from "../provenance/contracts";
import { capabilityExecutionReceiptSchema } from "../provenance/schemas";
import type { RuntimeSha256Digest } from "../runtime/contracts";
import type { ResolvedExecutionMode } from "../runtime/contracts";
import type {
  CharlieSignatureReviewError,
  CharlieSignatureReviewInput,
  CharlieSignatureReviewRequestContext,
  CharlieSignatureReviewResult,
  CharlieSignatureReviewServiceOutcome,
} from "./contracts";
import {
  charlieSignatureReviewErrorSchema,
  charlieSignatureReviewInputSchema,
  charlieSignatureReviewRequestContextSchema,
  charlieSignatureReviewResultSchema,
  charlieSignatureReviewServiceOutcomeSchema,
} from "./schemas";
import { FINAL_REVIEW_SCHEMA_VERSION } from "./versions";
import { validateCharlieSignatureReviewResultBinding } from "./validator";

export function projectFinalReviewExecutionReceipt(input: {
  context: CharlieSignatureReviewRequestContext;
  serviceOutcome: CharlieSignatureReviewServiceOutcome;
  startedAt: string;
  completedAt: string;
  resolvedMode: Extract<ResolvedExecutionMode, "live" | "mock" | "unavailable">;
  resultDigest?: RuntimeSha256Digest;
}): CapabilityExecutionReceipt {
  const context = parseSerializableContext(input.context);
  const serviceOutcome = charlieSignatureReviewServiceOutcomeSchema.parse(
    input.serviceOutcome,
  );
  const reviewed = serviceOutcome.outcomeKind === "reviewed";
  if (
    (reviewed && input.resolvedMode !== context.requestedMode) ||
    (!reviewed && input.resolvedMode !== "unavailable")
  ) {
    throw new TypeError(
      "Final Review receipt mode must represent the actual reviewed or unavailable path",
    );
  }
  const fallbackReason =
    serviceOutcome.outcomeKind === "reviewed"
      ? null
      : serviceOutcome.error.code;
  const observation = serviceOutcome.observation;
  const receipt = {
    capability: "reviewCharlieSignature",
    operationId: context.operationId,
    requestId: context.requestId,
    requestedMode: context.requestedMode,
    resolvedMode: input.resolvedMode,
    outcome: reviewed ? "succeeded" : "failed",
    fallbackReason,
    promptVersion: context.promptVersion,
    adapterVersion: context.adapterVersion,
    resultSchemaVersion: FINAL_REVIEW_SCHEMA_VERSION,
    inputFingerprintDigest: context.inputFingerprint,
    startedAt: input.startedAt,
    completedAt: input.completedAt,
    tokenUsage: {
      inputTokens: observation.inputTokens,
      outputTokens: observation.outputTokens,
      totalTokens: observation.inputTokens + observation.outputTokens,
    },
    durationMs: observation.latencyMs,
    ...(observation.modelName === undefined
      ? {}
      : { modelName: observation.modelName }),
    ...(observation.provider === undefined
      ? {}
      : { provider: observation.provider }),
    ...(reviewed && input.resultDigest !== undefined
      ? { resultDigest: input.resultDigest }
      : {}),
  } as const;
  return capabilityExecutionReceiptSchema.parse(receipt);
}

export function projectReviewedSignatureSnapshot(input: {
  reviewInput: CharlieSignatureReviewInput;
  context: CharlieSignatureReviewRequestContext;
  result: CharlieSignatureReviewResult;
  reviewedAt: string;
  resultDigest?: RuntimeSha256Digest | null;
}): SignatureReviewSnapshot {
  const reviewInput = charlieSignatureReviewInputSchema.parse(input.reviewInput);
  const context = parseSerializableContext(input.context);
  const result = charlieSignatureReviewResultSchema.parse(input.result);
  requireProjectionBindings(reviewInput, context, result);

  return signatureReviewSnapshotSchema.parse({
    snapshotKind: "reviewed",
    status: result.status,
    preciseRevisionId: result.preciseRevisionId,
    plainRevisionId: result.plainRevisionId,
    contentBundleId: result.contentBundleId,
    contentBundleVersion: result.contentBundleVersion,
    contentBundleChecksum: result.contentBundleChecksum,
    finalReviewSchemaVersion: result.finalReviewSchemaVersion,
    evidenceIds: result.evidenceIds,
    inputFingerprint: context.inputFingerprint,
    requestId: context.requestId,
    reason: result.reason,
    reviewedAt: input.reviewedAt,
    resultDigest: input.resultDigest ?? null,
  });
}

export function projectUnavailableSignatureSnapshot(input: {
  reviewInput: CharlieSignatureReviewInput;
  context: CharlieSignatureReviewRequestContext;
  error: CharlieSignatureReviewError;
  unavailableAt: string;
}): SignatureReviewSnapshot {
  const reviewInput = charlieSignatureReviewInputSchema.parse(input.reviewInput);
  const context = parseSerializableContext(input.context);
  const error = charlieSignatureReviewErrorSchema.parse(input.error);
  requireInputContextBindings(reviewInput, context);

  return signatureReviewSnapshotSchema.parse({
    snapshotKind: "unavailable",
    status: "unavailable",
    preciseRevisionId: reviewInput.preciseRevisionId,
    plainRevisionId: reviewInput.plainRevisionId,
    contentBundleId: reviewInput.contentBundleId,
    contentBundleVersion: reviewInput.contentBundleVersion,
    contentBundleChecksum: reviewInput.contentBundleChecksum,
    finalReviewSchemaVersion: reviewInput.finalReviewSchemaVersion,
    evidenceIds: [],
    inputFingerprint: context.inputFingerprint,
    requestId: context.requestId,
    failureCode: error.code,
    summary: error.message,
    retryable: error.retryable,
    unavailableAt: input.unavailableAt,
  });
}

function parseSerializableContext(context: CharlieSignatureReviewRequestContext) {
  const { abortSignal, ...serializableContext } = context;
  void abortSignal;
  return charlieSignatureReviewRequestContextSchema.parse(serializableContext);
}

function requireProjectionBindings(
  input: CharlieSignatureReviewInput,
  context: ReturnType<typeof parseSerializableContext>,
  result: CharlieSignatureReviewResult,
): void {
  const validation = validateCharlieSignatureReviewResultBinding({
    reviewInput: input,
    context,
    result,
  });
  if (validation.bindingValidationKind === "invalid") {
    throw new TypeError(
      `Validated Final Review result binding failed: ${validation.error.code}`,
    );
  }
}

function requireInputContextBindings(
  input: CharlieSignatureReviewInput,
  context: ReturnType<typeof parseSerializableContext>,
): void {
  if (
    context.bindings.revisions.preciseRevisionId !== input.preciseRevisionId ||
    context.bindings.revisions.plainRevisionId !== input.plainRevisionId ||
    context.bindings.content.contentBundleId !== input.contentBundleId ||
    context.bindings.content.contentBundleVersion !== input.contentBundleVersion ||
    context.bindings.content.contentBundleChecksum !== input.contentBundleChecksum
  ) {
    throw new TypeError(
      "Final Review business input and RequestContext bindings must match",
    );
  }
}

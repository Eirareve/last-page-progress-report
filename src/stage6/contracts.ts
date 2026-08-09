import { z } from "zod";

import {
  roundAnalysisRuntimePortInputSchema,
  plainSemanticRuntimePortInputSchema,
  stage3BudgetUsageSchema,
  stage3TerminalArtifactSchema,
} from "../application";
import { summarizePortraitShiftInputSchema } from "../agent";
import { charlieSignatureReviewInputSchema } from "../final-review";
import { serializableRequestContextSchema } from "../runtime";
import { STAGE6_TRANSPORT_VERSION } from "./versions";

const nonBlank = z.string().trim().min(1);

const clientOperationContextSchema = serializableRequestContextSchema
  .omit({ promptVersion: true, adapterVersion: true })
  .extend({ requestedMode: z.literal("live") });

const {
  evidenceContext: _clientEvidenceContext,
  ...clientCharlieResponseShape
} = roundAnalysisRuntimePortInputSchema.shape.generateCharlieResponse.shape;
void _clientEvidenceContext;

export const stage6RoundAnalysisClientInputSchema = z.strictObject({
  ...roundAnalysisRuntimePortInputSchema.shape,
  generateCharlieResponse: z.strictObject(clientCharlieResponseShape),
});

const requestHeader = {
  stage6TransportVersion: z.literal(STAGE6_TRANSPORT_VERSION),
  sessionId: nonBlank,
  operationContext: clientOperationContextSchema,
  priorBudgetUsage: stage3BudgetUsageSchema,
} as const;

export const stage6LiveRequestSchema = z
  .discriminatedUnion("executionKind", [
    z.strictObject({
      ...requestHeader,
      executionKind: z.literal("round_analysis"),
      input: stage6RoundAnalysisClientInputSchema,
    }),
    z.strictObject({
      ...requestHeader,
      executionKind: z.literal("plain_semantic_review"),
      input: plainSemanticRuntimePortInputSchema,
    }),
    z.strictObject({
      ...requestHeader,
      executionKind: z.literal("portrait_shift_summary"),
      input: summarizePortraitShiftInputSchema,
    }),
    z.strictObject({
      ...requestHeader,
      executionKind: z.literal("charlie_signature_review"),
      input: charlieSignatureReviewInputSchema,
    }),
  ])
  .superRefine((request, context) => {
    const expected = expectedCapability(request.executionKind);
    if (request.operationContext.capability !== expected) {
      context.addIssue({
        code: "custom",
        message: `executionKind requires capability ${expected}`,
        path: ["operationContext", "capability"],
      });
    }
    if (!requestBindingsMatch(request)) {
      context.addIssue({
        code: "custom",
        message: "Request input must match the operation revision/content binding",
        path: ["operationContext", "bindings"],
      });
    }
  });

export const stage6HttpErrorCodeSchema = z.enum([
  "live_api_gate_closed",
  "invalid_content_type",
  "payload_too_large",
  "invalid_request",
  "rate_limited",
  "concurrency_limited",
  "content_gate_unavailable",
  "idempotency_conflict",
  "budget_state_mismatch",
  "request_cancelled",
  "invalid_terminal_artifact",
  "internal_error",
]);

const retryableHttpCodes = new Set([
  "rate_limited",
  "concurrency_limited",
  "internal_error",
]);

export const stage6HttpErrorSchema = z
  .strictObject({
    code: stage6HttpErrorCodeSchema,
    message: nonBlank,
    retryable: z.boolean(),
  })
  .superRefine((error, context) => {
    if (error.retryable !== retryableHttpCodes.has(error.code)) {
      context.addIssue({
        code: "custom",
        message: `retryable does not match ${error.code}`,
        path: ["retryable"],
      });
    }
  });

export const stage6LiveResponseSchema = z.discriminatedUnion("outcomeKind", [
  z.strictObject({
    stage6TransportVersion: z.literal(STAGE6_TRANSPORT_VERSION),
    outcomeKind: z.literal("terminal_artifact"),
    requestId: nonBlank,
    artifact: stage3TerminalArtifactSchema,
  }),
  z.strictObject({
    stage6TransportVersion: z.literal(STAGE6_TRANSPORT_VERSION),
    outcomeKind: z.literal("error"),
    requestId: nonBlank.nullable(),
    error: stage6HttpErrorSchema,
  }),
]);

export type Stage6LiveRequest = z.infer<typeof stage6LiveRequestSchema>;
export type Stage6LiveResponse = z.infer<typeof stage6LiveResponseSchema>;
export type Stage6HttpErrorCode = z.infer<typeof stage6HttpErrorCodeSchema>;

function expectedCapability(
  kind: Stage6LiveRequest["executionKind"],
): string {
  switch (kind) {
    case "round_analysis":
      return "executeRoundAnalysis";
    case "plain_semantic_review":
      return "executePlainSemanticReview";
    case "portrait_shift_summary":
      return "executePortraitShiftSummary";
    case "charlie_signature_review":
      return "executeCharlieSignatureReview";
  }
}

function requestBindingsMatch(request: Stage6LiveRequest): boolean {
  const bindings = request.operationContext.bindings;
  switch (request.executionKind) {
    case "round_analysis":
      return (
        JSON.stringify(request.input.contentBinding) ===
          JSON.stringify(bindings.content) &&
        JSON.stringify(request.input.revisions) ===
          JSON.stringify(bindings.revisions)
      );
    case "plain_semantic_review":
      return (
        JSON.stringify(request.input.contentBinding) ===
          JSON.stringify(bindings.content) &&
        request.input.sourcePreciseRevisionId ===
          bindings.revisions.preciseRevisionId &&
        request.input.targetPlainRevisionId === bindings.revisions.plainRevisionId
      );
    case "charlie_signature_review":
      return (
        request.input.preciseRevisionId === bindings.revisions.preciseRevisionId &&
        request.input.plainRevisionId === bindings.revisions.plainRevisionId &&
        request.input.contentBundleId === bindings.content.contentBundleId &&
        request.input.contentBundleVersion === bindings.content.contentBundleVersion &&
        request.input.contentBundleChecksum === bindings.content.contentBundleChecksum
      );
    case "portrait_shift_summary":
      return request.input.allowedRevisionIds.every(
        (revisionId) =>
          revisionId === bindings.revisions.preciseRevisionId ||
          revisionId === bindings.revisions.plainRevisionId,
      );
  }
}

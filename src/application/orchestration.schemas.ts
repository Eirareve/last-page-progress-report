import { z } from "zod";

import {
  AGENT_CONTRACT_VERSION,
  AGENT_RESULT_SCHEMA_VERSIONS,
  agentCapabilityErrorSchema,
  summarizePortraitShiftValidatedResultSchema,
  validatedPlainSemanticBundleSchema,
  validatedRoundAnalysisBundleSchema,
} from "../agent";
import {
  FINAL_REVIEW_SCHEMA_VERSION,
  charlieSignatureReviewErrorSchema,
  charlieSignatureReviewResultSchema,
} from "../final-review";
import { capabilityExecutionReceiptSchema } from "../provenance";
import {
  operationResultGuardInputSchema,
  runtimeIdentifierSchema,
} from "../runtime";
import { APPLICATION_ORCHESTRATION_CONTRACT_VERSION } from "./schemas";
import { deriveStage3EntityId } from "./entity-id";
import { evaluateStage3Budget } from "./budget";
import {
  stage3BudgetEvaluationSchema,
  stage3BudgetUsageSchema,
} from "./schemas";

export const applicationOrchestrationPreflightReasonSchema = z.enum([
  "invalid_context",
  "operation_guard_rejected",
  "invalid_budget",
]);

const applicationEventHeaderShape = {
  applicationOrchestrationContractVersion: z.literal(
    APPLICATION_ORCHESTRATION_CONTRACT_VERSION,
  ),
  eventId: runtimeIdentifierSchema,
} as const;

const roundReceiptInventorySchema = exactReceiptInventory([
  "extractUserPrinciple",
  "detectTension",
  "generateCharlieResponse",
  "proposeDocumentDiff",
]);
const plainSemanticReceiptInventorySchema = exactReceiptInventory([
  "compareSemanticDrift",
]);
const portraitSummaryReceiptInventorySchema = exactReceiptInventory([
  "summarizePortraitShift",
]);
const finalReviewReceiptInventorySchema = exactReceiptInventory([
  "reviewCharlieSignature",
]);

export const roundAnalysisBundleResolvedEventSchema =
  operationResultGuardInputSchema.extend({
    ...applicationEventHeaderShape,
    eventType: z.literal("ROUND_ANALYSIS_BUNDLE_RESOLVED"),
    capability: z.literal("executeRoundAnalysis"),
    outcome: z.literal("succeeded"),
    bundle: validatedRoundAnalysisBundleSchema,
    receipts: roundReceiptInventorySchema,
  }).superRefine((event, context) => {
    refineEventIdentityAndReceipts(event, context, ROUND_RECEIPT_VERSIONS);
    refineRoundBundleBindings(event, context);
  });

export const roundAnalysisBundleFailedEventSchema =
  operationResultGuardInputSchema.extend({
    ...applicationEventHeaderShape,
    eventType: z.literal("ROUND_ANALYSIS_BUNDLE_FAILED"),
    capability: z.literal("executeRoundAnalysis"),
    outcome: z.literal("failed"),
    error: agentCapabilityErrorSchema,
    receipts: roundReceiptInventorySchema,
  }).superRefine((event, context) => {
    refineEventIdentityAndReceipts(event, context, ROUND_RECEIPT_VERSIONS);
  });

export const plainSemanticBundleResolvedEventSchema =
  operationResultGuardInputSchema.extend({
    ...applicationEventHeaderShape,
    eventType: z.literal("PLAIN_SEMANTIC_BUNDLE_RESOLVED"),
    capability: z.literal("executePlainSemanticReview"),
    outcome: z.literal("succeeded"),
    bundle: validatedPlainSemanticBundleSchema,
    receipts: plainSemanticReceiptInventorySchema,
  }).superRefine((event, context) => {
    refineEventIdentityAndReceipts(event, context, PLAIN_RECEIPT_VERSIONS);
    refinePlainBundleBindings(event, context);
  });

export const plainSemanticBundleFailedEventSchema =
  operationResultGuardInputSchema.extend({
    ...applicationEventHeaderShape,
    eventType: z.literal("PLAIN_SEMANTIC_BUNDLE_FAILED"),
    capability: z.literal("executePlainSemanticReview"),
    outcome: z.literal("failed"),
    error: agentCapabilityErrorSchema,
    receipts: plainSemanticReceiptInventorySchema,
  }).superRefine((event, context) => {
    refineEventIdentityAndReceipts(event, context, PLAIN_RECEIPT_VERSIONS);
  });

export const portraitShiftSummaryResolvedEventSchema =
  operationResultGuardInputSchema.extend({
    ...applicationEventHeaderShape,
    eventType: z.literal("PORTRAIT_SHIFT_SUMMARY_RESOLVED"),
    capability: z.literal("executePortraitShiftSummary"),
    outcome: z.literal("succeeded"),
    result: summarizePortraitShiftValidatedResultSchema,
    receipts: portraitSummaryReceiptInventorySchema,
  }).superRefine((event, context) => {
    refineEventIdentityAndReceipts(event, context, PORTRAIT_RECEIPT_VERSIONS);
    const currentRevisionIds = new Set([
      event.bindings.revisions.preciseRevisionId,
      event.bindings.revisions.plainRevisionId,
    ]);
    if (
      event.result.revisionIds.some(
        (revisionId) => !currentRevisionIds.has(revisionId),
      )
    ) {
      context.addIssue({
        code: "custom",
        message: "Portrait result revisions must match event bindings",
        path: ["result", "revisionIds"],
      });
    }
  });

export const portraitShiftSummaryFailedEventSchema =
  operationResultGuardInputSchema.extend({
    ...applicationEventHeaderShape,
    eventType: z.literal("PORTRAIT_SHIFT_SUMMARY_FAILED"),
    capability: z.literal("executePortraitShiftSummary"),
    outcome: z.literal("failed"),
    error: agentCapabilityErrorSchema,
    receipts: portraitSummaryReceiptInventorySchema,
  }).superRefine((event, context) => {
    refineEventIdentityAndReceipts(event, context, PORTRAIT_RECEIPT_VERSIONS);
  });

export const charlieSignatureReviewResolvedEventSchema =
  operationResultGuardInputSchema.extend({
    ...applicationEventHeaderShape,
    eventType: z.literal("CHARLIE_SIGNATURE_REVIEW_RESOLVED"),
    capability: z.literal("executeCharlieSignatureReview"),
    outcome: z.literal("succeeded"),
    result: charlieSignatureReviewResultSchema,
    receipts: finalReviewReceiptInventorySchema,
  }).superRefine((event, context) => {
    refineEventIdentityAndReceipts(event, context, FINAL_RECEIPT_VERSIONS);
    refineFinalReviewBindings(event, context);
  });

export const charlieSignatureReviewFailedEventSchema =
  operationResultGuardInputSchema.extend({
    ...applicationEventHeaderShape,
    eventType: z.literal("CHARLIE_SIGNATURE_REVIEW_FAILED"),
    capability: z.literal("executeCharlieSignatureReview"),
    outcome: z.literal("failed"),
    error: charlieSignatureReviewErrorSchema,
    receipts: finalReviewReceiptInventorySchema,
  }).superRefine((event, context) => {
    refineEventIdentityAndReceipts(event, context, FINAL_RECEIPT_VERSIONS);
  });

export const applicationOrchestrationEventSchema = z.discriminatedUnion(
  "eventType",
  [
    roundAnalysisBundleResolvedEventSchema,
    roundAnalysisBundleFailedEventSchema,
    plainSemanticBundleResolvedEventSchema,
    plainSemanticBundleFailedEventSchema,
    portraitShiftSummaryResolvedEventSchema,
    portraitShiftSummaryFailedEventSchema,
    charlieSignatureReviewResolvedEventSchema,
    charlieSignatureReviewFailedEventSchema,
  ],
);

const terminalArtifactBaseShape = {
  applicationOrchestrationContractVersion: z.literal(
    APPLICATION_ORCHESTRATION_CONTRACT_VERSION,
  ),
  budgetEvaluation: stage3BudgetEvaluationSchema,
  budgetUsage: stage3BudgetUsageSchema,
} as const;

export const roundAnalysisResolvedTerminalArtifactSchema = z
  .strictObject({
    ...terminalArtifactBaseShape,
    terminalKind: z.literal("round_analysis_resolved"),
    outcomeKind: z.literal("resolved"),
    event: roundAnalysisBundleResolvedEventSchema,
  })
  .superRefine(refineTerminalBudget);
export const roundAnalysisFailedTerminalArtifactSchema = z
  .strictObject({
    ...terminalArtifactBaseShape,
    terminalKind: z.literal("round_analysis_failed"),
    outcomeKind: z.literal("failed"),
    event: roundAnalysisBundleFailedEventSchema,
  })
  .superRefine(refineTerminalBudget);
export const plainSemanticResolvedTerminalArtifactSchema = z
  .strictObject({
    ...terminalArtifactBaseShape,
    terminalKind: z.literal("plain_semantic_resolved"),
    outcomeKind: z.literal("resolved"),
    event: plainSemanticBundleResolvedEventSchema,
  })
  .superRefine(refineTerminalBudget);
export const plainSemanticFailedTerminalArtifactSchema = z
  .strictObject({
    ...terminalArtifactBaseShape,
    terminalKind: z.literal("plain_semantic_failed"),
    outcomeKind: z.literal("failed"),
    event: plainSemanticBundleFailedEventSchema,
  })
  .superRefine(refineTerminalBudget);
export const portraitSummaryResolvedTerminalArtifactSchema = z
  .strictObject({
    ...terminalArtifactBaseShape,
    terminalKind: z.literal("portrait_summary_resolved"),
    outcomeKind: z.literal("resolved"),
    event: portraitShiftSummaryResolvedEventSchema,
  })
  .superRefine(refineTerminalBudget);
export const portraitSummaryFailedTerminalArtifactSchema = z
  .strictObject({
    ...terminalArtifactBaseShape,
    terminalKind: z.literal("portrait_summary_failed"),
    outcomeKind: z.literal("failed"),
    event: portraitShiftSummaryFailedEventSchema,
  })
  .superRefine(refineTerminalBudget);
export const finalReviewResolvedTerminalArtifactSchema = z
  .strictObject({
    ...terminalArtifactBaseShape,
    terminalKind: z.literal("final_review_resolved"),
    outcomeKind: z.literal("resolved"),
    event: charlieSignatureReviewResolvedEventSchema,
  })
  .superRefine(refineTerminalBudget);
export const finalReviewFailedTerminalArtifactSchema = z
  .strictObject({
    ...terminalArtifactBaseShape,
    terminalKind: z.literal("final_review_failed"),
    outcomeKind: z.literal("failed"),
    event: charlieSignatureReviewFailedEventSchema,
  })
  .superRefine(refineTerminalBudget);

export const stage3TerminalArtifactSchema = z.discriminatedUnion(
  "terminalKind",
  [
    roundAnalysisResolvedTerminalArtifactSchema,
    roundAnalysisFailedTerminalArtifactSchema,
    plainSemanticResolvedTerminalArtifactSchema,
    plainSemanticFailedTerminalArtifactSchema,
    portraitSummaryResolvedTerminalArtifactSchema,
    portraitSummaryFailedTerminalArtifactSchema,
    finalReviewResolvedTerminalArtifactSchema,
    finalReviewFailedTerminalArtifactSchema,
  ],
);

function exactReceiptInventory(capabilities: readonly string[]) {
  return z
    .array(capabilityExecutionReceiptSchema)
    .length(capabilities.length)
    .superRefine((receipts, context) => {
      const actual = receipts.map(({ capability }) => capability);
      if (
        new Set(actual).size !== actual.length ||
        capabilities.some((capability) => !actual.includes(capability))
      ) {
        context.addIssue({
          code: "custom",
          message: `Expected one receipt for each capability: ${capabilities.join(
            ", ",
          )}`,
        });
      }
    });
}

function refineTerminalBudget(
  artifact: {
    budgetEvaluation: z.infer<typeof stage3BudgetEvaluationSchema>;
    budgetUsage: z.infer<typeof stage3BudgetUsageSchema>;
    event?: { capability: string; stage: string };
    failure?: { capability: string; stage: string };
  },
  context: z.RefinementCtx,
): void {
  const expected = evaluateStage3Budget(artifact.budgetUsage);
  if (JSON.stringify(expected) !== JSON.stringify(artifact.budgetEvaluation)) {
    context.addIssue({
      code: "custom",
      message: "Terminal artifact budgetEvaluation must match budgetUsage",
      path: ["budgetEvaluation"],
    });
  }
  const terminalPayload = artifact.event ?? artifact.failure;
  if (terminalPayload === undefined) {
    context.addIssue({
      code: "custom",
      message: "Terminal artifact must contain one validated event or failure artifact",
    });
    return;
  }
  const expectedSlot = budgetSlotForTerminalPayload(terminalPayload);
  if (expectedSlot === null) {
    context.addIssue({
      code: "custom",
      message: "Terminal artifact capability/stage has no Stage 3 budget slot",
      path: ["budgetUsage", "logicalCalls"],
    });
    return;
  }
  const currentCall = artifact.budgetUsage.logicalCalls.find(
    ({ budgetSlot }) => budgetSlot === expectedSlot,
  );
  if (
    currentCall === undefined ||
    currentCall.capability !== terminalPayload.capability
  ) {
    context.addIssue({
      code: "custom",
      message:
        "Terminal artifact budgetUsage must contain the logical call for its event capability and stage",
      path: ["budgetUsage", "logicalCalls"],
    });
  }
}

function budgetSlotForTerminalPayload(payload: {
  capability: string;
  stage: string;
}): z.infer<typeof stage3BudgetUsageSchema>["logicalCalls"][number]["budgetSlot"] | null {
  switch (payload.capability) {
    case "executeRoundAnalysis":
      switch (payload.stage) {
        case "ROUND_1_PAST_SELF":
          return "round_1";
        case "ROUND_2_FORECAST":
          return "round_2";
        case "ROUND_3_RELATIONSHIP":
          return "round_3";
        default:
          return null;
      }
    case "executePlainSemanticReview":
      return "plain_semantic";
    case "executePortraitShiftSummary":
      return "portrait_shift_summary";
    case "executeCharlieSignatureReview":
      return "signature_review";
    default:
      return null;
  }
}

const ROUND_RECEIPT_VERSIONS = {
  extractUserPrinciple: AGENT_RESULT_SCHEMA_VERSIONS.extractUserPrinciple,
  detectTension: AGENT_RESULT_SCHEMA_VERSIONS.detectTension,
  generateCharlieResponse: AGENT_RESULT_SCHEMA_VERSIONS.generateCharlieResponse,
  proposeDocumentDiff: AGENT_RESULT_SCHEMA_VERSIONS.proposeDocumentDiff,
} as const;
const PLAIN_RECEIPT_VERSIONS = {
  compareSemanticDrift: AGENT_RESULT_SCHEMA_VERSIONS.compareSemanticDrift,
} as const;
const PORTRAIT_RECEIPT_VERSIONS = {
  summarizePortraitShift: AGENT_RESULT_SCHEMA_VERSIONS.summarizePortraitShift,
} as const;
const FINAL_RECEIPT_VERSIONS = {
  reviewCharlieSignature: FINAL_REVIEW_SCHEMA_VERSION,
} as const;

function refineEventIdentityAndReceipts(
  event: {
    eventId: string;
    operationId: string;
    requestId: string;
    completedAt: string;
    receipts: readonly z.infer<typeof capabilityExecutionReceiptSchema>[];
  },
  context: z.RefinementCtx,
  versions: Readonly<Record<string, string>>,
): void {
  if (
    event.eventId !==
    deriveStage3EntityId({
      operationId: event.operationId,
      entityKind: "application_event",
      ordinal: 0,
    })
  ) {
    context.addIssue({
      code: "custom",
      message: "Application eventId must be derived from operationId",
      path: ["eventId"],
    });
  }
  refineReceiptBindings(event, context, versions);
}

function refineReceiptBindings(
  artifact: {
    operationId: string;
    requestId: string;
    completedAt: string;
    receipts: readonly z.infer<typeof capabilityExecutionReceiptSchema>[];
  },
  context: z.RefinementCtx,
  versions: Readonly<Record<string, string>>,
): void {
  artifact.receipts.forEach((receipt, index) => {
    const expectedVersion = versions[receipt.capability];
    const isFinalReview = receipt.capability === "reviewCharlieSignature";
    if (
      receipt.operationId !== artifact.operationId ||
      receipt.requestId !== artifact.requestId ||
      receipt.completedAt !== artifact.completedAt ||
      expectedVersion === undefined ||
      receipt.resultSchemaVersion !== expectedVersion ||
      (isFinalReview
        ? receipt.agentContractVersion !== undefined
        : receipt.agentContractVersion !== AGENT_CONTRACT_VERSION)
    ) {
      context.addIssue({
        code: "custom",
        message:
          "Receipt operation/request/completion and Contract versions must match its terminal artifact",
        path: ["receipts", index],
      });
    }
  });
}

function refineRoundBundleBindings(
  event: z.infer<typeof roundAnalysisBundleResolvedEventSchema>,
  context: z.RefinementCtx,
): void {
  const content = event.bindings.content;
  if (
    content.contentBundleId !== event.bundle.contentBinding.contentBundleId ||
    content.contentBundleVersion !==
      event.bundle.contentBinding.contentBundleVersion ||
    content.contentBundleChecksum !==
      event.bundle.contentBinding.contentBundleChecksum ||
    event.bindings.revisions.preciseRevisionId !==
      event.bundle.revisions.preciseRevisionId ||
    event.bindings.revisions.plainRevisionId !==
      event.bundle.revisions.plainRevisionId
  ) {
    context.addIssue({
      code: "custom",
      message: "Round bundle bindings must match event bindings",
      path: ["bundle"],
    });
  }
}

function refinePlainBundleBindings(
  event: z.infer<typeof plainSemanticBundleResolvedEventSchema>,
  context: z.RefinementCtx,
): void {
  const content = event.bindings.content;
  if (
    content.contentBundleId !== event.bundle.contentBinding.contentBundleId ||
    content.contentBundleVersion !==
      event.bundle.contentBinding.contentBundleVersion ||
    content.contentBundleChecksum !==
      event.bundle.contentBinding.contentBundleChecksum ||
    event.bindings.revisions.preciseRevisionId !==
      event.bundle.plainRevision.sourcePreciseRevisionId ||
    event.bindings.revisions.plainRevisionId !==
      event.bundle.plainRevision.plainRevisionId
  ) {
    context.addIssue({
      code: "custom",
      message: "Plain/Semantic bundle bindings must match event bindings",
      path: ["bundle"],
    });
  }
}

function refineFinalReviewBindings(
  event: z.infer<typeof charlieSignatureReviewResolvedEventSchema>,
  context: z.RefinementCtx,
): void {
  const content = event.bindings.content;
  if (
    content.contentBundleId !== event.result.contentBundleId ||
    content.contentBundleVersion !== event.result.contentBundleVersion ||
    content.contentBundleChecksum !== event.result.contentBundleChecksum ||
    event.bindings.revisions.preciseRevisionId !==
      event.result.preciseRevisionId ||
    event.bindings.revisions.plainRevisionId !== event.result.plainRevisionId
  ) {
    context.addIssue({
      code: "custom",
      message: "Final Review result bindings must match event bindings",
      path: ["result"],
    });
  }
}

import { z } from "zod";

import {
  capabilityIdentifierSchema,
  runtimeIdentifierSchema,
} from "../runtime/schemas";

export const APPLICATION_ORCHESTRATION_CONTRACT_VERSION = "0.2.0" as const;
export const STAGE3_EXECUTION_BUDGET_VERSION = "0.1.0" as const;
export const STAGE3_ENTITY_ID_FORMAT_VERSION = "v1" as const;

const resourceBudgetSchema = z.strictObject({
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  latencyMs: z.number().int().nonnegative(),
  estimatedCostUsdMicros: z.number().int().nonnegative(),
});

export const stage3ExecutionBudgetSchema = z
  .strictObject({
    budgetVersion: z.literal(STAGE3_EXECUTION_BUDGET_VERSION),
    maxLogicalMainCalls: z.literal(6),
    maxNetworkRetriesPerLogicalCall: z.literal(1),
    maxStructuredRepairsPerLogicalCall: z.literal(1),
    base: resourceBudgetSchema,
    absolute: resourceBudgetSchema,
  })
  .superRefine((budget, context) => {
    for (const field of [
      "inputTokens",
      "outputTokens",
      "latencyMs",
      "estimatedCostUsdMicros",
    ] as const) {
      if (budget.absolute[field] < budget.base[field]) {
        context.addIssue({
          code: "custom",
          message: `Absolute ${field} must not be below the base budget`,
          path: ["absolute", field],
        });
      }
    }
  });

const parsedStage3ExecutionBudget = stage3ExecutionBudgetSchema.parse({
    budgetVersion: STAGE3_EXECUTION_BUDGET_VERSION,
    maxLogicalMainCalls: 6,
    maxNetworkRetriesPerLogicalCall: 1,
    maxStructuredRepairsPerLogicalCall: 1,
    base: {
      inputTokens: 37_000,
      outputTokens: 6_800,
      latencyMs: 90_000,
      estimatedCostUsdMicros: 300_000,
    },
    absolute: {
      inputTokens: 111_000,
      outputTokens: 20_400,
      latencyMs: 270_000,
      estimatedCostUsdMicros: 900_000,
    },
});

export const STAGE3_EXECUTION_BUDGET = Object.freeze({
  ...parsedStage3ExecutionBudget,
  base: Object.freeze(parsedStage3ExecutionBudget.base),
  absolute: Object.freeze(parsedStage3ExecutionBudget.absolute),
});

export const stage3BudgetSlotSchema = z.enum([
  "round_1",
  "round_2",
  "round_3",
  "plain_semantic",
  "portrait_shift_summary",
  "signature_review",
]);

export const logicalCallBudgetUsageSchema = z.strictObject({
  logicalCallId: runtimeIdentifierSchema,
  budgetSlot: stage3BudgetSlotSchema,
  capability: capabilityIdentifierSchema,
  networkRetries: z.number().int().nonnegative(),
  structuredRepairs: z.number().int().nonnegative(),
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  latencyMs: z.number().int().nonnegative(),
  estimatedCostUsdMicros: z.number().int().nonnegative(),
});

export const stage3BudgetUsageSchema = z
  .strictObject({
    budgetVersion: z.literal(STAGE3_EXECUTION_BUDGET_VERSION),
    logicalCalls: z.array(logicalCallBudgetUsageSchema),
  })
  .superRefine((usage, context) => {
    const callIds = usage.logicalCalls.map(({ logicalCallId }) => logicalCallId);
    if (new Set(callIds).size !== callIds.length) {
      context.addIssue({
        code: "custom",
        message: "logicalCallId values must be unique within one Session budget",
        path: ["logicalCalls"],
      });
    }
    const budgetSlots = usage.logicalCalls.map(({ budgetSlot }) => budgetSlot);
    if (new Set(budgetSlots).size !== budgetSlots.length) {
      context.addIssue({
        code: "custom",
        message: "Each Stage 3 budget slot can be consumed at most once",
        path: ["logicalCalls"],
      });
    }
  });

export const stage3BudgetViolationCodeSchema = z.enum([
  "logical_main_call_limit_exceeded",
  "network_retry_limit_exceeded",
  "structured_repair_limit_exceeded",
  "base_input_token_budget_exceeded",
  "base_output_token_budget_exceeded",
  "base_latency_budget_exceeded",
  "base_cost_budget_exceeded",
  "absolute_input_token_budget_exceeded",
  "absolute_output_token_budget_exceeded",
  "absolute_latency_budget_exceeded",
  "absolute_cost_budget_exceeded",
]);

export const stage3BudgetTotalsSchema = resourceBudgetSchema.extend({
  logicalMainCalls: z.number().int().nonnegative(),
  networkRetries: z.number().int().nonnegative(),
  structuredRepairs: z.number().int().nonnegative(),
});

export const stage3BudgetEvaluationSchema = z.strictObject({
  budgetVersion: z.literal(STAGE3_EXECUTION_BUDGET_VERSION),
  decision: z.enum(["proceed", "degrade", "reject"]),
  totals: stage3BudgetTotalsSchema,
  violations: z.array(stage3BudgetViolationCodeSchema),
});

export const stage3EntityKindSchema = z.enum([
  "user_principle",
  "charlie_position",
  "charlie_response",
  "dissent_record",
  "document_diff",
  "plain_revision",
  "semantic_fragment",
  "semantic_restoration_proposal",
  "round_analysis_bundle",
  "plain_semantic_bundle",
  "portrait_shift_summary",
  "signature_review",
  "application_event",
]);

export const conditionalReceiptInventoryInputSchema = z.strictObject({
  contentMode: z.enum(["placeholder", "verified"]),
  dissentRecordRequired: z.boolean(),
  signatureReview: z.enum(["not_requested", "requested"]),
});

import type {
  LogicalCallBudgetUsage,
  Stage3BudgetEvaluation,
  Stage3BudgetTotals,
  Stage3BudgetUsage,
  Stage3BudgetViolationCode,
  Stage3ExecutionBudget,
} from "./contracts";
import {
  STAGE3_EXECUTION_BUDGET,
  logicalCallBudgetUsageSchema,
  stage3BudgetEvaluationSchema,
  stage3BudgetUsageSchema,
  stage3ExecutionBudgetSchema,
} from "./schemas";

/**
 * Upserts cumulative telemetry for one logical call. A technical retry keeps
 * the same slot and logicalCallId; it does not consume another main-call slot.
 */
export function upsertLogicalCallBudgetUsage(input: {
  priorUsage: Stage3BudgetUsage;
  plannedCall: LogicalCallBudgetUsage;
}): Stage3BudgetUsage {
  const prior = stage3BudgetUsageSchema.parse(input.priorUsage);
  const planned = logicalCallBudgetUsageSchema.parse(input.plannedCall);
  const existingIndex = prior.logicalCalls.findIndex(
    ({ budgetSlot }) => budgetSlot === planned.budgetSlot,
  );
  if (existingIndex === -1) {
    return stage3BudgetUsageSchema.parse({
      budgetVersion: prior.budgetVersion,
      logicalCalls: [...prior.logicalCalls, planned],
    });
  }

  const existing = prior.logicalCalls[existingIndex];
  if (
    existing.logicalCallId !== planned.logicalCallId ||
    existing.capability !== planned.capability
  ) {
    throw new TypeError(
      "A consumed budget slot can only update the same logical call and capability",
    );
  }
  for (const field of [
    "networkRetries",
    "structuredRepairs",
    "inputTokens",
    "outputTokens",
    "latencyMs",
    "estimatedCostUsdMicros",
  ] as const) {
    if (planned[field] < existing[field]) {
      throw new TypeError(
        `Cumulative logical-call budget field ${field} cannot decrease`,
      );
    }
  }
  const logicalCalls = [...prior.logicalCalls];
  logicalCalls[existingIndex] = planned;
  return stage3BudgetUsageSchema.parse({
    budgetVersion: prior.budgetVersion,
    logicalCalls,
  });
}

export function evaluateStage3Budget(
  usageInput: Stage3BudgetUsage,
  budgetInput: Stage3ExecutionBudget = STAGE3_EXECUTION_BUDGET,
): Stage3BudgetEvaluation {
  const usage = stage3BudgetUsageSchema.parse(usageInput);
  const budget = stage3ExecutionBudgetSchema.parse(budgetInput);
  const totals = sumBudgetUsage(usage);
  const hardViolations: Stage3BudgetViolationCode[] = [];
  const baseViolations: Stage3BudgetViolationCode[] = [];

  if (totals.logicalMainCalls > budget.maxLogicalMainCalls) {
    hardViolations.push("logical_main_call_limit_exceeded");
  }
  if (
    usage.logicalCalls.some(
      ({ networkRetries }) =>
        networkRetries > budget.maxNetworkRetriesPerLogicalCall,
    )
  ) {
    hardViolations.push("network_retry_limit_exceeded");
  }
  if (
    usage.logicalCalls.some(
      ({ structuredRepairs }) =>
        structuredRepairs > budget.maxStructuredRepairsPerLogicalCall,
    )
  ) {
    hardViolations.push("structured_repair_limit_exceeded");
  }

  compareAggregateBudget(
    totals,
    budget.base,
    {
      inputTokens: "base_input_token_budget_exceeded",
      outputTokens: "base_output_token_budget_exceeded",
      latencyMs: "base_latency_budget_exceeded",
      estimatedCostUsdMicros: "base_cost_budget_exceeded",
    },
    baseViolations,
  );
  compareAggregateBudget(
    totals,
    budget.absolute,
    {
      inputTokens: "absolute_input_token_budget_exceeded",
      outputTokens: "absolute_output_token_budget_exceeded",
      latencyMs: "absolute_latency_budget_exceeded",
      estimatedCostUsdMicros: "absolute_cost_budget_exceeded",
    },
    hardViolations,
  );

  const violations = [...hardViolations, ...baseViolations];
  return stage3BudgetEvaluationSchema.parse({
    budgetVersion: budget.budgetVersion,
    decision:
      hardViolations.length > 0
        ? "reject"
        : baseViolations.length > 0
          ? "degrade"
          : "proceed",
    totals,
    violations,
  });
}

function sumBudgetUsage(usage: Stage3BudgetUsage): Stage3BudgetTotals {
  return usage.logicalCalls.reduce<Stage3BudgetTotals>(
    (totals, call) => ({
      logicalMainCalls: totals.logicalMainCalls + 1,
      networkRetries: totals.networkRetries + call.networkRetries,
      structuredRepairs: totals.structuredRepairs + call.structuredRepairs,
      inputTokens: totals.inputTokens + call.inputTokens,
      outputTokens: totals.outputTokens + call.outputTokens,
      latencyMs: totals.latencyMs + call.latencyMs,
      estimatedCostUsdMicros:
        totals.estimatedCostUsdMicros + call.estimatedCostUsdMicros,
    }),
    {
      logicalMainCalls: 0,
      networkRetries: 0,
      structuredRepairs: 0,
      inputTokens: 0,
      outputTokens: 0,
      latencyMs: 0,
      estimatedCostUsdMicros: 0,
    },
  );
}

function compareAggregateBudget(
  totals: Stage3BudgetTotals,
  limit: Stage3ExecutionBudget["base"],
  codes: Readonly<
    Record<keyof Stage3ExecutionBudget["base"], Stage3BudgetViolationCode>
  >,
  violations: Stage3BudgetViolationCode[],
): void {
  for (const field of [
    "inputTokens",
    "outputTokens",
    "latencyMs",
    "estimatedCostUsdMicros",
  ] as const) {
    if (totals[field] > limit[field]) {
      violations.push(codes[field]);
    }
  }
}

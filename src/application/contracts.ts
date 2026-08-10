import type { z } from "zod";

import type {
  conditionalReceiptInventoryInputSchema,
  logicalCallBudgetUsageSchema,
  stage3BudgetSlotSchema,
  stage3BudgetEvaluationSchema,
  stage3BudgetTotalsSchema,
  stage3BudgetUsageSchema,
  stage3BudgetViolationCodeSchema,
  stage3EntityKindSchema,
  stage3ExecutionBudgetSchema,
} from "./schemas";

export type Stage3ExecutionBudget = z.infer<typeof stage3ExecutionBudgetSchema>;
export type LogicalCallBudgetUsage = z.infer<
  typeof logicalCallBudgetUsageSchema
>;
export type Stage3BudgetSlot = z.infer<typeof stage3BudgetSlotSchema>;
export type Stage3BudgetUsage = z.infer<typeof stage3BudgetUsageSchema>;
export type Stage3BudgetTotals = z.infer<typeof stage3BudgetTotalsSchema>;
export type Stage3BudgetViolationCode = z.infer<
  typeof stage3BudgetViolationCodeSchema
>;
export type Stage3BudgetEvaluation = z.infer<
  typeof stage3BudgetEvaluationSchema
>;
export type Stage3EntityKind = z.infer<typeof stage3EntityKindSchema>;
export type ConditionalReceiptInventoryInput = z.infer<
  typeof conditionalReceiptInventoryInputSchema
>;

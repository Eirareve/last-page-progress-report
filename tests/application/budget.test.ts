import { describe, expect, it } from "vitest";

import {
  STAGE3_EXECUTION_BUDGET,
  evaluateStage3Budget,
  stage3BudgetUsageSchema,
  upsertLogicalCallBudgetUsage,
} from "@/application";
import {
  makeLogicalCallBudgetUsage,
} from "../fixtures/application";

const SIX_CALLS = [
  makeLogicalCallBudgetUsage("round_1"),
  makeLogicalCallBudgetUsage("round_2"),
  makeLogicalCallBudgetUsage("round_3"),
  makeLogicalCallBudgetUsage("plain_semantic"),
  makeLogicalCallBudgetUsage("portrait_shift_summary"),
  makeLogicalCallBudgetUsage("signature_review", {
    inputTokens: 7_000,
    outputTokens: 1_300,
  }),
] as const;

describe("Stage 3 execution budget 0.1.0", () => {
  it("freezes the approved six-slot base and absolute limits", () => {
    expect(STAGE3_EXECUTION_BUDGET).toEqual({
      budgetVersion: "0.1.0",
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
    expect(Object.isFrozen(STAGE3_EXECUTION_BUDGET)).toBe(true);
    expect(Object.isFrozen(STAGE3_EXECUTION_BUDGET.base)).toBe(true);
    expect(Object.isFrozen(STAGE3_EXECUTION_BUDGET.absolute)).toBe(true);
  });

  it("proceeds at the exact base envelope", () => {
    const result = evaluateStage3Budget({
      budgetVersion: "0.1.0",
      logicalCalls: [...SIX_CALLS],
    });

    expect(result.decision).toBe("proceed");
    expect(result.violations).toEqual([]);
    expect(result.totals).toMatchObject({
      logicalMainCalls: 6,
      inputTokens: 37_000,
      outputTokens: 6_800,
      latencyMs: 90_000,
      estimatedCostUsdMicros: 300_000,
    });
  });

  it("degrades above base while inside the absolute envelope", () => {
    const calls = [...SIX_CALLS];
    calls[0] = makeLogicalCallBudgetUsage("round_1", {
      inputTokens: 6_001,
    });

    expect(
      evaluateStage3Budget({ budgetVersion: "0.1.0", logicalCalls: calls }),
    ).toMatchObject({
      decision: "degrade",
      violations: ["base_input_token_budget_exceeded"],
    });
  });

  it("rejects an absolute resource breach", () => {
    const calls = [...SIX_CALLS];
    calls[0] = makeLogicalCallBudgetUsage("round_1", {
      inputTokens: 100_001,
    });

    const result = evaluateStage3Budget({
      budgetVersion: "0.1.0",
      logicalCalls: calls,
    });
    expect(result.decision).toBe("reject");
    expect(result.violations).toContain(
      "absolute_input_token_budget_exceeded",
    );
  });

  it("rejects retry or repair counts above one within a slot", () => {
    const retry = evaluateStage3Budget({
      budgetVersion: "0.1.0",
      logicalCalls: [
        makeLogicalCallBudgetUsage("round_1", { networkRetries: 2 }),
      ],
    });
    const repair = evaluateStage3Budget({
      budgetVersion: "0.1.0",
      logicalCalls: [
        makeLogicalCallBudgetUsage("plain_semantic", {
          structuredRepairs: 2,
        }),
      ],
    });

    expect(retry).toMatchObject({
      decision: "reject",
      violations: ["network_retry_limit_exceeded"],
    });
    expect(repair).toMatchObject({
      decision: "reject",
      violations: ["structured_repair_limit_exceeded"],
    });
  });

  it("cannot consume one approved slot twice", () => {
    expect(() =>
      stage3BudgetUsageSchema.parse({
        budgetVersion: "0.1.0",
        logicalCalls: [
          makeLogicalCallBudgetUsage("round_1"),
          makeLogicalCallBudgetUsage("round_1", {
            logicalCallId: "logical-call-round-1-again",
          }),
        ],
      }),
    ).toThrow(/budget slot/i);
  });

  it("upserts one technical retry into the original logical call slot", () => {
    const initial = makeLogicalCallBudgetUsage("signature_review", {
      logicalCallId: "signature-logical-call-1",
      networkRetries: 0,
      inputTokens: 1_000,
      outputTokens: 200,
    });
    const retry = makeLogicalCallBudgetUsage("signature_review", {
      logicalCallId: "signature-logical-call-1",
      networkRetries: 1,
      inputTokens: 1_900,
      outputTokens: 350,
      latencyMs: 25_000,
      estimatedCostUsdMicros: 80_000,
    });
    const merged = upsertLogicalCallBudgetUsage({
      priorUsage: { budgetVersion: "0.1.0", logicalCalls: [initial] },
      plannedCall: retry,
    });
    const evaluation = evaluateStage3Budget(merged);

    expect(merged.logicalCalls).toEqual([retry]);
    expect(evaluation.totals.logicalMainCalls).toBe(1);
    expect(evaluation.totals.networkRetries).toBe(1);
    expect(evaluation.decision).not.toBe("reject");
  });

  it("rejects a second technical retry without consuming another main-call slot", () => {
    const initial = makeLogicalCallBudgetUsage("signature_review", {
      logicalCallId: "signature-logical-call-1",
      networkRetries: 1,
    });
    const secondRetry = makeLogicalCallBudgetUsage("signature_review", {
      logicalCallId: "signature-logical-call-1",
      networkRetries: 2,
    });
    const merged = upsertLogicalCallBudgetUsage({
      priorUsage: { budgetVersion: "0.1.0", logicalCalls: [initial] },
      plannedCall: secondRetry,
    });
    const evaluation = evaluateStage3Budget(merged);

    expect(evaluation.totals.logicalMainCalls).toBe(1);
    expect(evaluation).toMatchObject({
      decision: "reject",
      violations: ["network_retry_limit_exceeded"],
    });
  });

  it("does not let a new logical call reuse an already consumed slot", () => {
    const initial = makeLogicalCallBudgetUsage("round_1", {
      logicalCallId: "round-logical-call-1",
    });
    const differentCall = makeLogicalCallBudgetUsage("round_1", {
      logicalCallId: "round-logical-call-2",
    });

    expect(() =>
      upsertLogicalCallBudgetUsage({
        priorUsage: { budgetVersion: "0.1.0", logicalCalls: [initial] },
        plannedCall: differentCall,
      }),
    ).toThrow(/same logical call/i);
  });
});

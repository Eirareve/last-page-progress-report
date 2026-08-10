import { z } from "zod";
import { describe, expect, it, vi } from "vitest";

import {
  buildPortraitShiftSummaryPrompt,
  executeStage6StructuredCall,
} from "@/stage6";
import { FakeStage6ProviderTransport } from "@/stage6/testing/fake-provider-transport";
import { makePortraitSummaryInput } from "../fixtures/agent";

const candidateSchema = z.strictObject({ answer: z.string().min(1) });
const observation = Object.freeze({
  inputTokens: 10,
  outputTokens: 4,
  latencyMs: 25,
  estimatedCostUsdMicros: 100,
});

describe("Stage 6 structured provider execution", () => {
  it("retries a network-class failure at most once", async () => {
    const transport = new FakeStage6ProviderTransport([
      { outcomeKind: "error", code: "rate_limited", observation },
      { outcomeKind: "candidate", candidate: { answer: "safe" }, observation },
    ]);

    const result = await execute(transport);

    expect(result.outcomeKind).toBe("candidate");
    expect(result.observation.networkRetries).toBe(1);
    expect(result.observation.inputTokens).toBe(20);
    expect(transport.calls.map(({ attemptKind }) => attemptKind)).toEqual([
      "primary",
      "network_retry",
    ]);
  });

  it("performs one structured repair after strict Schema failure", async () => {
    const transport = new FakeStage6ProviderTransport([
      { outcomeKind: "candidate", candidate: { wrong: true }, observation },
      {
        outcomeKind: "candidate",
        candidate: { answer: "repaired" },
        observation,
      },
    ]);

    const result = await execute(transport);

    expect(result.outcomeKind).toBe("candidate");
    expect(result.observation.structuredRepairs).toBe(1);
    expect(transport.calls[1]).toMatchObject({
      attemptKind: "structured_repair",
      previousCandidate: { wrong: true },
    });
  });

  it("fails after one retry or one repair without leaking raw provider errors", async () => {
    const network = new FakeStage6ProviderTransport([
      { outcomeKind: "error", code: "network_error", observation },
      { outcomeKind: "error", code: "network_error", observation },
      { outcomeKind: "candidate", candidate: { answer: "too late" }, observation },
    ]);
    const networkResult = await execute(network);
    expect(networkResult).toMatchObject({
      outcomeKind: "error",
      code: "network_error",
      summary: "Provider network request failed",
    });
    expect(network.calls).toHaveLength(2);

    const invalid = new FakeStage6ProviderTransport([
      { outcomeKind: "candidate", candidate: { secret: "raw" }, observation },
      { outcomeKind: "candidate", candidate: { stillWrong: true }, observation },
      { outcomeKind: "candidate", candidate: { answer: "too late" }, observation },
    ]);
    const invalidResult = await execute(invalid);
    expect(invalidResult).toMatchObject({
      outcomeKind: "error",
      code: "schema_validation_failed",
    });
    expect(JSON.stringify(invalidResult)).not.toContain("raw");
    expect(invalid.calls).toHaveLength(2);
  });

  it("enforces a real deadline even when a transport never settles", async () => {
    const transport = {
      provider: "fake-provider",
      modelName: "hanging-model",
      execute: () => new Promise<never>(() => undefined),
    };

    const result = await executeStage6StructuredCall({
      transport,
      prompt: buildPortraitShiftSummaryPrompt(makePortraitSummaryInput()),
      candidateSchema,
      timeoutMs: 5,
    });

    expect(result).toMatchObject({ outcomeKind: "error", code: "timeout" });
    expect(result.observation.networkRetries).toBe(1);
  });

  it("does not retry or repair after the caller cancels", async () => {
    const controller = new AbortController();
    const transport = {
      provider: "fake-provider",
      modelName: "cancelled-model",
      execute: vi.fn(async () => {
        controller.abort();
        return {
          outcomeKind: "error" as const,
          code: "timeout" as const,
          observation,
        };
      }),
    };

    const result = await executeStage6StructuredCall({
      transport,
      prompt: buildPortraitShiftSummaryPrompt(makePortraitSummaryInput()),
      candidateSchema,
      timeoutMs: 100,
      abortSignal: controller.signal,
    });

    expect(result).toMatchObject({ outcomeKind: "error", code: "timeout" });
    expect(result.observation.networkRetries).toBe(0);
    expect(transport.execute).toHaveBeenCalledTimes(1);

    const repairController = new AbortController();
    const repairTransport = {
      provider: "fake-provider",
      modelName: "cancelled-repair-model",
      execute: vi.fn(async () => {
        repairController.abort();
        return {
          outcomeKind: "candidate" as const,
          candidate: { wrong: true },
          observation,
        };
      }),
    };
    const repairResult = await executeStage6StructuredCall({
      transport: repairTransport,
      prompt: buildPortraitShiftSummaryPrompt(makePortraitSummaryInput()),
      candidateSchema,
      timeoutMs: 100,
      abortSignal: repairController.signal,
    });
    expect(repairResult).toMatchObject({
      outcomeKind: "error",
      code: "network_error",
    });
    expect(repairResult.observation.structuredRepairs).toBe(0);
    expect(repairTransport.execute).toHaveBeenCalledTimes(1);
  });
});

function execute(transport: FakeStage6ProviderTransport) {
  return executeStage6StructuredCall({
    transport,
    prompt: buildPortraitShiftSummaryPrompt(makePortraitSummaryInput()),
    candidateSchema,
    timeoutMs: 100,
  });
}

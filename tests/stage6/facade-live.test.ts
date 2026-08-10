import { IDBKeyRange, indexedDB } from "fake-indexeddb";
import { beforeAll, describe, expect, it, vi } from "vitest";

import type {
  AgentExecutionEnvelope,
  PlainSemanticReviewPortInput,
  ProviderNeutralAgentPort,
  RoundAnalysisPortInput,
  SummarizePortraitShiftInput,
} from "@/agent";
import {
  DeterministicMockAgentAdapter,
  MOCK_AGENT_ADAPTER_VERSION,
  agentCapabilityError,
} from "@/agent";
import { createContentAccess } from "@/content";
import type { GatedContentAccess } from "@/content/server";
import { sealVerifiedContentBundle } from "@/content/bundle-projection";
import { evaluateContentGate } from "@/content/evaluate-content-gate";
import type { FinalReviewService } from "@/final-review";
import {
  ZERO_FINAL_REVIEW_EXECUTION_OBSERVATION,
  createCharlieSignatureReviewError,
} from "@/final-review";
import type { RequestContext } from "@/runtime";
import {
  DEEPSEEK_OPENAI_ADAPTER_VERSION,
  Stage6LiveHttpError,
  type Stage6LiveApplicationClient,
} from "@/stage6";
import { createStage6ServerExecutor } from "@/stage6/server/executor";
import { Stage5ExperienceFacade } from "@/stage5";
import { makeVerifiedContentBundleMaterial } from "../fixtures/content";

const NOW = "2026-08-09T15:00:00.000Z";

describe("Stage 6 live facade wiring", () => {
  beforeAll(() => {
    Object.defineProperty(globalThis, "indexedDB", {
      configurable: true,
      value: indexedDB,
    });
    Object.defineProperty(globalThis, "IDBKeyRange", {
      configurable: true,
      value: IDBKeyRange,
    });
  });

  it("dispatches a strict server terminal artifact through the existing FSM", async () => {
    const fixture = await verifiedFixture();
    const execute = createStage6ServerExecutor({
      agentPort: new FakeLiveAgentPort(),
      finalReviewService: unusedFinalReviewService(),
      loadGatedContent: async () => fixture.gatedContent,
      now: () => NOW,
    });
    const liveClient: Stage6LiveApplicationClient = {
      execute: vi.fn((request, abortSignal) =>
        execute(request, {
          abortSignal: abortSignal ?? new AbortController().signal,
        }),
      ),
    };
    const facade = new Stage5ExperienceFacade(null, {
      requestedMode: "live",
      liveClient,
      loadContent: async () => fixture.loaded,
    });

    await reachFirstRound(facade);
    await facade.submitRound({ response: "Synthetic live-mode response." });

    const snapshot = facade.getSnapshot();
    expect(snapshot.status).toBe("ready");
    expect(snapshot.error).toBeNull();
    expect(snapshot.view?.stage).toBe("ROUND_2_FORECAST");
    expect(snapshot.view?.executionStatus).toMatchObject({
      requestedMode: "live",
      resolvedMode: "live",
      outcome: "succeeded",
    });
    expect(liveClient.execute).toHaveBeenCalledTimes(1);
    const [request] = vi.mocked(liveClient.execute).mock.calls[0]!;
    const serialized = JSON.stringify(request);
    expect(serialized).not.toContain("internalExcerpt");
    expect(serialized).not.toContain("verifiedFacts");
  });

  it("falls back to local Mock without changing requested live provenance when HTTP is unavailable", async () => {
    const fixture = await verifiedFixture();
    const liveClient: Stage6LiveApplicationClient = {
      execute: vi.fn(async () => {
        throw new Error("synthetic route outage");
      }),
    };
    const facade = new Stage5ExperienceFacade(null, {
      requestedMode: "live",
      liveClient,
      loadContent: async () => fixture.loaded,
    });

    await reachFirstRound(facade);
    await facade.submitRound({ response: "Synthetic fallback response." });

    expect(facade.getSnapshot()).toMatchObject({
      status: "ready",
      error: null,
      view: {
        stage: "ROUND_2_FORECAST",
        executionStatus: {
          requestedMode: "live",
          resolvedMode: "mock",
          outcome: "succeeded",
        },
      },
    });
    expect(liveClient.execute).toHaveBeenCalledTimes(1);
  });

  it("does not hide a trusted content failure behind the local Mock", async () => {
    const fixture = await verifiedFixture();
    const liveClient: Stage6LiveApplicationClient = {
      execute: vi.fn(async () => {
        throw new Stage6LiveHttpError({
          code: "content_gate_unavailable",
          message: "Verified content binding was rejected",
          retryable: false,
        });
      }),
    };
    const facade = new Stage5ExperienceFacade(null, {
      requestedMode: "live",
      liveClient,
      loadContent: async () => fixture.loaded,
    });

    await reachFirstRound(facade);
    await facade.submitRound({ response: "Synthetic rejected response." });

    expect(facade.getSnapshot()).toMatchObject({
      persistence: "failed",
      error: "Verified content binding was rejected",
      view: { stage: "ROUND_1_PAST_SELF", executionStatus: null },
    });
    expect(liveClient.execute).toHaveBeenCalledTimes(1);
  });

  it("uses the static safety template if both the route and local Mock fail", async () => {
    const fixture = await verifiedFixture();
    const liveClient: Stage6LiveApplicationClient = {
      execute: vi.fn(async () => {
        throw new Error("synthetic route outage");
      }),
    };
    const facade = new Stage5ExperienceFacade(null, {
      requestedMode: "live",
      liveClient,
      localFallbackPort: failingLocalMockPort(),
      loadContent: async () => fixture.loaded,
    });

    await reachFirstRound(facade);
    await facade.submitRound({ response: "Synthetic static response." });

    expect(facade.getSnapshot()).toMatchObject({
      status: "ready",
      error: null,
      view: {
        stage: "ROUND_2_FORECAST",
        executionStatus: {
          requestedMode: "live",
          resolvedMode: "static_template",
          outcome: "succeeded",
        },
      },
    });
  });

  it("rejects a late Live result after the facade is disposed", async () => {
    const fixture = await verifiedFixture();
    const execute = createStage6ServerExecutor({
      agentPort: new FakeLiveAgentPort(),
      finalReviewService: unusedFinalReviewService(),
      loadGatedContent: async () => fixture.gatedContent,
      now: () => NOW,
    });
    let release: (() => void) | undefined;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const liveClient: Stage6LiveApplicationClient = {
      execute: vi.fn(async (request) => {
        const artifact = await execute(request, {
          abortSignal: new AbortController().signal,
        });
        await held;
        return artifact;
      }),
    };
    const facade = new Stage5ExperienceFacade(null, {
      requestedMode: "live",
      liveClient,
      loadContent: async () => fixture.loaded,
    });

    await reachFirstRound(facade);
    const command = facade.submitRound({ response: "Synthetic late response." });
    await vi.waitFor(() => expect(liveClient.execute).toHaveBeenCalledTimes(1));
    facade.dispose();
    release?.();
    await command;

    expect(facade.getSnapshot()).toMatchObject({
      persistence: "failed",
      error: "Live operation was cancelled before application commit",
      view: { stage: "ROUND_1_PAST_SELF", executionStatus: null },
    });
  });

  it("binds Live Final Review fingerprints before calling the server service", async () => {
    const fixture = await verifiedFixture();
    const finalReviewService = unavailableFinalReviewService();
    const reviewCall = vi.spyOn(finalReviewService, "reviewCharlieSignature");
    const execute = createStage6ServerExecutor({
      agentPort: new FakeLiveAgentPort(),
      finalReviewService,
      loadGatedContent: async () => fixture.gatedContent,
      now: () => NOW,
    });
    const liveClient: Stage6LiveApplicationClient = {
      execute: vi.fn((request, abortSignal) =>
        execute(request, {
          abortSignal: abortSignal ?? new AbortController().signal,
        }),
      ),
    };
    const facade = new Stage5ExperienceFacade(null, {
      requestedMode: "live",
      liveClient,
      loadContent: async () => fixture.loaded,
    });

    await reachFinalSignature(facade);
    await facade.requestSignature("signed");

    expect(reviewCall).toHaveBeenCalledTimes(1);
    expect(facade.getSnapshot()).toMatchObject({
      status: "ready",
      error: null,
      view: {
        stage: "FINAL_SIGNATURE",
        signatureStatus: "unavailable",
        executionStatus: {
          requestedMode: "live",
          resolvedMode: "unavailable",
          outcome: "failed",
        },
      },
    });
  });

  it("does not hide a trusted Final Review budget rejection as unavailable", async () => {
    const fixture = await verifiedFixture();
    const execute = createStage6ServerExecutor({
      agentPort: new FakeLiveAgentPort(),
      finalReviewService: unavailableFinalReviewService(),
      loadGatedContent: async () => fixture.gatedContent,
      now: () => NOW,
    });
    const liveClient: Stage6LiveApplicationClient = {
      execute: vi.fn((request, abortSignal) => {
        if (request.executionKind === "charlie_signature_review") {
          throw new Stage6LiveHttpError({
            code: "budget_state_mismatch",
            message: "Synthetic Final Review budget mismatch",
            retryable: false,
          });
        }
        return execute(request, {
          abortSignal: abortSignal ?? new AbortController().signal,
        });
      }),
    };
    const facade = new Stage5ExperienceFacade(null, {
      requestedMode: "live",
      liveClient,
      loadContent: async () => fixture.loaded,
    });

    await reachFinalSignature(facade);
    await facade.requestSignature("signed");

    expect(facade.getSnapshot()).toMatchObject({
      persistence: "failed",
      error: "Synthetic Final Review budget mismatch",
      view: {
        stage: "FINAL_SIGNATURE",
        signatureStatus: "pending",
      },
    });
  });

  it("allows exactly one manual retry after a retryable Live Final Review failure", async () => {
    const fixture = await verifiedFixture();
    const finalReviewService = retryableUnavailableFinalReviewService();
    const reviewCall = vi.spyOn(finalReviewService, "reviewCharlieSignature");
    const execute = createStage6ServerExecutor({
      agentPort: new FakeLiveAgentPort(),
      finalReviewService,
      loadGatedContent: async () => fixture.gatedContent,
      now: () => NOW,
    });
    const facade = new Stage5ExperienceFacade(null, {
      requestedMode: "live",
      liveClient: {
        execute: (request, abortSignal) =>
          execute(request, {
            abortSignal: abortSignal ?? new AbortController().signal,
          }),
      },
      loadContent: async () => fixture.loaded,
    });

    await reachFinalSignature(facade);
    await facade.requestSignature("signed");
    expect(facade.getSnapshot().view).toMatchObject({
      signatureStatus: "unavailable",
      signatureRetryAvailable: true,
    });

    await facade.requestSignature("signed");
    expect(reviewCall).toHaveBeenCalledTimes(2);
    expect(facade.getSnapshot()).toMatchObject({
      status: "ready",
      error: null,
      view: {
        stage: "FINAL_SIGNATURE",
        signatureStatus: "unavailable",
        signatureRetryAvailable: false,
      },
    });
  });
});

class FakeLiveAgentPort implements ProviderNeutralAgentPort {
  readonly executionMode = "live" as const;
  readonly adapterVersion = DEEPSEEK_OPENAI_ADAPTER_VERSION;
  readonly #delegate = new DeterministicMockAgentAdapter();

  executeRoundAnalysis(input: RoundAnalysisPortInput, context: RequestContext) {
    return this.#delegate.executeRoundAnalysis(input, mockContext(context));
  }

  executePlainSemanticReview(
    input: PlainSemanticReviewPortInput,
    context: RequestContext,
  ) {
    return this.#delegate.executePlainSemanticReview(input, mockContext(context));
  }

  summarizePortraitShift(
    input: SummarizePortraitShiftInput,
    context: RequestContext,
  ) {
    return this.#delegate.summarizePortraitShift(input, mockContext(context));
  }
}

function unusedFinalReviewService(): FinalReviewService & {
  executionMode: "live";
  adapterVersion: string;
} {
  return {
    executionMode: "live",
    adapterVersion: DEEPSEEK_OPENAI_ADAPTER_VERSION,
    reviewCharlieSignature: async () => {
      throw new Error("Final Review is outside this facade fixture");
    },
  };
}

function unavailableFinalReviewService(): FinalReviewService & {
  executionMode: "live";
  adapterVersion: string;
} {
  return {
    executionMode: "live",
    adapterVersion: DEEPSEEK_OPENAI_ADAPTER_VERSION,
    reviewCharlieSignature: async () => ({
      outcomeKind: "unavailable",
      error: createCharlieSignatureReviewError(
        "execution_unavailable",
        "synthetic unavailable Final Review",
      ),
      observation: ZERO_FINAL_REVIEW_EXECUTION_OBSERVATION,
    }),
  };
}

function retryableUnavailableFinalReviewService(): FinalReviewService & {
  executionMode: "live";
  adapterVersion: string;
} {
  return {
    executionMode: "live",
    adapterVersion: DEEPSEEK_OPENAI_ADAPTER_VERSION,
    reviewCharlieSignature: async () => ({
      outcomeKind: "unavailable",
      error: createCharlieSignatureReviewError(
        "network_error",
        "synthetic retryable Final Review failure",
      ),
      observation: ZERO_FINAL_REVIEW_EXECUTION_OBSERVATION,
    }),
  };
}

async function verifiedFixture() {
  const { publicBundle } = await sealVerifiedContentBundle(
    makeVerifiedContentBundleMaterial(),
  );
  const access = createContentAccess(publicBundle);
  const evaluation = evaluateContentGate({
    evaluationId: "stage6-facade-live-gate",
    evaluatedAt: NOW,
    targetEnvironment: "development",
    contentMode: "verified",
    agentMode: "live",
    contentBundleId: publicBundle.contentBundleId,
    contentBundleVersion: publicBundle.contentBundleVersion,
    contentSchemaVersion: publicBundle.contentSchemaVersion,
    contentBundleChecksum: publicBundle.contentBundleChecksum,
    computedContentBundleChecksum: publicBundle.contentBundleChecksum,
    approvalStatus: publicBundle.approvalStatus,
    containsPlaceholderContent: publicBundle.containsPlaceholderContent,
  });
  if (evaluation.status !== "passed" || access.contentMode !== "verified") {
    throw new Error("Verified facade fixture failed its gate");
  }
  return {
    loaded: { bundle: publicBundle, access },
    gatedContent: { evaluation, access } satisfies GatedContentAccess,
  };
}

async function reachFirstRound(facade: Stage5ExperienceFacade) {
  await facade.initialize();
  await facade.start();
  const prelude = facade.getSnapshot().view;
  if (prelude?.stage !== "PORTRAIT_PRELUDE") {
    throw new Error("Facade did not reach portrait prelude");
  }
  await facade.submitPortraitDescriptors(
    prelude.portraits.flatMap((portrait) => portrait.selectedDescriptors),
  );
  await facade.submitInitialPortrait({
    choice: "early",
    reason: "Synthetic live fixture reason.",
  });
  expect(facade.getSnapshot().view?.stage).toBe("ROUND_1_PAST_SELF");
}

async function reachFinalSignature(facade: Stage5ExperienceFacade) {
  await reachFirstRound(facade);
  for (const response of [
    "Synthetic live response for round one.",
    "Synthetic live response for round two.",
    "Synthetic live response for round three.",
  ]) {
    await facade.submitRound({ response });
    if (facade.getSnapshot().view?.stage === "ROUND_1_DIFF") {
      await facade.decideDiff("reject");
    }
  }
  while (facade.getSnapshot().view?.stage === "SEMANTIC_PLACEMENT") {
    const fragment = facade.getSnapshot().view?.semanticFragments[0];
    if (fragment === undefined) break;
    await facade.chooseFragmentPlacement({
      fragmentId: fragment.id,
      placement: "margin_note",
    });
  }
  expect(facade.getSnapshot().view?.stage).toBe("PORTRAIT_REASSEMBLY");
  await facade.submitFinalPortrait({
    choice: "all_three",
    reason: "Synthetic final portrait reason.",
  });
  expect(facade.getSnapshot().view?.stage).toBe("FINAL_SIGNATURE");
}

function mockContext(context: RequestContext): RequestContext {
  return {
    ...context,
    adapterVersion: MOCK_AGENT_ADAPTER_VERSION,
    promptVersion: null,
  };
}

function failingLocalMockPort(): ProviderNeutralAgentPort {
  const failure = (): AgentExecutionEnvelope => ({
    outcomeKind: "error",
    error: agentCapabilityError(
      "extractUserPrinciple",
      "network_error",
      "synthetic local Mock failure",
    ),
    observation: {
      networkRetries: 0,
      structuredRepairs: 0,
      inputTokens: 0,
      outputTokens: 0,
      latencyMs: 0,
      estimatedCostUsdMicros: 0,
    },
  });
  return {
    executionMode: "mock",
    adapterVersion: "failing-local-mock-v1",
    executeRoundAnalysis: async () => failure(),
    executePlainSemanticReview: async () => failure(),
    summarizePortraitShift: async () => failure(),
  };
}

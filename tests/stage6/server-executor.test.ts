import { describe, expect, it, vi } from "vitest";

import type {
  AgentExecutionEnvelope,
  PlainSemanticReviewPortInput,
  ProviderNeutralAgentPort,
  RoundAnalysisPortInput,
  SummarizePortraitShiftInput,
} from "@/agent";
import {
  AGENT_CONTRACT_VERSION,
  AGENT_RESULT_SCHEMA_VERSIONS,
  DeterministicMockAgentAdapter,
  MOCK_AGENT_ADAPTER_VERSION,
  ROUND_ANALYSIS_BUNDLE_SCHEMA_VERSION,
  agentCapabilityError,
} from "@/agent";
import {
  buildFinalReviewInputMaterials,
  buildRoundAnalysisSemanticMaterials,
} from "@/application";
import {
  createContentAccess,
} from "@/content";
import type { GatedContentAccess } from "@/content/server";
import {
  sealVerifiedContentBundle,
} from "@/content/bundle-projection";
import { evaluateContentGate } from "@/content/evaluate-content-gate";
import type { FinalReviewService } from "@/final-review";
import {
  DEFAULT_CHARLIE_SIGNATURE_REVIEW_SAFETY_POLICY,
  FINAL_REVIEW_SCHEMA_VERSION,
  createGatedFinalReviewEvidenceResolver,
} from "@/final-review";
import type { RequestContext } from "@/runtime";
import {
  bindStage6LiveRequestContext,
  DEEPSEEK_OPENAI_ADAPTER_VERSION,
  STAGE6_TRANSPORT_VERSION,
  type Stage6LiveRequest,
} from "@/stage6";
import { Stage6ServerExecutionError } from "@/stage6/server/errors";
import { createStage6ServerExecutor } from "@/stage6/server/executor";
import { Stage6SessionLedger } from "@/stage6/server/session-ledger";
import { makeRoundAnalysisPortInput } from "../fixtures/agent";
import { makeVerifiedContentBundleMaterial } from "../fixtures/content";

const NOW = "2026-08-09T12:00:00.000Z";

describe("Stage 6 trusted server executor", () => {
  it("returns one strict live terminal artifact and reuses it idempotently", async () => {
    const gatedContent = await verifiedGatedContent();
    const livePort = new FakeLiveAgentPort();
    const liveCall = vi.spyOn(livePort, "executeRoundAnalysis");
    const executor = createStage6ServerExecutor({
      agentPort: livePort,
      finalReviewService: unavailableFinalReviewService(),
      loadGatedContent: async () => gatedContent,
      now: () => NOW,
    });
    const request = await roundRequest(gatedContent);

    const first = await executor(request, executionContext());
    const duplicate = await executor(request, executionContext());

    expect(first).toEqual(duplicate);
    expect(first).toMatchObject({
      terminalKind: "round_analysis_resolved",
      outcomeKind: "resolved",
    });
    if (first.terminalKind !== "round_analysis_resolved") {
      throw new Error("Expected round resolution");
    }
    expect(first.event.receipts).toHaveLength(4);
    expect(
      first.event.receipts.every(
        ({ requestedMode, resolvedMode }) =>
          requestedMode === "live" && resolvedMode === "live",
      ),
    ).toBe(true);
    expect(liveCall).toHaveBeenCalledTimes(1);
  });

  it("falls back from a technical live failure to the deterministic Mock", async () => {
    const gatedContent = await verifiedGatedContent();
    const executor = createStage6ServerExecutor({
      agentPort: failingLivePort(),
      finalReviewService: unavailableFinalReviewService(),
      loadGatedContent: async () => gatedContent,
      now: () => NOW,
    });

    const artifact = await executor(
      await roundRequest(gatedContent),
      executionContext(),
    );

    expect(artifact.terminalKind).toBe("round_analysis_resolved");
    if (artifact.terminalKind !== "round_analysis_resolved") return;
    expect(
      artifact.event.receipts.every(
        ({ requestedMode, resolvedMode, fallbackReason }) =>
          requestedMode === "live" &&
          resolvedMode === "mock" &&
          fallbackReason === "live_execution_failed_mock_fallback",
      ),
    ).toBe(true);
  });

  it("uses the separately-versioned static template if the Mock fallback fails", async () => {
    const gatedContent = await verifiedGatedContent();
    const executor = createStage6ServerExecutor({
      agentPort: failingLivePort(),
      finalReviewService: unavailableFinalReviewService(),
      fallbackPort: failingMockPort(),
      loadGatedContent: async () => gatedContent,
      now: () => NOW,
    });

    const artifact = await executor(
      await roundRequest(gatedContent),
      executionContext(),
    );

    expect(artifact.terminalKind).toBe("round_analysis_resolved");
    if (artifact.terminalKind !== "round_analysis_resolved") return;
    expect(
      artifact.event.receipts.every(
        ({ resolvedMode, fallbackReason }) =>
          resolvedMode === "static_template" &&
          fallbackReason === "mock_fallback_failed_static_template",
      ),
    ).toBe(true);
  });

  it("returns a degradable failed artifact if the ordinary fallback chain is exhausted", async () => {
    const gatedContent = await verifiedGatedContent();
    const executor = createStage6ServerExecutor({
      agentPort: failingLivePort(),
      finalReviewService: unavailableFinalReviewService(),
      fallbackPort: failingMockPort(),
      staticTemplatePort: failingMockPort(),
      loadGatedContent: async () => gatedContent,
      now: () => NOW,
    });

    const artifact = await executor(
      await roundRequest(gatedContent),
      executionContext(),
    );

    expect(artifact).toMatchObject({
      terminalKind: "round_analysis_failed",
      outcomeKind: "failed",
      event: {
        eventType: "ROUND_ANALYSIS_BUNDLE_FAILED",
        receipts: [
          { requestedMode: "live", resolvedMode: "unavailable" },
          { requestedMode: "live", resolvedMode: "unavailable" },
          { requestedMode: "live", resolvedMode: "unavailable" },
          { requestedMode: "live", resolvedMode: "unavailable" },
        ],
      },
    });
  });

  it("rejects a tampered semantic fingerprint before calling the live port", async () => {
    const gatedContent = await verifiedGatedContent();
    const livePort = new FakeLiveAgentPort();
    const liveCall = vi.spyOn(livePort, "executeRoundAnalysis");
    const executor = createStage6ServerExecutor({
      agentPort: livePort,
      finalReviewService: unavailableFinalReviewService(),
      loadGatedContent: async () => gatedContent,
    });
    const request = await roundRequest(gatedContent);
    const tampered = {
      ...request,
      operationContext: {
        ...request.operationContext,
        inputFingerprint: `sha256:${"f".repeat(64)}`,
      },
    } as Stage6LiveRequest;

    await expect(executor(tampered, executionContext())).rejects.toMatchObject({
      code: "invalid_request",
    });
    expect(liveCall).not.toHaveBeenCalled();
  });

  it("rejects placeholder content and mismatched budget continuity", async () => {
    const verified = await verifiedGatedContent();
    const request = await roundRequest(verified);
    const placeholder = {
      ...verified,
      access: { ...verified.access, contentMode: "placeholder" },
    } as unknown as GatedContentAccess;
    const blockedExecutor = createStage6ServerExecutor({
      agentPort: new FakeLiveAgentPort(),
      finalReviewService: unavailableFinalReviewService(),
      loadGatedContent: async () => placeholder,
    });
    await expect(
      blockedExecutor(request, executionContext()),
    ).rejects.toMatchObject({ code: "content_gate_unavailable" });

    const executor = createStage6ServerExecutor({
      agentPort: new FakeLiveAgentPort(),
      finalReviewService: unavailableFinalReviewService(),
      loadGatedContent: async () => verified,
      now: () => NOW,
    });
    await executor(request, executionContext());
    const next = await roundRequest(verified, {
      sessionId: request.sessionId,
      operationId: "operation-2",
      requestId: "request-2",
    });
    await expect(executor(next, executionContext())).rejects.toBeInstanceOf(
      Stage6ServerExecutionError,
    );
    await expect(executor(next, executionContext())).rejects.toMatchObject({
      code: "budget_state_mismatch",
    });
  });

  it("releases a new ledger session after an uncommitted execution failure", async () => {
    const verified = await verifiedGatedContent();
    const loadGatedContent = vi
      .fn<() => Promise<GatedContentAccess>>()
      .mockRejectedValueOnce(new Error("synthetic content outage"))
      .mockResolvedValue(verified);
    const executor = createStage6ServerExecutor({
      agentPort: new FakeLiveAgentPort(),
      finalReviewService: unavailableFinalReviewService(),
      loadGatedContent,
      ledger: new Stage6SessionLedger(1),
      now: () => NOW,
    });

    await expect(
      executor(
        await roundRequest(verified, { sessionId: "failed-session" }),
        executionContext(),
      ),
    ).rejects.toMatchObject({ code: "content_gate_unavailable" });
    await expect(
      executor(
        await roundRequest(verified, { sessionId: "replacement-session" }),
        executionContext(),
      ),
    ).resolves.toMatchObject({ terminalKind: "round_analysis_resolved" });
  });

  it("reconciles only new zero-provider client fallback budget slots", async () => {
    const verified = await verifiedGatedContent();
    const ledger = new Stage6SessionLedger();
    const executor = createStage6ServerExecutor({
      agentPort: new FakeLiveAgentPort(),
      finalReviewService: unavailableFinalReviewService(),
      loadGatedContent: async () => verified,
      ledger,
      now: () => NOW,
    });
    const request = await roundRequest(verified);
    const artifact = await executor(request, executionContext());
    const next = await roundRequest(verified, {
      sessionId: request.sessionId,
      operationId: "operation-after-local-fallback",
      requestId: "request-after-local-fallback",
    });
    const localFallbackCall = {
      logicalCallId: "logical-call-local-plain-fallback",
      budgetSlot: "plain_semantic" as const,
      capability: "executePlainSemanticReview",
      networkRetries: 0,
      structuredRepairs: 0,
      inputTokens: 0,
      outputTokens: 0,
      latencyMs: 0,
      estimatedCostUsdMicros: 0,
    };
    const reconciled = {
      ...next,
      priorBudgetUsage: {
        ...artifact.budgetUsage,
        logicalCalls: [
          ...artifact.budgetUsage.logicalCalls,
          localFallbackCall,
        ],
      },
    };

    expect(ledger.begin(reconciled)).toMatchObject({ kind: "proceed" });
    const forgedSpend = {
      ...reconciled,
      operationContext: {
        ...reconciled.operationContext,
        operationId: "operation-forged-spend",
        requestId: "request-forged-spend",
      },
      priorBudgetUsage: {
        ...reconciled.priorBudgetUsage,
        logicalCalls: [
          ...reconciled.priorBudgetUsage.logicalCalls,
          {
            ...localFallbackCall,
            logicalCallId: "logical-call-forged-spend",
            budgetSlot: "portrait_shift_summary" as const,
            capability: "executePortraitShiftSummary",
            inputTokens: 1,
          },
        ],
      },
    };
    expect(() => ledger.begin(forgedSpend)).toThrowError(
      Stage6ServerExecutionError,
    );
  });

  it("maps a live Final Review technical failure to unavailable without role fallback", async () => {
    const verified = await verifiedGatedContent();
    const finalReviewService = unavailableFinalReviewService();
    const reviewCall = vi.spyOn(finalReviewService, "reviewCharlieSignature");
    const fallbackPort = failingMockPort();
    const fallbackCall = vi.spyOn(fallbackPort, "executeRoundAnalysis");
    const executor = createStage6ServerExecutor({
      agentPort: new FakeLiveAgentPort(),
      finalReviewService,
      fallbackPort,
      staticTemplatePort: fallbackPort,
      loadGatedContent: async () => verified,
      now: () => NOW,
    });

    const artifact = await executor(
      await finalReviewRequest(verified),
      executionContext(),
    );

    expect(artifact).toMatchObject({
      terminalKind: "final_review_failed",
      outcomeKind: "failed",
      event: {
        error: { code: "execution_unavailable" },
        receipts: [{ requestedMode: "live", resolvedMode: "unavailable" }],
      },
    });
    expect(reviewCall).toHaveBeenCalledTimes(1);
    expect(fallbackCall).not.toHaveBeenCalled();
  });

  it("rejects a cancelled late result before commit and permits a clean retry", async () => {
    const verified = await verifiedGatedContent();
    const livePort = new FakeLiveAgentPort();
    const original = livePort.executeRoundAnalysis.bind(livePort);
    const controller = new AbortController();
    let cancelAfterCandidate = true;
    const liveCall = vi
      .spyOn(livePort, "executeRoundAnalysis")
      .mockImplementation(async (portInput, context) => {
        const envelope = await original(portInput, context);
        if (cancelAfterCandidate) controller.abort();
        return envelope;
      });
    const executor = createStage6ServerExecutor({
      agentPort: livePort,
      finalReviewService: unavailableFinalReviewService(),
      loadGatedContent: async () => verified,
      ledger: new Stage6SessionLedger(1),
      now: () => NOW,
    });
    const request = await roundRequest(verified, {
      sessionId: "cancelled-session",
    });

    await expect(
      executor(request, { abortSignal: controller.signal }),
    ).rejects.toMatchObject({ code: "request_cancelled" });
    cancelAfterCandidate = false;
    await expect(
      executor(request, executionContext()),
    ).resolves.toMatchObject({ terminalKind: "round_analysis_resolved" });
    expect(liveCall).toHaveBeenCalledTimes(2);
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

function failingLivePort(): FakeLiveAgentPort {
  const port = new FakeLiveAgentPort();
  port.executeRoundAnalysis = async () => technicalFailure();
  port.executePlainSemanticReview = async () => technicalFailure();
  port.summarizePortraitShift = async () => technicalFailure();
  return port;
}

function failingMockPort(): ProviderNeutralAgentPort {
  return {
    executionMode: "mock",
    adapterVersion: "failing-mock-v1",
    executeRoundAnalysis: async () => technicalFailure(),
    executePlainSemanticReview: async () => technicalFailure(),
    summarizePortraitShift: async () => technicalFailure(),
  };
}

function technicalFailure(): AgentExecutionEnvelope {
  return {
    outcomeKind: "error",
    error: agentCapabilityError(
      "extractUserPrinciple",
      "network_error",
      "synthetic technical failure",
    ),
    observation: {
      networkRetries: 0,
      structuredRepairs: 0,
      inputTokens: 0,
      outputTokens: 0,
      latencyMs: 0,
      estimatedCostUsdMicros: 0,
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
    reviewCharlieSignature: async () => {
      throw new Error("Final Review is not used by this round fixture");
    },
  };
}

async function verifiedGatedContent(): Promise<GatedContentAccess> {
  const { publicBundle } = await sealVerifiedContentBundle(
    makeVerifiedContentBundleMaterial(),
  );
  const access = createContentAccess(publicBundle);
  const evaluation = evaluateContentGate({
    evaluationId: "stage6-server-test-gate",
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
    throw new Error("Verified content fixture did not pass its gate");
  }
  return { evaluation, access };
}

async function roundRequest(
  gatedContent: GatedContentAccess,
  identity: {
    sessionId?: string;
    operationId?: string;
    requestId?: string;
  } = {},
): Promise<Extract<Stage6LiveRequest, { executionKind: "round_analysis" }>> {
  if (gatedContent.access.contentMode !== "verified") {
    throw new Error("Round fixture requires verified content");
  }
  const baseInput = makeRoundAnalysisPortInput();
  const card = gatedContent.access.evidenceCards[0]!;
  const allowedEvidenceIds = [...card.factIds];
  const portInput: RoundAnalysisPortInput = {
    ...baseInput,
    contentBinding: {
      contentBundleId: gatedContent.access.binding.contentBundleId,
      contentBundleVersion: gatedContent.access.binding.contentBundleVersion,
      contentBundleChecksum: gatedContent.access.binding.contentBundleChecksum,
    },
    extractUserPrinciple: {
      ...baseInput.extractUserPrinciple,
      allowedEvidenceIds,
    },
    detectTension: { ...baseInput.detectTension, allowedEvidenceIds },
    generateCharlieResponse: {
      ...baseInput.generateCharlieResponse,
      evidenceContext: {
        contentMode: "verified",
        verifiedFacts: [
          ...gatedContent.access.getVerifiedFactsByIds(allowedEvidenceIds),
        ],
        allowedEvidenceIds,
      },
    },
    proposeDocumentDiff: { ...baseInput.proposeDocumentDiff, allowedEvidenceIds },
  };
  const safetyPolicy = {
    prohibitedClaims: [...card.prohibitedClaims],
    prohibitedInferences: [],
    allowedQuotedText: [],
  };
  const materials = buildRoundAnalysisSemanticMaterials({
    portInput,
    safetyPolicy,
  });
  const base = {
    operationId: identity.operationId ?? "operation-stage6-server-1",
    requestId: identity.requestId ?? "request-stage6-server-1",
    requestedMode: "live" as const,
    capability: "executeRoundAnalysis",
    attempt: 1,
    inputFingerprint: `sha256:${"0".repeat(64)}` as const,
    stage: "ROUND_1_PAST_SELF" as const,
    stageInstanceId: "stage-instance-stage6-server-1",
    bindings: {
      revisions: portInput.revisions,
      content: portInput.contentBinding,
    },
  };
  const bound = await bindStage6LiveRequestContext({
    base,
    capability: "executeRoundAnalysis",
    semanticMaterial: materials.operation,
    resultSchemaVersion: ROUND_ANALYSIS_BUNDLE_SCHEMA_VERSION,
    agentContractVersion: AGENT_CONTRACT_VERSION,
    adapterVersion: DEEPSEEK_OPENAI_ADAPTER_VERSION,
  });
  const { promptVersion: _prompt, adapterVersion: _adapter, ...operationContext } =
    bound;
  void _prompt;
  void _adapter;
  const { evidenceContext: _evidence, ...generateCharlieResponse } =
    portInput.generateCharlieResponse;
  void _evidence;
  return {
    stage6TransportVersion: STAGE6_TRANSPORT_VERSION,
    executionKind: "round_analysis",
    sessionId: identity.sessionId ?? "session-stage6-server-1",
    priorBudgetUsage: { budgetVersion: "0.1.0", logicalCalls: [] },
    operationContext: { ...operationContext, requestedMode: "live" },
    input: { ...portInput, generateCharlieResponse },
  };
}

async function finalReviewRequest(
  gatedContent: GatedContentAccess,
): Promise<
  Extract<Stage6LiveRequest, { executionKind: "charlie_signature_review" }>
> {
  if (gatedContent.access.contentMode !== "verified") {
    throw new Error("Final Review fixture requires verified content");
  }
  const allowedEvidenceIds = gatedContent.access.evidenceCards.map(
    ({ id }) => id,
  );
  const reviewInput = {
    preciseRevisionId: "precise-final-stage6",
    plainRevisionId: "plain-final-stage6",
    preciseText: "Synthetic precise text with an explicitly unresolved tension.",
    plainText: "Synthetic plain text that preserves the unresolved tension.",
    allowedEvidenceIds,
    unresolvedDissents: [],
    contentBundleId: gatedContent.access.binding.contentBundleId,
    contentBundleVersion: gatedContent.access.binding.contentBundleVersion,
    contentBundleChecksum: gatedContent.access.binding.contentBundleChecksum,
    finalReviewSchemaVersion: FINAL_REVIEW_SCHEMA_VERSION,
  };
  const resolution = await createGatedFinalReviewEvidenceResolver(
    gatedContent,
  ).resolveEvidence(reviewInput);
  if (resolution.resolutionKind !== "resolved") {
    throw new Error("Final Review fixture evidence did not resolve");
  }
  const materials = buildFinalReviewInputMaterials({
    reviewInput,
    evidenceContext: resolution.evidenceContext,
    safetyPolicy: DEFAULT_CHARLIE_SIGNATURE_REVIEW_SAFETY_POLICY,
  });
  const base = {
    operationId: "operation-stage6-final-review-1",
    requestId: "request-stage6-final-review-1",
    requestedMode: "live" as const,
    capability: "executeCharlieSignatureReview",
    attempt: 1,
    inputFingerprint: `sha256:${"0".repeat(64)}` as const,
    stage: "FINAL_SIGNATURE" as const,
    stageInstanceId: "stage-instance-stage6-final-review-1",
    bindings: {
      revisions: {
        preciseRevisionId: reviewInput.preciseRevisionId,
        plainRevisionId: reviewInput.plainRevisionId,
      },
      content: {
        contentBundleId: reviewInput.contentBundleId,
        contentBundleVersion: reviewInput.contentBundleVersion,
        contentBundleChecksum: reviewInput.contentBundleChecksum,
      },
    },
  };
  const bound = await bindStage6LiveRequestContext({
    base,
    capability: "executeCharlieSignatureReview",
    semanticMaterial: materials.operation,
    resultSchemaVersion: FINAL_REVIEW_SCHEMA_VERSION,
    agentContractVersion: null,
    adapterVersion: DEEPSEEK_OPENAI_ADAPTER_VERSION,
  });
  const {
    promptVersion: _prompt,
    adapterVersion: _adapter,
    ...operationContext
  } = bound;
  void _prompt;
  void _adapter;
  return {
    stage6TransportVersion: STAGE6_TRANSPORT_VERSION,
    executionKind: "charlie_signature_review",
    sessionId: "session-stage6-final-review-1",
    priorBudgetUsage: { budgetVersion: "0.1.0", logicalCalls: [] },
    operationContext: { ...operationContext, requestedMode: "live" },
    input: reviewInput,
  };
}

function mockContext(context: RequestContext): RequestContext {
  return {
    ...context,
    adapterVersion: MOCK_AGENT_ADAPTER_VERSION,
    promptVersion: null,
  };
}

function executionContext() {
  return { abortSignal: new AbortController().signal };
}

void AGENT_RESULT_SCHEMA_VERSIONS;

import { describe, expect, it, vi } from "vitest";

import {
  AGENT_CONTRACT_VERSION,
  AGENT_RESULT_SCHEMA_VERSIONS,
  DeterministicMockAgentAdapter,
  DEFAULT_MOCK_AGENT_FIXTURE,
  MOCK_AGENT_ADAPTER_VERSION,
  PLAIN_SEMANTIC_BUNDLE_SCHEMA_VERSION,
  ROUND_ANALYSIS_BUNDLE_SCHEMA_VERSION,
  type ProviderNeutralAgentPort,
  type RoundAnalysisPortInput,
} from "@/agent";
import {
  buildFinalReviewInputMaterials,
  buildPlainSemanticInputMaterials,
  buildPortraitSummaryInputMaterials,
  buildRoundAnalysisSemanticMaterials,
  computeStage3RequestFingerprint,
  orchestrateCharlieSignatureReview,
  orchestratePlainSemanticReview,
  orchestratePortraitShiftSummary,
  orchestrateRoundAnalysis,
  type RoundAnalysisFallbackPlan,
} from "@/application";
import {
  DEFAULT_CHARLIE_SIGNATURE_REVIEW_SAFETY_POLICY,
  DeterministicMockFinalReviewService,
  FINAL_REVIEW_SCHEMA_VERSION,
  type FinalReviewService,
} from "@/final-review";
import {
  AGENT_TEST_CONTENT_BINDING,
  AGENT_TEST_FACT,
  AGENT_TEST_VALIDATION_CONTEXT,
  makePlainSemanticPortInput,
  makePortraitSummaryInput,
  makeRoundAnalysisPortInput,
} from "../fixtures/agent";
import {
  APPLICATION_COMPLETED_AT,
  APPLICATION_STARTED_AT,
  applicationDigest,
  makeApplicationOperationBoundary,
  makeApplicationRequestContext,
  makeLogicalCallBudgetUsage,
  makeSequenceClock,
} from "../fixtures/application";
import {
  makeCharlieSignatureReviewContext,
  makeCharlieSignatureReviewInput,
  makeMockFinalReviewFixture,
  makePlaceholderFinalReviewEvidenceContext,
} from "../fixtures/final-review-stage3";

const UNAVAILABLE_FALLBACK = Object.freeze({
  kind: "unavailable",
  fallbackReason: "fixture_fallback_unavailable",
} as const);

const ZERO_AGENT_OBSERVATION = Object.freeze({
  networkRetries: 0,
  structuredRepairs: 0,
  inputTokens: 0,
  outputTokens: 0,
  latencyMs: 0,
  estimatedCostUsdMicros: 0,
});

describe("RoundAnalysisOrchestrator", () => {
  it.each([
    ["round1", "round_1"],
    ["round2", "round_2"],
    ["round3", "round_3"],
  ] as const)(
    "maps Domain %s to budget slot %s and emits one complete atomic event",
    async (roundId, budgetSlot) => {
      const setup = await makeRoundSetup(roundId, budgetSlot);
      const adapter = new DeterministicMockAgentAdapter();
      const call = vi.spyOn(adapter, "executeRoundAnalysis");

      const outcome = await orchestrateRoundAnalysis({
        ...setup,
        port: adapter,
      });

      expect(call).toHaveBeenCalledOnce();
      expect(outcome.outcomeKind).toBe("resolved");
      if (outcome.outcomeKind !== "resolved") return;
      expect(outcome.event.eventType).toBe("ROUND_ANALYSIS_BUNDLE_RESOLVED");
      expect(outcome.event.bundle.roundId).toBe(roundId);
      expect(outcome.event.receipts).toHaveLength(4);
      expect(outcome.event.receipts.map(({ capability }) => capability)).toEqual([
        "extractUserPrinciple",
        "detectTension",
        "generateCharlieResponse",
        "proposeDocumentDiff",
      ]);
      expect(
        outcome.event.receipts.every(
          (receipt) =>
            receipt.resolvedMode === "mock" &&
            receipt.agentContractVersion === AGENT_CONTRACT_VERSION,
        ),
      ).toBe(true);
    },
  );

  it("rejects an invalid Domain round identifier before calling the adapter", async () => {
    const setup = await makeRoundSetup("round1", "round_1");
    const invalidPortInput = {
      ...setup.portInput,
      extractUserPrinciple: {
        ...setup.portInput.extractUserPrinciple,
        roundId: "round_1",
      },
    } as unknown as RoundAnalysisPortInput;
    const adapter = new DeterministicMockAgentAdapter();
    const call = vi.spyOn(adapter, "executeRoundAnalysis");

    const outcome = await orchestrateRoundAnalysis({
      ...setup,
      portInput: invalidPortInput,
      port: adapter,
    });

    expect(outcome).toMatchObject({
      outcomeKind: "preflight_rejected",
      reason: "invalid_context",
    });
    expect(call).not.toHaveBeenCalled();
  });

  it("rejects stale subcapability revision bindings before calling the adapter", async () => {
    const setup = await makeRoundSetup("round1", "round_1");
    const port = portReturning({ round: {} });
    const stalePortInput: RoundAnalysisPortInput = {
      ...setup.portInput,
      detectTension: {
        ...setup.portInput.detectTension,
        preciseRevisionId: "precise-stale",
      },
    };

    const outcome = await orchestrateRoundAnalysis({
      ...setup,
      port,
      portInput: stalePortInput,
    });

    expect(outcome).toMatchObject({
      outcomeKind: "preflight_rejected",
      reason: "invalid_context",
    });
    expect(port.executeRoundAnalysis).not.toHaveBeenCalled();
  });

  it("rejects placeholder evidence allowlists before calling the adapter", async () => {
    const setup = await makeRoundSetup("round1", "round_1");
    const port = portReturning({ round: {} });
    const portInput: RoundAnalysisPortInput = {
      ...setup.portInput,
      generateCharlieResponse: {
        ...setup.portInput.generateCharlieResponse,
        evidenceContext: {
          contentMode: "placeholder",
          evidenceCards: [],
          allowedEvidenceIds: [],
        },
      },
    };

    const outcome = await orchestrateRoundAnalysis({
      ...setup,
      portInput,
      port,
    });

    expect(outcome).toMatchObject({
      outcomeKind: "preflight_rejected",
      reason: "invalid_context",
    });
    expect(port.executeRoundAnalysis).not.toHaveBeenCalled();
  });

  it("rejects verified child evidence outside the resolver trusted allowlist", async () => {
    const setup = await makeRoundSetup("round1", "round_1");
    const port = portReturning({ round: {} });
    const portInput: RoundAnalysisPortInput = {
      ...setup.portInput,
      generateCharlieResponse: {
        ...setup.portInput.generateCharlieResponse,
        evidenceContext: {
          contentMode: "verified",
          verifiedFacts: [AGENT_TEST_FACT],
          allowedEvidenceIds: [],
        },
      },
    };

    const outcome = await orchestrateRoundAnalysis({
      ...setup,
      portInput,
      port,
    });

    expect(outcome).toMatchObject({
      outcomeKind: "preflight_rejected",
      reason: "invalid_context",
    });
    expect(port.executeRoundAnalysis).not.toHaveBeenCalled();
  });

  it("uses an explicit fallback for only the invalid slot and never emits partial success", async () => {
    const setup = await makeRoundSetup("round1", "round_1");
    const fixtureAdapter = new DeterministicMockAgentAdapter();
    const validExecution = await fixtureAdapter.executeRoundAnalysis(
      setup.portInput,
      setup.boundary.operationContext,
    );
    if (validExecution.outcomeKind !== "candidate") {
      throw new Error("Mock Agent must return a Candidate");
    }
    const validCandidate = validExecution.candidate as Record<string, unknown> & {
      charlieResponse: Record<string, unknown>;
    };
    const invalidCandidate = structuredClone(validCandidate);
    invalidCandidate.charlieResponse.question = "First question? Second question?";
    const port = portReturning({ round: invalidCandidate });
    const fallbacks: RoundAnalysisFallbackPlan = {
      ...unavailableRoundFallbacks(),
      generateCharlieResponse: {
        kind: "candidate",
        candidate: validCandidate.charlieResponse,
        binding: {
          inputFingerprint:
            setup.capabilityContexts.generateCharlieResponse.inputFingerprint,
          bindings: setup.capabilityContexts.generateCharlieResponse.bindings,
          roundId: "round1",
        },
        observation: ZERO_AGENT_OBSERVATION,
        executionIdentity: {
          adapterVersion: "static-template-0.1.0",
          promptVersion: null,
        },
        resolvedMode: "static_template",
        fallbackReason: "primary_question_validation_failed",
      },
    };

    const outcome = await orchestrateRoundAnalysis({
      ...setup,
      port,
      fallbacks,
    });

    expect(port.executeRoundAnalysis).toHaveBeenCalledOnce();
    expect(outcome.outcomeKind).toBe("resolved");
    if (outcome.outcomeKind !== "resolved") return;
    const responseReceipt = outcome.event.receipts.find(
      ({ capability }) => capability === "generateCharlieResponse",
    );
    expect(responseReceipt).toMatchObject({
      resolvedMode: "static_template",
      outcome: "succeeded",
      fallbackReason: "primary_question_validation_failed",
    });
    expect(outcome.event).toHaveProperty("bundle.documentDiff");
  });

  it("fails the whole bundle when an invalid required slot has no safe fallback", async () => {
    const setup = await makeRoundSetup("round1", "round_1");
    const fixtureAdapter = new DeterministicMockAgentAdapter();
    const execution = await fixtureAdapter.executeRoundAnalysis(
      setup.portInput,
      setup.boundary.operationContext,
    );
    if (execution.outcomeKind !== "candidate") {
      throw new Error("Mock Agent must return a Candidate");
    }
    const candidate = execution.candidate as Record<string, unknown> & {
      charlieResponse: Record<string, unknown>;
    };
    const invalidCandidate = structuredClone(candidate);
    invalidCandidate.charlieResponse.question = "First question? Second question?";
    const port = portReturning({ round: invalidCandidate });

    const outcome = await orchestrateRoundAnalysis({
      ...setup,
      port,
    });

    expect(port.executeRoundAnalysis).toHaveBeenCalledOnce();
    expect(outcome.outcomeKind).toBe("failed");
    if (outcome.outcomeKind !== "failed") return;
    expect(outcome.event.eventType).toBe("ROUND_ANALYSIS_BUNDLE_FAILED");
    expect(outcome.event).not.toHaveProperty("bundle");
    expect(outcome.event.receipts).toHaveLength(4);
    expect(outcome.event.receipts.map(({ outcome: receiptOutcome }) => receiptOutcome)).toEqual([
      "succeeded",
      "succeeded",
      "failed",
      "skipped",
    ]);
  });

  it("rejects a fallback Candidate whose trusted fingerprint binding is stale", async () => {
    const setup = await makeRoundSetup("round1", "round_1");
    const fixtureAdapter = new DeterministicMockAgentAdapter();
    const execution = await fixtureAdapter.executeRoundAnalysis(
      setup.portInput,
      setup.boundary.operationContext,
    );
    if (execution.outcomeKind !== "candidate") {
      throw new Error("Mock Agent must return a Candidate");
    }
    const candidate = execution.candidate as Record<string, unknown> & {
      charlieResponse: Record<string, unknown>;
    };
    const invalidCandidate = structuredClone(candidate);
    invalidCandidate.charlieResponse.question = "First question? Second question?";
    const port = portReturning({ round: invalidCandidate });

    const outcome = await orchestrateRoundAnalysis({
      ...setup,
      port,
      fallbacks: {
        ...unavailableRoundFallbacks(),
        generateCharlieResponse: {
          kind: "candidate",
          candidate: candidate.charlieResponse,
          binding: {
            inputFingerprint: applicationDigest("f"),
            bindings:
              setup.capabilityContexts.generateCharlieResponse.bindings,
            roundId: "round1",
          },
          observation: ZERO_AGENT_OBSERVATION,
          executionIdentity: {
            adapterVersion: "mock-fallback-0.1.0",
            promptVersion: null,
          },
          resolvedMode: "mock",
          fallbackReason: "candidate_fixture",
        },
      },
    });

    expect(outcome.outcomeKind).toBe("failed");
    if (outcome.outcomeKind !== "failed") return;
    expect(outcome.event.error).toMatchObject({
      capability: "generateCharlieResponse",
      code: "stale_revision",
    });
    expect(
      outcome.event.receipts.find(
        ({ capability }) => capability === "generateCharlieResponse",
      ),
    ).toMatchObject({
      resolvedMode: "unavailable",
      fallbackReason: "fallback_binding_mismatch",
    });
  });

  it("degrades before the adapter and resolves every slot through explicit fallbacks", async () => {
    const setup = await makeRoundSetup("round1", "round_1");
    const fixtureAdapter = new DeterministicMockAgentAdapter();
    const execution = await fixtureAdapter.executeRoundAnalysis(
      setup.portInput,
      setup.boundary.operationContext,
    );
    if (execution.outcomeKind !== "candidate") {
      throw new Error("Mock Agent must return a Candidate");
    }
    const candidate = execution.candidate as Record<
      "principle" | "tension" | "charlieResponse" | "documentDiff",
      unknown
    >;
    const port = portReturning({ round: candidate });
    const fallback = (
      candidateSlot: unknown,
      context: (typeof setup.capabilityContexts)[keyof typeof setup.capabilityContexts],
    ) => ({
      kind: "candidate",
      candidate: candidateSlot,
      binding: {
        inputFingerprint: context.inputFingerprint,
        bindings: context.bindings,
        roundId: "round1",
      },
      observation: ZERO_AGENT_OBSERVATION,
      executionIdentity: {
        adapterVersion: "static-template-0.1.0",
        promptVersion: null,
      },
      resolvedMode: "static_template",
      fallbackReason: "base_budget_degraded",
    } as const);
    const boundary = makeApplicationOperationBoundary({
      operationContext: setup.boundary.operationContext,
      budgetSlot: "round_1",
      priorLogicalCalls: [
        makeLogicalCallBudgetUsage("plain_semantic", {
          inputTokens: 37_000,
          outputTokens: 0,
          latencyMs: 0,
          estimatedCostUsdMicros: 0,
        }),
      ],
      clock: makeSequenceClock(
        APPLICATION_STARTED_AT,
        APPLICATION_COMPLETED_AT,
      ),
    });

    const outcome = await orchestrateRoundAnalysis({
      ...setup,
      boundary,
      port,
      fallbacks: {
        extractUserPrinciple: fallback(
          candidate.principle,
          setup.capabilityContexts.extractUserPrinciple,
        ),
        detectTension: fallback(
          candidate.tension,
          setup.capabilityContexts.detectTension,
        ),
        generateCharlieResponse: fallback(
          candidate.charlieResponse,
          setup.capabilityContexts.generateCharlieResponse,
        ),
        proposeDocumentDiff: fallback(
          candidate.documentDiff,
          setup.capabilityContexts.proposeDocumentDiff,
        ),
      },
    });

    expect(port.executeRoundAnalysis).not.toHaveBeenCalled();
    expect(outcome.outcomeKind).toBe("resolved");
    if (outcome.outcomeKind !== "resolved") return;
    expect(outcome.budgetEvaluation.decision).toBe("degrade");
    expect(
      outcome.event.receipts.every(
        ({ resolvedMode }) => resolvedMode === "static_template",
      ),
    ).toBe(true);
  });

  it("guards stale operations and capability fingerprints before the adapter", async () => {
    const stale = await makeRoundSetup("round1", "round_1", {
      activeOperationOverrides: { operationId: "stale-operation" },
    });
    const stalePort = portReturning({ round: {} });
    const staleOutcome = await orchestrateRoundAnalysis({
      ...stale,
      port: stalePort,
    });
    expect(staleOutcome).toMatchObject({
      outcomeKind: "preflight_rejected",
      reason: "operation_guard_rejected",
    });
    expect(stalePort.executeRoundAnalysis).not.toHaveBeenCalled();

    const duplicate = await makeRoundSetup("round1", "round_1");
    const duplicateContext = makeApplicationRequestContext(
      "detectTension",
      {
        ...duplicate.capabilityContexts.detectTension,
        inputFingerprint:
          duplicate.capabilityContexts.extractUserPrinciple.inputFingerprint,
      },
    );
    const duplicatePort = portReturning({ round: {} });
    const duplicateOutcome = await orchestrateRoundAnalysis({
      ...duplicate,
      capabilityContexts: {
        ...duplicate.capabilityContexts,
        detectTension: duplicateContext,
      },
      port: duplicatePort,
    });
    expect(duplicateOutcome).toMatchObject({
      outcomeKind: "preflight_rejected",
      reason: "invalid_context",
    });
    expect(duplicatePort.executeRoundAnalysis).not.toHaveBeenCalled();
  });

  it("binds a live-to-Mock route to the actual Mock port identity", async () => {
    const setup = await makeRoundSetup("round1", "round_1", {
      requestedMode: "live",
      availability: { live: false, mock: true },
    });
    const livePort = {
      ...portReturning({ round: {} }),
      executionMode: "live" as const,
    };
    const wrongPort = await orchestrateRoundAnalysis({
      ...setup,
      port: livePort,
    });
    expect(wrongPort).toMatchObject({
      outcomeKind: "preflight_rejected",
      reason: "invalid_context",
    });
    expect(livePort.executeRoundAnalysis).not.toHaveBeenCalled();

    const mockAdapter = new DeterministicMockAgentAdapter();
    const mockCall = vi.spyOn(mockAdapter, "executeRoundAnalysis");
    const resolved = await orchestrateRoundAnalysis({
      ...setup,
      boundary: makeApplicationOperationBoundary({
        operationContext: setup.boundary.operationContext,
        budgetSlot: "round_1",
        availability: { live: false, mock: true },
        clock: standardClock(),
      }),
      port: mockAdapter,
    });
    expect(mockCall).toHaveBeenCalledOnce();
    expect(resolved.outcomeKind).toBe("resolved");
    if (resolved.outcomeKind === "resolved") {
      expect(
        resolved.event.receipts.every(
          ({ resolvedMode, fallbackReason }) =>
            resolvedMode === "mock" &&
            fallbackReason === "live_adapter_unavailable",
        ),
      ).toBe(true);
    }
  });

  it("rejects an absolute budget breach before the adapter with four typed receipts", async () => {
    const setup = await makeRoundSetup("round1", "round_1");
    const port = portReturning({ round: {} });
    const boundary = makeApplicationOperationBoundary({
      operationContext: setup.boundary.operationContext,
      budgetSlot: "round_1",
      priorLogicalCalls: [
        makeLogicalCallBudgetUsage("plain_semantic", {
          inputTokens: 111_001,
          outputTokens: 0,
          latencyMs: 0,
          estimatedCostUsdMicros: 0,
        }),
      ],
      clock: makeSequenceClock(APPLICATION_STARTED_AT),
    });

    const outcome = await orchestrateRoundAnalysis({
      ...setup,
      boundary,
      port,
    });

    expect(port.executeRoundAnalysis).not.toHaveBeenCalled();
    expect(outcome.outcomeKind).toBe("failed");
    if (outcome.outcomeKind !== "failed") return;
    expect(outcome.event.error.code).toBe("budget_exhausted");
    expect(outcome.event.receipts).toHaveLength(4);
    expect(
      outcome.event.receipts.every(
        ({ resolvedMode }) => resolvedMode === "unavailable",
      ),
    ).toBe(true);
  });
});

describe("PlainSemanticReviewOrchestrator", () => {
  it("performs one call and exposes only a complete plain-plus-semantic bundle", async () => {
    const setup = await makePlainSetup();
    const adapter = new DeterministicMockAgentAdapter();
    const call = vi.spyOn(adapter, "executePlainSemanticReview");

    const outcome = await orchestratePlainSemanticReview({
      ...setup,
      port: adapter,
    });

    expect(call).toHaveBeenCalledOnce();
    expect(outcome.outcomeKind).toBe("resolved");
    if (outcome.outcomeKind !== "resolved") return;
    expect(outcome.event.eventType).toBe("PLAIN_SEMANTIC_BUNDLE_RESOLVED");
    expect(outcome.event.bundle).toHaveProperty("plainRevision");
    expect(outcome.event.bundle).toHaveProperty("semanticReview");
    expect(outcome.event.receipts).toHaveLength(1);
  });

  it("emits no partial bundle when the required Candidate is invalid", async () => {
    const setup = await makePlainSetup();
    const port = portReturning({ plain: { plainTextCandidate: {} } });
    const outcome = await orchestratePlainSemanticReview({
      ...setup,
      port,
    });

    expect(outcome.outcomeKind).toBe("failed");
    if (outcome.outcomeKind !== "failed") return;
    expect(outcome.event.eventType).toBe("PLAIN_SEMANTIC_BUNDLE_FAILED");
    expect(outcome.event).not.toHaveProperty("bundle");
  });

  it("commits proposal outcomes in the same atomic bundle without another main call", async () => {
    const setup = await makePlainSetup();
    const adapter = new DeterministicMockAgentAdapter({
      ...DEFAULT_MOCK_AGENT_FIXTURE,
      semanticRestorationMode: "proposal",
    });
    const call = vi.spyOn(adapter, "executePlainSemanticReview");
    const outcome = await orchestratePlainSemanticReview({
      ...setup,
      port: adapter,
    });

    expect(call).toHaveBeenCalledOnce();
    expect(outcome.outcomeKind).toBe("resolved");
    if (outcome.outcomeKind !== "resolved") return;
    expect(outcome.event.bundle).toMatchObject({
      semanticReview: {
        semanticFragments: [
          { id: "stage3:v1:semantic_fragment:0:operation-1" },
        ],
      },
      restorationOutcomes: [
        {
          kind: "proposal",
          fragmentId: "stage3:v1:semantic_fragment:0:operation-1",
          proposal: {
            proposalId:
              "stage3:v1:semantic_restoration_proposal:0:operation-1",
          },
        },
      ],
    });
    expect(outcome.event.receipts).toHaveLength(1);
    expect(outcome.budgetUsage.logicalCalls).toHaveLength(1);
    expect(outcome.budgetUsage.logicalCalls[0]?.budgetSlot).toBe(
      "plain_semantic",
    );
    expect(outcome.budgetEvaluation.totals.logicalMainCalls).toBe(1);
  });
});

describe("PortraitShiftSummaryOrchestrator", () => {
  it("validates a summary and records one capability receipt", async () => {
    const setup = await makePortraitSetup();
    const adapter = new DeterministicMockAgentAdapter();
    const outcome = await orchestratePortraitShiftSummary({
      ...setup,
      port: adapter,
    });

    expect(outcome.outcomeKind).toBe("resolved");
    if (outcome.outcomeKind !== "resolved") return;
    expect(outcome.event.eventType).toBe("PORTRAIT_SHIFT_SUMMARY_SUCCEEDED");
    expect(outcome.event.receipts[0]).toMatchObject({
      capability: "summarizePortraitShift",
      resolvedMode: "mock",
    });
  });
});

describe("Final Review orchestration", () => {
  it("freezes the trusted semantic snapshot and does not mislabel a service throw as a network error", async () => {
    const setup = await makeFinalReviewSetup();
    let mutationWasBlocked = false;
    const service: FinalReviewService = {
      executionMode: "mock",
      adapterVersion: "0.1.0",
      reviewCharlieSignature: vi.fn(
        async (reviewInput, reviewContext, trustedExecution) => {
          mutationWasBlocked = [
            Reflect.set(reviewInput, "preciseRevisionId", "mutated-revision"),
            Reflect.set(
              reviewContext.bindings.revisions,
              "preciseRevisionId",
              "mutated-revision",
            ),
            Reflect.set(
              trustedExecution.evidenceContext,
              "contentBundleVersion",
              "mutated-version",
            ),
            Reflect.set(
              trustedExecution.safetyPolicy.prohibitedClaims,
              "0",
              "mutated-policy",
            ),
          ].every((mutationSucceeded) => !mutationSucceeded);
          throw new Error("malicious service mutation attempt");
        },
      ),
    };

    const outcome = await orchestrateCharlieSignatureReview({
      ...setup,
      service,
    });

    expect(mutationWasBlocked).toBe(true);
    expect(outcome.outcomeKind).toBe("failed");
    if (outcome.outcomeKind !== "failed") return;
    expect(outcome.event.error.code).toBe("execution_unavailable");
    expect(outcome.event.error.code).not.toBe("network_error");
  });

  it("rejects an adapterVersion mismatch before calling Final Review", async () => {
    const setup = await makeFinalReviewSetup({
      adapterVersion: "stale-final-review-adapter",
    });
    const service = new DeterministicMockFinalReviewService({
      fixture: makeMockFinalReviewFixture("signed"),
    });
    const call = vi.spyOn(service, "reviewCharlieSignature");

    const outcome = await orchestrateCharlieSignatureReview({
      ...setup,
      boundary: {
        ...setup.boundary,
        clock: makeSequenceClock(APPLICATION_STARTED_AT),
      },
      service,
    });

    expect(outcome).toMatchObject({
      outcomeKind: "preflight_rejected",
      reason: "invalid_context",
    });
    expect(call).not.toHaveBeenCalled();
  });

  it("keeps the business input and child RequestContext separate and emits a reviewed event", async () => {
    const setup = await makeFinalReviewSetup();
    const service = new DeterministicMockFinalReviewService({
      fixture: makeMockFinalReviewFixture("signed"),
    });
    const call = vi.spyOn(service, "reviewCharlieSignature");
    const outcome = await orchestrateCharlieSignatureReview({
      ...setup,
      service,
    });

    expect(call).toHaveBeenCalledOnce();
    expect(outcome.outcomeKind).toBe("resolved");
    if (outcome.outcomeKind !== "resolved") return;
    expect(outcome.event.eventType).toBe(
      "CHARLIE_SIGNATURE_REVIEW_RESOLVED",
    );
    expect(outcome.event.result.status).toBe("signed");
    expect(outcome.event.receipts[0]).toMatchObject({
      capability: "reviewCharlieSignature",
      resolvedMode: "mock",
    });
    expect(outcome.event.receipts[0]).not.toHaveProperty("agentContractVersion");
  });

  it("never turns an unavailable live route into a Mock role decision", async () => {
    const setup = await makeFinalReviewSetup({
      requestedMode: "live",
      availability: { live: false, mock: true },
    });
    const service = new DeterministicMockFinalReviewService({
      fixture: makeMockFinalReviewFixture("signed"),
    });
    const call = vi.spyOn(service, "reviewCharlieSignature");
    const outcome = await orchestrateCharlieSignatureReview({
      ...setup,
      service,
    });

    expect(call).not.toHaveBeenCalled();
    expect(outcome.outcomeKind).toBe("failed");
    if (outcome.outcomeKind !== "failed") return;
    expect(outcome.event.eventType).toBe("CHARLIE_SIGNATURE_REVIEW_FAILED");
    expect(outcome.event.error.code).toBe("execution_unavailable");
    expect(outcome.event.receipts[0].resolvedMode).toBe("unavailable");
  });
});

async function makeRoundSetup(
  roundId: "round1" | "round2" | "round3",
  budgetSlot: "round_1" | "round_2" | "round_3",
  options: {
    activeOperationOverrides?: Record<string, unknown>;
    requestedMode?: "mock" | "live";
    availability?: { live: boolean; mock: boolean };
  } = {},
) {
  const base = makeRoundAnalysisPortInput();
  const portInput: RoundAnalysisPortInput = {
    ...base,
    extractUserPrinciple: { ...base.extractUserPrinciple, roundId },
    detectTension: { ...base.detectTension, roundId },
    generateCharlieResponse: { ...base.generateCharlieResponse, roundId },
  };
  const stage =
    roundId === "round1"
      ? "ROUND_1_PAST_SELF"
      : roundId === "round2"
        ? "ROUND_2_FORECAST"
        : "ROUND_3_RELATIONSHIP";
  const operationContextBase = applicationContext({
    capability: "executeRoundAnalysis",
    fingerprint: "0",
    stage,
    requestedMode: options.requestedMode,
  });
  const capabilityContextBases = {
    extractUserPrinciple: applicationContext({
      capability: "extractUserPrinciple",
      fingerprint: "1",
      stage,
      requestedMode: options.requestedMode,
    }),
    detectTension: applicationContext({
      capability: "detectTension",
      fingerprint: "2",
      stage,
      requestedMode: options.requestedMode,
    }),
    generateCharlieResponse: applicationContext({
      capability: "generateCharlieResponse",
      fingerprint: "3",
      stage,
      requestedMode: options.requestedMode,
    }),
    proposeDocumentDiff: applicationContext({
      capability: "proposeDocumentDiff",
      fingerprint: "4",
      stage,
      requestedMode: options.requestedMode,
    }),
  } as const;
  const semanticMaterials = buildRoundAnalysisSemanticMaterials({
    portInput,
    safetyPolicy: AGENT_TEST_VALIDATION_CONTEXT.safetyPolicy,
  });
  const [operationContext, ...childContexts] = await Promise.all([
    withSemanticFingerprint(
      operationContextBase,
      semanticMaterials.operation,
      ROUND_ANALYSIS_BUNDLE_SCHEMA_VERSION,
    ),
    ...(
      [
        "extractUserPrinciple",
        "detectTension",
        "generateCharlieResponse",
        "proposeDocumentDiff",
      ] as const
    ).map((capability) =>
      withSemanticFingerprint(
        capabilityContextBases[capability],
        semanticMaterials[capability],
        AGENT_RESULT_SCHEMA_VERSIONS[capability],
      ),
    ),
  ]);
  const capabilityContexts = {
    extractUserPrinciple: childContexts[0],
    detectTension: childContexts[1],
    generateCharlieResponse: childContexts[2],
    proposeDocumentDiff: childContexts[3],
  } as const;
  return {
    boundary: makeApplicationOperationBoundary({
      operationContext,
      budgetSlot,
      activeOperationOverrides: options.activeOperationOverrides,
      availability: options.availability,
      clock: standardClock(),
    }),
    portInput,
    validationContext: AGENT_TEST_VALIDATION_CONTEXT,
    capabilityContexts,
    fallbacks: unavailableRoundFallbacks(),
  };
}

async function makePlainSetup() {
  const portInput = makePlainSemanticPortInput();
  const operationContextBase = applicationContext({
    capability: "executePlainSemanticReview",
    fingerprint: "5",
    stage: "PLAIN_REWRITE",
    plainRevisionId: portInput.targetPlainRevisionId,
  });
  const capabilityContextBase = applicationContext({
    capability: "compareSemanticDrift",
    fingerprint: "6",
    stage: "PLAIN_REWRITE",
    plainRevisionId: portInput.targetPlainRevisionId,
  });
  const semanticMaterials = buildPlainSemanticInputMaterials({
    portInput,
    safetyPolicy: AGENT_TEST_VALIDATION_CONTEXT.safetyPolicy,
  });
  const [operationContext, capabilityContext] = await Promise.all([
    withSemanticFingerprint(
      operationContextBase,
      semanticMaterials.operation,
      PLAIN_SEMANTIC_BUNDLE_SCHEMA_VERSION,
    ),
    withSemanticFingerprint(
      capabilityContextBase,
      semanticMaterials.compareSemanticDrift,
      AGENT_RESULT_SCHEMA_VERSIONS.compareSemanticDrift,
    ),
  ]);
  return {
    boundary: makeApplicationOperationBoundary({
      operationContext,
      budgetSlot: "plain_semantic",
      clock: standardClock(),
    }),
    portInput,
    validationContext: AGENT_TEST_VALIDATION_CONTEXT,
    capabilityContext,
    fallback: UNAVAILABLE_FALLBACK,
  };
}

async function makePortraitSetup() {
  const summaryInput = makePortraitSummaryInput();
  const evidenceContext = {
    contentMode: "verified" as const,
    verifiedFacts: [AGENT_TEST_FACT],
    allowedEvidenceIds: [AGENT_TEST_FACT.id],
  };
  const operationContextBase = applicationContext({
    capability: "executePortraitShiftSummary",
    fingerprint: "7",
    stage: "PORTRAIT_REASSEMBLY",
  });
  const capabilityContextBase = applicationContext({
    capability: "summarizePortraitShift",
    fingerprint: "8",
    stage: "PORTRAIT_REASSEMBLY",
  });
  const semanticMaterials = buildPortraitSummaryInputMaterials({
    summaryInput,
    evidenceContext,
    safetyPolicy: AGENT_TEST_VALIDATION_CONTEXT.safetyPolicy,
  });
  const [operationContext, capabilityContext] = await Promise.all([
    withSemanticFingerprint(
      operationContextBase,
      semanticMaterials.operation,
      AGENT_RESULT_SCHEMA_VERSIONS.summarizePortraitShift,
    ),
    withSemanticFingerprint(
      capabilityContextBase,
      semanticMaterials.summarizePortraitShift,
      AGENT_RESULT_SCHEMA_VERSIONS.summarizePortraitShift,
    ),
  ]);
  return {
    boundary: makeApplicationOperationBoundary({
      operationContext,
      budgetSlot: "portrait_shift_summary",
      clock: standardClock(),
    }),
    summaryInput,
    validationContext: AGENT_TEST_VALIDATION_CONTEXT,
    evidenceContext,
    capabilityContext,
    fallback: UNAVAILABLE_FALLBACK,
  };
}

async function makeFinalReviewSetup(
  options: {
    requestedMode?: "mock" | "live";
    adapterVersion?: string;
    availability?: { live: boolean; mock: boolean };
  } = {},
) {
  const reviewInput = makeCharlieSignatureReviewInput();
  const evidenceContext = makePlaceholderFinalReviewEvidenceContext(reviewInput);
  const safetyPolicy = DEFAULT_CHARLIE_SIGNATURE_REVIEW_SAFETY_POLICY;
  const reviewContextBase = makeCharlieSignatureReviewContext({
    requestedMode: options.requestedMode ?? "mock",
    adapterVersion: options.adapterVersion ?? "0.1.0",
  });
  const operationContextBase = makeApplicationRequestContext(
    "executeCharlieSignatureReview",
    {
      operationId: reviewContextBase.operationId,
      requestId: reviewContextBase.requestId,
      requestedMode: reviewContextBase.requestedMode,
      inputFingerprint: applicationDigest("e"),
      promptVersion: reviewContextBase.promptVersion,
      adapterVersion: reviewContextBase.adapterVersion,
      stage: reviewContextBase.stage,
      stageInstanceId: reviewContextBase.stageInstanceId,
      bindings: reviewContextBase.bindings,
    },
  );
  const semanticMaterials = buildFinalReviewInputMaterials({
    reviewInput,
    evidenceContext,
    safetyPolicy,
  });
  const [operationFingerprint, reviewFingerprint] = await Promise.all([
    computeStage3RequestFingerprint({
      context: operationContextBase,
      semanticMaterial: semanticMaterials.operation,
      agentContractVersion: null,
      resultSchemaVersion: FINAL_REVIEW_SCHEMA_VERSION,
    }),
    computeStage3RequestFingerprint({
      context: reviewContextBase,
      semanticMaterial: semanticMaterials.reviewCharlieSignature,
      agentContractVersion: null,
      resultSchemaVersion: FINAL_REVIEW_SCHEMA_VERSION,
    }),
  ]);
  const operationContext = makeApplicationRequestContext(
    "executeCharlieSignatureReview",
    { ...operationContextBase, inputFingerprint: operationFingerprint },
  );
  const reviewContext = makeCharlieSignatureReviewContext({
    ...reviewContextBase,
    inputFingerprint: reviewFingerprint,
  });
  return {
    boundary: makeApplicationOperationBoundary({
      operationContext,
      budgetSlot: "signature_review",
      availability: options.availability,
      clock: standardClock(),
    }),
    reviewInput,
    reviewContext,
    evidenceContext,
    safetyPolicy,
  };
}

async function withSemanticFingerprint(
  context: ReturnType<typeof makeApplicationRequestContext>,
  semanticMaterial: unknown,
  resultSchemaVersion: string,
  agentContractVersion: string | null = AGENT_CONTRACT_VERSION,
) {
  return makeApplicationRequestContext(context.capability, {
    ...context,
    inputFingerprint: await computeStage3RequestFingerprint({
      context,
      semanticMaterial,
      agentContractVersion,
      resultSchemaVersion,
    }),
  });
}

function unavailableRoundFallbacks(): RoundAnalysisFallbackPlan {
  return {
    extractUserPrinciple: UNAVAILABLE_FALLBACK,
    detectTension: UNAVAILABLE_FALLBACK,
    generateCharlieResponse: UNAVAILABLE_FALLBACK,
    proposeDocumentDiff: UNAVAILABLE_FALLBACK,
  };
}

function applicationContext(input: {
  capability: string;
  fingerprint: string;
  stage: "ROUND_1_PAST_SELF" | "ROUND_2_FORECAST" | "ROUND_3_RELATIONSHIP" | "PLAIN_REWRITE" | "PORTRAIT_REASSEMBLY";
  plainRevisionId?: string | null;
  requestedMode?: "mock" | "live";
}) {
  return makeApplicationRequestContext(input.capability, {
    operationId: "operation-1",
    requestId: "request-1",
    requestedMode: input.requestedMode ?? "mock",
    inputFingerprint: applicationDigest(input.fingerprint),
    promptVersion: null,
    adapterVersion: MOCK_AGENT_ADAPTER_VERSION,
    stage: input.stage,
    stageInstanceId: `stage-instance-${input.stage}`,
    bindings: {
      revisions: {
        preciseRevisionId: "precise-r1",
        plainRevisionId: input.plainRevisionId ?? null,
      },
      content: AGENT_TEST_CONTENT_BINDING,
    },
  });
}

function standardClock() {
  return makeSequenceClock(APPLICATION_STARTED_AT, APPLICATION_COMPLETED_AT);
}

function portReturning(input: {
  round?: unknown;
  plain?: unknown;
  portrait?: unknown;
  observation?: typeof ZERO_AGENT_OBSERVATION;
}): ProviderNeutralAgentPort & {
  executeRoundAnalysis: ReturnType<typeof vi.fn>;
  executePlainSemanticReview: ReturnType<typeof vi.fn>;
  summarizePortraitShift: ReturnType<typeof vi.fn>;
} {
  return {
    executionMode: "mock" as const,
    adapterVersion: MOCK_AGENT_ADAPTER_VERSION,
    executeRoundAnalysis: vi.fn(async () => ({
      outcomeKind: "candidate" as const,
      candidate: input.round,
      observation: input.observation ?? ZERO_AGENT_OBSERVATION,
    })),
    executePlainSemanticReview: vi.fn(async () => ({
      outcomeKind: "candidate" as const,
      candidate: input.plain,
      observation: input.observation ?? ZERO_AGENT_OBSERVATION,
    })),
    summarizePortraitShift: vi.fn(async () => ({
      outcomeKind: "candidate" as const,
      candidate: input.portrait,
      observation: input.observation ?? ZERO_AGENT_OBSERVATION,
    })),
  };
}

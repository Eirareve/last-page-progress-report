import "server-only";

import type {
  AgentEvidenceContext,
  AgentSafetyPolicy,
  PlainSemanticReviewPortInput,
  ProviderNeutralAgentPort,
  RoundAnalysisPortInput,
  SummarizePortraitShiftInput,
} from "../../agent";
import {
  AGENT_CONTRACT_VERSION,
  AGENT_RESULT_SCHEMA_VERSIONS,
  DeterministicMockAgentAdapter,
  PLAIN_SEMANTIC_BUNDLE_SCHEMA_VERSION,
  ROUND_ANALYSIS_BUNDLE_SCHEMA_VERSION,
  ZERO_AGENT_EXECUTION_OBSERVATION,
  plainSemanticReviewCandidateBundleSchema,
  roundAnalysisCandidateBundleSchema,
  summarizePortraitShiftCandidateSchema,
} from "../../agent";
import type {
  OrchestrationOperationBoundary,
  Stage3BudgetSlot,
  Stage3TerminalArtifact,
} from "../../application";
import {
  buildFinalReviewInputMaterials,
  buildPlainSemanticInputMaterials,
  buildPortraitSummaryInputMaterials,
  buildRoundAnalysisSemanticMaterials,
  logicalCallBudgetUsageSchema,
  orchestrateCharlieSignatureReview,
  orchestratePlainSemanticReview,
  orchestratePortraitShiftSummary,
  orchestrateRoundAnalysis,
} from "../../application";
import type { GatedContentAccess } from "../../content/server";
import type {
  CharlieSignatureReviewRequestContext,
  FinalReviewService,
  ResolvedFinalReviewEvidenceContext,
} from "../../final-review";
import {
  DEFAULT_CHARLIE_SIGNATURE_REVIEW_SAFETY_POLICY,
  FINAL_REVIEW_SCHEMA_VERSION,
  createGatedFinalReviewEvidenceResolver,
} from "../../final-review";
import {
  activeOperationSchema,
  type RequestContext,
} from "../../runtime";
import { bindStage6LiveRequestContext } from "../context-binding";
import type { Stage6LiveRequest } from "../contracts";
import { Stage6StaticSafetyTemplateAdapter } from "../static-template-adapter";
import { Stage6ServerExecutionError } from "./errors";
import { Stage6SessionLedger } from "./session-ledger";

type LiveFinalReviewService = FinalReviewService &
  Readonly<{
    executionMode: "live";
    adapterVersion: string;
  }>;

type Stage6ExecutorContext = Readonly<{ abortSignal: AbortSignal }>;

export function createStage6ServerExecutor(input: {
  agentPort: ProviderNeutralAgentPort & { readonly executionMode: "live" };
  finalReviewService: LiveFinalReviewService;
  loadGatedContent: () => Promise<GatedContentAccess>;
  ledger?: Stage6SessionLedger;
  fallbackPort?: ProviderNeutralAgentPort;
  staticTemplatePort?: ProviderNeutralAgentPort;
  now?: () => string;
}) {
  const ledger = input.ledger ?? new Stage6SessionLedger();
  const fallbackPort = input.fallbackPort ?? new DeterministicMockAgentAdapter();
  const staticTemplatePort =
    input.staticTemplatePort ?? new Stage6StaticSafetyTemplateAdapter();
  const now = input.now ?? (() => new Date().toISOString());

  return async function executeStage6LiveRequest(
    request: Stage6LiveRequest,
    context: Stage6ExecutorContext,
  ): Promise<Stage3TerminalArtifact> {
    throwIfCancelled(context.abortSignal);
    const ledgerDecision = ledger.begin(request);
    if (ledgerDecision.kind === "cached") return ledgerDecision.artifact;

    try {
      let gatedContent: GatedContentAccess;
      try {
        gatedContent = await input.loadGatedContent();
        throwIfCancelled(context.abortSignal);
        assertVerifiedContentBinding(gatedContent, request);
      } catch (caught) {
        if (caught instanceof Stage6ServerExecutionError) throw caught;
        throw new Stage6ServerExecutionError(
          "content_gate_unavailable",
          "Verified content could not be resolved for live execution",
        );
      }

      const artifact = await executeByKind({
        request,
        context,
        gatedContent,
        priorBudgetUsage: ledgerDecision.priorBudgetUsage,
        agentPort: input.agentPort,
        finalReviewService: input.finalReviewService,
        fallbackPort,
        staticTemplatePort,
        now,
      });
      throwIfCancelled(context.abortSignal);
      ledger.commit(request, artifact);
      return artifact;
    } catch (caught) {
      ledger.abortUncommitted(request);
      throw caught;
    }
  };
}

function throwIfCancelled(signal: AbortSignal): void {
  if (signal.aborted) {
    throw new Stage6ServerExecutionError(
      "request_cancelled",
      "Live execution was cancelled before its terminal artifact committed",
    );
  }
}

async function executeByKind(input: {
  request: Stage6LiveRequest;
  context: Stage6ExecutorContext;
  gatedContent: GatedContentAccess;
  priorBudgetUsage: Stage6LiveRequest["priorBudgetUsage"];
  agentPort: ProviderNeutralAgentPort & { readonly executionMode: "live" };
  finalReviewService: LiveFinalReviewService;
  fallbackPort: ProviderNeutralAgentPort;
  staticTemplatePort: ProviderNeutralAgentPort;
  now: () => string;
}): Promise<Stage3TerminalArtifact> {
  switch (input.request.executionKind) {
    case "round_analysis":
      return executeRound(input as Parameters<typeof executeRound>[0]);
    case "plain_semantic_review":
      return executePlain(input as Parameters<typeof executePlain>[0]);
    case "portrait_shift_summary":
      return executePortrait(input as Parameters<typeof executePortrait>[0]);
    case "charlie_signature_review":
      return executeFinalReview(
        input as Parameters<typeof executeFinalReview>[0],
      );
  }
}

async function executeRound(
  input: Parameters<typeof executeByKind>[0] & {
    request: Extract<Stage6LiveRequest, { executionKind: "round_analysis" }>;
  },
): Promise<Stage3TerminalArtifact> {
  const trusted = resolveTrustedRoundInput(input.request, input.gatedContent);
  const materials = buildRoundAnalysisSemanticMaterials(trusted);
  const operationContext = await createOperationContext({
    request: input.request,
    semanticMaterial: materials.operation,
    resultSchemaVersion: ROUND_ANALYSIS_BUNDLE_SCHEMA_VERSION,
    adapterVersion: input.agentPort.adapterVersion,
    abortSignal: input.context.abortSignal,
  });
  const capabilities = [
    "extractUserPrinciple",
    "detectTension",
    "generateCharlieResponse",
    "proposeDocumentDiff",
  ] as const;
  const capabilityContexts = Object.fromEntries(
    await Promise.all(
      capabilities.map(async (capability) => [
        capability,
        await bindStage6LiveRequestContext({
          base: input.request.operationContext,
          capability,
          semanticMaterial: materials[capability],
          resultSchemaVersion: AGENT_RESULT_SCHEMA_VERSIONS[capability],
          agentContractVersion: AGENT_CONTRACT_VERSION,
          adapterVersion: input.agentPort.adapterVersion,
          abortSignal: input.context.abortSignal,
        }),
      ]),
    ),
  ) as Record<(typeof capabilities)[number], RequestContext>;
  const fallbacks = await roundFallbacks({
    portInput: trusted.portInput,
    capabilityContexts,
    fallbackPort: input.fallbackPort,
    staticTemplatePort: input.staticTemplatePort,
  });
  const outcome = await orchestrateRoundAnalysis({
    boundary: boundary(
      input.request,
      operationContext,
      roundSlot(trusted.portInput.extractUserPrinciple.roundId),
      input.priorBudgetUsage,
      input.now,
    ),
    port: input.agentPort,
    portInput: trusted.portInput,
    validationContext: { safetyPolicy: trusted.safetyPolicy },
    capabilityContexts,
    fallbacks,
  });
  return terminal(outcome);
}

async function executePlain(
  input: Parameters<typeof executeByKind>[0] & {
    request: Extract<Stage6LiveRequest, { executionKind: "plain_semantic_review" }>;
  },
): Promise<Stage3TerminalArtifact> {
  const portInput: PlainSemanticReviewPortInput = input.request.input;
  const safetyPolicy = emptyAgentSafetyPolicy();
  const materials = buildPlainSemanticInputMaterials({ portInput, safetyPolicy });
  const operationContext = await createOperationContext({
    request: input.request,
    semanticMaterial: materials.operation,
    resultSchemaVersion: PLAIN_SEMANTIC_BUNDLE_SCHEMA_VERSION,
    adapterVersion: input.agentPort.adapterVersion,
    abortSignal: input.context.abortSignal,
  });
  const capabilityContext = await bindStage6LiveRequestContext({
    base: input.request.operationContext,
    capability: "compareSemanticDrift",
    semanticMaterial: materials.compareSemanticDrift,
    resultSchemaVersion: AGENT_RESULT_SCHEMA_VERSIONS.compareSemanticDrift,
    agentContractVersion: AGENT_CONTRACT_VERSION,
    adapterVersion: input.agentPort.adapterVersion,
    abortSignal: input.context.abortSignal,
  });
  const fallback = await plainFallback({
    portInput,
    capabilityContext,
    fallbackPort: input.fallbackPort,
    staticTemplatePort: input.staticTemplatePort,
  });
  return terminal(
    await orchestratePlainSemanticReview({
      boundary: boundary(
        input.request,
        operationContext,
        "plain_semantic",
        input.priorBudgetUsage,
        input.now,
      ),
      port: input.agentPort,
      portInput,
      validationContext: { safetyPolicy },
      capabilityContext,
      fallback,
    }),
  );
}

async function executePortrait(
  input: Parameters<typeof executeByKind>[0] & {
    request: Extract<Stage6LiveRequest, { executionKind: "portrait_shift_summary" }>;
  },
): Promise<Stage3TerminalArtifact> {
  const summaryInput: SummarizePortraitShiftInput = input.request.input;
  const safetyPolicy = emptyAgentSafetyPolicy();
  const evidenceContext = resolvePortraitEvidence(
    summaryInput,
    input.gatedContent,
  );
  const materials = buildPortraitSummaryInputMaterials({
    summaryInput,
    evidenceContext,
    safetyPolicy,
  });
  const operationContext = await createOperationContext({
    request: input.request,
    semanticMaterial: materials.operation,
    resultSchemaVersion: AGENT_RESULT_SCHEMA_VERSIONS.summarizePortraitShift,
    adapterVersion: input.agentPort.adapterVersion,
    abortSignal: input.context.abortSignal,
  });
  const capabilityContext = await bindStage6LiveRequestContext({
    base: input.request.operationContext,
    capability: "summarizePortraitShift",
    semanticMaterial: materials.summarizePortraitShift,
    resultSchemaVersion: AGENT_RESULT_SCHEMA_VERSIONS.summarizePortraitShift,
    agentContractVersion: AGENT_CONTRACT_VERSION,
    adapterVersion: input.agentPort.adapterVersion,
    abortSignal: input.context.abortSignal,
  });
  const fallback = await portraitFallback({
    summaryInput,
    capabilityContext,
    fallbackPort: input.fallbackPort,
    staticTemplatePort: input.staticTemplatePort,
  });
  return terminal(
    await orchestratePortraitShiftSummary({
      boundary: boundary(
        input.request,
        operationContext,
        "portrait_shift_summary",
        input.priorBudgetUsage,
        input.now,
      ),
      port: input.agentPort,
      summaryInput,
      validationContext: { safetyPolicy },
      evidenceContext,
      capabilityContext,
      fallback,
    }),
  );
}

async function executeFinalReview(
  input: Parameters<typeof executeByKind>[0] & {
    request: Extract<Stage6LiveRequest, { executionKind: "charlie_signature_review" }>;
  },
): Promise<Stage3TerminalArtifact> {
  const resolution = await createGatedFinalReviewEvidenceResolver(
    input.gatedContent,
  ).resolveEvidence(input.request.input);
  if (resolution.resolutionKind === "error") {
    throw new Stage6ServerExecutionError(
      "content_gate_unavailable",
      "Final Review evidence could not be resolved",
    );
  }
  const evidenceContext: ResolvedFinalReviewEvidenceContext =
    resolution.evidenceContext;
  const safetyPolicy = DEFAULT_CHARLIE_SIGNATURE_REVIEW_SAFETY_POLICY;
  const materials = buildFinalReviewInputMaterials({
    reviewInput: input.request.input,
    evidenceContext,
    safetyPolicy,
  });
  const operationContext = await createOperationContext({
    request: input.request,
    semanticMaterial: materials.operation,
    resultSchemaVersion: FINAL_REVIEW_SCHEMA_VERSION,
    adapterVersion: input.finalReviewService.adapterVersion,
    agentContractVersion: null,
    abortSignal: input.context.abortSignal,
  });
  const reviewContext = (await bindStage6LiveRequestContext({
    base: input.request.operationContext,
    capability: "reviewCharlieSignature",
    semanticMaterial: materials.reviewCharlieSignature,
    resultSchemaVersion: FINAL_REVIEW_SCHEMA_VERSION,
    agentContractVersion: null,
    adapterVersion: input.finalReviewService.adapterVersion,
    abortSignal: input.context.abortSignal,
  })) as CharlieSignatureReviewRequestContext;
  return terminal(
    await orchestrateCharlieSignatureReview({
      boundary: boundary(
        input.request,
        operationContext,
        "signature_review",
        input.priorBudgetUsage,
        input.now,
        false,
      ),
      service: input.finalReviewService,
      reviewInput: input.request.input,
      reviewContext,
      evidenceContext,
      safetyPolicy,
    }),
  );
}

function resolveTrustedRoundInput(
  request: Extract<Stage6LiveRequest, { executionKind: "round_analysis" }>,
  gatedContent: GatedContentAccess,
): { portInput: RoundAnalysisPortInput; safetyPolicy: AgentSafetyPolicy } {
  const access = gatedContent.access;
  if (access.contentMode !== "verified") {
    throw new Stage6ServerExecutionError(
      "content_gate_unavailable",
      "Live round analysis requires verified content",
    );
  }
  const roundId = request.input.extractUserPrinciple.roundId;
  const card = access.evidenceCards.find((item) => item.round === roundId);
  if (card === undefined) {
    throw new Stage6ServerExecutionError(
      "content_gate_unavailable",
      "No verified evidence card exists for the requested round",
    );
  }
  const allowedEvidenceIds = [...card.factIds];
  let verifiedFacts;
  try {
    verifiedFacts = [...access.getVerifiedFactsByIds(allowedEvidenceIds)];
  } catch {
    throw new Stage6ServerExecutionError(
      "content_gate_unavailable",
      "Verified facts could not be resolved for the requested round",
    );
  }
  const portInput: RoundAnalysisPortInput = {
    ...request.input,
    extractUserPrinciple: {
      ...request.input.extractUserPrinciple,
      allowedEvidenceIds,
    },
    detectTension: {
      ...request.input.detectTension,
      allowedEvidenceIds,
    },
    generateCharlieResponse: {
      ...request.input.generateCharlieResponse,
      evidenceContext: {
        contentMode: "verified",
        verifiedFacts,
        allowedEvidenceIds,
      },
    },
    proposeDocumentDiff: {
      ...request.input.proposeDocumentDiff,
      allowedEvidenceIds,
    },
  };
  return {
    portInput,
    safetyPolicy: {
      prohibitedClaims: [...card.prohibitedClaims],
      prohibitedInferences: [],
      allowedQuotedText: [],
    },
  };
}

function resolvePortraitEvidence(
  summaryInput: SummarizePortraitShiftInput,
  gatedContent: GatedContentAccess,
): AgentEvidenceContext {
  const access = gatedContent.access;
  if (access.contentMode !== "verified") {
    throw new Stage6ServerExecutionError(
      "content_gate_unavailable",
      "Live portrait summary requires verified content",
    );
  }
  const allowedIds = new Set(
    access.evidenceCards.flatMap((card) => card.factIds),
  );
  if (
    summaryInput.allowedEvidenceIds.some(
      (evidenceId) => !allowedIds.has(evidenceId),
    )
  ) {
    throw new Stage6ServerExecutionError(
      "invalid_request",
      "Portrait evidence identifiers are outside the gated allowlist",
    );
  }
  try {
    return {
      contentMode: "verified",
      verifiedFacts: [
        ...access.getVerifiedFactsByIds(summaryInput.allowedEvidenceIds),
      ],
      allowedEvidenceIds: summaryInput.allowedEvidenceIds,
    };
  } catch {
    throw new Stage6ServerExecutionError(
      "content_gate_unavailable",
      "Portrait evidence could not be resolved",
    );
  }
}

function assertVerifiedContentBinding(
  gatedContent: GatedContentAccess,
  request: Stage6LiveRequest,
): void {
  const binding = request.operationContext.bindings.content;
  const access = gatedContent.access;
  if (
    gatedContent.evaluation.status !== "passed" ||
    access.contentMode !== "verified" ||
    binding.contentBundleId !== access.binding.contentBundleId ||
    binding.contentBundleVersion !== access.binding.contentBundleVersion ||
    binding.contentBundleChecksum !== access.binding.contentBundleChecksum
  ) {
    throw new Stage6ServerExecutionError(
      "content_gate_unavailable",
      "Request content binding does not match passed verified content",
    );
  }
}

async function createOperationContext(input: {
  request: Stage6LiveRequest;
  semanticMaterial: unknown;
  resultSchemaVersion: string;
  adapterVersion: string;
  agentContractVersion?: string | null;
  abortSignal: AbortSignal;
}): Promise<RequestContext> {
  const context = await bindStage6LiveRequestContext({
    base: input.request.operationContext,
    capability: input.request.operationContext.capability,
    semanticMaterial: input.semanticMaterial,
    resultSchemaVersion: input.resultSchemaVersion,
    agentContractVersion:
      input.agentContractVersion === undefined
        ? AGENT_CONTRACT_VERSION
        : input.agentContractVersion,
    adapterVersion: input.adapterVersion,
    abortSignal: input.abortSignal,
  });
  if (
    context.inputFingerprint !==
    input.request.operationContext.inputFingerprint
  ) {
    throw new Stage6ServerExecutionError(
      "invalid_request",
      "Client operation fingerprint does not match trusted semantic input",
    );
  }
  return context;
}

function boundary(
  request: Stage6LiveRequest,
  context: RequestContext,
  slot: Stage3BudgetSlot,
  priorBudgetUsage: Stage6LiveRequest["priorBudgetUsage"],
  now: () => string,
  mockAvailable = true,
): OrchestrationOperationBoundary {
  const startedAt = now();
  const priorCall = priorBudgetUsage.logicalCalls.find(
    ({ budgetSlot }) => budgetSlot === slot,
  );
  return {
    activeOperation: activeOperationSchema.parse({
      operationId: context.operationId,
      requestId: context.requestId,
      capability: context.capability,
      stage: context.stage,
      stageInstanceId: context.stageInstanceId,
      inputFingerprint: context.inputFingerprint,
      bindings: context.bindings,
      attempt: context.attempt,
      status: "running",
      startedAt,
    }),
    currentStage: context.stage,
    operationContext: context,
    budget: {
      priorUsage: priorBudgetUsage,
      plannedCall: logicalCallBudgetUsageSchema.parse({
        logicalCallId:
          priorCall?.logicalCallId ?? `logical-call-${context.operationId}`,
        budgetSlot: slot,
        capability: context.capability,
        networkRetries: priorCall?.networkRetries ?? 0,
        structuredRepairs: priorCall?.structuredRepairs ?? 0,
        inputTokens: priorCall?.inputTokens ?? 0,
        outputTokens: priorCall?.outputTokens ?? 0,
        latencyMs: priorCall?.latencyMs ?? 0,
        estimatedCostUsdMicros: priorCall?.estimatedCostUsdMicros ?? 0,
      }),
    },
    availability: { live: true, mock: mockAvailable },
    clock: { now },
  };
}

async function roundFallbacks(input: {
  portInput: RoundAnalysisPortInput;
  capabilityContexts: Record<
    "extractUserPrinciple" | "detectTension" | "generateCharlieResponse" | "proposeDocumentDiff",
    RequestContext
  >;
  fallbackPort: ProviderNeutralAgentPort;
  staticTemplatePort: ProviderNeutralAgentPort;
}) {
  for (const [port, resolvedMode] of [
    [input.fallbackPort, "mock"],
    [input.staticTemplatePort, "static_template"],
  ] as const) {
    try {
      const context = fallbackContext(
        input.capabilityContexts.extractUserPrinciple,
        port.adapterVersion,
      );
      const envelope = await port.executeRoundAnalysis(input.portInput, context);
      if (envelope.outcomeKind !== "candidate") continue;
      const bundle = roundAnalysisCandidateBundleSchema.safeParse(
        envelope.candidate,
      );
      if (!bundle.success) continue;
      return {
        extractUserPrinciple: roundFallback(
          bundle.data.principle,
          input.capabilityContexts.extractUserPrinciple,
          input.portInput.extractUserPrinciple.roundId,
          port.adapterVersion,
          resolvedMode,
        ),
        detectTension: roundFallback(
          bundle.data.tension,
          input.capabilityContexts.detectTension,
          input.portInput.extractUserPrinciple.roundId,
          port.adapterVersion,
          resolvedMode,
        ),
        generateCharlieResponse: roundFallback(
          bundle.data.charlieResponse,
          input.capabilityContexts.generateCharlieResponse,
          input.portInput.extractUserPrinciple.roundId,
          port.adapterVersion,
          resolvedMode,
        ),
        proposeDocumentDiff: roundFallback(
          bundle.data.documentDiff,
          input.capabilityContexts.proposeDocumentDiff,
          input.portInput.extractUserPrinciple.roundId,
          port.adapterVersion,
          resolvedMode,
        ),
      };
    } catch {
      continue;
    }
  }
  return {
    extractUserPrinciple: unavailableFallback(),
    detectTension: unavailableFallback(),
    generateCharlieResponse: unavailableFallback(),
    proposeDocumentDiff: unavailableFallback(),
  };
}

async function plainFallback(input: {
  portInput: PlainSemanticReviewPortInput;
  capabilityContext: RequestContext;
  fallbackPort: ProviderNeutralAgentPort;
  staticTemplatePort: ProviderNeutralAgentPort;
}) {
  for (const [port, resolvedMode] of [
    [input.fallbackPort, "mock"],
    [input.staticTemplatePort, "static_template"],
  ] as const) {
    try {
      const envelope = await port.executePlainSemanticReview(
        input.portInput,
        fallbackContext(input.capabilityContext, port.adapterVersion),
      );
      const candidate =
        envelope.outcomeKind === "candidate"
          ? plainSemanticReviewCandidateBundleSchema.safeParse(
              envelope.candidate,
            )
          : null;
      if (candidate === null || !candidate.success) continue;
      return candidateFallback(
        candidate.data,
        input.capabilityContext,
        port.adapterVersion,
        resolvedMode,
      );
    } catch {
      continue;
    }
  }
  return unavailableFallback();
}

async function portraitFallback(input: {
  summaryInput: SummarizePortraitShiftInput;
  capabilityContext: RequestContext;
  fallbackPort: ProviderNeutralAgentPort;
  staticTemplatePort: ProviderNeutralAgentPort;
}) {
  for (const [port, resolvedMode] of [
    [input.fallbackPort, "mock"],
    [input.staticTemplatePort, "static_template"],
  ] as const) {
    try {
      const envelope = await port.summarizePortraitShift(
        input.summaryInput,
        fallbackContext(input.capabilityContext, port.adapterVersion),
      );
      const candidate =
        envelope.outcomeKind === "candidate"
          ? summarizePortraitShiftCandidateSchema.safeParse(envelope.candidate)
          : null;
      if (candidate === null || !candidate.success) continue;
      return candidateFallback(
        candidate.data,
        input.capabilityContext,
        port.adapterVersion,
        resolvedMode,
      );
    } catch {
      continue;
    }
  }
  return unavailableFallback();
}

function candidateFallback(
  candidate: unknown,
  context: RequestContext,
  adapterVersion: string,
  resolvedMode: "mock" | "static_template",
) {
  return {
    kind: "candidate" as const,
    candidate,
    binding: {
      inputFingerprint: context.inputFingerprint,
      bindings: context.bindings,
    },
    observation: ZERO_AGENT_EXECUTION_OBSERVATION,
    executionIdentity: { adapterVersion, promptVersion: null },
    resolvedMode,
    fallbackReason:
      resolvedMode === "mock"
        ? "live_execution_failed_mock_fallback"
        : "mock_fallback_failed_static_template",
  };
}

function roundFallback(
  candidate: unknown,
  context: RequestContext,
  roundId: string,
  adapterVersion: string,
  resolvedMode: "mock" | "static_template",
) {
  return {
    ...candidateFallback(candidate, context, adapterVersion, resolvedMode),
    binding: {
      inputFingerprint: context.inputFingerprint,
      bindings: context.bindings,
      roundId,
    },
  };
}

function unavailableFallback() {
  return {
    kind: "unavailable" as const,
    fallbackReason: "ordinary_fallback_chain_exhausted",
  };
}

function fallbackContext(
  context: RequestContext,
  adapterVersion: string,
): RequestContext {
  return {
    ...context,
    adapterVersion,
    promptVersion: null,
  };
}

function emptyAgentSafetyPolicy(): AgentSafetyPolicy {
  return {
    prohibitedClaims: [],
    prohibitedInferences: [],
    allowedQuotedText: [],
  };
}

function roundSlot(roundId: string): Stage3BudgetSlot {
  if (roundId === "round1") return "round_1";
  if (roundId === "round2") return "round_2";
  if (roundId === "round3") return "round_3";
  throw new Stage6ServerExecutionError(
    "invalid_request",
    "Round identifier does not map to a Stage 3 budget slot",
  );
}

function terminal(
  outcome:
    | Awaited<ReturnType<typeof orchestrateRoundAnalysis>>
    | Awaited<ReturnType<typeof orchestratePlainSemanticReview>>
    | Awaited<ReturnType<typeof orchestratePortraitShiftSummary>>
    | Awaited<ReturnType<typeof orchestrateCharlieSignatureReview>>,
): Stage3TerminalArtifact {
  if (outcome.outcomeKind === "preflight_rejected") {
    throw new Stage6ServerExecutionError(
      "invalid_request",
      "Server orchestration rejected the trusted live execution context",
    );
  }
  return outcome;
}

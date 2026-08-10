import { describe, expect, it } from "vitest";

import {
  AGENT_CANDIDATE_SCHEMA_VERSIONS,
  AGENT_CONTRACT_VERSION,
  AGENT_RESULT_SCHEMA_VERSIONS,
  DEFAULT_MOCK_AGENT_FIXTURE,
  DeterministicMockAgentAdapter,
  MOCK_AGENT_ADAPTER_VERSION,
  PLAIN_SEMANTIC_BUNDLE_SCHEMA_VERSION,
  ROUND_ANALYSIS_BUNDLE_SCHEMA_VERSION,
  roundAnalysisCandidateBundleSchema,
  type PlainSemanticReviewPortInput,
  type ProviderNeutralAgentPort,
  type RoundAnalysisPortInput,
} from "@/agent";
import {
  buildPlainSemanticInputMaterials,
  buildPortraitSummaryInputMaterials,
  buildRoundAnalysisSemanticMaterials,
  buildStage4ContractVersionVector,
  computeStage3RequestFingerprint,
  deriveStage3EntityId,
  orchestratePlainSemanticReview,
  orchestratePortraitShiftSummary,
  orchestrateRoundAnalysis,
  type RoundAnalysisFallbackPlan,
} from "@/application";
import {
  computePortraitShift,
  createStableTextPointAnchor,
  semanticDriftSchema,
} from "@/domain";
import {
  activateStage4Operation,
  beginPostPlacementConsistencyOperation,
  buildStage4FinalEnvelope,
  createStage4Session,
  reduceStage4Event,
  type Stage4Event,
  type Stage4PersistenceSidecars,
  type Stage4SessionState,
} from "@/fsm";
import { makeContentGateEvaluation } from "../fixtures/finalization";
import {
  AGENT_TEST_CONTENT_BINDING,
  AGENT_TEST_FACT,
  AGENT_TEST_VALIDATION_CONTEXT,
  makeRoundAnalysisPortInput,
} from "../fixtures/agent";
import {
  APPLICATION_COMPLETED_AT,
  APPLICATION_STARTED_AT,
  makeApplicationOperationBoundary,
  makeApplicationRequestContext,
  makeSequenceClock,
} from "../fixtures/application";
import { makeStage4FinalEnvelopeContentSnapshot } from "../fixtures/stage4";
import type {
  ActiveOperation,
  Clock,
  IdGenerator,
  PersistentIdKind,
  RequestContext,
} from "@/runtime";

const DIGEST = `sha256:${"a".repeat(64)}` as const;
const NOW = "2026-08-08T12:00:00.000Z";
const LATER = "2026-08-08T12:01:00.000Z";
const UNAVAILABLE = Object.freeze({
  kind: "unavailable",
  fallbackReason: "integration_fallback_unavailable",
} as const);

describe("Stage 4 deterministic Mock integration", () => {
  it("moves WELCOME to COMPLETE with a rejected Diff, restoration, open dissent and not_requested signature", async () => {
    const first = await runCompleteMockFlow();
    const second = await runCompleteMockFlow();
    expect(second.finalEnvelope).toEqual(first.finalEnvelope);
    expect(second.stateRevision).toBe(first.stateRevision);
  });
});

async function runCompleteMockFlow() {
    const ports = inspectablePorts();
    let { state, sidecars } = createIntegrationSession(ports);

    ({ state, sidecars } = await dispatch(state, sidecars, { eventType: "START" }, ports));
    ({ state, sidecars } = await dispatch(
      state,
      sidecars,
      { eventType: "SET_PORTRAIT_DESCRIPTORS", descriptors: state.portraitDescriptors },
      ports,
    ));
    ({ state, sidecars } = await dispatch(
      state,
      sidecars,
      { eventType: "CHOOSE_INITIAL_PORTRAIT", choice: "early" },
      ports,
    ));
    ({ state, sidecars } = await dispatch(
      state,
      sidecars,
      { eventType: "SUBMIT_INITIAL_REASON", reason: "The early portrait fits." },
      ports,
    ));

    for (const roundId of ["round1", "round2", "round3"] as const) {
      ({ state, sidecars } = await dispatch(
        state,
        sidecars,
        { eventType: "SUBMIT_RESPONSE", roundId, response: `response-${roundId}` },
        ports,
      ));
      const setup = await roundSetup(state, roundId);
      ({ state, sidecars } = await dispatch(
        state,
        sidecars,
        {
          eventType: "CONTINUE_WITHOUT_CLARIFICATION",
          roundId,
          operation: setup.boundary.activeOperation,
        },
        ports,
      ));
      const outcome = await orchestrateRoundAnalysis({
        ...setup,
        port:
          roundId === "round1"
            ? await diffOncePort(setup.portInput)
            : new DeterministicMockAgentAdapter(),
      });
      expect(outcome.outcomeKind).toBe("resolved");
      if (outcome.outcomeKind !== "resolved") throw new Error("round failed");
      ({ state, sidecars } = await dispatch(
        state,
        sidecars,
        outcome.event,
        ports,
      ));
      if (roundId === "round1") {
        expect(state.stage).toBe("ROUND_1_DIFF");
        const diff = state.manuscript.pendingDiff!;
        ({ state, sidecars } = await dispatch(
          state,
          sidecars,
          {
            eventType: "REJECT_DIFF",
            diffId: diff.id,
            transitionId: "dissent-round-1",
          },
          ports,
        ));
      }
    }
    expect(state.stage).toBe("PLAIN_REWRITE");
    expect(state.openDissents).toMatchObject([
      { id: "dissent-round-1", status: "open" },
    ]);

    const plain = await plainSetup(state);
    state = activateStage4Operation({
      state,
      operation: plain.boundary.activeOperation,
      expectedCapability: "executePlainSemanticReview",
    });
    const plainOutcome = await orchestratePlainSemanticReview({
      ...plain,
      port: new DeterministicMockAgentAdapter({
        ...DEFAULT_MOCK_AGENT_FIXTURE,
        semanticRestorationMode: "proposal",
      }),
    });
    expect(plainOutcome.outcomeKind).toBe("resolved");
    if (plainOutcome.outcomeKind !== "resolved") throw new Error("plain failed");
    ({ state, sidecars } = await dispatch(
      state,
      sidecars,
      plainOutcome.event,
      ports,
    ));
    expect(state.stage).toBe("SEMANTIC_PLACEMENT");
    expect(state.semanticDrift?.status).toBe("placement_in_progress");
    const fragment = state.semanticFragments[0]!;
    const proposal = state.semanticRestorationProposals[0]!;
    ({ state, sidecars } = await dispatch(
      state,
      sidecars,
      {
        eventType: "CHOOSE_FRAGMENT_PLACEMENT",
        fragmentId: fragment.id,
        placement: "restored_to_plain_text",
      },
      ports,
    ));
    expect(state.semanticFragments[0]?.placement).toBeNull();
    ({ state, sidecars } = await dispatch(
      state,
      sidecars,
      {
        eventType: "CONFIRM_SEMANTIC_RESTORATION_PROPOSAL",
        proposalId: proposal.proposalId,
        nextPlainRevisionId: "plain-restored-r2",
      },
      ports,
    ));
    expect(state.semanticFragments[0]?.placement).toBe("restored_to_plain_text");
    expect(state.semanticFragments[0]?.restorationProposalId).toBe(
      proposal.proposalId,
    );

    const consistencyOperation = operationFor(
      state,
      "checkPostPlacementConsistency",
    );
    state = beginPostPlacementConsistencyOperation({
      state,
      operation: consistencyOperation,
    });
    const fragmentCount = state.semanticFragments.length;
    ({ state, sidecars } = await dispatch(
      state,
      sidecars,
      {
        ...resultHeader(consistencyOperation),
        eventType: "POST_PLACEMENT_CHECK_SUCCEEDED",
        capability: "checkPostPlacementConsistency",
        outcome: "succeeded",
        nextDrift: semanticDriftSchema.parse({
          ...state.semanticDrift,
          preciseRevisionId: state.manuscript.preciseRevisionId,
          plainRevisionId: state.manuscript.plainRevisionId,
          status: "current",
        }),
      },
      ports,
    ));
    expect(state.semanticFragments).toHaveLength(fragmentCount);
    expect(state.semanticDrift?.status).toBe("current");
    expect(state.stage).toBe("PORTRAIT_REASSEMBLY");

    ({ state, sidecars } = await dispatch(
      state,
      sidecars,
      { eventType: "CHOOSE_FINAL_PORTRAIT", choice: "all_three" },
      ports,
    ));
    const computeOperation = operationFor(state, "computePortraitShift");
    ({ state, sidecars } = await dispatch(
      state,
      sidecars,
      { eventType: "CONTINUE_WITHOUT_FINAL_REASON", operation: computeOperation },
      ports,
    ));
    const comparison = computePortraitShift({
      initialChoice: state.portraits.initialRecord!.initialChoice,
      finalChoice: state.portraits.finalChoice!,
      relatedEvidenceIds: [],
      relatedRevisionIds: [
        state.manuscript.preciseRevisionId,
        state.manuscript.plainRevisionId!,
      ],
    });
    ({ state, sidecars } = await dispatch(
      state,
      sidecars,
      {
        ...resultHeader(computeOperation),
        eventType: "PORTRAIT_SHIFT_COMPUTED",
        capability: "computePortraitShift",
        outcome: "succeeded",
        comparison,
        receipt: receiptFor(computeOperation, "deterministic"),
      },
      ports,
    ));

    const summary = await portraitSetup(state);
    state = activateStage4Operation({
      state,
      operation: summary.boundary.activeOperation,
      expectedCapability: "executePortraitShiftSummary",
    });
    const summaryOutcome = await orchestratePortraitShiftSummary({
      ...summary,
      port: new DeterministicMockAgentAdapter(),
    });
    expect(summaryOutcome.outcomeKind).toBe("resolved");
    if (summaryOutcome.outcomeKind !== "resolved") throw new Error("summary failed");
    ({ state, sidecars } = await dispatch(
      state,
      sidecars,
      summaryOutcome.event,
      ports,
    ));
    expect(state.stage).toBe("FINAL_SIGNATURE");
    ({ state, sidecars } = await dispatch(
      state,
      sidecars,
      { eventType: "CONTINUE_WITHOUT_SIGNATURE_REVIEW" },
      ports,
    ));
    expect(state.currentCharlieSignatureStatus).toBe("not_requested");
    expect(state.futureCharlieSignatureStatus).toBe("blank");

    const finalizationStageId = ports.peek("stage_instance");
    const finalizationOperation = operationFor(
      {
        ...state,
        stage: "FINALIZING",
        stageInstanceId: finalizationStageId,
        runtime: { stageInstanceId: finalizationStageId, activeOperation: null },
      },
      "persistFinalEnvelope",
    );
    ({ state, sidecars } = await dispatch(
      state,
      sidecars,
      {
        eventType: "CHOOSE_DISPOSITION",
        disposition: "unfinished",
        finalizationContext: {
          targetEnvironment: "development",
          contentGateEvaluation: makeContentGateEvaluation({
            contentBundleId: state.contentBinding.contentBundleId,
            contentBundleVersion: state.contentBinding.contentBundleVersion,
            checksum: state.contentBinding.contentBundleChecksum,
            contentSchemaVersion: state.contentBinding.contentSchemaVersion,
            targetEnvironment: "development",
          }),
          requiresContentGateAttestation: false,
          contentGateAttestation: null,
          requiredCapabilityReceipts: [],
        },
        operation: finalizationOperation,
      },
      ports,
    ));
    expect(state.stage).toBe("FINALIZING");
    const envelope = await buildStage4FinalEnvelope({
      state,
      contentSnapshot: makeStage4FinalEnvelopeContentSnapshot(state),
      clock: ports.clock,
      idGenerator: ports.idGenerator,
    });
    ({ state, sidecars } = await dispatch(
      state,
      sidecars,
      {
        ...resultHeader(state.runtime.activeOperation!),
        eventType: "FINAL_ENVELOPE_PERSISTED",
        capability: "persistFinalEnvelope",
        outcome: "succeeded",
        envelope,
      },
      ports,
    ));

    expect(state.stage).toBe("COMPLETE");
    expect(state.finalEnvelope?.openDissents).toMatchObject([
      { id: "dissent-round-1", status: "open" },
    ]);
    expect(state.finalEnvelope?.signature.currentStatus).toBe("not_requested");
    expect(state.finalEnvelope?.finalDisposition).toBe("unfinished");
    return state;
}

function createIntegrationSession(ports: ReturnType<typeof inspectablePorts>) {
  return createStage4Session({
    contentBinding: {
      ...AGENT_TEST_CONTENT_BINDING,
      contentSchemaVersion: "0.2.0",
      targetEnvironment: "development",
    },
    originalInteraction: {
      id: "integration-original-interaction",
      contentType: "ORIGINAL_INTERACTION",
      purpose: "manuscript",
      text: "Precise test text.",
    },
    preciseRevisionId: "precise-r1",
    portraitDescriptors: [
      { id: "early", stage: "early", label: "Early" },
      { id: "peak", stage: "peak", label: "Peak" },
      { id: "future", stage: "futureFacing", label: "Future" },
    ],
    configuration: { requestedAgentMode: "mock" },
    provenance: {
      contractVersionVector: buildStage4ContractVersionVector(),
      capabilityExecutionReceipts: [],
    },
    clock: ports.clock,
    idGenerator: ports.idGenerator,
  });
}

async function roundSetup(
  state: Stage4SessionState,
  roundId: "round1" | "round2" | "round3",
) {
  const base = makeRoundAnalysisPortInput();
  const portInput: RoundAnalysisPortInput = {
    ...base,
    contentBinding: contentBinding(state),
    revisions: revisionBindings(state),
    extractUserPrinciple: {
      ...base.extractUserPrinciple,
      roundId,
      untrustedUserText: `response-${roundId}`,
    },
    detectTension: {
      ...base.detectTension,
      roundId,
      priorPrinciples: state.userPrinciples,
      initialPortraitChoice: state.portraits.initialRecord!.initialChoice,
      charliePositions: state.charliePositions,
      preciseRevisionId: state.manuscript.preciseRevisionId,
      preciseText: state.manuscript.preciseText,
      plainRevisionId: state.manuscript.plainRevisionId,
      plainText: state.manuscript.plainText,
    },
    generateCharlieResponse: {
      ...base.generateCharlieResponse,
      roundId,
      preciseRevisionId: state.manuscript.preciseRevisionId,
      preciseText: state.manuscript.preciseText,
    },
    proposeDocumentDiff: {
      ...base.proposeDocumentDiff,
      baseRevisionId: state.manuscript.preciseRevisionId,
      currentText: state.manuscript.preciseText,
    },
  };
  const materials = buildRoundAnalysisSemanticMaterials({
    portInput,
    safetyPolicy: AGENT_TEST_VALIDATION_CONTEXT.safetyPolicy,
  });
  const operationBase = contextFor(state, "executeRoundAnalysis");
  const operationContext = await fingerprint(
    operationBase,
    materials.operation,
    ROUND_ANALYSIS_BUNDLE_SCHEMA_VERSION,
  );
  const capabilityContexts = Object.fromEntries(
    await Promise.all(
      (
        [
          "extractUserPrinciple",
          "detectTension",
          "generateCharlieResponse",
          "proposeDocumentDiff",
        ] as const
      ).map(async (capability) => [
        capability,
        await fingerprint(
          contextFor(state, capability),
          materials[capability],
          AGENT_RESULT_SCHEMA_VERSIONS[capability],
        ),
      ]),
    ),
  ) as Record<
    "extractUserPrinciple" | "detectTension" | "generateCharlieResponse" | "proposeDocumentDiff",
    RequestContext
  >;
  return {
    boundary: makeApplicationOperationBoundary({
      operationContext,
      budgetSlot:
        roundId === "round1" ? "round_1" : roundId === "round2" ? "round_2" : "round_3",
      clock: appClock(),
    }),
    portInput,
    validationContext: AGENT_TEST_VALIDATION_CONTEXT,
    capabilityContexts,
    fallbacks: roundFallbacks(),
  };
}

async function plainSetup(state: Stage4SessionState) {
  const targetPlainRevisionId = deriveStage3EntityId({
    operationId: operationId(state),
    entityKind: "plain_revision",
    ordinal: 0,
  });
  const portInput: PlainSemanticReviewPortInput = {
    contentBinding: contentBinding(state),
    sourcePreciseRevisionId: state.manuscript.preciseRevisionId,
    targetPlainRevisionId,
    preciseText: state.manuscript.preciseText,
  };
  const materials = buildPlainSemanticInputMaterials({
    portInput,
    safetyPolicy: AGENT_TEST_VALIDATION_CONTEXT.safetyPolicy,
  });
  const operationContext = await fingerprint(
    contextFor(state, "executePlainSemanticReview", targetPlainRevisionId),
    materials.operation,
    PLAIN_SEMANTIC_BUNDLE_SCHEMA_VERSION,
  );
  const capabilityContext = await fingerprint(
    contextFor(state, "compareSemanticDrift", targetPlainRevisionId),
    materials.compareSemanticDrift,
    AGENT_RESULT_SCHEMA_VERSIONS.compareSemanticDrift,
  );
  return {
    boundary: makeApplicationOperationBoundary({
      operationContext,
      budgetSlot: "plain_semantic",
      clock: appClock(),
    }),
    portInput,
    validationContext: AGENT_TEST_VALIDATION_CONTEXT,
    capabilityContext,
    fallback: UNAVAILABLE,
  };
}

async function portraitSetup(state: Stage4SessionState) {
  const summaryInput = {
    comparison: state.portraits.comparison!,
    allowedEvidenceIds: [AGENT_TEST_FACT.id],
    allowedRevisionIds: [
      state.manuscript.preciseRevisionId,
      state.manuscript.plainRevisionId!,
    ],
  };
  const evidenceContext = {
    contentMode: "verified" as const,
    verifiedFacts: [AGENT_TEST_FACT],
    allowedEvidenceIds: [AGENT_TEST_FACT.id],
  };
  const materials = buildPortraitSummaryInputMaterials({
    summaryInput,
    evidenceContext,
    safetyPolicy: AGENT_TEST_VALIDATION_CONTEXT.safetyPolicy,
  });
  const operationContext = await fingerprint(
    contextFor(state, "executePortraitShiftSummary"),
    materials.operation,
    AGENT_RESULT_SCHEMA_VERSIONS.summarizePortraitShift,
  );
  const capabilityContext = await fingerprint(
    contextFor(state, "summarizePortraitShift"),
    materials.summarizePortraitShift,
    AGENT_RESULT_SCHEMA_VERSIONS.summarizePortraitShift,
  );
  return {
    boundary: makeApplicationOperationBoundary({
      operationContext,
      budgetSlot: "portrait_shift_summary",
      clock: appClock(),
    }),
    summaryInput,
    validationContext: AGENT_TEST_VALIDATION_CONTEXT,
    evidenceContext,
    capabilityContext,
    fallback: UNAVAILABLE,
  };
}

async function diffOncePort(
  portInput: RoundAnalysisPortInput,
): Promise<ProviderNeutralAgentPort> {
  const delegate = new DeterministicMockAgentAdapter();
  const anchor = await createStableTextPointAnchor({
    textDocument: "precise_text",
    baseRevisionId: portInput.revisions.preciseRevisionId,
    baselineText: portInput.proposeDocumentDiff.currentText,
    offsetCodePoint: Array.from(portInput.proposeDocumentDiff.currentText).length,
  });
  return {
    executionMode: "mock",
    adapterVersion: MOCK_AGENT_ADAPTER_VERSION,
    async executeRoundAnalysis(input, context) {
      const envelope = await delegate.executeRoundAnalysis(input, context);
      if (envelope.outcomeKind !== "candidate") return envelope;
      const candidate = roundAnalysisCandidateBundleSchema.parse(envelope.candidate);
      return {
        ...envelope,
        candidate: roundAnalysisCandidateBundleSchema.parse({
          ...candidate,
          documentDiff: {
            agentContractVersion: AGENT_CONTRACT_VERSION,
            candidateSchemaVersion:
              AGENT_CANDIDATE_SCHEMA_VERSIONS.proposeDocumentDiff,
            kind: "diff",
            diff: {
              agentContractVersion: AGENT_CONTRACT_VERSION,
              candidateSchemaVersion:
                AGENT_CANDIDATE_SCHEMA_VERSIONS.proposeDocumentDiff,
              operation: "insert",
              baseRevisionId: input.revisions.preciseRevisionId,
              documentTarget: "precise_text",
              targetAnchor: anchor,
              newText: " Added suggestion.",
              reason: "Keep the proposed qualification visible.",
              evidenceIds: [],
              principleIds: [],
            },
          },
        }),
      };
    },
    executePlainSemanticReview: (input, context) =>
      delegate.executePlainSemanticReview(input, context),
    summarizePortraitShift: (input, context) =>
      delegate.summarizePortraitShift(input, context),
  };
}

function contextFor(
  state: Stage4SessionState,
  capability: string,
  plainRevisionId = state.manuscript.plainRevisionId,
): RequestContext {
  return makeApplicationRequestContext(capability, {
    operationId: operationId(state),
    requestId: requestId(state),
    requestedMode: "mock",
    inputFingerprint: DIGEST,
    promptVersion: null,
    adapterVersion: MOCK_AGENT_ADAPTER_VERSION,
    stage: state.stage,
    stageInstanceId: state.stageInstanceId,
    bindings: {
      revisions: {
        preciseRevisionId: state.manuscript.preciseRevisionId,
        plainRevisionId,
      },
      content: contentBinding(state),
    },
  });
}

async function fingerprint(
  context: RequestContext,
  semanticMaterial: unknown,
  resultSchemaVersion: string,
) {
  return makeApplicationRequestContext(context.capability, {
    ...context,
    inputFingerprint: await computeStage3RequestFingerprint({
      context,
      semanticMaterial,
      agentContractVersion: AGENT_CONTRACT_VERSION,
      resultSchemaVersion,
    }),
  });
}

function operationFor(state: Stage4SessionState, capability: string): ActiveOperation {
  return {
    operationId: operationId(state),
    requestId: requestId(state),
    capability,
    stage: state.stage,
    stageInstanceId: state.stageInstanceId,
    inputFingerprint: DIGEST,
    bindings: {
      revisions: revisionBindings(state),
      content: contentBinding(state),
    },
    attempt: 1,
    status: "running",
    startedAt: NOW,
  };
}

function resultHeader(operation: ActiveOperation) {
  return {
    operationId: operation.operationId,
    requestId: operation.requestId,
    stage: operation.stage,
    stageInstanceId: operation.stageInstanceId,
    inputFingerprint: operation.inputFingerprint,
    bindings: operation.bindings,
    completedAt: LATER,
  };
}

function receiptFor(operation: ActiveOperation, resolvedMode: "deterministic") {
  return {
    capability: operation.capability,
    operationId: operation.operationId,
    requestId: operation.requestId,
    requestedMode: "mock" as const,
    resolvedMode,
    outcome: "succeeded" as const,
    fallbackReason: null,
    promptVersion: null,
    adapterVersion: null,
    resultSchemaVersion: "0.2.0",
    inputFingerprintDigest: operation.inputFingerprint,
    startedAt: NOW,
    completedAt: LATER,
  };
}

async function dispatch(
  state: Stage4SessionState,
  sidecars: Stage4PersistenceSidecars,
  event: Stage4Event,
  ports: { clock: Clock; idGenerator: IdGenerator },
) {
  const reduction = await reduceStage4Event({ state, sidecars, event, ports });
  expect(reduction.disposition).toBe("applied");
  return reduction;
}

function roundFallbacks(): RoundAnalysisFallbackPlan {
  return {
    extractUserPrinciple: UNAVAILABLE,
    detectTension: UNAVAILABLE,
    generateCharlieResponse: UNAVAILABLE,
    proposeDocumentDiff: UNAVAILABLE,
  };
}

function contentBinding(state: Stage4SessionState) {
  return {
    contentBundleId: state.contentBinding.contentBundleId,
    contentBundleVersion: state.contentBinding.contentBundleVersion,
    contentBundleChecksum: state.contentBinding.contentBundleChecksum,
  };
}

function revisionBindings(state: Stage4SessionState) {
  return {
    preciseRevisionId: state.manuscript.preciseRevisionId,
    plainRevisionId: state.manuscript.plainRevisionId,
  };
}

function operationId(state: Stage4SessionState) {
  return `operation-${state.stage.toLowerCase()}`;
}

function requestId(state: Stage4SessionState) {
  return `request-${state.stage.toLowerCase()}`;
}

function appClock() {
  return makeSequenceClock(APPLICATION_STARTED_AT, APPLICATION_COMPLETED_AT);
}

function inspectablePorts(): {
  clock: Clock;
  idGenerator: IdGenerator;
  peek(kind: PersistentIdKind): string;
} {
  const counters = new Map<PersistentIdKind, number>();
  const nextValue = (kind: PersistentIdKind) =>
    `${kind}-${(counters.get(kind) ?? 0) + 1}`;
  return {
    clock: { now: () => LATER },
    idGenerator: {
      next(kind) {
        const value = nextValue(kind);
        counters.set(kind, (counters.get(kind) ?? 0) + 1);
        return value;
      },
    },
    peek: nextValue,
  };
}

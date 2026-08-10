import {
  AGENT_CANDIDATE_SCHEMA_VERSIONS,
  AGENT_CONTRACT_VERSION,
  AGENT_RESULT_SCHEMA_VERSIONS,
  DEFAULT_MOCK_AGENT_FIXTURE,
  DeterministicMockAgentAdapter,
  MOCK_AGENT_ADAPTER_VERSION,
  PLAIN_SEMANTIC_BUNDLE_SCHEMA_VERSION,
  ROUND_ANALYSIS_BUNDLE_SCHEMA_VERSION,
  ZERO_AGENT_EXECUTION_OBSERVATION,
  roundAnalysisCandidateBundleSchema,
  type AgentEvidenceContext,
  type AgentSafetyPolicy,
  type PlainSemanticReviewPortInput,
  type ProviderNeutralAgentPort,
  type RoundAnalysisPortInput,
} from "../agent";
import {
  buildFinalReviewInputMaterials,
  buildPlainSemanticInputMaterials,
  buildPortraitSummaryInputMaterials,
  buildRoundAnalysisSemanticMaterials,
  buildStage4ContractVersionVector,
  computeStage3RequestFingerprint,
  deriveStage3EntityId,
  orchestrateCharlieSignatureReview,
  orchestratePlainSemanticReview,
  orchestratePortraitShiftSummary,
  orchestrateRoundAnalysis,
  type ExplicitCandidateFallback,
  type RoundAnalysisFallbackPlan,
  type Stage3TerminalArtifact,
  type OrchestrationOperationBoundary,
} from "../application";
import {
  createBundledContentLoader,
  projectFinalEnvelopeContentSnapshot,
  type ContentAccess,
  type ContentEnvironment,
  type ContentGateEvaluation,
  type ContentMode,
} from "../content";
import { canonicalizeJson } from "../content/canonical-json";
import { evaluateContentGate } from "../content/evaluate-content-gate";
import {
  computePortraitShift,
  createStableTextPointAnchor,
  semanticDriftSchema,
  sha256NfcUtf8,
  signatureReviewFingerprintMaterialSchema,
  type PortraitDescriptor,
} from "../domain";
import {
  DEFAULT_CHARLIE_SIGNATURE_REVIEW_SAFETY_POLICY,
  DeterministicMockFinalReviewService,
  FINAL_REVIEW_SCHEMA_VERSION,
  MOCK_FINAL_REVIEW_ADAPTER_VERSION,
  ZERO_FINAL_REVIEW_EXECUTION_OBSERVATION,
  charlieSignatureReviewInputSchema,
  charlieSignatureReviewRequestContextSchema,
  charlieSignatureReviewServiceOutcomeSchema,
  createCharlieSignatureReviewError,
  createGatedFinalReviewEvidenceResolver,
  resolvedFinalReviewEvidenceContextSchema,
  type CharlieSignatureReviewInput,
  type FinalReviewService,
} from "../final-review";
import { evaluateFinalization } from "../finalization";
import {
  activateStage4Operation,
  beginPostPlacementConsistencyOperation,
  buildStage4FinalEnvelope,
  createStage4Session,
  stage4SessionStateSchema,
  type Stage4Event,
  type Stage4PersistenceSidecars,
  type Stage4SessionState,
} from "../fsm";
import {
  IndexedDbStage4Store,
  Stage4PersistenceConflictError,
  Stage4SessionEngine,
  recoverStage4Session,
  type Stage4AtomicSnapshot,
} from "../persistence";
import {
  activeOperationSchema,
  serializableRequestContextSchema,
  type ActiveOperation,
  type RequestContext,
  type RuntimeSha256Digest,
} from "../runtime";
import {
  DEEPSEEK_OPENAI_ADAPTER_VERSION,
  STAGE6_PROMPT_VERSION,
  STAGE6_TRANSPORT_VERSION,
  Stage6StaticSafetyTemplateAdapter,
  Stage6LiveHttpClient,
  Stage6LiveHttpError,
  stage6LiveRequestSchema,
  type Stage6LiveApplicationClient,
  type Stage6LiveRequest,
} from "../stage6";
import {
  browserClock,
  createBrowserIdGenerator,
  type BrowserIdGenerator,
} from "./browser-ports";
import type {
  Stage5Commands,
  Stage5Disposition,
  Stage5PortraitStage,
  Stage5RecoveryView,
  Stage5Snapshot,
} from "./contracts";
import {
  createAgentRequestContext,
  createOperationBoundary,
  newOperationIdentity,
  operationContentBinding,
  operationResultHeader,
  operationRevisionBinding,
} from "./operation";
import { projectStage5View } from "./projection";

const UNAVAILABLE = Object.freeze({
  kind: "unavailable",
  fallbackReason: "stage5_mock_fallback_unavailable",
} as const);

type Listener = () => void;
type Stage5LoadedContent = Awaited<
  ReturnType<ReturnType<typeof createBundledContentLoader>["load"]>
>;

export type Stage5ExperienceFacadeOptions = Readonly<{
  requestedMode?: "mock" | "live";
  contentMode?: ContentMode;
  targetEnvironment?: ContentEnvironment["appEnvironment"];
  liveClient?: Stage6LiveApplicationClient;
  localFallbackPort?: ProviderNeutralAgentPort;
  loadContent?: (
    mode: "placeholder" | "verified",
  ) => Promise<Stage5LoadedContent>;
}>;

export class Stage5ExperienceFacade implements Stage5Commands {
  private readonly listeners = new Set<Listener>();
  private readonly idGenerator: BrowserIdGenerator = createBrowserIdGenerator();
  private readonly ownerToken = `stage5-owner-${crypto.randomUUID()}`;
  private snapshot: Stage5Snapshot = Object.freeze({
    status: "booting",
    persistence: "idle",
    announcement: "正在准备本地体验。",
    error: null,
    recovery: null,
    view: null,
  });
  private store: IndexedDbStage4Store | null = null;
  private engine: Stage4SessionEngine | null = null;
  private current: Stage4AtomicSnapshot | null = null;
  private access: ContentAccess | null = null;
  private gate: ContentGateEvaluation | null = null;
  private requestedSessionId: string | null;
  private readonly requestedMode: "mock" | "live";
  private readonly contentMode: ContentMode;
  private readonly targetEnvironment: ContentEnvironment["appEnvironment"];
  private readonly liveClient: Stage6LiveApplicationClient;
  private readonly localFallbackPort: ProviderNeutralAgentPort;
  private readonly loadContent: Stage5ExperienceFacadeOptions["loadContent"];
  private inFlight: Promise<void> | null = null;
  private liveAbortController: AbortController | null = null;
  private liveExecutionGeneration = 0;

  constructor(
    sessionId: string | null,
    options: Stage5ExperienceFacadeOptions = {},
  ) {
    this.requestedSessionId = sessionId;
    this.requestedMode = options.requestedMode ?? "mock";
    this.contentMode =
      options.contentMode ??
      (this.requestedMode === "live" ? "verified" : "placeholder");
    this.targetEnvironment = options.targetEnvironment ?? "development";
    this.liveClient = options.liveClient ?? new Stage6LiveHttpClient();
    this.localFallbackPort =
      options.localFallbackPort ?? new DeterministicMockAgentAdapter();
    this.loadContent =
      options.loadContent ??
      ((mode) => createBundledContentLoader().load(mode));
  }

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = (): Stage5Snapshot => this.snapshot;

  dispose = (): void => {
    this.liveExecutionGeneration += 1;
    this.liveAbortController?.abort();
    this.liveAbortController = null;
    this.listeners.clear();
  };

  async initialize(): Promise<void> {
    this.setSnapshot({
      status: "booting",
      persistence: "idle",
      announcement: "正在校验内容并打开本地存储。",
      error: null,
      recovery: null,
      view: null,
    });
    try {
      const loaded = await this.loadContent!(this.contentMode);
      const evaluatedAt = browserClock.now();
      const gate = evaluateContentGate({
        evaluationId: this.idGenerator.next("transition"),
        evaluatedAt,
        targetEnvironment: this.targetEnvironment,
        contentMode: loaded.bundle.contentMode,
        agentMode: this.requestedMode,
        contentBundleId: loaded.bundle.contentBundleId,
        contentBundleVersion: loaded.bundle.contentBundleVersion,
        contentSchemaVersion: loaded.bundle.contentSchemaVersion,
        contentBundleChecksum: loaded.bundle.contentBundleChecksum,
        computedContentBundleChecksum: loaded.bundle.contentBundleChecksum,
        approvalStatus: loaded.bundle.approvalStatus,
        containsPlaceholderContent: loaded.bundle.containsPlaceholderContent,
      });
      if (gate.status !== "passed") {
        throw new Error(`内容闸门未通过：${gate.failureCodes.join("、")}`);
      }
      const store = await IndexedDbStage4Store.create({
        factory: indexedDB,
        databaseName: "last-page-progress-report-stage5",
      });
      this.access = loaded.access;
      this.gate = gate;
      this.store = store;
      this.engine = new Stage4SessionEngine({
        store,
        reducerPorts: { clock: browserClock, idGenerator: this.idGenerator },
        ownerToken: this.ownerToken,
        locks: typeof navigator !== "undefined" ? navigator.locks : undefined,
      });
      if (this.requestedSessionId === null) {
        await this.createAndInitializeSession("已创建新的本地 Mock 体验。");
      } else {
        await this.restoreRequestedSession(this.requestedSessionId);
      }
    } catch (error) {
      this.failInitialization(error);
    }
  }

  async retryInitialization(): Promise<void> {
    await this.initialize();
  }

  async startNewSession(): Promise<void> {
    return this.runCommand(async () => {
      await this.createAndInitializeSession("已创建新的独立体验。");
    });
  }

  async start(): Promise<void> {
    return this.runCommand(async () => {
      await this.dispatch({ eventType: "START" }, "已进入肖像序章。");
    });
  }

  async submitPortraitDescriptors(descriptorIds: readonly string[]): Promise<void> {
    return this.runCommand(async () => {
      const access = this.requireAccess();
      const descriptors: PortraitDescriptor[] =
        access.contentMode === "placeholder"
          ? access.portraits.flatMap((portrait) =>
              portrait.descriptorOptions
                .filter((option) => descriptorIds.includes(option.id))
                .map((option) => ({
                  id: option.id,
                  stage: portrait.stage,
                  label: option.label,
                })),
            )
          : access.portraits.flatMap((portrait) =>
              portrait.descriptorOptions
                .filter((option) => descriptorIds.includes(option.id))
                .map((option) => ({
                  id: option.id,
                  stage: portrait.charlieStage,
                  label: option.label,
                })),
            );
      for (const stage of ["early", "peak", "futureFacing"] as const) {
        if (!descriptors.some((descriptor) => descriptor.stage === stage)) {
          throw new Error("每一幅肖像至少选择一个描述词。");
        }
      }
      await this.dispatch(
        { eventType: "SET_PORTRAIT_DESCRIPTORS", descriptors },
        "肖像描述已保存。",
      );
    });
  }

  async submitInitialPortrait(input: {
    choice: Stage5PortraitStage;
    reason: string;
  }): Promise<void> {
    return this.runCommand(async () => {
      await this.dispatch({ eventType: "CHOOSE_INITIAL_PORTRAIT", choice: input.choice });
      await this.dispatch(
        { eventType: "SUBMIT_INITIAL_REASON", reason: input.reason },
        "初始判断已记录，进入第一轮。",
      );
    });
  }

  async submitRound(input: { response: string; clarification?: string }): Promise<void> {
    return this.runCommand(async () => {
      const roundId = currentRoundId(this.requireState().stage);
      if (roundId === null) throw new Error("当前阶段不能提交轮次回答。");
      await this.dispatch({ eventType: "SUBMIT_RESPONSE", roundId, response: input.response });
      const setup = await this.prepareRound(roundId);
      if (input.clarification?.trim()) {
        await this.dispatch({
          eventType: "SUBMIT_CLARIFICATION",
          roundId,
          clarification: input.clarification,
          operation: setup.boundary.activeOperation,
        });
      } else {
        await this.dispatch({
          eventType: "CONTINUE_WITHOUT_CLARIFICATION",
          roundId,
          operation: setup.boundary.activeOperation,
        });
      }
      let outcome: Stage3TerminalArtifact | Awaited<
        ReturnType<typeof orchestrateRoundAnalysis>
      >;
      if (this.requestedMode === "live") {
        const { evidenceContext: _evidenceContext, ...generateCharlieResponse } =
          setup.portInput.generateCharlieResponse;
        void _evidenceContext;
        const liveRequest = stage6LiveRequestSchema.parse({
          stage6TransportVersion: STAGE6_TRANSPORT_VERSION,
          executionKind: "round_analysis",
          sessionId: this.requireState().sessionId,
          priorBudgetUsage: setup.boundary.budget.priorUsage,
          operationContext: clientOperationContext(
            setup.boundary.operationContext,
          ),
          input: {
            ...setup.portInput,
            generateCharlieResponse,
          },
        });
        try {
          outcome = await this.executeLiveRequest(liveRequest);
        } catch (error) {
          if (!ordinaryLiveFallbackAllowed(error)) throw error;
          const fallbackAdapterVersion = this.localFallbackPort.adapterVersion;
          outcome = await orchestrateRoundAnalysis({
            ...setup,
            boundary: mockFallbackBoundary(
              setup.boundary,
              fallbackAdapterVersion,
            ),
            capabilityContexts: mapMockFallbackContexts(
              setup.capabilityContexts,
              fallbackAdapterVersion,
            ),
            port: this.localFallbackPort,
            fallbacks: await staticRoundFallbacks(
              setup.portInput,
              setup.capabilityContexts,
            ),
          });
        }
      } else {
        outcome = await orchestrateRoundAnalysis({
          ...setup,
          port:
            roundId === "round1"
              ? await createFirstRoundDiffPort(setup.portInput)
              : new DeterministicMockAgentAdapter(),
        });
      }
      if (outcome.outcomeKind === "preflight_rejected") {
        throw new Error(`Mock 编排预检失败：${outcome.detail}`);
      }
      await this.dispatch(outcome.event, "本轮 Mock 分析已完成。", outcome.budgetUsage);
      await this.runEntryActions();
    });
  }

  async decideDiff(decision: "accept" | "reject"): Promise<void> {
    return this.runCommand(async () => {
      const pending = this.requireState().manuscript.pendingDiff;
      if (pending === null) throw new Error("当前没有待审阅的修改。");
      const transitionId = this.idGenerator.next("transition");
      if (decision === "accept") {
        await this.dispatch(
          {
            eventType: "ACCEPT_DIFF",
            diffId: pending.id,
            transitionId,
            nextRevisionId: this.idGenerator.next("revision"),
          },
          "修改已接受并原子保存。",
        );
      } else {
        await this.dispatch(
          { eventType: "REJECT_DIFF", diffId: pending.id, transitionId },
          "修改已拒绝；分歧已保留。",
        );
      }
      await this.runEntryActions();
    });
  }

  async chooseFragmentPlacement(input: {
    fragmentId: string;
    placement: "restored_to_plain_text" | "margin_note" | "bouquet";
  }): Promise<void> {
    return this.runCommand(async () => {
      const placement =
        input.placement === "margin_note"
          ? "saved_as_margin_note"
          : input.placement === "bouquet"
            ? "placed_in_bouquet"
            : "restored_to_plain_text";
      await this.dispatch({
        eventType: "CHOOSE_FRAGMENT_PLACEMENT",
        fragmentId: input.fragmentId,
        placement,
        ...(placement === "placed_in_bouquet"
          ? { bouquetEntryId: this.idGenerator.next("transition") }
          : {}),
      });
      if (placement !== "restored_to_plain_text") {
        await this.runEntryActions();
      } else {
        this.announce("恢复方向已选择；请先审阅冻结的替换内容再确认。");
      }
    });
  }

  async confirmRestoration(proposalId: string): Promise<void> {
    return this.runCommand(async () => {
      await this.dispatch({
        eventType: "CONFIRM_SEMANTIC_RESTORATION_PROPOSAL",
        proposalId,
        nextPlainRevisionId: this.idGenerator.next("revision"),
      });
      await this.runEntryActions();
    });
  }

  async rejectRestoration(proposalId: string): Promise<void> {
    return this.runCommand(async () => {
      await this.dispatch({
        eventType: "REJECT_SEMANTIC_RESTORATION_PROPOSAL",
        proposalId,
      });
      this.announce("恢复提案已拒绝；请选择页边批注或语义花束。");
    });
  }

  async submitFinalPortrait(input: { choice: string; reason?: string }): Promise<void> {
    return this.runCommand(async () => {
      const choice = input.choice as "early" | "peak" | "futureFacing" | "all_three" | "no_unique_answer";
      await this.dispatch({ eventType: "CHOOSE_FINAL_PORTRAIT", choice });
      const state = this.requireState();
      const operation = this.simpleOperation(state, "computePortraitShift");
      await this.dispatch(
        input.reason?.trim()
          ? { eventType: "SUBMIT_FINAL_REASON", reason: input.reason, operation }
          : { eventType: "CONTINUE_WITHOUT_FINAL_REASON", operation },
      );
      const active = this.requireState().runtime.activeOperation!;
      const current = this.requireState();
      const comparison = computePortraitShift({
        initialChoice: current.portraits.initialRecord!.initialChoice,
        finalChoice: current.portraits.finalChoice!,
        relatedEvidenceIds: current.evidenceUsed.map((evidence) => evidence.id),
        relatedRevisionIds: [
          current.manuscript.preciseRevisionId,
          current.manuscript.plainRevisionId!,
        ],
      });
      await this.dispatch({
        ...operationResultHeader(active, browserClock),
        eventType: "PORTRAIT_SHIFT_COMPUTED",
        capability: "computePortraitShift",
        outcome: "succeeded",
        comparison,
        receipt: this.deterministicReceipt(active),
      });
      await this.runEntryActions();
    });
  }

  async requestSignature(
    status: "signed" | "declined" | "unavailable",
  ): Promise<void> {
    return this.runCommand(async () => {
      await this.runSignatureReview(status);
    });
  }

  async skipSignature(): Promise<void> {
    return this.runCommand(async () => {
      await this.dispatch(
        { eventType: "CONTINUE_WITHOUT_SIGNATURE_REVIEW" },
        "签名审阅未请求；技术状态与角色拒绝保持区分。",
      );
    });
  }

  async returnToManuscript(): Promise<void> {
    return this.runCommand(async () => {
      await this.dispatch({ eventType: "RETURN_TO_MANUSCRIPT_REVIEW" });
    });
  }

  async cancelManuscriptRevision(): Promise<void> {
    return this.runCommand(async () => {
      await this.dispatch({ eventType: "CANCEL_MANUSCRIPT_REVISION" });
    });
  }

  async submitManuscriptRevision(input: {
    draftPreciseText: string;
    reason: string;
  }): Promise<void> {
    return this.runCommand(async () => {
      await this.dispatch({
        eventType: "SUBMIT_MANUSCRIPT_REVISION",
        draftPreciseText: input.draftPreciseText,
        nextRevisionId: this.idGenerator.next("revision"),
        reason: input.reason,
      });
      await this.runEntryActions();
    });
  }

  async chooseDisposition(disposition: Stage5Disposition): Promise<void> {
    return this.runCommand(async () => {
      const state = this.requireState();
      const stagedId = this.idGenerator.peek("stage_instance");
      const operation = this.simpleOperation(
        {
          ...state,
          stage: "FINALIZING",
          stageInstanceId: stagedId,
          runtime: { stageInstanceId: stagedId, activeOperation: null },
        },
        "persistFinalEnvelope",
      );
      await this.dispatch({
        eventType: "CHOOSE_DISPOSITION",
        disposition,
        finalizationContext: {
          targetEnvironment: this.targetEnvironment,
          contentGateEvaluation: this.requireGate(),
          requiresContentGateAttestation: false,
          contentGateAttestation: null,
          requiredCapabilityReceipts: [],
        },
        operation,
      });
      if (this.requireState().stage === "FINALIZING") {
        await this.runEntryActions();
      } else {
        this.announce("当前文稿仍有未满足的最终化条件。", this.finalizationBlockers());
      }
    });
  }

  private async createAndInitializeSession(message: string): Promise<void> {
    const access = this.requireAccess();
    const engine = this.requireEngine();
    const descriptors =
      access.contentMode === "placeholder"
        ? access.portraits.map((portrait) => {
            const option = portrait.descriptorOptions[0];
            if (option === undefined) throw new Error("肖像描述词内容缺失。");
            return { id: option.id, stage: portrait.stage, label: option.label };
          })
        : access.portraits.map((portrait) => {
            const option = portrait.descriptorOptions[0];
            if (option === undefined) throw new Error("肖像描述词内容缺失。");
            return {
              id: option.id,
              stage: portrait.charlieStage,
              label: option.label,
            };
          });
    const created = createStage4Session({
      contentBinding: {
        ...access.binding,
        targetEnvironment: this.targetEnvironment,
      },
      originalInteraction: access.originalInteraction.item,
      preciseRevisionId: this.idGenerator.next("revision"),
      portraitDescriptors: descriptors,
      configuration: { requestedAgentMode: this.requestedMode },
      provenance: {
        contractVersionVector: buildStage4ContractVersionVector(),
        capabilityExecutionReceipts: [],
      },
      clock: browserClock,
      idGenerator: this.idGenerator,
    });
    const fingerprint = await this.fingerprint({ kind: "initialize", sessionId: created.state.sessionId });
    const result = await engine.initialize({
      ...created,
      transitionKey: `${created.state.sessionId}:initialize`,
      inputFingerprint: fingerprint,
    });
    this.current = result.snapshot;
    this.requestedSessionId = created.state.sessionId;
    this.writeSessionUrl(created.state.sessionId);
    this.publishReady({ kind: "new", message }, message);
  }

  private async restoreRequestedSession(sessionId: string): Promise<void> {
    const store = this.requireStore();
    const existing = await store.load(sessionId);
    if (existing === null) {
      this.setSnapshot({
        status: "blocked",
        persistence: "failed",
        announcement: "没有找到这个本地体验。",
        error: "恢复链接在此浏览器中没有对应的本地 Session。",
        recovery: {
          kind: "rejected",
          message: "本地 Session 不存在。",
          code: "session_not_found",
          details: ["Session 数据只保存在创建它的浏览器中。"],
        },
        view: null,
      });
      return;
    }
    if (
      existing.state.configuration.requestedAgentMode !== this.requestedMode
    ) {
      throw new Error(
        "Session 的 Agent mode 与当前应用模式不一致，不能混合恢复。",
      );
    }
    const recovered = recoverStage4Session({
      persistedState: existing.state,
      sidecars: existing.sidecars,
      integrityValid: true,
      expectedContentBinding: {
        ...this.requireAccess().binding,
        targetEnvironment: this.targetEnvironment,
      },
      expectedContractVersionVector: buildStage4ContractVersionVector(),
      now: browserClock.now(),
      idGenerator: this.idGenerator,
    });
    if (recovered.kind === "rejected") {
      this.setSnapshot({
        status: "blocked",
        persistence: "failed",
        announcement: "本地体验未能安全恢复。",
        error: `恢复被拒绝：${recovered.code}`,
        recovery: {
          kind: "rejected",
          message: "恢复安全检查未通过。",
          code: recovered.code,
          details: recovered.details,
        },
        view: null,
      });
      return;
    }
    if (recovered.access === "read_only") {
      this.current = {
        ...existing,
        state: stage4SessionStateSchema.parse(recovered.state),
        sidecars: recovered.sidecars ?? existing.sidecars,
      };
      this.publishReady(
        {
          kind: "restored",
          message: "完整封套已按只读兼容规则恢复。",
          action: "none",
          invalidatedOperationId: null,
        },
        "只读 FinalEnvelope 已恢复。",
      );
      return;
    }
    const fingerprint = await this.fingerprint({
      kind: "recovery",
      priorRevision: existing.state.stateRevision,
      invalidatedOperationId: recovered.invalidatedOperationId,
    });
    const committed = await store.commit({
      sessionId,
      expectedRevision: existing.state.stateRevision,
      expectedOwnerToken: existing.ownerToken,
      ownerToken: this.ownerToken,
      transitionKey: `${sessionId}:${existing.state.stateRevision}:recovery`,
      inputFingerprint: fingerprint,
      committedAt: browserClock.now(),
      state: recovered.state,
      sidecars: recovered.sidecars,
    });
    this.current = committed.snapshot;
    const recoveryView: Stage5RecoveryView = {
      kind: "restored",
      message: "已通过完整性、内容绑定与 Contract 版本检查恢复。",
      action: recovered.action,
      invalidatedOperationId: recovered.invalidatedOperationId,
    };
    this.publishReady(recoveryView, "本地体验已恢复。" );
    if (recovered.action === "resume_deterministic_operation") {
      await this.runEntryActions();
    }
  }

  private async prepareRound(roundId: "round1" | "round2" | "round3") {
    const state = this.requireState();
    const sidecars = this.requireCurrent().sidecars;
    const content = this.requireAccess();
    const privateRound = sidecars.privateInputs.rounds.find((item) => item.roundId === roundId);
    let allowedEvidenceIds: string[] = [];
    let evidenceContext: AgentEvidenceContext;
    let prohibitedClaims: readonly string[];
    if (content.contentMode === "placeholder") {
      const placeholderCard = content.evidenceCards.find(
        (candidate) => candidate.round === roundId,
      );
      if (placeholderCard === undefined) throw new Error("当前轮次的内容卡缺失。");
      prohibitedClaims = placeholderCard.prohibitedClaims;
      evidenceContext = {
            contentMode: "placeholder",
            evidenceCards: [{ id: placeholderCard.id, publicSummary: placeholderCard.publicText }],
            allowedEvidenceIds,
          };
    } else {
      const verifiedCard = content.evidenceCards.find(
        (candidate) => candidate.round === roundId,
      );
      if (verifiedCard === undefined) throw new Error("当前轮次的内容卡缺失。");
      prohibitedClaims = verifiedCard.prohibitedClaims;
      const factIds = [...verifiedCard.factIds];
      allowedEvidenceIds = factIds;
      evidenceContext = {
            contentMode: "verified",
            verifiedFacts: [...content.getVerifiedFactsByIds(factIds)],
            allowedEvidenceIds: factIds,
          };
    }
    const portInput: RoundAnalysisPortInput = {
      contentBinding: operationContentBinding(state),
      revisions: operationRevisionBinding(state),
      extractUserPrinciple: {
        roundId,
        untrustedUserText: privateRound?.response ?? "",
        allowedEvidenceIds,
      },
      detectTension: {
        roundId,
        priorPrinciples: state.userPrinciples,
        initialPortraitChoice: state.portraits.initialRecord!.initialChoice,
        charliePositions: state.charliePositions,
        preciseRevisionId: state.manuscript.preciseRevisionId,
        preciseText: state.manuscript.preciseText,
        plainRevisionId: state.manuscript.plainRevisionId,
        plainText: state.manuscript.plainText,
        allowedEvidenceIds,
      },
      generateCharlieResponse: {
        roundId,
        preciseRevisionId: state.manuscript.preciseRevisionId,
        preciseText: state.manuscript.preciseText,
        evidenceContext,
      },
      proposeDocumentDiff: {
        documentTarget: "precise_text",
        baseRevisionId: state.manuscript.preciseRevisionId,
        currentText: state.manuscript.preciseText,
        allowedEvidenceIds,
      },
    };
    const safetyPolicy = this.agentSafetyPolicy(prohibitedClaims);
    const materials = buildRoundAnalysisSemanticMaterials({ portInput, safetyPolicy });
    const identity = newOperationIdentity(this.idGenerator);
    const operationContext = await createAgentRequestContext({
      ...this.agentContextIdentity(),
      state,
      capability: "executeRoundAnalysis",
      identity,
      semanticMaterial: materials.operation,
      resultSchemaVersion: ROUND_ANALYSIS_BUNDLE_SCHEMA_VERSION,
    });
    const capabilityContexts = Object.fromEntries(
      await Promise.all(
        (["extractUserPrinciple", "detectTension", "generateCharlieResponse", "proposeDocumentDiff"] as const).map(
          async (capability) => [
            capability,
            await createAgentRequestContext({
              ...this.agentContextIdentity(),
              state,
              capability,
              identity,
              semanticMaterial: materials[capability],
              resultSchemaVersion: AGENT_RESULT_SCHEMA_VERSIONS[capability],
            }),
          ],
        ),
      ),
    ) as Record<"extractUserPrinciple" | "detectTension" | "generateCharlieResponse" | "proposeDocumentDiff", RequestContext>;
    return {
      boundary: createOperationBoundary({
        context: operationContext,
        slot: roundId === "round1" ? "round_1" : roundId === "round2" ? "round_2" : "round_3",
        sidecars,
        clock: browserClock,
        availability: this.executionAvailability(),
      }),
      portInput,
      validationContext: { safetyPolicy },
      capabilityContexts,
      fallbacks: roundFallbacks(),
    };
  }

  private async runPlainSemanticReview(): Promise<void> {
    const state = this.requireState();
    const sidecars = this.requireCurrent().sidecars;
    const identity = newOperationIdentity(this.idGenerator);
    const targetPlainRevisionId = deriveStage3EntityId({
      operationId: identity.operationId,
      entityKind: "plain_revision",
      ordinal: 0,
    });
    const portInput: PlainSemanticReviewPortInput = {
      contentBinding: operationContentBinding(state),
      sourcePreciseRevisionId: state.manuscript.preciseRevisionId,
      targetPlainRevisionId,
      preciseText: state.manuscript.preciseText,
    };
    const safetyPolicy = this.agentSafetyPolicy();
    const materials = buildPlainSemanticInputMaterials({ portInput, safetyPolicy });
    const operationContext = await createAgentRequestContext({
      ...this.agentContextIdentity(),
      state,
      capability: "executePlainSemanticReview",
      identity,
      semanticMaterial: materials.operation,
      resultSchemaVersion: PLAIN_SEMANTIC_BUNDLE_SCHEMA_VERSION,
      plainRevisionId: targetPlainRevisionId,
    });
    const capabilityContext = await createAgentRequestContext({
      ...this.agentContextIdentity(),
      state,
      capability: "compareSemanticDrift",
      identity,
      semanticMaterial: materials.compareSemanticDrift,
      resultSchemaVersion: AGENT_RESULT_SCHEMA_VERSIONS.compareSemanticDrift,
      plainRevisionId: targetPlainRevisionId,
    });
    const boundary = createOperationBoundary({
      context: operationContext,
      slot: "plain_semantic",
      sidecars,
      clock: browserClock,
      availability: this.executionAvailability(),
    });
    await this.activateSystemOperation(boundary.activeOperation, "plain-semantic");
    const port = new DeterministicMockAgentAdapter({
      ...DEFAULT_MOCK_AGENT_FIXTURE,
      semanticRestorationMode: "proposal",
      semanticFragmentPhrase: "现在的意愿",
      semanticFragmentReason: "朴素表达可能淡化现在意愿的优先边界。",
      semanticFragmentConsequence: "读者可能把这句话理解为一般性的未来授权。",
      semanticRestorationReplacementText: "（仍以现在的意愿为准）",
    });
    let outcome: Stage3TerminalArtifact | Awaited<
      ReturnType<typeof orchestratePlainSemanticReview>
    >;
    if (this.requestedMode === "live") {
      const liveRequest = stage6LiveRequestSchema.parse({
        stage6TransportVersion: STAGE6_TRANSPORT_VERSION,
        executionKind: "plain_semantic_review",
        sessionId: state.sessionId,
        priorBudgetUsage: sidecars.budgetUsage,
        operationContext: clientOperationContext(operationContext),
        input: portInput,
      });
      try {
        outcome = await this.executeLiveRequest(liveRequest);
      } catch (error) {
        if (!ordinaryLiveFallbackAllowed(error)) throw error;
        const fallbackAdapterVersion = this.localFallbackPort.adapterVersion;
        outcome = await orchestratePlainSemanticReview({
          boundary: mockFallbackBoundary(boundary, fallbackAdapterVersion),
          port: this.localFallbackPort,
          portInput,
          validationContext: { safetyPolicy },
          capabilityContext: mockFallbackContext(
            capabilityContext,
            fallbackAdapterVersion,
          ),
          fallback: await staticCandidateFallback(
            "plain_semantic_review",
            portInput,
            capabilityContext,
          ),
        });
      }
    } else {
      outcome = await orchestratePlainSemanticReview({
        boundary,
        port,
        portInput,
        validationContext: { safetyPolicy },
        capabilityContext,
        fallback: UNAVAILABLE,
      });
    }
    if (outcome.outcomeKind === "preflight_rejected") {
      throw new Error(`朴素版本预检失败：${outcome.detail}`);
    }
    await this.dispatch(outcome.event, "朴素版本与语义复核已原子保存。", outcome.budgetUsage);
  }

  private async runPortraitSummary(): Promise<void> {
    const state = this.requireState();
    const sidecars = this.requireCurrent().sidecars;
    const identity = newOperationIdentity(this.idGenerator);
    const allowedEvidenceIds: string[] = [];
    const summaryInput = {
      comparison: state.portraits.comparison!,
      allowedEvidenceIds,
      allowedRevisionIds: [state.manuscript.preciseRevisionId, state.manuscript.plainRevisionId!],
    };
    const access = this.requireAccess();
    const evidenceContext: AgentEvidenceContext =
      access.contentMode === "placeholder"
        ? {
            contentMode: "placeholder",
            evidenceCards: access.evidenceCards.map((card) => ({
              id: card.id,
              publicSummary: card.publicText,
            })),
            allowedEvidenceIds,
          }
        : {
            contentMode: "verified",
            verifiedFacts: [],
            allowedEvidenceIds,
          };
    const safetyPolicy = this.agentSafetyPolicy();
    const materials = buildPortraitSummaryInputMaterials({ summaryInput, evidenceContext, safetyPolicy });
    const operationContext = await createAgentRequestContext({
      ...this.agentContextIdentity(),
      state,
      capability: "executePortraitShiftSummary",
      identity,
      semanticMaterial: materials.operation,
      resultSchemaVersion: AGENT_RESULT_SCHEMA_VERSIONS.summarizePortraitShift,
    });
    const capabilityContext = await createAgentRequestContext({
      ...this.agentContextIdentity(),
      state,
      capability: "summarizePortraitShift",
      identity,
      semanticMaterial: materials.summarizePortraitShift,
      resultSchemaVersion: AGENT_RESULT_SCHEMA_VERSIONS.summarizePortraitShift,
    });
    const boundary = createOperationBoundary({
      context: operationContext,
      slot: "portrait_shift_summary",
      sidecars,
      clock: browserClock,
      availability: this.executionAvailability(),
    });
    await this.activateSystemOperation(boundary.activeOperation, "portrait-summary");
    let outcome: Stage3TerminalArtifact | Awaited<
      ReturnType<typeof orchestratePortraitShiftSummary>
    >;
    if (this.requestedMode === "live") {
      const liveRequest = stage6LiveRequestSchema.parse({
        stage6TransportVersion: STAGE6_TRANSPORT_VERSION,
        executionKind: "portrait_shift_summary",
        sessionId: state.sessionId,
        priorBudgetUsage: sidecars.budgetUsage,
        operationContext: clientOperationContext(operationContext),
        input: summaryInput,
      });
      try {
        outcome = await this.executeLiveRequest(liveRequest);
      } catch (error) {
        if (!ordinaryLiveFallbackAllowed(error)) throw error;
        const fallbackAdapterVersion = this.localFallbackPort.adapterVersion;
        outcome = await orchestratePortraitShiftSummary({
          boundary: mockFallbackBoundary(boundary, fallbackAdapterVersion),
          port: this.localFallbackPort,
          summaryInput,
          validationContext: { safetyPolicy },
          evidenceContext,
          capabilityContext: mockFallbackContext(
            capabilityContext,
            fallbackAdapterVersion,
          ),
          fallback: await staticCandidateFallback(
            "portrait_shift_summary",
            summaryInput,
            capabilityContext,
          ),
        });
      }
    } else {
      outcome = await orchestratePortraitShiftSummary({
        boundary,
        port: new DeterministicMockAgentAdapter(),
        summaryInput,
        validationContext: { safetyPolicy },
        evidenceContext,
        capabilityContext,
        fallback: UNAVAILABLE,
      });
    }
    if (outcome.outcomeKind === "preflight_rejected") {
      throw new Error(`肖像摘要预检失败：${outcome.detail}`);
    }
    await this.dispatch(outcome.event, "肖像变化摘要已完成。", outcome.budgetUsage);
  }

  private async runPostPlacementCheck(): Promise<void> {
    const state = this.requireState();
    const operation = this.simpleOperation(state, "checkPostPlacementConsistency");
    await this.activateSystemOperation(operation, "placement-consistency", true);
    const active = this.requireState().runtime.activeOperation!;
    const current = this.requireState();
    await this.dispatch({
      ...operationResultHeader(active, browserClock),
      eventType: "POST_PLACEMENT_CHECK_SUCCEEDED",
      capability: "checkPostPlacementConsistency",
      outcome: "succeeded",
      nextDrift: semanticDriftSchema.parse({
        ...current.semanticDrift,
        preciseRevisionId: current.manuscript.preciseRevisionId,
        plainRevisionId: current.manuscript.plainRevisionId,
        status: "current",
      }),
    }, "语义安放的一致性检查已完成。");
  }

  private async runSignatureReview(
    status: "signed" | "declined" | "unavailable",
  ): Promise<void> {
    const state = this.requireState();
    if (state.manuscript.plainText === null || state.manuscript.plainRevisionId === null) {
      throw new Error("签名审阅需要完整的双文本版本。");
    }
    const reviewInput = charlieSignatureReviewInputSchema.parse({
      preciseRevisionId: state.manuscript.preciseRevisionId,
      plainRevisionId: state.manuscript.plainRevisionId,
      preciseText: state.manuscript.preciseText,
      plainText: state.manuscript.plainText,
      allowedEvidenceIds: [],
      unresolvedDissents: state.openDissents,
      contentBundleId: state.contentBinding.contentBundleId,
      contentBundleVersion: state.contentBinding.contentBundleVersion,
      contentBundleChecksum: state.contentBinding.contentBundleChecksum,
      finalReviewSchemaVersion: FINAL_REVIEW_SCHEMA_VERSION,
    });
    const evidenceContext =
      this.requestedMode === "live"
        ? await this.resolveLiveFinalReviewEvidence(reviewInput)
        : resolvedFinalReviewEvidenceContextSchema.parse({
            evidenceMode: "placeholder",
            contentBundleId: state.contentBinding.contentBundleId,
            contentBundleVersion: state.contentBinding.contentBundleVersion,
            contentBundleChecksum: state.contentBinding.contentBundleChecksum,
            placeholderEvidenceIds: [],
            evidenceItems: [],
          });
    const safetyPolicy = DEFAULT_CHARLIE_SIGNATURE_REVIEW_SAFETY_POLICY;
    const materials = buildFinalReviewInputMaterials({ reviewInput, evidenceContext, safetyPolicy });
    const identity = newOperationIdentity(this.idGenerator);
    const operationBase = this.finalReviewContextBase(state, identity, "executeCharlieSignatureReview");
    const reviewBase = this.finalReviewContextBase(state, identity, "reviewCharlieSignature");
    const operationContext = await this.withFinalReviewFingerprint(operationBase, materials.operation);
    const reviewContext = charlieSignatureReviewRequestContextSchema.parse(
      await this.withFinalReviewFingerprint(reviewBase, materials.reviewCharlieSignature),
    );
    const boundary = createOperationBoundary({
      context: operationContext,
      slot: "signature_review",
      sidecars: this.requireCurrent().sidecars,
      clock: browserClock,
      availability: this.executionAvailability(false),
    });
    const fingerprintMaterial = signatureReviewFingerprintMaterialSchema.parse({
      capability: "reviewCharlieSignature",
      requestedMode: this.requestedMode,
      bindings: {
        revisions: {
          preciseRevisionId: state.manuscript.preciseRevisionId,
          plainRevisionId: state.manuscript.plainRevisionId,
        },
        content: operationContentBinding(state),
      },
      finalReviewSchemaVersion: FINAL_REVIEW_SCHEMA_VERSION,
      semanticInputDigest: reviewContext.inputFingerprint,
    });
    await this.dispatch({
      eventType:
        state.currentCharlieSignatureStatus === "unavailable"
          ? "RETRY_CHARLIE_SIGNATURE_REVIEW"
          : "REQUEST_CHARLIE_SIGNATURE_REVIEW",
      fingerprintMaterial,
      operation: boundary.activeOperation,
    });
    let outcome: Stage3TerminalArtifact | Awaited<
      ReturnType<typeof orchestrateCharlieSignatureReview>
    >;
    if (this.requestedMode === "live") {
      const liveRequest = stage6LiveRequestSchema.parse({
        stage6TransportVersion: STAGE6_TRANSPORT_VERSION,
        executionKind: "charlie_signature_review",
        sessionId: state.sessionId,
        priorBudgetUsage: this.requireCurrent().sidecars.budgetUsage,
        operationContext: clientOperationContext(operationContext),
        input: reviewInput,
      });
      try {
        outcome = await this.executeLiveRequest(liveRequest);
      } catch (error) {
        if (!ordinaryLiveFallbackAllowed(error)) throw error;
        outcome = await orchestrateCharlieSignatureReview({
          boundary,
          service: unavailableLiveFinalReviewService(),
          reviewInput,
          reviewContext,
          evidenceContext,
          safetyPolicy,
        });
      }
    } else {
      const reviewedStatus = status === "declined" ? "declined" : "signed";
      const service = new DeterministicMockFinalReviewService({
        fixture: {
          fixtureId: `stage5-${status}`,
          candidate: {
            status: reviewedStatus,
            finalReviewSchemaVersion: FINAL_REVIEW_SCHEMA_VERSION,
            reason:
              reviewedStatus === "signed"
                ? "两种文本保留了当前意愿的边界，我愿意为这次呈现签名。"
                : "这次呈现仍未保留我认为必要的边界，我明确拒绝签名。",
            evidenceIds:
              status === "unavailable" ? ["untrusted-missing-evidence"] : [],
          },
        },
      });
      outcome = await orchestrateCharlieSignatureReview({
        boundary,
        service,
        reviewInput,
        reviewContext,
        evidenceContext,
        safetyPolicy,
      });
    }
    if (outcome.outcomeKind === "preflight_rejected") {
      throw new Error(`签名审阅预检失败：${outcome.detail}`);
    }
    await this.dispatch(
      outcome.event,
      this.requestedMode === "live"
        ? "Live 签名审阅已完成；技术失败只会记录为 unavailable。"
        : status === "unavailable"
          ? "Mock 签名审阅模拟了技术上未完成；这不是角色拒绝。"
          : `Mock 签名审阅结果：${status}。`,
      outcome.budgetUsage,
    );
  }

  private async finalizeEnvelope(): Promise<void> {
    const state = this.requireState();
    const active = state.runtime.activeOperation;
    if (active === null) throw new Error("最终化 operation 缺失。");
    const envelope = await buildStage4FinalEnvelope({
      state,
      contentSnapshot: projectFinalEnvelopeContentSnapshot({
        access: this.requireAccess(),
        targetEnvironment: this.targetEnvironment,
      }),
      clock: browserClock,
      idGenerator: this.idGenerator,
    });
    await this.dispatch({
      ...operationResultHeader(active, browserClock),
      eventType: "FINAL_ENVELOPE_PERSISTED",
      capability: "persistFinalEnvelope",
      outcome: "succeeded",
      envelope,
    }, "封套已完成并保存。" );
  }

  private async runEntryActions(): Promise<void> {
    const state = this.requireState();
    if (state.stage === "FINALIZING" && state.runtime.activeOperation !== null) {
      await this.finalizeEnvelope();
      return;
    }
    if (state.runtime.activeOperation !== null) return;
    if (state.stage === "PLAIN_REWRITE") {
      await this.runPlainSemanticReview();
      return;
    }
    if (
      state.stage === "SEMANTIC_PLACEMENT" &&
      state.semanticPlacementBatch?.status === "in_progress" &&
      state.semanticFragments.length > 0 &&
      state.semanticFragments.every((fragment) => fragment.placement !== null)
    ) {
      await this.runPostPlacementCheck();
      return;
    }
    if (
      state.stage === "PORTRAIT_REASSEMBLY" &&
      state.portraits.comparison !== null &&
      state.portraitShiftSummary === null
    ) {
      await this.runPortraitSummary();
      return;
    }
  }

  private async dispatch(
    event: Stage4Event,
    announcement = "更改已保存。",
    budgetUsage?: Stage4PersistenceSidecars["budgetUsage"],
  ): Promise<void> {
    const current = this.requireCurrent();
    const transitionKey = `${current.state.sessionId}:${current.state.stateRevision}:${event.eventType}`;
    const inputFingerprint = await this.fingerprint(event);
    const result = await this.requireEngine().dispatch({
      sessionId: current.state.sessionId,
      transitionKey,
      inputFingerprint,
      event,
      ...(budgetUsage === undefined ? {} : { budgetUsage }),
    });
    if (result.kind === "ignored_stale_result") {
      this.announce("已忽略不再匹配当前 Session 的旧结果。");
      return;
    }
    this.current = result.snapshot;
    this.publishReady(this.snapshot.recovery, announcement);
  }

  private async activateSystemOperation(
    operation: ActiveOperation,
    kind: string,
    placement = false,
  ): Promise<void> {
    await this.commitDerivedState(kind, (state) =>
      placement
        ? beginPostPlacementConsistencyOperation({ state, operation })
        : activateStage4Operation({
            state,
            operation,
            expectedCapability: operation.capability,
          }),
    );
  }

  private async commitDerivedState(
    kind: string,
    transform: (state: Stage4SessionState) => Stage4SessionState,
  ): Promise<void> {
    const current = this.requireCurrent();
    const now = browserClock.now();
    const transformed = transform(current.state);
    const next = stage4SessionStateSchema.parse({
      ...transformed,
      stateRevision: current.state.stateRevision + 1,
      updatedAt: now,
      expiresAt: new Date(Date.parse(now) + 24 * 60 * 60 * 1000).toISOString(),
    });
    const transitionKey = `${current.state.sessionId}:${current.state.stateRevision}:system:${kind}`;
    const inputFingerprint = await this.fingerprint({ kind, operation: next.runtime.activeOperation });
    const result = await this.requireStore().commit({
      sessionId: current.state.sessionId,
      expectedRevision: current.state.stateRevision,
      expectedOwnerToken: current.ownerToken,
      ownerToken: this.ownerToken,
      transitionKey,
      inputFingerprint,
      committedAt: now,
      state: next,
      sidecars: current.sidecars,
    });
    this.current = result.snapshot;
    this.publishReady(this.snapshot.recovery, "系统步骤已安全保存。");
  }

  private simpleOperation(state: Stage4SessionState, capability: string): ActiveOperation {
    return activeOperationSchema.parse({
      operationId: this.idGenerator.next("operation"),
      requestId: this.idGenerator.next("request"),
      capability,
      stage: state.stage,
      stageInstanceId: state.stageInstanceId,
      inputFingerprint: `sha256:${"a".repeat(64)}`,
      bindings: {
        revisions: operationRevisionBinding(state),
        content: operationContentBinding(state),
      },
      attempt: 1,
      status: "running",
      startedAt: browserClock.now(),
    });
  }

  private deterministicReceipt(operation: ActiveOperation) {
    return {
      capability: operation.capability,
      operationId: operation.operationId,
      requestId: operation.requestId,
      requestedMode: "mock" as const,
      resolvedMode: "deterministic" as const,
      outcome: "succeeded" as const,
      fallbackReason: null,
      promptVersion: null,
      adapterVersion: null,
      resultSchemaVersion: "0.2.0",
      inputFingerprintDigest: operation.inputFingerprint,
      startedAt: operation.startedAt,
      completedAt: browserClock.now(),
    };
  }

  private finalReviewContextBase(
    state: Stage4SessionState,
    identity: ReturnType<typeof newOperationIdentity>,
    capability: "executeCharlieSignatureReview" | "reviewCharlieSignature",
  ): RequestContext {
    return serializableRequestContextSchema.parse({
      operationId: identity.operationId,
      requestId: identity.requestId,
      requestedMode: this.requestedMode,
      capability,
      attempt: 1,
      inputFingerprint: `sha256:${"0".repeat(64)}`,
      promptVersion:
        this.requestedMode === "live" ? STAGE6_PROMPT_VERSION : null,
      adapterVersion:
        this.requestedMode === "live"
          ? DEEPSEEK_OPENAI_ADAPTER_VERSION
          : MOCK_FINAL_REVIEW_ADAPTER_VERSION,
      stage: state.stage,
      stageInstanceId: state.stageInstanceId,
      bindings: {
        revisions: operationRevisionBinding(state),
        content: operationContentBinding(state),
      },
    });
  }

  private async withFinalReviewFingerprint(
    context: RequestContext,
    semanticMaterial: unknown,
  ): Promise<RequestContext> {
    return serializableRequestContextSchema.parse({
      ...context,
      inputFingerprint: await computeStage3RequestFingerprint({
        context,
        semanticMaterial,
        agentContractVersion: null,
        resultSchemaVersion: FINAL_REVIEW_SCHEMA_VERSION,
      }),
    });
  }

  private agentSafetyPolicy(prohibitedClaims: readonly string[] = []): AgentSafetyPolicy {
    return {
      prohibitedClaims: [...prohibitedClaims],
      prohibitedInferences: [],
      allowedQuotedText: [],
    };
  }

  private async resolveLiveFinalReviewEvidence(
    reviewInput: CharlieSignatureReviewInput,
  ) {
    const resolution = await createGatedFinalReviewEvidenceResolver({
      evaluation: this.requireGate(),
      access: this.requireAccess(),
    }).resolveEvidence(reviewInput);
    if (
      resolution.resolutionKind === "error" ||
      resolution.evidenceContext.evidenceMode !== "verified"
    ) {
      throw new Error(
        "Live 签名审阅需要与当前内容绑定一致的 verified evidence。",
      );
    }
    return resolution.evidenceContext;
  }

  private agentContextIdentity() {
    return this.requestedMode === "live"
      ? {
          requestedMode: "live" as const,
          adapterVersion: DEEPSEEK_OPENAI_ADAPTER_VERSION,
          promptVersion: STAGE6_PROMPT_VERSION,
        }
      : {
          requestedMode: "mock" as const,
          adapterVersion: MOCK_AGENT_ADAPTER_VERSION,
          promptVersion: null,
        };
  }

  private executionAvailability(mock = true) {
    return this.requestedMode === "live"
      ? { live: true, mock }
      : { live: false, mock: true };
  }

  private finalizationBlockers(): readonly string[] {
    if (
      this.current === null ||
      this.gate === null ||
      this.current.state.stage !== "FINAL_DISPOSITION" ||
      this.current.state.finalDisposition === null
    ) {
      return [];
    }
    const result = evaluateFinalization(this.current.state, {
      targetEnvironment: this.targetEnvironment,
      contentGateEvaluation: this.gate,
      requiresContentGateAttestation: false,
      contentGateAttestation: null,
      requiredCapabilityReceipts: [],
    });
    return result.eligible
      ? []
      : result.blockers.map(
          ({ code, subject }) => (subject === null ? code : `${code}: ${subject}`),
        );
  }

  private async fingerprint(value: unknown): Promise<RuntimeSha256Digest> {
    return sha256NfcUtf8(canonicalizeJson(value));
  }

  private async executeLiveRequest(
    request: Stage6LiveRequest,
  ): Promise<Stage3TerminalArtifact> {
    this.liveAbortController?.abort();
    const controller = new AbortController();
    const generation = this.liveExecutionGeneration + 1;
    this.liveExecutionGeneration = generation;
    this.liveAbortController = controller;
    try {
      const artifact = await this.liveClient.execute(request, controller.signal);
      if (
        controller.signal.aborted ||
        generation !== this.liveExecutionGeneration
      ) {
        throw new Stage6LiveHttpError({
          code: "request_cancelled",
          message: "Live operation was cancelled before application commit",
          retryable: false,
        });
      }
      return artifact;
    } finally {
      if (this.liveAbortController === controller) {
        this.liveAbortController = null;
      }
    }
  }

  private async runCommand(command: () => Promise<void>): Promise<void> {
    if (this.inFlight !== null) return this.inFlight;
    this.setSnapshot({ ...this.snapshot, persistence: "saving", error: null });
    const task = command()
      .catch((error) => {
        const conflict = error instanceof Stage4PersistenceConflictError;
        this.setSnapshot({
          ...this.snapshot,
          persistence: conflict ? "conflict" : "failed",
          error: errorMessage(error),
          announcement: conflict
            ? "检测到另一个页面已更新此体验。"
            : "操作未完成，已提交的页面状态没有被提前推进。",
        });
      })
      .finally(() => {
        this.inFlight = null;
      });
    this.inFlight = task;
    return task;
  }

  private publishReady(recovery: Stage5RecoveryView | null, announcement: string): void {
    const current = this.requireCurrent();
    const blockers = this.finalizationBlockers();
    this.setSnapshot({
      status: "ready",
      persistence: "saved",
      announcement,
      error: null,
      recovery,
      view: projectStage5View({
        state: current.state,
        sidecars: current.sidecars,
        content: this.requireAccess(),
        blockers,
      }),
    });
  }

  private announce(announcement: string, blockers?: readonly string[]): void {
    const view =
      this.current === null || this.access === null
        ? this.snapshot.view
        : projectStage5View({
            state: this.current.state,
            sidecars: this.current.sidecars,
            content: this.access,
            blockers,
          });
    this.setSnapshot({ ...this.snapshot, announcement, view });
  }

  private failInitialization(error: unknown): void {
    this.setSnapshot({
      status: "blocked",
      persistence: "failed",
      announcement: "体验初始化失败。",
      error: errorMessage(error),
      recovery: null,
      view: null,
    });
  }

  private setSnapshot(snapshot: Stage5Snapshot): void {
    this.snapshot = Object.freeze(snapshot);
    for (const listener of this.listeners) listener();
  }

  private writeSessionUrl(sessionId: string): void {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    url.search = "";
    url.searchParams.set("session", sessionId);
    window.history.replaceState(null, "", url);
  }

  private requireCurrent(): Stage4AtomicSnapshot {
    if (this.current === null) throw new Error("Session 尚未准备完成。");
    return this.current;
  }
  private requireState(): Stage4SessionState {
    return this.requireCurrent().state;
  }
  private requireAccess(): ContentAccess {
    if (this.access === null) throw new Error("内容尚未准备完成。");
    return this.access;
  }
  private requireGate(): ContentGateEvaluation {
    if (this.gate === null) throw new Error("内容闸门尚未完成。");
    return this.gate;
  }
  private requireStore(): IndexedDbStage4Store {
    if (this.store === null) throw new Error("本地存储尚未准备完成。");
    return this.store;
  }
  private requireEngine(): Stage4SessionEngine {
    if (this.engine === null) throw new Error("Session engine 尚未准备完成。");
    return this.engine;
  }
}

async function createFirstRoundDiffPort(
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
            candidateSchemaVersion: AGENT_CANDIDATE_SCHEMA_VERSIONS.proposeDocumentDiff,
            kind: "diff",
            diff: {
              agentContractVersion: AGENT_CONTRACT_VERSION,
              candidateSchemaVersion: AGENT_CANDIDATE_SCHEMA_VERSIONS.proposeDocumentDiff,
              operation: "insert",
              baseRevisionId: input.revisions.preciseRevisionId,
              documentTarget: "precise_text",
              targetAnchor: anchor,
              newText: " 也请保留我此刻无法消除的犹疑。",
              reason: "让现在意愿的边界与尚未解决的分歧同时可见。",
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

function roundFallbacks(): RoundAnalysisFallbackPlan {
  return {
    extractUserPrinciple: UNAVAILABLE,
    detectTension: UNAVAILABLE,
    generateCharlieResponse: UNAVAILABLE,
    proposeDocumentDiff: UNAVAILABLE,
  };
}

function clientOperationContext(context: RequestContext) {
  const {
    promptVersion: _promptVersion,
    adapterVersion: _adapterVersion,
    abortSignal: _abortSignal,
    ...clientContext
  } = context;
  void _promptVersion;
  void _adapterVersion;
  void _abortSignal;
  return { ...clientContext, requestedMode: "live" as const };
}

function mockFallbackContext(
  context: RequestContext,
  adapterVersion: string = MOCK_AGENT_ADAPTER_VERSION,
): RequestContext {
  return {
    ...context,
    adapterVersion,
    promptVersion: null,
  };
}

function mockFallbackBoundary(
  boundary: OrchestrationOperationBoundary,
  adapterVersion: string = MOCK_AGENT_ADAPTER_VERSION,
): OrchestrationOperationBoundary {
  return {
    ...boundary,
    operationContext: mockFallbackContext(
      boundary.operationContext,
      adapterVersion,
    ),
    availability: { live: false, mock: true },
  };
}

function mapMockFallbackContexts<
  T extends Record<string, RequestContext>,
>(contexts: T, adapterVersion: string = MOCK_AGENT_ADAPTER_VERSION): T {
  return Object.fromEntries(
    Object.entries(contexts).map(([key, context]) => [
      key,
      mockFallbackContext(context, adapterVersion),
    ]),
  ) as T;
}

async function staticRoundFallbacks(
  portInput: RoundAnalysisPortInput,
  contexts: Record<
    | "extractUserPrinciple"
    | "detectTension"
    | "generateCharlieResponse"
    | "proposeDocumentDiff",
    RequestContext
  >,
): Promise<RoundAnalysisFallbackPlan> {
  const adapter = new Stage6StaticSafetyTemplateAdapter();
  try {
    const envelope = await adapter.executeRoundAnalysis(
      portInput,
      contexts.extractUserPrinciple,
    );
    const bundle =
      envelope.outcomeKind === "candidate"
        ? roundAnalysisCandidateBundleSchema.safeParse(envelope.candidate)
        : null;
    if (bundle === null || !bundle.success) return roundFallbacks();
    const roundId = portInput.extractUserPrinciple.roundId;
    return {
      extractUserPrinciple: staticRoundCandidate(
        bundle.data.principle,
        contexts.extractUserPrinciple,
        roundId,
        adapter.adapterVersion,
      ),
      detectTension: staticRoundCandidate(
        bundle.data.tension,
        contexts.detectTension,
        roundId,
        adapter.adapterVersion,
      ),
      generateCharlieResponse: staticRoundCandidate(
        bundle.data.charlieResponse,
        contexts.generateCharlieResponse,
        roundId,
        adapter.adapterVersion,
      ),
      proposeDocumentDiff: staticRoundCandidate(
        bundle.data.documentDiff,
        contexts.proposeDocumentDiff,
        roundId,
        adapter.adapterVersion,
      ),
    };
  } catch {
    return roundFallbacks();
  }
}

async function staticCandidateFallback(
  kind: "plain_semantic_review" | "portrait_shift_summary",
  input: PlainSemanticReviewPortInput | Parameters<
    ProviderNeutralAgentPort["summarizePortraitShift"]
  >[0],
  context: RequestContext,
): Promise<ExplicitCandidateFallback> {
  const adapter = new Stage6StaticSafetyTemplateAdapter();
  try {
    const envelope =
      kind === "plain_semantic_review"
        ? await adapter.executePlainSemanticReview(
            input as PlainSemanticReviewPortInput,
            context,
          )
        : await adapter.summarizePortraitShift(
            input as Parameters<
              ProviderNeutralAgentPort["summarizePortraitShift"]
            >[0],
            context,
          );
    if (envelope.outcomeKind !== "candidate") return UNAVAILABLE;
    return staticCandidate(
      envelope.candidate,
      context,
      adapter.adapterVersion,
    );
  } catch {
    return UNAVAILABLE;
  }
}

function staticCandidate(
  candidate: unknown,
  context: RequestContext,
  adapterVersion: string,
): Extract<ExplicitCandidateFallback, { kind: "candidate" }> {
  return {
    kind: "candidate",
    candidate,
    binding: {
      inputFingerprint: context.inputFingerprint,
      bindings: context.bindings,
    },
    observation: ZERO_AGENT_EXECUTION_OBSERVATION,
    executionIdentity: { adapterVersion, promptVersion: null },
    resolvedMode: "static_template",
    fallbackReason: "mock_fallback_failed_static_template",
  };
}

function staticRoundCandidate(
  candidate: unknown,
  context: RequestContext,
  roundId: string,
  adapterVersion: string,
) {
  return {
    ...staticCandidate(candidate, context, adapterVersion),
    binding: {
      inputFingerprint: context.inputFingerprint,
      bindings: context.bindings,
      roundId,
    },
  };
}

function unavailableLiveFinalReviewService(): FinalReviewService {
  return {
    executionMode: "live",
    adapterVersion: DEEPSEEK_OPENAI_ADAPTER_VERSION,
    async reviewCharlieSignature() {
      return charlieSignatureReviewServiceOutcomeSchema.parse({
        outcomeKind: "unavailable",
        error: createCharlieSignatureReviewError(
          "execution_unavailable",
          "The live Final Review route was unavailable",
        ),
        observation: ZERO_FINAL_REVIEW_EXECUTION_OBSERVATION,
      });
    },
  };
}

function ordinaryLiveFallbackAllowed(error: unknown): boolean {
  if (!(error instanceof Stage6LiveHttpError)) return true;
  return new Set<Stage6LiveHttpError["code"]>([
    "network_error",
    "invalid_response",
    "live_api_gate_closed",
    "rate_limited",
    "concurrency_limited",
    "invalid_terminal_artifact",
    "internal_error",
  ]).has(error.code);
}

function currentRoundId(stage: string): "round1" | "round2" | "round3" | null {
  if (stage === "ROUND_1_PAST_SELF") return "round1";
  if (stage === "ROUND_2_FORECAST") return "round2";
  if (stage === "ROUND_3_RELATIONSHIP") return "round3";
  return null;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "发生了未知错误。";
}

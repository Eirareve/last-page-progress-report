import type { ContentAccess } from "../content";
import { canManuallyRetrySignatureReview } from "../domain";
import type { Stage4PersistenceSidecars, Stage4SessionState } from "../fsm";
import type {
  Stage5EnvelopeView,
  Stage5FragmentView,
  Stage5PortraitStage,
  Stage5PortraitView,
  Stage5PresentationView,
  Stage5RoundView,
} from "./contracts";

const STAGE_TITLES: Readonly<Record<string, string>> = Object.freeze({
  WELCOME: "欢迎",
  PORTRAIT_PRELUDE: "三次看见查理",
  PORTRAIT_CHOICE: "哪一个最接近真正的查理？",
  ROUND_1_PAST_SELF: "第一轮：过去自我的解释权",
  ROUND_1_DIFF: "第一轮：审阅局部修改",
  ROUND_2_FORECAST: "第二轮：对未来的预测边界",
  ROUND_2_DIFF: "第二轮：审阅局部修改",
  ROUND_3_RELATIONSHIP: "第三轮：未来自我与他人的连接",
  ROUND_3_DIFF: "第三轮：审阅局部修改",
  PLAIN_REWRITE: "生成朴素版本",
  SEMANTIC_REVIEW: "语义复核",
  SEMANTIC_PLACEMENT: "安放不能被完整传递的意义",
  PORTRAIT_REASSEMBLY: "重新拼合三次看见",
  FINAL_SIGNATURE: "现在的查理是否签名？",
  MANUSCRIPT_REVISION: "返回修改手稿",
  FINAL_DISPOSITION: "这份文稿将被如何留下？",
  FINALIZING: "正在封存",
  COMPLETE: "未被签收的封套",
});

const ROUND_META = Object.freeze({
  round1: { title: "过去自我的解释权", stage: "ROUND_1_PAST_SELF" },
  round2: { title: "对未来的预测边界", stage: "ROUND_2_FORECAST" },
  round3: { title: "未来自我与他人的连接", stage: "ROUND_3_RELATIONSHIP" },
});

export function projectStage5View(input: {
  state: Stage4SessionState;
  sidecars: Stage4PersistenceSidecars;
  content: ContentAccess;
  blockers?: readonly string[];
}): Stage5PresentationView {
  const { state, sidecars, content } = input;
  const portraits = projectPortraits(content, state);
  const rounds = (Object.keys(ROUND_META) as (keyof typeof ROUND_META)[]).map(
    (roundId) => projectRound(roundId, state, sidecars, content),
  );
  const currentRound = rounds.find((round) =>
    state.stage.startsWith(round.roundId === "round1" ? "ROUND_1" : round.roundId === "round2" ? "ROUND_2" : "ROUND_3"),
  ) ?? null;
  const pending = state.manuscript.pendingDiff;
  const envelope = state.finalEnvelope === null ? null : projectEnvelope(state.finalEnvelope);
  const latestReceipt = state.provenance.capabilityExecutionReceipts.at(-1);

  return Object.freeze({
    sessionId: state.sessionId,
    stage: state.stage,
    stageTitle: STAGE_TITLES[state.stage] ?? state.stage,
    stateRevision: state.stateRevision,
    contentMode: content.contentMode,
    contentBundleVersion: content.binding.contentBundleVersion,
    contentSchemaVersion: content.binding.contentSchemaVersion,
    originalDeclaration: content.originalInteraction.publicDeclaration,
    originalAttribution: content.originalInteraction.attribution,
    portraits,
    initialChoice: state.portraits.initialRecord?.initialChoice ?? sidecars.pendingInitialChoice,
    initialReason: state.portraits.initialRecord?.initialReason ?? null,
    finalChoice: state.portraits.finalChoice,
    finalReason: state.portraits.finalReason,
    portraitShiftSummary: state.portraitShiftSummary,
    currentRound,
    rounds,
    preciseText: state.manuscript.preciseText,
    preciseRevisionId: state.manuscript.preciseRevisionId,
    plainText: state.manuscript.plainText,
    plainRevisionId: state.manuscript.plainRevisionId,
    pendingDiff:
      pending === null
        ? null
        : {
            id: pending.id,
            operation: pending.operation,
            newText: "newText" in pending ? pending.newText : null,
            reason: pending.reason,
          },
    revisionCount: state.manuscript.revisionHistory.length,
    semanticStatus: state.semanticDrift?.status ?? null,
    semanticFragments: state.semanticFragments.map((fragment) =>
      projectFragment(fragment, state),
    ),
    placementChecking:
      state.semanticPlacementBatch?.status === "checking_consistency",
    signatureStatus: state.currentCharlieSignatureStatus,
    signatureSummary:
      state.currentCharlieSignatureReview?.snapshotKind === "reviewed"
        ? state.currentCharlieSignatureReview.reason
        : state.currentCharlieSignatureReview?.snapshotKind === "unavailable"
          ? state.currentCharlieSignatureReview.summary
          : null,
    signatureRetryAvailable: canManuallyRetrySignatureReview({
      currentCharlieSignatureStatus: state.currentCharlieSignatureStatus,
      currentCharlieSignatureReview: state.currentCharlieSignatureReview,
      signatureReviewAttemptState: state.signatureReviewAttemptState,
    }),
    finalDisposition: state.finalDisposition,
    blockers: [...(input.blockers ?? [])],
    envelope,
    executionStatus:
      latestReceipt === undefined
        ? null
        : {
            capability: latestReceipt.capability,
            requestedMode: latestReceipt.requestedMode,
            resolvedMode: latestReceipt.resolvedMode,
            outcome: latestReceipt.outcome,
          },
    busy: state.runtime.activeOperation !== null || state.stage === "FINALIZING",
  });
}

function projectPortraits(
  content: ContentAccess,
  state: Stage4SessionState,
): readonly Stage5PortraitView[] {
  if (content.contentMode === "placeholder") {
    return content.portraits.map((portrait) => ({
      id: portrait.id,
      stage: portrait.stage,
      title: portraitTitle(portrait.stage),
      assetPath: portrait.assetPath,
      altText: portrait.altText,
      descriptorOptions: portrait.descriptorOptions,
      selectedDescriptors: state.portraitDescriptors
        .filter((descriptor) => descriptor.stage === portrait.stage)
        .map((descriptor) => descriptor.id),
    }));
  }
  return content.portraits.map((portrait) => ({
    id: portrait.assetId,
    stage: portrait.charlieStage,
    title: portraitTitle(portrait.charlieStage),
    assetPath: portrait.publicAssetPath,
    altText: portrait.altText,
    descriptorOptions: portrait.descriptorOptions,
    selectedDescriptors: state.portraitDescriptors
      .filter((descriptor) => descriptor.stage === portrait.charlieStage)
      .map((descriptor) => descriptor.id),
  }));
}

function projectRound(
  roundId: keyof typeof ROUND_META,
  state: Stage4SessionState,
  sidecars: Stage4PersistenceSidecars,
  content: ContentAccess,
): Stage5RoundView {
  const card = content.evidenceCards.find((candidate) => candidate.round === roundId);
  const privateRound = sidecars.privateInputs.rounds.find(
    (candidate) => candidate.roundId === roundId,
  );
  const response = [...state.charlieResponses]
    .reverse()
    .find((candidate) => candidate.roundId === roundId);
  const principle = [...state.userPrinciples]
    .reverse()
    .find((candidate) => candidate.roundId === roundId);
  const dissent = [...state.openDissents]
    .reverse()
    .find((candidate) => candidate.roundId === roundId);
  return {
    roundId,
    title: ROUND_META[roundId].title,
    evidenceTitle: card?.title ?? "内容卡暂不可用",
    evidenceText: card?.publicText ?? "",
    question: card?.question ?? "请写下你此刻的判断。",
    responseSubmitted: state.rounds[roundId].responseSubmitted,
    completed: state.rounds[roundId].completed,
    privateResponse: privateRound?.response ?? null,
    privateClarification: privateRound?.clarification ?? null,
    charlieResponse: response?.responseText ?? null,
    principle: principle?.claim ?? null,
    dissent: dissent?.focus ?? null,
  };
}

function projectFragment(
  fragment: Stage4SessionState["semanticFragments"][number],
  state: Stage4SessionState,
): Stage5FragmentView {
  const placementDecision = state.semanticPlacementBatch?.decisions.find(
    (candidate) => candidate.fragmentId === fragment.id,
  );
  const proposal =
    placementDecision?.placement === "restored_to_plain_text" &&
    placementDecision.restorationProposalId !== null
      ? state.semanticRestorationProposals.find(
          (candidate) =>
            candidate.proposalId === placementDecision.restorationProposalId,
        )
      : undefined;
  const placement =
    fragment.placement === "saved_as_margin_note"
      ? "margin_note"
      : fragment.placement === "placed_in_bouquet"
        ? "bouquet"
        : fragment.placement;
  return {
    id: fragment.id,
    phrase: fragment.phrase,
    reason: fragment.reason,
    consequence: fragment.consequence,
    placement,
    proposal:
      proposal === undefined
        ? null
        : {
            proposalId: proposal.proposalId,
            status: proposal.status,
            replacementText: proposal.replacementText,
          },
  };
}

function projectEnvelope(
  envelope: NonNullable<Stage4SessionState["finalEnvelope"]>,
): Stage5EnvelopeView {
  return {
    finalEnvelopeId: envelope.finalEnvelopeId,
    generatedAt: envelope.generatedAt,
    preciseText: envelope.manuscript.preciseText,
    plainText: envelope.manuscript.plainText,
    finalPortraitChoice: envelope.portraits.finalChoice,
    portraitShiftSummary: envelope.portraits.shiftSummary,
    signatureStatus: envelope.signature.currentStatus,
    letter:
      "letter" in envelope
        ? envelope.letter.letterKind === "charlie_perspective"
          ? {
              kind: "charlie_perspective",
              body: envelope.letter.body,
              attribution: envelope.letter.attribution,
              sourceMode: envelope.letter.sourceMode,
              evidenceIds: envelope.letter.evidenceIds,
              voicePolicyVersion: envelope.letter.voicePolicyVersion,
            }
          : {
              kind: "archive_note",
              body: envelope.letter.body,
              attribution: envelope.letter.attribution,
              sourceMode: "unavailable",
              evidenceIds: envelope.letter.evidenceIds,
              voicePolicyVersion: envelope.letter.voicePolicyVersion,
            }
        : {
            kind: "archive_note",
            body: "此封套生成于查理来信功能上线前。原始档案保持不变，这里不会补写一封不存在的信。",
            attribution: "旧版只读封套",
            sourceMode: "legacy",
            evidenceIds: [],
            voicePolicyVersion: null,
          },
    finalDisposition: envelope.finalDisposition,
    openDissents: envelope.openDissents.map((dissent) => dissent.focus),
    originalDeclaration:
      envelope.contentSnapshot.originalInteraction.publicDeclaration,
    attribution: envelope.contentSnapshot.originalInteraction.attribution,
    contentBundleVersion: envelope.contentSnapshot.binding.contentBundleVersion,
    contentSchemaVersion: envelope.contentSnapshot.binding.contentSchemaVersion,
    requestedAgentMode: envelope.sessionConfiguration.requestedAgentMode,
    receiptCount: envelope.executionProvenance.capabilityExecutionReceipts.length,
    integrityChecksum: envelope.integrityChecksum,
  };
}

function portraitTitle(stage: Stage5PortraitStage): string {
  switch (stage) {
    case "early":
      return "仍相信笑声与友谊的查理";
    case "peak":
      return "高度理解、却更加孤独的查理";
    case "futureFacing":
      return "试图给未来留下文字的查理";
  }
}

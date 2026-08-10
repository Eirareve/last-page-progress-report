"use client";

import Image from "next/image";
import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

import {
  Stage5ExperienceFacade,
  type Stage5Commands,
  type Stage5PortraitStage,
  type Stage5PresentationView,
  type Stage5Snapshot,
} from ".";
import {
  deleteResearchData,
  exportResearchRecord,
  pruneExpiredResearchData,
  readResearchConsent,
  recordResearchEvent,
  setResearchConsent,
  STAGE9_AGENT_VERSION_VECTOR,
  STAGE9_RESEARCH_RETENTION_DAYS,
  type ResearchConsent,
} from "../stage9";

export function ExperienceClient({
  sessionId,
  requestedMode,
  contentMode,
  targetEnvironment,
}: {
  sessionId: string | null;
  requestedMode: "mock" | "live";
  contentMode: "placeholder" | "verified";
  targetEnvironment: "development" | "test" | "production";
}) {
  const [facade] = useState(
    () =>
      new Stage5ExperienceFacade(sessionId, {
        requestedMode,
        contentMode,
        targetEnvironment,
      }),
  );
  const snapshot = useSyncExternalStore(
    facade.subscribe,
    facade.getSnapshot,
    facade.getSnapshot,
  );
  useEffect(() => {
    void facade.initialize();
    return () => facade.dispose();
  }, [facade]);
  const activeSessionId = snapshot.view?.sessionId ?? null;
  const [researchConsent, setResearchConsentState] =
    useState<ResearchConsent>("pending");
  useEffect(() => {
    if (activeSessionId === null) return;
    pruneExpiredResearchData(window.localStorage);
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) {
        setResearchConsentState(
          readResearchConsent(window.localStorage, activeSessionId),
        );
      }
    });
    return () => {
      cancelled = true;
    };
  }, [activeSessionId]);
  useResearchTracking(snapshot.view, researchConsent);

  const chooseResearchConsent = (consent: Exclude<ResearchConsent, "pending">) => {
    if (activeSessionId === null) return;
    setResearchConsent(window.localStorage, activeSessionId, consent);
    setResearchConsentState(consent);
  };
  const removeResearchData = () => {
    if (activeSessionId === null) return;
    deleteResearchData(window.localStorage, activeSessionId);
    setResearchConsentState("pending");
  };
  const downloadResearchData = () => {
    if (activeSessionId === null) return;
    const exported = exportResearchRecord(window.localStorage, activeSessionId);
    if (exported === null) return;
    const url = URL.createObjectURL(
      new Blob([exported], { type: "application/json;charset=utf-8" }),
    );
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `last-page-research-${activeSessionId}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <a className="skip-link" href="#main-content">
        跳到主内容
      </a>
      <ExperienceHeader snapshot={snapshot} requestedMode={requestedMode} />
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {snapshot.announcement}
      </div>
      {snapshot.error ? (
        <div className="error-summary" role="alert" tabIndex={-1}>
          <strong>这一步没有完成</strong>
          <p>{snapshot.error}</p>
        </div>
      ) : null}
      <main id="main-content">
        {snapshot.status === "booting" ? <LoadingView /> : null}
        {snapshot.status === "blocked" ? (
          <BlockedView snapshot={snapshot} commands={facade} />
        ) : null}
        {snapshot.status === "ready" && snapshot.view ? (
          <>
            <ExecutionStatus
              view={snapshot.view}
              busy={snapshot.persistence === "saving" || snapshot.view.busy}
              requestedMode={requestedMode}
            />
            <StageProjection
              view={snapshot.view}
              snapshot={snapshot}
              commands={facade}
              requestedMode={requestedMode}
              researchConsent={researchConsent}
              onResearchConsent={chooseResearchConsent}
              onResearchDelete={removeResearchData}
              onResearchDownload={downloadResearchData}
            />
          </>
        ) : null}
      </main>
      <footer className="site-footer">
        <p>
          原创互动草案 · AI 协作式阅读体验
        </p>
        {snapshot.status === "ready" && snapshot.view ? (
          <button
            type="button"
            className="text-action"
            onClick={() => {
              if (!window.confirm("删除当前浏览器中的本次体验进度和研究记录？此操作无法撤销。")) {
                return;
              }
              removeResearchData();
              void facade.deleteCurrentSession();
            }}
          >
            删除当前体验的本地数据
          </button>
        ) : null}
      </footer>
    </>
  );
}

function useResearchTracking(
  view: Stage5PresentationView | null,
  consent: ResearchConsent,
) {
  const tracked = useRef<{
    view: Stage5PresentationView;
    stageEnteredAt: number;
  } | null>(null);

  useEffect(() => {
    if (view === null || consent !== "accepted") {
      tracked.current = null;
      return;
    }
    const now = Date.now();
    const previous = tracked.current;
    const record = (event: Parameters<typeof recordResearchEvent>[2]) => {
      recordResearchEvent(window.localStorage, view.sessionId, event, now);
    };

    if (previous === null || previous.view.sessionId !== view.sessionId) {
      record({
        dedupeKey: `versions:${view.sessionId}`,
        eventType: "version_snapshot",
        ...STAGE9_AGENT_VERSION_VECTOR,
        contentBundleVersion: view.contentBundleVersion,
      });
      record({
        dedupeKey: `stage:${view.stateRevision}:${view.stage}`,
        eventType: "stage_entered",
        stage: view.stage,
      });
      tracked.current = { view, stageEnteredAt: now };
      return;
    }

    const prior = previous.view;
    if (prior.stage !== view.stage) {
      record({
        dedupeKey: `duration:${prior.stateRevision}:${prior.stage}`,
        eventType: "stage_duration",
        stage: prior.stage,
        durationMs: Math.max(0, now - previous.stageEnteredAt),
      });
      record({
        dedupeKey: `stage:${view.stateRevision}:${view.stage}`,
        eventType: "stage_entered",
        stage: view.stage,
      });
    }
    if (prior.initialChoice !== view.initialChoice && view.initialChoice !== null) {
      record({
        dedupeKey: `initial-portrait:${view.stateRevision}`,
        eventType: "initial_portrait_selected",
        portraitChoice: view.initialChoice,
      });
    }
    if (prior.pendingDiff !== null && view.pendingDiff === null) {
      record({
        dedupeKey: `diff:${prior.pendingDiff.id}`,
        eventType: "diff_decision",
        round: roundFromStage(prior.stage),
        decision: view.revisionCount > prior.revisionCount ? "accept" : "reject",
      });
    }
    for (const fragment of view.semanticFragments) {
      const before = prior.semanticFragments.find((item) => item.id === fragment.id);
      if (fragment.placement !== null && before?.placement !== fragment.placement) {
        record({
          dedupeKey: `placement:${fragment.id}:${fragment.placement}`,
          eventType: "semantic_fragment_placed",
          placement: fragment.placement,
        });
      }
    }
    for (const round of view.rounds) {
      const before = prior.rounds.find((item) => item.roundId === round.roundId);
      if (round.completed && !before?.completed && round.dissent !== null) {
        record({
          dedupeKey: `dissent:${round.roundId}`,
          eventType: "dissent_retained",
          round: round.roundId,
          retained: true,
        });
      }
    }
    if (prior.finalChoice !== view.finalChoice && view.finalChoice !== null) {
      record({
        dedupeKey: `final-portrait:${view.stateRevision}`,
        eventType: "final_portrait_selected",
        portraitChoice: normalizePortraitChoice(view.finalChoice),
      });
    }
    if (
      prior.finalDisposition !== view.finalDisposition &&
      view.finalDisposition !== null
    ) {
      record({
        dedupeKey: `disposition:${view.stateRevision}`,
        eventType: "manuscript_disposition_selected",
        disposition: view.finalDisposition,
      });
    }
    if (
      view.executionStatus?.requestedMode === "live" &&
      view.executionStatus.resolvedMode !== "live" &&
      (prior.executionStatus?.capability !== view.executionStatus.capability ||
        prior.executionStatus?.resolvedMode !== view.executionStatus.resolvedMode ||
        prior.executionStatus?.outcome !== view.executionStatus.outcome)
    ) {
      record({
        dedupeKey: `fallback:${view.stateRevision}:${view.executionStatus.capability}:${view.executionStatus.resolvedMode}`,
        eventType: "fallback_triggered",
        capability: view.executionStatus.capability,
        resolvedMode: view.executionStatus.resolvedMode,
      });
    }
    if (prior.stage !== "COMPLETE" && view.stage === "COMPLETE") {
      record({
        dedupeKey: `complete:${view.sessionId}`,
        eventType: "experience_completed",
        completed: true,
      });
    }
    tracked.current = {
      view,
      stageEnteredAt:
        prior.stage === view.stage ? previous.stageEnteredAt : now,
    };
  }, [consent, view]);
}

function ExperienceHeader({
  snapshot,
  requestedMode,
}: {
  snapshot: Stage5Snapshot;
  requestedMode: "mock" | "live";
}) {
  const stage = snapshot.view?.stage ?? null;
  const position = stage ? stagePosition(stage) : 0;
  return (
    <header className="experience-header">
      <div>
        <p className="eyebrow">AI 协作式互动阅读体验</p>
        <p className="product-title">最后一页进步报告</p>
      </div>
      <div className="header-status">
        <span className="mode-badge">
          {requestedMode === "live" ? "真实模型模式" : "本地演示模式"}
        </span>
        <span data-testid="persistence-status">
          {persistenceLabel(snapshot.persistence)}
        </span>
      </div>
      <div className="progress-track" aria-label={`体验进度 ${position}/6`}>
        <span style={{ width: `${Math.max(4, (position / 6) * 100)}%` }} />
      </div>
    </header>
  );
}

function StageProjection({
  view,
  snapshot,
  commands,
  requestedMode,
  researchConsent,
  onResearchConsent,
  onResearchDelete,
  onResearchDownload,
}: {
  view: Stage5PresentationView;
  snapshot: Stage5Snapshot;
  commands: Stage5Commands;
  requestedMode: "mock" | "live";
  researchConsent: ResearchConsent;
  onResearchConsent: (consent: Exclude<ResearchConsent, "pending">) => void;
  onResearchDelete: () => void;
  onResearchDownload: () => void;
}) {
  const titleRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    titleRef.current?.focus();
  }, [view.stage]);
  const heading = (
    <h1 ref={titleRef} tabIndex={-1} data-testid="stage-heading">
      {view.stageTitle}
    </h1>
  );
  const busy = snapshot.persistence === "saving" || view.busy;

  switch (view.stage) {
    case "WELCOME":
      return (
        <WelcomeView
          heading={heading}
          view={view}
          commands={commands}
          busy={busy}
          requestedMode={requestedMode}
          researchConsent={researchConsent}
          onResearchConsent={onResearchConsent}
          onResearchDelete={onResearchDelete}
        />
      );
    case "PORTRAIT_PRELUDE":
      return <PortraitPreludeView heading={heading} view={view} commands={commands} busy={busy} />;
    case "PORTRAIT_CHOICE":
      return <PortraitChoiceView heading={heading} view={view} commands={commands} busy={busy} />;
    case "ROUND_1_PAST_SELF":
    case "ROUND_2_FORECAST":
    case "ROUND_3_RELATIONSHIP":
    case "ROUND_1_DIFF":
    case "ROUND_2_DIFF":
    case "ROUND_3_DIFF":
    case "PLAIN_REWRITE":
    case "SEMANTIC_REVIEW":
    case "SEMANTIC_PLACEMENT":
      return <ReviewCanvas heading={heading} view={view} commands={commands} busy={busy} />;
    case "PORTRAIT_REASSEMBLY":
      return <PortraitReassemblyView heading={heading} view={view} commands={commands} busy={busy} />;
    case "FINAL_SIGNATURE":
      return (
        <FinalSignatureView
          heading={heading}
          view={view}
          commands={commands}
          busy={busy}
          requestedMode={requestedMode}
        />
      );
    case "MANUSCRIPT_REVISION":
      return <ManuscriptRevisionView heading={heading} view={view} commands={commands} busy={busy} />;
    case "FINAL_DISPOSITION":
      return <FinalDispositionView heading={heading} view={view} commands={commands} busy={busy} />;
    case "FINALIZING":
      return <FinalizingView heading={heading} />;
    case "COMPLETE":
      return (
        <CompleteView
          heading={heading}
          view={view}
          commands={commands}
          busy={false}
          researchConsent={researchConsent}
          onResearchDelete={onResearchDelete}
          onResearchDownload={onResearchDownload}
        />
      );
    default:
      return (
        <section className="stage-shell">
          {heading}
          <p>这个正式阶段暂时无法投影。</p>
        </section>
      );
  }
}

function WelcomeView({
  heading,
  view,
  commands,
  busy,
  requestedMode,
  researchConsent,
  onResearchConsent,
  onResearchDelete,
}: StageProps & {
  requestedMode: "mock" | "live";
  researchConsent: ResearchConsent;
  onResearchConsent: (consent: Exclude<ResearchConsent, "pending">) => void;
  onResearchDelete: () => void;
}) {
  return (
    <section className="stage-shell welcome-stage">
      <div className="welcome-copy">
        <p className="section-kicker">这句话能留给未来的我吗？</p>
        {heading}
        <p className="lede">
          你将先看见三个认知阶段的查理，再用三轮审校决定：哪一个阶段的自我，有权代表“真正的他”？
        </p>
        <div className="declaration-card">
          <strong>原创互动声明</strong>
          <p>{view.originalDeclaration}</p>
          <small>{view.originalAttribution}</small>
        </div>
        <ul className="fact-list">
          <li>预计 18–20 分钟</li>
          {requestedMode === "live" ? (
            <li>普通分析优先使用真实模型，并按安全策略降级；签名审阅不会由演示结果代替</li>
          ) : null}
          <li>进度仅保存在这台浏览器的本地存储中，未完成体验 24 小时后过期</li>
        </ul>
        <ResearchConsentPanel
          consent={researchConsent}
          requestedMode={requestedMode}
          onChoose={onResearchConsent}
          onDelete={onResearchDelete}
        />
        <button
          className="primary-action"
          disabled={busy || researchConsent === "pending"}
          onClick={() => void commands.start()}
        >
          开始体验
        </button>
      </div>
      <blockquote className="manuscript-teaser">“{view.preciseText}”</blockquote>
    </section>
  );
}

function ResearchConsentPanel({
  consent,
  requestedMode,
  onChoose,
  onDelete,
}: {
  consent: ResearchConsent;
  requestedMode: "mock" | "live";
  onChoose: (consent: Exclude<ResearchConsent, "pending">) => void;
  onDelete: () => void;
}) {
  return (
    <section className="research-consent" aria-labelledby="research-consent-title">
      <h2 id="research-consent-title">用户测试数据说明</h2>
      <p>
        用途是了解流程是否容易完成和理解。你可以拒绝记录并继续全部体验。
        选择同意后，只在这台浏览器保存随机会话编号、阶段与停留时间、结构化选择、
        是否完成、是否发生安全降级及版本号；不会保存你的完整回答、原话、模型完整输入、
        身份信息、人格标签、心理判断或 API 密钥。
      </p>
      <p>
        数据不会自动上传服务器，最多保留 {STAGE9_RESEARCH_RETENTION_DAYS} 天，
        与其他演示环境隔离。你可以随时删除本会话的研究数据。
      </p>
      <p>
        为支持刷新恢复，回答、选择、手稿和流程状态会另存于浏览器 IndexedDB；
        未完成体验 24 小时后过期，完成档案会保留到你点击页面底部“删除当前体验的本地数据”
        或清除本站浏览器数据。该进度不会作为 analytics 自动上传。
      </p>
      {requestedMode === "live" ? (
        <p>
          真实模型模式会把当前步骤所需的回答和上下文发送给 DeepSeek API 生成候选，
          但不会把它们写入研究 analytics。请不要输入姓名、联系方式或其他敏感信息。
        </p>
      ) : null}
      <div className="action-row" role="group" aria-label="用户测试数据选择">
        <button
          type="button"
          className={consent === "accepted" ? "primary-action" : "secondary-action"}
          aria-pressed={consent === "accepted"}
          onClick={() => onChoose("accepted")}
        >
          同意记录匿名事件
        </button>
        <button
          type="button"
          className={consent === "declined" ? "primary-action" : "secondary-action"}
          aria-pressed={consent === "declined"}
          onClick={() => onChoose("declined")}
        >
          不同意记录，继续体验
        </button>
      </div>
      {consent !== "pending" ? (
        <p className="consent-status" role="status">
          当前选择：{consent === "accepted" ? "同意本地记录" : "不同意记录"}。
          <button type="button" className="text-action" onClick={onDelete}>
            删除本会话研究数据并重新选择
          </button>
        </p>
      ) : (
        <p className="consent-status">请选择一项后开始体验。</p>
      )}
    </section>
  );
}

function ExecutionStatus({
  view,
  busy,
  requestedMode,
}: {
  view: Stage5PresentationView;
  busy: boolean;
  requestedMode: "mock" | "live";
}) {
  if (requestedMode === "mock") {
    return null;
  }
  let message =
    "真实模型已启用；普通分析支持安全降级，签名审阅不会由演示结果代替。";
  if (busy) {
    message = "AI 正在处理。本步骤完成前请留在此页。";
  } else if (view.executionStatus?.requestedMode === "live") {
    switch (view.executionStatus.resolvedMode) {
      case "live":
        message = "上一步由真实模型完成。";
        break;
      case "deterministic":
        message = "上一步由本地确定性规则完成，没有调用模型。";
        break;
      case "mock":
        message = "真实模型未完成；上一步已使用本地安全演示结果，并保留实际来源记录。";
        break;
      case "static_template":
        message = "真实模型与本地演示均未完成；上一步已使用静态安全模板。";
        break;
      case "unavailable":
        message = "真实模型执行未完成；本步骤没有生成替代角色决定。";
        break;
    }
  }
  return (
    <div
      className="execution-status"
      role="status"
      aria-live="polite"
      data-testid="execution-status"
    >
      {message}
    </div>
  );
}

function PortraitPreludeView({ heading, view, commands, busy }: StageProps) {
  const [selected, setSelected] = useState<string[]>(
    view.portraits.flatMap((portrait) => portrait.selectedDescriptors),
  );
  const toggle = (id: string) =>
    setSelected((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    );
  return (
    <section className="stage-shell">
      <p className="section-kicker">感受序章</p>
      {heading}
      <p className="stage-intro">每幅肖像可选择一个或多个描述词。系统只记录，不评价。</p>
      <div className="portrait-grid">
        {view.portraits.map((portrait) => (
          <article className="portrait-card" key={portrait.id}>
            <PortraitImage portrait={portrait} />
            <h2>{portrait.title}</h2>
            <fieldset>
              <legend>你看见了什么？</legend>
              <div className="chip-grid">
                {portrait.descriptorOptions.map((option) => (
                  <label className="choice-chip" key={option.id}>
                    <input
                      type="checkbox"
                      checked={selected.includes(option.id)}
                      onChange={() => toggle(option.id)}
                    />
                    <span>{option.label}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          </article>
        ))}
      </div>
      <div className="action-row">
        <button
          className="primary-action"
          disabled={busy}
          onClick={() => void commands.submitPortraitDescriptors(selected)}
        >
          保存这些描述
        </button>
      </div>
    </section>
  );
}

function PortraitChoiceView({ heading, view, commands, busy }: StageProps) {
  const [choice, setChoice] = useState<Stage5PortraitStage>(
    view.initialChoice ?? "early",
  );
  const [reason, setReason] = useState("");
  return (
    <section className="stage-shell">
      <p className="section-kicker">第一次判断</p>
      {heading}
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void commands.submitInitialPortrait({ choice, reason });
        }}
      >
        <fieldset>
          <legend>只选一个阶段</legend>
          <div className="portrait-grid compact">
            {view.portraits.map((portrait) => (
              <label className="portrait-card radio-card" key={portrait.id}>
                <PortraitImage portrait={portrait} />
                <span className="radio-title">
                  <input
                    type="radio"
                    name="initial-portrait"
                    value={portrait.stage}
                    checked={choice === portrait.stage}
                    onChange={() => setChoice(portrait.stage)}
                  />
                  {portrait.title}
                </span>
                <small>
                  {portrait.descriptorOptions
                    .filter((option) => portrait.selectedDescriptors.includes(option.id))
                    .map((option) => option.label)
                    .join(" · ")}
                </small>
              </label>
            ))}
          </div>
        </fieldset>
        <label className="field-label" htmlFor="initial-reason">
          为什么？
        </label>
        <textarea
          id="initial-reason"
          required
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          rows={4}
        />
        <button className="primary-action" disabled={busy || !reason.trim()}>
          记录这个判断
        </button>
      </form>
    </section>
  );
}

function ReviewCanvas({ heading, view, commands, busy }: StageProps) {
  const isDiff = view.stage.endsWith("_DIFF");
  const isPlacement = view.stage === "SEMANTIC_PLACEMENT";
  return (
    <section className="stage-shell review-stage" aria-busy={busy}>
      <p className="section-kicker">双栏审校台</p>
      {heading}
      <div className="review-grid">
        <div className="context-panel">
          {view.currentRound ? <RoundContext round={view.currentRound} /> : <SemanticContext view={view} />}
          {!isDiff && !isPlacement && view.currentRound && !view.currentRound.responseSubmitted ? (
            <RoundForm commands={commands} busy={busy} question={view.currentRound.question} />
          ) : null}
        </div>
        <div className="manuscript-panel">
          <ManuscriptDocuments view={view} />
          {isDiff && view.pendingDiff ? (
            <DiffReview diff={view.pendingDiff} commands={commands} busy={busy} />
          ) : null}
          {isPlacement ? (
            <SemanticPlacement view={view} commands={commands} busy={busy} />
          ) : null}
          {view.stage === "PLAIN_REWRITE" || view.stage === "SEMANTIC_REVIEW" ? (
            <p className="operation-note">正在生成并校验语义版本…</p>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function RoundContext({ round }: { round: NonNullable<Stage5PresentationView["currentRound"]> }) {
  return (
    <>
      <div className="evidence-card">
        <p className="micro-label">内容卡 · {round.title}</p>
        <h2>{round.evidenceTitle}</h2>
        <p>{round.evidenceText}</p>
      </div>
      {round.charlieResponse ? (
        <div className="charlie-response">
          <p className="micro-label">查理的回应</p>
          <p>{round.charlieResponse}</p>
        </div>
      ) : null}
      {round.principle ? (
        <p className="principle"><strong>你的主张：</strong>{round.principle}</p>
      ) : null}
      {round.dissent ? (
        <p className="dissent"><strong>尚未解决的分歧：</strong>{round.dissent}</p>
      ) : null}
    </>
  );
}

function RoundForm({ commands, busy, question }: { commands: Stage5Commands; busy: boolean; question: string }) {
  const [response, setResponse] = useState("");
  const [clarification, setClarification] = useState("");
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void commands.submitRound({ response, ...(clarification.trim() ? { clarification } : {}) });
      }}
    >
      <label className="field-label" htmlFor="round-response">{question}</label>
      <textarea
        id="round-response"
        required
        rows={5}
        value={response}
        onChange={(event) => setResponse(event.target.value)}
      />
      <details className="clarification-details">
        <summary>补充一次可选澄清</summary>
        <label className="field-label" htmlFor="round-clarification">澄清（可选）</label>
        <textarea
          id="round-clarification"
          rows={3}
          value={clarification}
          onChange={(event) => setClarification(event.target.value)}
        />
      </details>
      <button className="primary-action" disabled={busy || !response.trim()}>
        {clarification.trim() ? "提交回答与澄清" : "提交并继续，不作澄清"}
      </button>
    </form>
  );
}

function ManuscriptDocuments({ view }: { view: Stage5PresentationView }) {
  return (
    <div className="documents">
      <article className="document-card">
        <header><span>精确版本</span></header>
        <p>{view.preciseText}</p>
      </article>
      <article className="document-card plain-document">
        <header><span>朴素版本</span></header>
        <p>{view.plainText ?? "尚未生成。三轮审校完成前，不会预先伪造这份文本。"}</p>
      </article>
      <p className="revision-meta">已保存版本：{view.revisionCount}</p>
    </div>
  );
}

function DiffReview({ diff, commands, busy }: {
  diff: NonNullable<Stage5PresentationView["pendingDiff"]>;
  commands: Stage5Commands;
  busy: boolean;
}) {
  return (
    <section className="diff-review" aria-label="待审阅的局部修改">
      <p className="micro-label">提案状态：尚未应用</p>
      <h2>局部修改</h2>
      <p><strong>操作：</strong>{diffOperationLabel(diff.operation)}</p>
      {diff.newText ? <ins>{diff.newText}</ins> : null}
      <p><strong>理由：</strong>{diff.reason}</p>
      <div className="action-row">
        <button className="primary-action" disabled={busy} onClick={() => void commands.decideDiff("accept")}>
          接受修改
        </button>
        <button className="secondary-action" disabled={busy} onClick={() => void commands.decideDiff("reject")}>
          拒绝并保留分歧
        </button>
      </div>
    </section>
  );
}

function SemanticContext({ view }: { view: Stage5PresentationView }) {
  return (
    <div className="evidence-card">
      <p className="micro-label">语义偏移状态</p>
      <h2>{semanticStatusLabel(view.semanticStatus)}</h2>
      <p>不能被朴素版本完整传递的意义，需要由你决定归处。</p>
    </div>
  );
}

function SemanticPlacement({
  view,
  commands,
  busy,
}: Pick<StageProps, "view" | "commands" | "busy">) {
  return (
    <section className="semantic-panel">
      <h2>语义碎片</h2>
      {view.semanticFragments.map((fragment) => (
        <article className="fragment-card" key={fragment.id}>
          <blockquote>{fragment.phrase}</blockquote>
          <p>{fragment.reason}</p>
          <p><strong>若丢失：</strong>{fragment.consequence}</p>
          {fragment.placement ? <p className="status-pill">已选择：{placementLabel(fragment.placement)}</p> : null}
          {!fragment.placement && fragment.proposal?.status !== "proposed" ? (
            <div className="placement-actions">
              <button disabled={busy} onClick={() => void commands.chooseFragmentPlacement({ fragmentId: fragment.id, placement: "restored_to_plain_text" })}>恢复到朴素文本</button>
              <button disabled={busy} onClick={() => void commands.chooseFragmentPlacement({ fragmentId: fragment.id, placement: "margin_note" })}>保存为页边批注</button>
              <button disabled={busy} onClick={() => void commands.chooseFragmentPlacement({ fragmentId: fragment.id, placement: "bouquet" })}>放入语义花束</button>
            </div>
          ) : null}
          {fragment.proposal && ["proposed", "confirmed"].includes(fragment.proposal.status) ? (
            <div className="proposal-card">
              <p className="micro-label">恢复提案 · {proposalStatusLabel(fragment.proposal.status)}</p>
              <p><ins>{fragment.proposal.replacementText}</ins></p>
              <div className="action-row">
                <button className="primary-action" disabled={busy || fragment.proposal.status !== "proposed"} onClick={() => void commands.confirmRestoration(fragment.proposal!.proposalId)}>确认并应用</button>
                <button className="secondary-action" disabled={busy} onClick={() => void commands.rejectRestoration(fragment.proposal!.proposalId)}>拒绝提案</button>
              </div>
            </div>
          ) : null}
        </article>
      ))}
      {view.placementChecking ? <p className="operation-note">正在检查最终双文本的一致性…</p> : null}
    </section>
  );
}

function PortraitReassemblyView({ heading, view, commands, busy }: StageProps) {
  const [choice, setChoice] = useState("all_three");
  const [reason, setReason] = useState("");
  return (
    <section className="stage-shell">
      <p className="section-kicker">肖像重新拼合</p>
      {heading}
      <div className="portrait-grid compact">
        {view.portraits.map((portrait) => <article className="portrait-card" key={portrait.id}><PortraitImage portrait={portrait} /><h2>{portrait.title}</h2></article>)}
      </div>
      <div className="round-summary-grid">
        {view.rounds.map((round) => <div key={round.roundId}><strong>{round.title}</strong><p>{round.principle}</p></div>)}
      </div>
      <form onSubmit={(event) => { event.preventDefault(); void commands.submitFinalPortrait({ choice, ...(reason.trim() ? { reason } : {}) }); }}>
        <fieldset>
          <legend>现在，你会怎样选择？</legend>
          {[{ value: "early", label: "早期查理" }, { value: "peak", label: "高峰期查理" }, { value: "futureFacing", label: "面向未来的查理" }, { value: "all_three", label: "三个都是" }, { value: "no_unique_answer", label: "拒绝给出唯一答案" }].map((item) => (
            <label className="radio-line" key={item.value}><input type="radio" name="final-portrait" checked={choice === item.value} onChange={() => setChoice(item.value)} />{item.label}</label>
          ))}
        </fieldset>
        <label className="field-label" htmlFor="final-reason">最终理由（可选）</label>
        <textarea id="final-reason" rows={3} value={reason} onChange={(event) => setReason(event.target.value)} />
        <button className="primary-action" disabled={busy}>保存最终选择</button>
      </form>
    </section>
  );
}

function FinalSignatureView({
  heading,
  view,
  commands,
  busy,
  requestedMode,
}: StageProps & { requestedMode: "mock" | "live" }) {
  const unavailable = view.signatureStatus === "unavailable";
  return (
    <section className="stage-shell">
      <p className="section-kicker">
        独立签名审阅 · {requestedMode === "live" ? "真实模型" : "本地演示"}
      </p>
      {heading}
      <div className="review-grid">
        <div><ManuscriptDocuments view={view} /></div>
        <div className="signature-card">
          <h2>当前状态：{signatureLabel(view.signatureStatus)}</h2>
          <p>“拒绝签名”是角色判断；“未请求”与“技术上未完成”是不同状态。</p>
          <div className="action-stack">
            {!unavailable && requestedMode === "live" ? (
              <button className="primary-action" disabled={busy} onClick={() => void commands.requestSignature("signed")}>
                请求查理签名审阅
              </button>
            ) : null}
            {unavailable && requestedMode === "live" && view.signatureRetryAvailable ? (
              <button className="primary-action" disabled={busy} onClick={() => void commands.requestSignature("signed")}>
                重试查理签名审阅（最后一次）
              </button>
            ) : null}
            {!unavailable && requestedMode === "mock" ? <button className="primary-action" disabled={busy} onClick={() => void commands.requestSignature("signed")}>演示同意签名</button> : null}
            {!unavailable && requestedMode === "mock" ? <button className="secondary-action" disabled={busy} onClick={() => void commands.requestSignature("declined")}>演示明确拒绝</button> : null}
            {!unavailable && requestedMode === "mock" ? <button className="secondary-action" disabled={busy} onClick={() => void commands.requestSignature("unavailable")}>模拟技术上未完成</button> : null}
            <button className="text-action" disabled={busy} onClick={() => void commands.skipSignature()}>{unavailable ? "保留技术未完成状态并继续" : "不请求签名，继续"}</button>
            <button className="text-action" disabled={busy} onClick={() => void commands.returnToManuscript()}>返回修改手稿</button>
          </div>
        </div>
      </div>
    </section>
  );
}

function ManuscriptRevisionView({ heading, view, commands, busy }: StageProps) {
  const [draft, setDraft] = useState(view.preciseText);
  const [reason, setReason] = useState("在签名前补充必要边界");
  return (
    <section className="stage-shell">
      <p className="section-kicker">提交后朴素版本与语义复核会正式失效并重建</p>
      {heading}
      <div className="review-grid">
        <article className="document-card"><header>当前精确版本</header><p>{view.preciseText}</p></article>
        <form onSubmit={(event) => { event.preventDefault(); void commands.submitManuscriptRevision({ draftPreciseText: draft, reason }); }}>
          <label className="field-label" htmlFor="working-draft">修改后的精确版本</label>
          <textarea id="working-draft" rows={10} value={draft} onChange={(event) => setDraft(event.target.value)} />
          <label className="field-label" htmlFor="revision-reason">修改理由</label>
          <input id="revision-reason" required value={reason} onChange={(event) => setReason(event.target.value)} />
          <div className="action-row">
            <button className="primary-action" disabled={busy}>提交修改</button>
            <button type="button" className="secondary-action" disabled={busy} onClick={() => void commands.cancelManuscriptRevision()}>取消并返回</button>
          </div>
        </form>
      </div>
    </section>
  );
}

function FinalDispositionView({ heading, view, commands, busy }: StageProps) {
  return (
    <section className="stage-shell disposition-stage">
      <p className="section-kicker">签名状态：{signatureLabel(view.signatureStatus)}</p>
      {heading}
      {view.signatureSummary ? <p className="signature-summary">{view.signatureSummary}</p> : null}
      <div className="disposition-grid">
        <button disabled={busy} onClick={() => void commands.chooseDisposition("future_reference")}><strong>留给未来参照</strong><span>作为以后可以回看的判断记录</span></button>
        <button disabled={busy} onClick={() => void commands.chooseDisposition("present_record")}><strong>留在现在</strong><span>作为此刻已经完成的书面记录</span></button>
        <button disabled={busy} onClick={() => void commands.chooseDisposition("unfinished")}><strong>保持未完成</strong><span>让尚未解决的分歧继续可见</span></button>
      </div>
      {view.blockers.length ? <ul className="blocker-list">{view.blockers.map((blocker) => <li key={blocker}>{blocker}</li>)}</ul> : null}
    </section>
  );
}

function FinalizingView({ heading }: { heading: React.ReactNode }) {
  return <section className="stage-shell finalizing-stage" aria-busy="true">{heading}<div className="seal-mark" aria-hidden="true">封</div><p>正在生成校验和并原子保存完整封套。请不要关闭这个页面。</p></section>;
}

function CompleteView({
  heading,
  view,
  commands,
  researchConsent,
  onResearchDelete,
  onResearchDownload,
}: StageProps & {
  researchConsent: ResearchConsent;
  onResearchDelete: () => void;
  onResearchDownload: () => void;
}) {
  const envelope = view.envelope;
  if (!envelope) return <section className="stage-shell">{heading}<p>封套数据缺失。</p></section>;
  return (
    <section className="stage-shell complete-stage">
      <p className="section-kicker">只读完成档案</p>
      {heading}
      <p className="completed-at">生成于 {new Date(envelope.generatedAt).toLocaleString("zh-CN")}</p>
      <div className="envelope-paper">
        <section><h2>那句被留下的话</h2><p>{envelope.preciseText}</p></section>
        <section><h2>朴素版本</h2><p>{envelope.plainText}</p></section>
        <section><h2>三次看见之后</h2><p>{envelope.portraitShiftSummary}</p><p>最终选择：{portraitChoiceLabel(envelope.finalPortraitChoice)}</p></section>
        <FixedFinalPortrait view={view} />
        <section><h2>仍然没有消失的分歧</h2>{envelope.openDissents.length ? <ul>{envelope.openDissents.map((item) => <li key={item}>{item}</li>)}</ul> : <p>没有开放分歧。</p>}</section>
        <section><h2>签名与归宿</h2><p>{signatureLabel(envelope.signatureStatus)} · {dispositionLabel(envelope.finalDisposition)}</p></section>
        <aside className="declaration-card"><strong>原创互动声明</strong><p>{envelope.originalDeclaration}</p><small>{envelope.attribution}</small></aside>
      </div>
      <p className="revision-meta">完成档案已通过本地完整性校验。</p>
      <section className="research-export" aria-labelledby="research-export-title">
        <h2 id="research-export-title">用户测试记录</h2>
        {researchConsent === "accepted" ? (
          <>
            <p>匿名事件只保存在当前浏览器。你可以下载后交给研究主持人，或立即删除。</p>
            <div className="action-row">
              <button type="button" className="secondary-action" onClick={onResearchDownload}>
                下载匿名测试记录
              </button>
              <button type="button" className="text-action" onClick={onResearchDelete}>
                删除本会话研究数据
              </button>
            </div>
          </>
        ) : (
          <p>你选择了不记录匿名事件；本次体验没有可导出的研究数据。</p>
        )}
      </section>
      <button className="primary-action" onClick={() => void commands.startNewSession()}>开始新的体验</button>
    </section>
  );
}

function FixedFinalPortrait({ view }: { view: Stage5PresentationView }) {
  const envelope = view.envelope!;
  const imageUrl = fixedFallbackForChoice(envelope.finalPortraitChoice);

  return (
    <section className="dynamic-portrait-card" data-testid="fixed-final-portrait">
      <h2>面向这一刻的肖像</h2>
      <Image
        src={imageUrl}
        alt="同一位查理在体验结尾面向记录与未来；此图为可选氛围视觉，不是事实证据。"
        width={720}
        height={900}
        unoptimized
      />
      <p>
        本次使用已审核的固定肖像；Agnes 动态图片生成暂未启用。图片仅作氛围呈现，
        不作为事实证据。
      </p>
    </section>
  );
}

function fixedFallbackForChoice(choice: string): string {
  if (choice === "early") return "/portraits/charlie-original-v2/early.png";
  if (choice === "peak") return "/portraits/charlie-original-v2/peak.png";
  return "/portraits/charlie-original-v2/future-facing.png";
}

function roundFromStage(stage: string): "round1" | "round2" | "round3" {
  if (stage.startsWith("ROUND_2")) return "round2";
  if (stage.startsWith("ROUND_3")) return "round3";
  return "round1";
}

function normalizePortraitChoice(
  choice: string,
): "early" | "peak" | "futureFacing" | "mixed" {
  if (choice === "early" || choice === "peak" || choice === "futureFacing") {
    return choice;
  }
  return "mixed";
}

function PortraitImage({ portrait }: { portrait: Stage5PresentationView["portraits"][number] }) {
  const [failed, setFailed] = useState(false);
  return (
    <div className="portrait-image">
      {failed ? (
        <div className="image-fallback" role="img" aria-label={`${portrait.altText}；图片暂不可用`}><span>肖像暂不可用</span></div>
      ) : (
        <Image src={portrait.assetPath} alt={portrait.altText} width={720} height={900} unoptimized onError={() => setFailed(true)} />
      )}
    </div>
  );
}

function LoadingView() {
  return <section className="stage-shell loading-stage" aria-busy="true"><p className="section-kicker">本地准备</p><h1>正在打开体验</h1><p>正在校验内容和本地进度…</p></section>;
}

function BlockedView({ snapshot, commands }: { snapshot: Stage5Snapshot; commands: Stage5Commands }) {
  const missing = snapshot.recovery?.kind === "rejected";
  return (
    <section className="stage-shell blocked-stage">
      <h1 tabIndex={-1}>无法安全恢复这个体验</h1>
      <p>{snapshot.recovery?.message ?? snapshot.error}</p>
      {snapshot.recovery?.kind === "rejected" ? <p>这份本地进度无法继续使用，你可以安全地开始一次新体验。</p> : null}
      <div className="action-row">
        {missing ? <button className="primary-action" onClick={() => void commands.startNewSession()}>开始新的体验</button> : null}
        <button className="secondary-action" onClick={() => void commands.retryInitialization()}>重试检查</button>
      </div>
    </section>
  );
}

type StageProps = {
  heading: React.ReactNode;
  view: Stage5PresentationView;
  commands: Stage5Commands;
  busy: boolean;
};

function persistenceLabel(status: Stage5Snapshot["persistence"]): string {
  return { idle: "尚未保存", saving: "正在保存…", saved: "已保存到本地", conflict: "检测到并发更新", failed: "保存失败" }[status];
}
function stagePosition(stage: string): number {
  if (stage === "WELCOME") return 0;
  if (stage.startsWith("PORTRAIT_") && stage !== "PORTRAIT_REASSEMBLY") return 1;
  if (stage.startsWith("ROUND_") || ["PLAIN_REWRITE", "SEMANTIC_REVIEW", "SEMANTIC_PLACEMENT"].includes(stage)) return 2;
  if (stage === "PORTRAIT_REASSEMBLY") return 3;
  if (["FINAL_SIGNATURE", "MANUSCRIPT_REVISION"].includes(stage)) return 4;
  if (["FINAL_DISPOSITION", "FINALIZING"].includes(stage)) return 5;
  return 6;
}
function placementLabel(value: string): string {
  return { restored_to_plain_text: "恢复到朴素文本", margin_note: "页边批注", bouquet: "语义花束" }[value] ?? value;
}
function signatureLabel(value: string): string {
  return { hidden: "尚未决定", pending: "正在审阅", signed: "已签名", declined: "明确拒绝", unavailable: "技术上未完成", not_requested: "未请求" }[value] ?? value;
}

function diffOperationLabel(value: string): string {
  return { insert: "增加", replace: "替换", delete: "删除", annotate: "添加批注" }[value] ?? "局部修改";
}

function semanticStatusLabel(value: string | null): string {
  return { current: "等待你决定语义去向", stale: "需要重新复核" }[value ?? ""] ?? "等待复核";
}

function proposalStatusLabel(value: string): string {
  return { proposed: "等待确认", confirmed: "已经确认", applied: "已经应用", rejected: "已经拒绝", stale: "需要重建" }[value] ?? "等待处理";
}

function portraitChoiceLabel(value: string): string {
  return { early: "早期查理", peak: "高峰期查理", futureFacing: "面向未来的查理", all_three: "三个都是", no_unique_answer: "不设唯一答案" }[value] ?? "保留开放选择";
}

function dispositionLabel(value: string): string {
  return { future_reference: "留给未来参照", present_record: "留在现在", unfinished: "保持未完成" }[value] ?? "保持未完成";
}

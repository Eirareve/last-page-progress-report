"use client";

import Image from "next/image";
import {
  type ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

import {
  Stage5ExperienceFacade,
  type Stage5Commands,
  type Stage5Disposition,
  type Stage5FragmentView,
  type Stage5PersistenceStatus,
  type Stage5PortraitStage,
  type Stage5PortraitView,
  type Stage5PresentationView,
  type Stage5RecoveryView,
  type Stage5RoundView,
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
  const mounted = useRef(false);
  const initialized = useRef(false);
  const activeSessionId = snapshot.view?.sessionId ?? null;
  const [researchConsent, setResearchConsentState] =
    useState<ResearchConsent>("pending");

  useEffect(() => {
    mounted.current = true;
    if (!initialized.current) {
      initialized.current = true;
      void facade.initialize();
    }
    return () => {
      mounted.current = false;
      queueMicrotask(() => {
        if (!mounted.current) facade.dispose();
      });
    };
  }, [facade]);

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

  const chooseConsent = (consent: Exclude<ResearchConsent, "pending">) => {
    if (activeSessionId === null) return;
    setResearchConsent(window.localStorage, activeSessionId, consent);
    setResearchConsentState(consent);
  };
  const removeResearch = () => {
    if (activeSessionId === null) return;
    deleteResearchData(window.localStorage, activeSessionId);
    setResearchConsentState("pending");
  };
  const downloadResearch = () => {
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
      <TheaterHeader snapshot={snapshot} requestedMode={requestedMode} />
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {snapshot.announcement}
      </div>
      {snapshot.error ? (
        <section className="error-summary" role="alert" tabIndex={-1}>
          <strong>这一步没有完成</strong>
          <p>{snapshot.error}</p>
        </section>
      ) : null}
      <main id="main-content">
        {snapshot.status === "booting" ? <LoadingStage /> : null}
        {snapshot.status === "blocked" ? (
          <BlockedStage snapshot={snapshot} commands={facade} />
        ) : null}
        {snapshot.status === "ready" && snapshot.view ? (
          <StageDirector
            snapshot={snapshot}
            view={snapshot.view}
            commands={facade}
            requestedMode={requestedMode}
            researchConsent={researchConsent}
            onConsent={chooseConsent}
            onResearchDelete={removeResearch}
            onResearchDownload={downloadResearch}
          />
        ) : null}
      </main>
      <footer
        className={`site-footer${snapshot.view?.stage === "COMPLETE" ? " is-complete" : ""}`}
      >
        <p>原创互动草案，AI 协作式阅读体验</p>
        {snapshot.status === "ready" && snapshot.view ? (
          <button
            type="button"
            className="quiet-button"
            onClick={() => {
              if (
                !window.confirm(
                  "删除当前浏览器中的本次体验进度和研究记录？此操作无法撤销。",
                )
              ) {
                return;
              }
              removeResearch();
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

function TheaterHeader({
  snapshot,
  requestedMode,
}: {
  snapshot: Stage5Snapshot;
  requestedMode: "mock" | "live";
}) {
  const stage = snapshot.view?.stage ?? "WELCOME";
  const current = chapterIndex(stage);
  const chapters = ["缘起", "肖像", "审校", "语义", "签名", "封套"];
  return (
    <header className={`theater-header${stage === "COMPLETE" ? " is-complete" : ""}`}>
      <div className="brand-block">
        <span className="kicker">LAST PAGE PROGRESS REPORT</span>
        <strong>最后一页进步报告</strong>
      </div>
      <nav className="chapter-nav" aria-label="体验章节">
        <ol>
          {chapters.map((chapter, index) => (
            <li
              className={index === current ? "is-current" : index < current ? "is-past" : ""}
              key={chapter}
              aria-current={index === current ? "step" : undefined}
            >
              <i>{String(index + 1).padStart(2, "0")}</i>
              {chapter}
            </li>
          ))}
        </ol>
      </nav>
      <div className="status-stack">
        <span className="mode-chip">
          {requestedMode === "live" ? "模型协作" : "本地演示"}
        </span>
        <span className="save-chip" data-state={snapshot.persistence}>
          {persistenceLabel(snapshot.persistence)}
        </span>
      </div>
    </header>
  );
}

function StageDirector({
  snapshot,
  view,
  commands,
  requestedMode,
  researchConsent,
  onConsent,
  onResearchDelete,
  onResearchDownload,
}: {
  snapshot: Stage5Snapshot;
  view: Stage5PresentationView;
  commands: Stage5Commands;
  requestedMode: "mock" | "live";
  researchConsent: ResearchConsent;
  onConsent: (consent: Exclude<ResearchConsent, "pending">) => void;
  onResearchDelete: () => void;
  onResearchDownload: () => void;
}) {
  const titleRef = useRef<HTMLHeadingElement>(null);
  const busy = snapshot.persistence === "saving" || view.busy;

  useEffect(() => {
    titleRef.current?.focus();
  }, [view.stage]);

  const heading = (
    <h1 ref={titleRef} tabIndex={-1} data-testid="stage-heading">
      {view.stageTitle}
    </h1>
  );

  const body = stageBody({
    heading,
    view,
    commands,
    busy,
    requestedMode,
    researchConsent,
    onConsent,
    onResearchDelete,
    onResearchDownload,
  });

  return (
    <div className={`stage-frame stage-${slug(view.stage)}`}>
      <section className="stage-surface" aria-busy={busy} key={view.stage}>
        {view.executionStatus && view.stage !== "COMPLETE" ? (
          <ExecutionNotice view={view} />
        ) : null}
        {body}
        {view.blockers.length > 0 ? (
          <section className="inline-blockers" aria-label="封存前阻塞">
            <strong>封存前阻塞</strong>
            <ul>
              {view.blockers.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </section>
        ) : null}
      </section>
    </div>
  );
}

function stageBody(input: StageBodyInput) {
  switch (input.view.stage) {
    case "WELCOME":
      return <WelcomeStage {...input} />;
    case "PORTRAIT_PRELUDE":
      return <PortraitPreludeStage {...input} />;
    case "PORTRAIT_CHOICE":
      return <PortraitChoiceStage {...input} />;
    case "ROUND_1_PAST_SELF":
    case "ROUND_2_FORECAST":
    case "ROUND_3_RELATIONSHIP":
    case "ROUND_1_DIFF":
    case "ROUND_2_DIFF":
    case "ROUND_3_DIFF":
    case "PLAIN_REWRITE":
    case "SEMANTIC_REVIEW":
    case "SEMANTIC_PLACEMENT":
      return <ReviewStage {...input} />;
    case "PORTRAIT_REASSEMBLY":
      return <ReassemblyStage {...input} />;
    case "FINAL_SIGNATURE":
      return <SignatureStage {...input} />;
    case "MANUSCRIPT_REVISION":
      return <ManuscriptRevisionStage {...input} />;
    case "FINAL_DISPOSITION":
      return <DispositionStage {...input} />;
    case "FINALIZING":
      return <FinalizingStage heading={input.heading} />;
    case "COMPLETE":
      return <CompleteStage {...input} />;
    default:
      return (
        <article className="scene-card">
          {input.heading}
          <p>这个阶段暂时没有前端投影。</p>
        </article>
      );
  }
}

type StageBodyInput = {
  heading: ReactNode;
  view: Stage5PresentationView;
  commands: Stage5Commands;
  busy: boolean;
  requestedMode: "mock" | "live";
  researchConsent: ResearchConsent;
  onConsent: (consent: Exclude<ResearchConsent, "pending">) => void;
  onResearchDelete: () => void;
  onResearchDownload: () => void;
};

function WelcomeStage({
  heading,
  view,
  commands,
  busy,
  requestedMode,
  researchConsent,
  onConsent,
}: StageBodyInput) {
  const coverPortrait =
    view.portraits.find((portrait) => portrait.stage === "peak") ?? view.portraits[0];
  const start = () => {
    if (researchConsent === "pending") onConsent("declined");
    void commands.start();
  };
  return (
    <article className="welcome-layout">
      <div className="title-plate">
        <p className="kicker">这句话能留给未来的我吗？</p>
        {heading}
        <p className="entry-title" aria-hidden="true">
          哪一版的查理，
          <span>才算真正的查理？</span>
        </p>
        <p className="lede opening-copy">
          这是一次关于心智、记忆与自我的互动阅读。你将在三个阶段的查理之间反复权衡：笨拙的、锋利的、与即将熄灭的。你的每一次选择都会被保存，成为这封档案的一部分。
        </p>
        <div className="welcome-actions">
          <button className="primary-button" disabled={busy} onClick={start}>
            开始体验
          </button>
          <span>默认不记录研究数据，可以直接开始。</span>
        </div>
        <figure className="opening-quote">
          <blockquote>{view.preciseText}</blockquote>
          <figcaption>原创互动手稿，第一版</figcaption>
        </figure>
        <ol className="entry-path" aria-label="体验路径">
          <li>
            <span>01</span>
            看见三张肖像
          </li>
          <li>
            <span>02</span>
            审校原创手稿
          </li>
          <li>
            <span>03</span>
            封存最后一页
          </li>
        </ol>
        <div className="declaration">
          <strong>原创互动声明</strong>
          <p>{view.originalDeclaration}</p>
          <small>{view.originalAttribution}</small>
        </div>
      </div>
      {coverPortrait ? (
        <figure className="cover-portrait">
          <Image
            src={coverPortrait.assetPath}
            alt={coverPortrait.altText}
            width={840}
            height={1120}
            sizes="(min-width: 900px) 34vw, 88vw"
            priority
          />
          <figcaption>
            <span>PLATE 02</span>
            {coverPortrait.title}
          </figcaption>
        </figure>
      ) : null}
      <ResearchConsentCard
        consent={researchConsent}
        requestedMode={requestedMode}
        onConsent={onConsent}
      />
    </article>
  );
}

function ResearchConsentCard({
  consent,
  requestedMode,
  onConsent,
}: {
  consent: ResearchConsent;
  requestedMode: "mock" | "live";
  onConsent: (consent: Exclude<ResearchConsent, "pending">) => void;
}) {
  return (
    <section className="research-card" aria-labelledby="research-title">
      <p className="kicker">LOCAL RESEARCH</p>
      <h2 id="research-title">默认不记录</h2>
      <p>
        你可以直接开始。若愿意帮助改进流程，可允许匿名事件保存在当前浏览器，最多
        {STAGE9_RESEARCH_RETENTION_DAYS} 天。
      </p>
      {requestedMode === "live" ? (
        <p>Live 模式会把当前步骤所需上下文发送给模型服务，但不进入研究 analytics。</p>
      ) : null}
      <div className="button-row" role="group" aria-label="匿名研究记录选择">
        <button
          className={consent === "accepted" ? "primary-button" : "secondary-button"}
          type="button"
          onClick={() => onConsent("accepted")}
        >
          同意记录匿名事件
        </button>
        <button
          className={consent === "declined" ? "primary-button" : "secondary-button"}
          type="button"
          onClick={() => onConsent("declined")}
        >
          不记录
        </button>
      </div>
      {consent !== "pending" ? (
        <p className="status-line" role="status">
          当前选择：{consent === "accepted" ? "同意本地记录。" : "不记录匿名事件。"}
        </p>
      ) : (
        <p className="status-line">未选择时开始体验会按“不记录”处理。</p>
      )}
    </section>
  );
}

function PortraitPreludeStage({ heading, view, commands, busy }: StageBodyInput) {
  const initial = useMemo(
    () => new Set(view.portraits.flatMap((portrait) => portrait.selectedDescriptors)),
    [view.portraits],
  );
  const [selected, setSelected] = useState<Set<string>>(initial);

  const toggle = (id: string) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  return (
    <form
      className="scene-card"
      onSubmit={(event) => {
        event.preventDefault();
        void commands.submitPortraitDescriptors([...selected]);
      }}
    >
      <p className="kicker">PORTRAIT GALLERY</p>
      {heading}
      <p className="lede">先观察三幅固定肖像。描述词不是评价，只是给后续判断留一枚书签。</p>
      <div className="portrait-wall">
        {view.portraits.map((portrait) => (
          <PortraitPanel
            key={portrait.id}
            portrait={portrait}
            selected={selected}
            onToggle={toggle}
          />
        ))}
      </div>
      <button className="primary-button" disabled={busy} type="submit">
        保存这些描述
      </button>
    </form>
  );
}

function PortraitPanel({
  portrait,
  selected,
  onToggle,
}: {
  portrait: Stage5PortraitView;
  selected: ReadonlySet<string>;
  onToggle: (id: string) => void;
}) {
  return (
    <article className="portrait-panel">
      <div className="portrait-image">
        <Image
          src={portrait.assetPath}
          alt={portrait.altText}
          width={420}
          height={560}
          loading="eager"
        />
      </div>
      <h2>{portrait.title}</h2>
      <fieldset>
        <legend>描述词</legend>
        <div className="chip-field">
          {portrait.descriptorOptions.map((option) => (
            <label className="choice-chip" key={option.id}>
              <input
                type="checkbox"
                checked={selected.has(option.id)}
                onChange={() => onToggle(option.id)}
              />
              <span>{option.label}</span>
            </label>
          ))}
        </div>
      </fieldset>
    </article>
  );
}

function PortraitChoiceStage({ heading, commands, busy }: StageBodyInput) {
  const [choice, setChoice] = useState<Stage5PortraitStage>("early");
  const [reason, setReason] = useState("");
  return (
    <form
      className="scene-card"
      onSubmit={(event) => {
        event.preventDefault();
        void commands.submitInitialPortrait({ choice, reason });
      }}
    >
      <p className="kicker">FIRST JUDGEMENT</p>
      {heading}
      <p className="lede">这不是最终答案。它只是三轮审校的起点。</p>
      <RadioColumn
        name="initial-portrait"
        value={choice}
        onChange={(value) => setChoice(value as Stage5PortraitStage)}
        options={[
          ["early", "早期查理", "仍相信笑声与友谊的查理"],
          ["peak", "高峰期查理", "高度理解，却更加孤独的查理"],
          ["futureFacing", "面向未来的查理", "试图给未来留下文字的查理"],
        ]}
      />
      <label className="field-label" htmlFor="initial-reason">
        为什么？
      </label>
      <textarea
        id="initial-reason"
        rows={4}
        value={reason}
        onChange={(event) => setReason(event.target.value)}
      />
      <button className="primary-button" disabled={busy || reason.trim().length === 0}>
        记录这个判断
      </button>
    </form>
  );
}

function ReviewStage(input: StageBodyInput) {
  const { heading, view } = input;
  const isDiff = view.stage.endsWith("_DIFF") && view.pendingDiff !== null;
  const isPlacement = view.stage === "SEMANTIC_PLACEMENT";
  return (
    <article className="review-theater">
      <div className="review-head">
        <p className="kicker">{isPlacement ? "SEMANTIC BOUQUET" : "EDITORIAL TABLE"}</p>
        {heading}
      </div>
      <RoundContext view={view} />
      <ManuscriptDocuments view={view} />
      {view.currentRound && !view.currentRound.responseSubmitted && !isDiff ? (
        <RoundAnswerForm {...input} round={view.currentRound} />
      ) : null}
      {isDiff && view.pendingDiff ? <DiffReview {...input} diff={view.pendingDiff} /> : null}
      {isPlacement ? <SemanticPlacement {...input} /> : null}
      {["PLAIN_REWRITE", "SEMANTIC_REVIEW"].includes(view.stage) ? (
        <p className="operation-note">正在生成并校验语义版本。</p>
      ) : null}
    </article>
  );
}

function RoundContext({ view }: { view: Stage5PresentationView }) {
  const round = view.currentRound;
  if (!round) {
    return (
      <section className="context-band">
        <h2>{semanticStatusLabel(view.semanticStatus)}</h2>
        <p>不能被朴素版本完整传递的意义，需要被收入语义花束。</p>
      </section>
    );
  }
  return (
    <section className="context-band">
      <p className="kicker">{round.title}</p>
      <h2>{round.evidenceTitle}</h2>
      <p>{round.evidenceText}</p>
      {round.charlieResponse ? <blockquote>{round.charlieResponse}</blockquote> : null}
      {round.principle ? <p className="principle">你的原则：{round.principle}</p> : null}
      {round.dissent ? <p className="dissent">保留分歧：{round.dissent}</p> : null}
    </section>
  );
}

function RoundAnswerForm({
  commands,
  busy,
  round,
}: StageBodyInput & { round: Stage5RoundView }) {
  const [response, setResponse] = useState("");
  const [clarification, setClarification] = useState("");
  const [clarificationOpen, setClarificationOpen] = useState(false);
  const clarificationRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (clarificationOpen) {
      clarificationRef.current?.focus();
    }
  }, [clarificationOpen]);

  return (
    <form
      className="answer-form"
      onSubmit={(event) => {
        event.preventDefault();
        void commands.submitRound({
          response,
          ...(clarification.trim() ? { clarification } : {}),
        });
      }}
    >
      <label className="field-label" htmlFor="round-response">
        {round.question}
      </label>
      <textarea
        id="round-response"
        rows={5}
        value={response}
        onChange={(event) => setResponse(event.target.value)}
      />
      {!clarificationOpen ? (
        <button
          type="button"
          className="secondary-button clarification-toggle"
          aria-expanded="false"
          aria-controls="round-clarification-region"
          onClick={() => setClarificationOpen(true)}
        >
          添加澄清（可选）
        </button>
      ) : null}
      {clarificationOpen ? (
        <div id="round-clarification-region" className="clarification-region">
          <label className="field-label" htmlFor="round-clarification">
            澄清，可选
          </label>
          <textarea
            id="round-clarification"
            ref={clarificationRef}
            rows={3}
            value={clarification}
            onChange={(event) => setClarification(event.target.value)}
          />
        </div>
      ) : null}
      <button className="primary-button" disabled={busy || response.trim().length === 0}>
        {clarificationOpen ? "提交回答与澄清" : "提交并继续"}
      </button>
    </form>
  );
}

function ManuscriptDocuments({ view }: { view: Stage5PresentationView }) {
  return (
    <section className="document-spread" aria-label="手稿版本">
      <article className="document-sheet precise">
        <header>
          <span>精确版本</span>
          <small>{view.preciseRevisionId}</small>
        </header>
        <p>{view.preciseText}</p>
      </article>
      <article className="document-sheet plain">
        <header>
          <span>朴素版本</span>
          <small>{view.plainRevisionId ?? "尚未生成"}</small>
        </header>
        <p>{view.plainText ?? "尚未生成。三轮审校完成前，不会预先伪造这份文本。"}</p>
      </article>
    </section>
  );
}

function DiffReview({
  commands,
  busy,
  diff,
}: StageBodyInput & {
  diff: NonNullable<Stage5PresentationView["pendingDiff"]>;
}) {
  return (
    <section className="diff-panel">
      <p className="kicker">{diffOperationLabel(diff.operation)}</p>
      <h2>审阅局部修改</h2>
      <p>{diff.reason}</p>
      {diff.newText ? <ins>{diff.newText}</ins> : null}
      <div className="button-row">
        <button
          className="primary-button"
          disabled={busy}
          onClick={() => void commands.decideDiff("accept")}
        >
          接受修改
        </button>
        <button
          className="secondary-button"
          disabled={busy}
          onClick={() => void commands.decideDiff("reject")}
        >
          拒绝并保留分歧
        </button>
      </div>
    </section>
  );
}

function SemanticPlacement({ view, commands, busy }: StageBodyInput) {
  return (
    <section className="semantic-bouquet">
      <h2>语义花束</h2>
      <p>每一枚碎片只做一个动作：收入花束。不要替它选择“回正文”或“页边批注”。</p>
      {view.semanticFragments.map((fragment) => (
        <FragmentCard
          key={fragment.id}
          fragment={fragment}
          busy={busy}
          onPlace={() =>
            void commands.chooseFragmentPlacement({
              fragmentId: fragment.id,
              placement: "bouquet",
            })
          }
        />
      ))}
      {view.placementChecking ? (
        <p className="operation-note">正在检查最终双文本的一致性。</p>
      ) : null}
    </section>
  );
}

function FragmentCard({
  fragment,
  busy,
  onPlace,
}: {
  fragment: Stage5FragmentView;
  busy: boolean;
  onPlace: () => void;
}) {
  return (
    <article className="fragment-card">
      <blockquote>{fragment.phrase}</blockquote>
      <p>{fragment.reason}</p>
      <p>
        <strong>若丢失：</strong>
        {fragment.consequence}
      </p>
      {fragment.placement ? (
        <p className="status-pill">已收入语义花束</p>
      ) : (
        <button className="primary-button" disabled={busy} onClick={onPlace}>
          收入语义花束
        </button>
      )}
    </article>
  );
}

function ReassemblyStage({ heading, view, commands, busy }: StageBodyInput) {
  const [choice, setChoice] = useState(view.finalChoice ?? "all_three");
  const [reason, setReason] = useState("");
  return (
    <form
      className="scene-card"
      onSubmit={(event) => {
        event.preventDefault();
        void commands.submitFinalPortrait({
          choice,
          ...(reason.trim() ? { reason } : {}),
        });
      }}
    >
      <p className="kicker">REASSEMBLY</p>
      {heading}
      <p className="lede">你可以改变判断，也可以拒绝唯一答案。改变不是推翻之前的自己。</p>
      <RadioColumn
        name="final-portrait"
        value={choice}
        onChange={setChoice}
        options={[
          ["early", "早期查理", "让过去自我保留解释权"],
          ["peak", "高峰期查理", "让理解能力承担代表权"],
          ["futureFacing", "面向未来的查理", "让未来边界保持开放"],
          ["all_three", "三个都是", "承认三个阶段共同构成同一生命"],
          ["no_unique_answer", "拒绝唯一答案", "不把真正的查理缩成一个阶段"],
        ]}
      />
      <label className="field-label" htmlFor="final-reason">
        最终理由，可选
      </label>
      <textarea
        id="final-reason"
        rows={3}
        value={reason}
        onChange={(event) => setReason(event.target.value)}
      />
      <button className="primary-button" disabled={busy}>
        保存最终选择
      </button>
    </form>
  );
}

function SignatureStage({ heading, view, commands, busy }: StageBodyInput) {
  const unavailable = view.signatureStatus === "unavailable";
  return (
    <article className="signature-room">
      <div>
        <p className="kicker">SIGNATURE REVIEW</p>
        {heading}
        <p className="lede">
          签名或拒签只能来自查理的审阅结果。你能提交审阅，也能暂不提交。
        </p>
        {view.signatureSummary ? (
          <p className="signature-summary">审阅说明：{view.signatureSummary}</p>
        ) : null}
        <div className="button-column">
          {!unavailable ? (
            <button
              className="primary-button"
              disabled={busy}
              onClick={() => void commands.requestSignature()}
            >
              提交给查理审阅
            </button>
          ) : null}
          {unavailable && view.signatureRetryAvailable ? (
            <button
              className="primary-button"
              disabled={busy}
              onClick={() => void commands.requestSignature()}
            >
              重试查理签名审阅（最后一次）
            </button>
          ) : null}
          <button
            className="quiet-button"
            disabled={busy}
            onClick={() => void commands.skipSignature()}
          >
            {unavailable ? "保留技术未完成状态并继续归档" : "暂不发起审阅，继续归档"}
          </button>
          <button
            className="quiet-button"
            disabled={busy}
            onClick={() => void commands.returnToManuscript()}
          >
            返回修改手稿
          </button>
        </div>
      </div>
      <div className="signature-state">
        <span>当前状态</span>
        <strong>{signatureLabel(view.signatureStatus)}</strong>
        <p>未请求、技术未完成和角色拒签永远分开记录。</p>
      </div>
    </article>
  );
}

function ManuscriptRevisionStage({ heading, view, commands, busy }: StageBodyInput) {
  const [draft, setDraft] = useState(view.preciseText);
  const [reason, setReason] = useState("在签名前补充必要边界");
  return (
    <form
      className="scene-card"
      onSubmit={(event) => {
        event.preventDefault();
        void commands.submitManuscriptRevision({
          draftPreciseText: draft,
          reason,
        });
      }}
    >
      <p className="kicker">MANUSCRIPT REVISION</p>
      {heading}
      <p className="lede">提交后，朴素版、语义复核和签名状态会失效并重建。</p>
      <label className="field-label" htmlFor="working-draft">
        修改后的精确版本
      </label>
      <textarea
        id="working-draft"
        rows={10}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
      />
      <label className="field-label" htmlFor="revision-reason">
        修改理由
      </label>
      <input
        id="revision-reason"
        value={reason}
        onChange={(event) => setReason(event.target.value)}
      />
      <div className="button-row">
        <button className="primary-button" disabled={busy}>
          提交修改
        </button>
        <button
          className="secondary-button"
          type="button"
          disabled={busy}
          onClick={() => void commands.cancelManuscriptRevision()}
        >
          取消并返回
        </button>
      </div>
    </form>
  );
}

function DispositionStage({ heading, view, commands, busy }: StageBodyInput) {
  return (
    <article className="scene-card">
      <p className="kicker">ARCHIVE CHOICE</p>
      {heading}
      <p className="lede">这是为文稿选择归宿，不是为查理裁决胜负。</p>
      <div className="disposition-grid">
        {(
          [
            ["future_reference", "留给未来参考", "允许未来读者回看，但不替未来签收"],
            ["present_record", "作为此刻记录", "承认这是现在阶段留下的判断"],
            ["unfinished", "保持未完成", "让未解决的分歧继续留在封套里"],
          ] as const
        ).map(([value, title, copy]) => (
          <button
            key={value}
            className="disposition-option"
            disabled={busy}
            onClick={() => void commands.chooseDisposition(value)}
          >
            <strong>{title}</strong>
            <span>{copy}</span>
          </button>
        ))}
      </div>
      {view.signatureStatus ? (
        <p className="status-line">签名状态：{signatureLabel(view.signatureStatus)}</p>
      ) : null}
    </article>
  );
}

function FinalizingStage({ heading }: { heading: ReactNode }) {
  return (
    <article className="scene-card">
      <p className="kicker">SEALING</p>
      {heading}
      <p className="operation-note">正在封存只读封套。</p>
    </article>
  );
}

function CompleteStage({
  heading,
  view,
  commands,
  researchConsent,
  onResearchDelete,
  onResearchDownload,
}: StageBodyInput) {
  const envelope = view.envelope;
  const [revealState, setRevealState] = useState<
    "sealed" | "opening" | "extracting" | "reading" | "revealed"
  >("sealed");
  const [visibleCount, setVisibleCount] = useState(0);
  const letterTopRef = useRef<HTMLElement>(null);
  const hasScrolledToLetterRef = useRef(false);
  const prefersReducedMotion = usePrefersReducedMotion();
  const graphemes = useMemo(
    () => (envelope ? segmentGraphemes(envelope.letter.body) : []),
    [envelope],
  );

  useEffect(() => {
    if (
      (revealState === "reading" || revealState === "revealed") &&
      !hasScrolledToLetterRef.current
    ) {
      hasScrolledToLetterRef.current = true;
      requestAnimationFrame(() => {
        letterTopRef.current?.scrollIntoView({
          behavior: prefersReducedMotion ? "auto" : "smooth",
          block: "start",
        });
      });
    }
  }, [prefersReducedMotion, revealState]);

  useEffect(() => {
    if (revealState === "opening") {
      const timer = window.setTimeout(() => setRevealState("extracting"), 540);
      return () => window.clearTimeout(timer);
    }
    if (revealState === "extracting") {
      const timer = window.setTimeout(() => setRevealState("reading"), 800);
      return () => window.clearTimeout(timer);
    }
    if (revealState !== "reading") return;
    if (visibleCount >= graphemes.length) return;
    const previous = graphemes[visibleCount - 1] ?? "";
    const delay =
      visibleCount === 0
        ? 420
        : /[。！？]/u.test(previous)
          ? 320
          : /[，、；：]/u.test(previous)
            ? 180
            : 28;
    const nextCount = visibleCount + 1;
    const timer = window.setTimeout(() => {
      setVisibleCount(nextCount);
      if (nextCount >= graphemes.length) setRevealState("revealed");
    }, delay);
    return () => window.clearTimeout(timer);
  }, [graphemes, revealState, visibleCount]);

  if (!envelope) {
    return (
      <article className="scene-card">
        {heading}
        <p>封套尚未生成。</p>
      </article>
    );
  }
  const openEnvelope = () => {
    if (revealState !== "sealed") return;
    if (prefersReducedMotion) {
      setVisibleCount(graphemes.length);
      setRevealState("revealed");
      return;
    }
    setRevealState("opening");
  };
  const showFullLetter = () => {
    setVisibleCount(graphemes.length);
    setRevealState("revealed");
  };
  const replayLetter = () => {
    setVisibleCount(0);
    if (prefersReducedMotion) {
      setVisibleCount(graphemes.length);
      setRevealState("revealed");
    } else {
      setRevealState("reading");
    }
    letterTopRef.current?.scrollIntoView({
      behavior: prefersReducedMotion ? "auto" : "smooth",
      block: "start",
    });
  };
  const visibleBody = graphemes.slice(0, visibleCount).join("");
  const isReading = revealState === "reading" || revealState === "revealed";
  const announcement =
    revealState === "revealed"
      ? "查理来信全文已显示。"
      : revealState === "sealed"
        ? "最终封套尚未打开。"
        : "信件正在展开。";

  return (
    <article className="envelope-finale" data-reveal-state={revealState}>
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {announcement}
      </div>

      <section className="envelope-stage" aria-label="最终封套">
        <div className="finale-heading">
          <p className="kicker">FINAL ENVELOPE · 06</p>
          {heading}
          <p>信封安静地放在桌上，等待你拿起。</p>
        </div>

        <div
          className="envelope-object"
          role="button"
          tabIndex={revealState === "sealed" ? 0 : -1}
          aria-label="拿起并翻开信封"
          onClick={openEnvelope}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              openEnvelope();
            }
          }}
        >
          <Image
            className="envelope-agnes-art"
            src="/envelope/charlie-envelope-risograph-cutout.png"
            alt=""
            aria-hidden="true"
            fill
            sizes="(max-width: 640px) 82vw, 33rem"
            priority
          />
          <div className="envelope-letter-preview">
            <span>LAST PAGE</span>
            <i />
            <i />
            <i />
          </div>
        </div>

      </section>

      {isReading ? (
        <section className="letter-reading-stage" ref={letterTopRef} tabIndex={-1}>
          <article className="letter-sheet" aria-label="查理来信">
            <header className="letter-masthead">
              <p>最后一页 · 封套内页</p>
              <span>{envelope.generatedAt.slice(0, 10)}</span>
            </header>

            <p className="letter-salutation">我是查理。</p>

            <div className="letter-copy-shell">
              <div className="letter-copy-measure" aria-hidden="true">
                <LetterParagraphs body={envelope.letter.body} />
              </div>
              <div className="letter-copy-stream" aria-hidden="true">
                <LetterParagraphs body={visibleBody} />
                {revealState === "reading" ? <span className="ink-caret" /> : null}
              </div>
              <div className="sr-only">
                <LetterParagraphs body={envelope.letter.body} />
              </div>
            </div>

            <footer className="letter-footer">
              <p>{envelope.letter.attribution}</p>
              <dl>
                <div>
                  <dt>签名状态</dt>
                  <dd>{signatureLabel(envelope.signatureStatus)}</dd>
                </div>
                <div>
                  <dt>归档方式</dt>
                  <dd>{dispositionLabel(envelope.finalDisposition)}</dd>
                </div>
              </dl>
            </footer>

            <div className="letter-controls">
              {revealState === "reading" ? (
                <button className="secondary-button" type="button" onClick={showFullLetter}>
                  显示全文
                </button>
              ) : (
                <button className="secondary-button" type="button" onClick={replayLetter}>
                  重新阅读
                </button>
              )}
            </div>

            <details className="envelope-record">
              <summary>查看封套记录</summary>
              <div className="record-ledger">
                <section>
                  <h2>被留下的话</h2>
                  <p>{envelope.preciseText}</p>
                </section>
                <section>
                  <h2>朴素版本</h2>
                  <p>{envelope.plainText}</p>
                </section>
                <section>
                  <h2>三次看见之后</h2>
                  <p>{envelope.portraitShiftSummary}</p>
                  <p>最终选择：{portraitChoiceLabel(envelope.finalPortraitChoice)}</p>
                </section>
                <section>
                  <h2>仍然保留的分歧</h2>
                  {envelope.openDissents.length > 0 ? (
                    <ul>
                      {envelope.openDissents.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  ) : (
                    <p>没有开放分歧。</p>
                  )}
                </section>
                <dl className="record-meta">
                  <div>
                    <dt>内容版本</dt>
                    <dd>{envelope.contentBundleVersion}</dd>
                  </div>
                  <div>
                    <dt>信件来源</dt>
                    <dd>{letterSourceLabel(envelope.letter.sourceMode)}</dd>
                  </div>
                  <div>
                    <dt>完整性校验</dt>
                    <dd>{envelope.integrityChecksum}</dd>
                  </div>
                </dl>
              </div>
            </details>

            <div className="finale-actions">
              <button className="primary-button" onClick={() => void commands.startNewSession()}>
                开始新的体验
              </button>
              {researchConsent === "accepted" ? (
                <button className="secondary-button" onClick={onResearchDownload}>
                  下载匿名研究记录
                </button>
              ) : null}
              <button
                className="quiet-button destructive-button"
                onClick={() => {
                  if (!window.confirm("删除本次体验和研究记录？此操作无法撤销。")) return;
                  onResearchDelete();
                  void commands.deleteCurrentSession();
                }}
              >
                删除本地数据
              </button>
            </div>
          </article>
        </section>
      ) : null}
    </article>
  );
}

function LetterParagraphs({ body }: { body: string }) {
  return body.split(/\n\s*\n/u).map((paragraph, index) => (
    <p key={`${index}-${paragraph.slice(0, 12)}`}>{paragraph}</p>
  ));
}

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return reduced;
}

function segmentGraphemes(value: string): string[] {
  if (typeof Intl.Segmenter === "function") {
    return Array.from(
      new Intl.Segmenter("zh-CN", { granularity: "grapheme" }).segment(value),
      ({ segment }) => segment,
    );
  }
  return Array.from(value);
}

function letterSourceLabel(source: "mock" | "live" | "unavailable" | "legacy") {
  switch (source) {
    case "mock":
      return "确定性 Mock，经本地安全校验";
    case "live":
      return "模型生成，经本地安全校验";
    case "legacy":
      return "旧版只读封套";
    case "unavailable":
      return "生成不可用，仅保留档案说明";
  }
}

function RadioColumn({
  name,
  value,
  options,
  onChange,
}: {
  name: string;
  value: string;
  options: readonly (readonly [string, string, string])[];
  onChange: (value: string) => void;
}) {
  return (
    <fieldset className="radio-column">
      <legend>选择</legend>
      {options.map(([optionValue, label, description]) => (
        <label className="radio-card" key={optionValue}>
          <input
            type="radio"
            name={name}
            checked={value === optionValue}
            onChange={() => onChange(optionValue)}
          />
          <span>
            <strong>{label}</strong>
            <small>{description}</small>
          </span>
        </label>
      ))}
    </fieldset>
  );
}

function ExecutionNotice({ view }: { view: Stage5PresentationView }) {
  const status = view.executionStatus;
  if (!status) return null;
  return (
    <p className="execution-notice" data-testid="execution-status">
      {status.outcome === "failed"
        ? "技术执行未完成"
        : status.resolvedMode === "live"
          ? "真实模型结果已通过校验"
          : "已使用本地安全演示结果"}
      ：{status.capability}
    </p>
  );
}

function LoadingStage() {
  return (
    <section className="loading-stage">
      <p className="kicker">OPENING GALLERY</p>
      <h1>正在准备展厅</h1>
      <p>正在核对内容包、来源和本地恢复状态。</p>
    </section>
  );
}

function BlockedStage({
  snapshot,
  commands,
}: {
  snapshot: Stage5Snapshot;
  commands: Stage5Commands;
}) {
  return (
    <section className="blocked-stage">
      <p className="kicker">BLOCKED</p>
      <h1>无法安全恢复这个体验</h1>
      <RecoveryDetails recovery={snapshot.recovery} />
      <button className="primary-button" onClick={() => void commands.retryInitialization()}>
        重试
      </button>
    </section>
  );
}

function RecoveryDetails({ recovery }: { recovery: Stage5RecoveryView | null }) {
  if (!recovery) return <p>请重试，或从新的体验开始。</p>;
  if (recovery.kind !== "rejected") return <p>{recovery.message}</p>;
  return (
    <>
      <p>{recovery.message}</p>
      <p>代码：{recovery.code}</p>
      <ul>
        {recovery.details.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </>
  );
}

function useResearchTracking(
  view: Stage5PresentationView | null,
  consent: ResearchConsent,
) {
  const tracked = useRef<{ view: Stage5PresentationView; enteredAt: number } | null>(
    null,
  );

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
    if (!previous || previous.view.sessionId !== view.sessionId) {
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
      tracked.current = { view, enteredAt: now };
      return;
    }
    if (previous.view.stage !== view.stage) {
      record({
        dedupeKey: `duration:${previous.view.stateRevision}:${previous.view.stage}`,
        eventType: "stage_duration",
        stage: previous.view.stage,
        durationMs: Math.max(0, now - previous.enteredAt),
      });
      record({
        dedupeKey: `stage:${view.stateRevision}:${view.stage}`,
        eventType: "stage_entered",
        stage: view.stage,
      });
    }
    if (previous.view.initialChoice !== view.initialChoice && view.initialChoice) {
      record({
        dedupeKey: `initial:${view.stateRevision}`,
        eventType: "initial_portrait_selected",
        portraitChoice: view.initialChoice,
      });
    }
    if (previous.view.pendingDiff && !view.pendingDiff) {
      record({
        dedupeKey: `diff:${previous.view.pendingDiff.id}`,
        eventType: "diff_decision",
        decision:
          view.revisionCount > previous.view.revisionCount ? "accept" : "reject",
      });
    }
    for (const fragment of view.semanticFragments) {
      const before = previous.view.semanticFragments.find(
        (item) => item.id === fragment.id,
      );
      if (fragment.placement && before?.placement !== fragment.placement) {
        record({
          dedupeKey: `placement:${fragment.id}:${fragment.placement}`,
          eventType: "semantic_fragment_placed",
          placement: fragment.placement,
        });
      }
    }
    if (previous.view.finalChoice !== view.finalChoice && view.finalChoice) {
      record({
        dedupeKey: `final:${view.stateRevision}`,
        eventType: "final_portrait_selected",
        portraitChoice: normalizePortraitChoice(view.finalChoice),
      });
    }
    if (
      previous.view.finalDisposition !== view.finalDisposition &&
      view.finalDisposition
    ) {
      record({
        dedupeKey: `disposition:${view.stateRevision}`,
        eventType: "manuscript_disposition_selected",
        disposition: view.finalDisposition,
      });
    }
    if (previous.view.stage !== "COMPLETE" && view.stage === "COMPLETE") {
      record({
        dedupeKey: `complete:${view.sessionId}`,
        eventType: "experience_completed",
        completed: true,
      });
    }
    tracked.current = {
      view,
      enteredAt: previous.view.stage === view.stage ? previous.enteredAt : now,
    };
  }, [consent, view]);
}

function normalizePortraitChoice(value: string) {
  return value === "early" || value === "peak" || value === "futureFacing"
    ? value
    : "mixed";
}

function chapterIndex(stage: string) {
  if (stage === "WELCOME") return 0;
  if (stage.startsWith("PORTRAIT_") && stage !== "PORTRAIT_REASSEMBLY") return 1;
  if (stage.startsWith("ROUND_") || ["PLAIN_REWRITE", "SEMANTIC_REVIEW", "SEMANTIC_PLACEMENT"].includes(stage)) return 2;
  if (stage === "PORTRAIT_REASSEMBLY") return 3;
  if (["FINAL_SIGNATURE", "MANUSCRIPT_REVISION"].includes(stage)) return 4;
  return 5;
}

function persistenceLabel(status: Stage5PersistenceStatus) {
  return {
    idle: "尚未保存",
    saving: "正在保存",
    saved: "已保存到本地",
    conflict: "检测到并发更新",
    failed: "保存失败",
  }[status];
}

function slug(value: string) {
  return value.toLowerCase().replaceAll("_", "-");
}

function semanticStatusLabel(value: string | null) {
  return { current: "等待收入语义花束", stale: "需要重新复核" }[value ?? ""] ?? "等待复核";
}

function diffOperationLabel(value: string) {
  return { insert: "增加", replace: "替换", delete: "删除", annotate: "添加批注" }[value] ?? "局部修改";
}

function signatureLabel(value: string) {
  return {
    hidden: "尚未决定",
    pending: "正在审阅",
    signed: "已签名",
    declined: "明确拒绝",
    unavailable: "技术上未完成",
    not_requested: "未请求",
  }[value] ?? value;
}

function portraitChoiceLabel(value: string) {
  return {
    early: "早期查理",
    peak: "高峰期查理",
    futureFacing: "面向未来的查理",
    all_three: "三个都是",
    no_unique_answer: "拒绝唯一答案",
  }[value] ?? value;
}

function dispositionLabel(value: Stage5Disposition) {
  return {
    future_reference: "留给未来参考",
    present_record: "作为此刻记录",
    unfinished: "保持未完成",
  }[value];
}

# Stage 5 STOP 复核与编码前 UI 设计

> 复核基线：`ea74626 feat: implement stage 4 state machine and persistence`
>
> 当前状态：**STOP 已解除**。项目负责人已于 2026-08-09 确认 G1–G5 修补、I1 application facade、单一路由与 Playwright 方案；Stage 5 仅使用 Mock。
>
> 约束：编码前输出形成期间未修改核心组件、路由、依赖或阶段 1—4 Contract；确认后按本文批准边界进入实现。

## 0. 结论

Stage 4 的实现与自动化验证整体健康。项目负责人随后明确批准 G1–G5、I1、单一路由与 Playwright 方案；下表记录修补完成后的 STOP 复核结论。

实际复核结果：

| STOP 条件 | 结论 | 证据与说明 |
| --- | --- | --- |
| 1. 阶段 4 完成条件与实际测试结果 | 通过 | `pnpm typecheck` 通过；FSM、持久化和完整 Mock 流程定向测试为 6 个文件、27 个测试全部通过；全量测试为 29 个文件、305 个测试全部通过。 |
| 2. State Machine、SessionState、events、持久化、FinalizationResult、FinalEnvelope 已冻结 | **通过** | G1 文档状态已冻结；G4 FinalEnvelope `0.2.0` 已提供 COMPLETE 所需的 checksummed content snapshot 与 Session configuration。 |
| 3. UI 所需业务状态可读取或确定性推导 | **通过** | G2 多描述词候选与结果、G4 肖像资产/内容身份/requested mode/原创声明均有正式可执行来源。 |
| 4. Stage 5 不新增或修改冻结 payload | **通过（经批准修补）** | 项目负责人先批准 G2–G4 Contract 修补与升版，再开始核心 UI；UI 没有另建业务 payload。 |
| 5. UI 不绕过 ContentLoader/content access | **通过** | G3 原创草案、公开声明与归属由 ContentAccess 注入 bootstrap，并随 FinalEnvelope 投影冻结。 |
| 6. 后半程阶段语义有可消费事件和状态 | **通过** | I1 facade 已组合恢复、幂等提交、Mock orchestration、entry operation、finalization 与 envelope persistence；React 组件只调用 facade。 |

### 已处理的 Contract gap（保留原复核依据）

#### G1 — 已解决：正式冻结状态

`scope-freeze.md`、`domain-contract.md`、`runtime-contract.md`、`naming-contract.md`、`finalization-contract.md` 等仍标注 draft/pending final human approval。可执行 Schema 已经版本化，但 Stage 5 STOP 原文要求的是“已冻结”。进入编码前应由最终审批人明确确认当前阶段 1—4 Contract 基线，或先修正文档状态。

#### G2 — 已解决：序章多描述词业务表示

产品要求用户为三幅肖像选择一个或多个描述词。现有边界只有：

- `PortraitDescriptor = { id, stage, label }`；
- Session 固定存放 3 个 `PortraitDescriptor`；
- `SET_PORTRAIT_DESCRIPTORS` 接收长度为 3 的数组；
- reducer 将每个 stage 的单个 label 投影成单元素数组；
- placeholder portrait content 只有 assetPath、altText 和 provenance，没有描述词候选集。

因此 UI 无法在不发明词表、不缩减多选语义、不新增临时 payload 的情况下实现正式交互。建议在编码前单独决定并版本化：描述词候选集由 Content Contract 提供，用户选择结果由 Domain/FSM Contract 以每个 stage 的非空字符串数组表示。

#### G3 — 已解决：核心原创草案与归属 bootstrap

Scope Freeze 已固定核心原创草案及“并非小说原文或遗失章节”的声明，但当前 ContentAccess 只提供 evidence cards 和 portraits；`createStage4Session` 由调用方直接传入 `preciseText`，同时把 `contentItemsUsed` 初始化为空数组。

Stage 5 若在组件内硬编码草案，会形成绕过内容/归属边界的第二来源；若以空文本启动，最终化会被 `precise_text_missing` 阻塞。建议把核心原创草案、公开声明和稳定 content item identity 纳入正式 bootstrap/content access 输入，并在 Session 创建时完成归属绑定。

#### G4 — 已解决：FinalEnvelope 是 COMPLETE 唯一数据源

Stage 5 要求 COMPLETE 页面只读取 FinalEnvelope，同时展示三张肖像图、原创声明、内容包版本、Session requested Agent mode、receipts 等。现有 FinalEnvelope 包含肖像描述与选择、领域 attribution 和 `executionProvenance`，但没有：

- 肖像 assetPath/altText 或可确定解析的 portrait content references；
- Session `contentBinding` 的 bundle id/version/checksum/schema/environment；
- `SessionConfiguration.requestedAgentMode`；
- 冻结的原创互动声明/核心草案归属字段。

在 `not_requested` 签名路径中，也不能借签名 snapshot 间接得到内容包绑定。UI 若回读 SessionState 或 ContentAccess 补齐 COMPLETE，会违反 FinalEnvelope 唯一数据源规则。建议正式扩展并升版 FinalEnvelope Schema/Builder，同时明确 Session Schema 与旧 COMPLETE 只读恢复影响。

#### G5 — 已解决：ContractVersionVector 单一组合入口

Stage 4 集成测试通过测试 fixture 硬编码 scope/naming/state-machine 等版本。生产源代码没有对应的统一 builder；Stage 5 若复制字符串会产生第二套版本真相。建议由各 Contract owner 导出版本常量，并由 application bootstrap 统一构建完整 `ContractVersionVector`。

### 非 Contract gap、但必须在 UI 组件之前完成的接线

#### I1 — 已实现：Stage 5 application facade

现有 production source 已有 reducer、engine、orchestrators、operation guards 与 IndexedDB store，但没有浏览器体验所需的统一 facade 来完成：Session bootstrap、RequestContext/ActiveOperation 构建、Mock orchestration、原子 dispatch、恢复、finalization context 和 envelope persistence。

这可以作为 Stage 5 的 application composition 实现，不需要让 React 组件直接碰 reducer 或 SessionState；但其接口和文件位置应在核心组件编码前确认。

---

## 1. 页面信息架构

采用一个应用壳和八个体验区域。URL 不代表业务阶段；已恢复的 FSM state 是唯一页面决定来源。

1. **全局应用壳**
   - 跳到主内容链接；
   - 项目名称与原创互动标识；
   - 当前进度的非交互展示；
   - 保存/恢复状态；
   - 全局可访问状态通知与错误摘要。
2. **欢迎区** — WELCOME
   - 项目简介、18–20 分钟预期、原创互动声明、内容与本地数据说明、开始。
3. **肖像序章区** — PORTRAIT_PRELUDE、PORTRAIT_CHOICE
   - 三张肖像卡、描述词选择、初始“真正的查理”单选、理由输入。
   - 描述词交互使用 G2 已冻结的正式候选集与多选 payload。
4. **审校 Canvas** — 三轮、三个 Diff、PLAIN_REWRITE、SEMANTIC_REVIEW、SEMANTIC_PLACEMENT
   - 上方：阶段标题、轮次和运行状态；
   - 左侧：肖像、证据、查理回应、用户输入、主张、分歧；
   - 右侧：精确版、朴素版、Diff、revision 历史、语义偏移、碎片、花束和页边批注；
   - 主操作放在当前任务紧邻区域，不设置脱离上下文的全局“下一步”。
5. **手稿修改区** — MANUSCRIPT_REVISION
   - canonical precise 只读基线、working draft 编辑器、失效影响提示、提交/取消。
6. **肖像重新拼合区** — PORTRAIT_REASSEMBLY
   - 三张肖像、初始选择、三轮观点、最终选择、可选理由、事实性变化摘要。
7. **最终审阅与归宿区** — FINAL_SIGNATURE、FINAL_DISPOSITION、FINALIZING
   - 只读双文本、签名审阅状态和允许操作；三种无标签归宿；blockers；最终化只读进度和恢复。
8. **最终封套区** — COMPLETE
   - 叙事内容默认展开；技术/生成信息折叠；只读；新体验使用 application command 创建新 session。
   - 完整展示只读取 G4 已升版的 FinalEnvelope。

路由采用已确认方案：保持单一路由 `/`，只允许不含 stage 的 opaque `session` 查询参数用于恢复；不得新增 `/stage/...`、`?stage=` 或用 pathname/search params 构造 `ExperienceStage`。

---

## 2. 组件树

```text
RootLayout (server；保留 content gate)
└── HomePage (server；单一路由入口)
    └── ExperienceClient (client；只组合 application facade)
        ├── SkipLink
        ├── ExperienceHeader
        │   ├── ProductIdentity
        │   ├── StageProgress
        │   └── PersistenceStatus
        ├── ExperienceAnnouncements
        │   ├── PoliteStatusRegion
        │   └── ErrorSummary
        └── StageProjectionSwitch（不是路由器）
            ├── WelcomeView
            ├── PortraitPreludeView
            │   └── PortraitCard × 3
            ├── PortraitChoiceView
            ├── ReviewCanvasView
            │   ├── EvidenceAndDialoguePanel
            │   │   ├── RoundContext
            │   │   ├── EvidenceCard
            │   │   ├── CharlieResponseBlock
            │   │   ├── UserResponseForm
            │   │   └── PrincipleAndDissentList
            │   └── ManuscriptPanel
            │       ├── RevisionDocument
            │       ├── PendingDiffReview
            │       ├── RevisionHistory
            │       └── SemanticReviewPanel
            │           ├── DriftSummary
            │           ├── SemanticFragmentList
            │           └── RestorationProposalReview
            ├── ManuscriptRevisionView
            ├── PortraitReassemblyView
            ├── FinalSignatureView
            ├── FinalDispositionView
            ├── FinalizingView
            └── CompleteEnvelopeView
                ├── NarrativeEnvelopeSections
                └── TechnicalProvenanceDisclosure
```

边界：

- 组件只接收 immutable view model 和 command callbacks；
- 组件不导入 `src/domain` reducer、`src/fsm/reducer`、IndexedDB store 或 orchestrator；
- `StageProjectionSwitch` 只按 facade 提供的正式 `state.stage` 选择 view，不维护自己的 stage；
- working draft、accordion、tab、图片失败状态和 focus target 仅为本地 UI state；
- 不引入全局 UI store 或新的状态管理依赖。

---

## 3. 状态来源与 view projection

建议新增一个纯 presentation projection。它不持久化，不定义业务 Schema，不改变事件合法性。

| UI 数据 | 唯一来源 | 投影规则 |
| --- | --- | --- |
| 当前页面、标题、stage kind | `Stage4SessionState.stage` + `STAGE_DESCRIPTORS` | 精确映射；未知值由 Schema 恢复拒绝，不显示兜底业务页。 |
| 当前运行/禁用状态 | `runtime.activeOperation`、descriptor.kind、placement batch status | `system_transient` 或匹配的 active operation 显示 busy；业务事件仍由 engine/reducer 最终校验。 |
| 当前轮次 | stage + `rounds` | stage 到 roundId 的只读映射；不产生新 round enum。 |
| 用户主回答/澄清 | persisted sidecars.privateInputs | 只在当前 Session 受控显示，不进入日志或 URL。 |
| 序章尚未提交选择 | sidecars.pendingInitialChoice | 仅显示正式持久化 sidecar；G2 修补后描述词选择也必须来自正式 payload。 |
| 肖像和证据展示 | `ContentAccess` + current round/stage | 仅按稳定 stage/round key 选取；placeholder 保持明确标识。 |
| 精确/朴素文本与 revision | `state.manuscript` | plainText=null 时固定显示“尚未生成”。 |
| pending Diff | `state.manuscript.pendingDiff` | 仅 status=proposed 时显示操作；接受/拒绝后以提交后的 state 为准。 |
| Diff 历史 | `state.manuscript.diffAudit` | 使用 operation/status/confirmedAt 展示，不根据颜色推断。 |
| 语义偏移、碎片、proposal、花束 | semantic fields + sidecars.restorationOutcomes | status 和 revision bindings 原样显示；不得重新判断 current。 |
| 签名状态 | current status/review/attempt/checkpoint | 每个正式状态使用独立文案；future status 只显示 blank。 |
| 最终化可用性与 blockers | `evaluateFinalization(state, context)` | 只调用统一 evaluator；不复制 blockers 条件。 |
| 恢复结果 | `recoverStage4Session` | 直接投影 access/action/code/details；UI 不推断旧 operation 仍 running。 |
| COMPLETE | `state.finalEnvelope` | 只生成 presentation projection；不得回读 SessionState/ContentAccess 补字段。 |
| 表单 draft、展开状态、图片 fallback、焦点 | component-local UI state | 不持久化为业务字段，不触发 FSM 事件。 |

建议 facade 输出：

```text
ExperienceSnapshot
├── view: Stage5PresentationView
├── persistence: idle | saving | saved | conflict | failed
├── recovery: formal recoverStage4Session result projection
├── finalization: FinalizationResult | null
└── commands: stage-scoped callback surface
```

`Stage5PresentationView` 只是 TypeScript readonly presentation type；不得创建 Zod 业务 Schema、不得写回 SessionState。

---

## 4. 用户交互到 FSM/application event 的映射

| 用户/系统交互 | 正式边界 | 说明 |
| --- | --- | --- |
| 开始 | `START` | commit 成功后才进入序章。 |
| 提交三幅肖像描述词 | `SET_PORTRAIT_DESCRIPTORS` | 使用 G2 多描述词集合；不能由 UI 临时缩减为固定单词。 |
| 选择初始肖像 | `CHOOSE_INITIAL_PORTRAIT` | 选择先进入正式 sidecar。 |
| 提交初始理由 | `SUBMIT_INITIAL_REASON` | reducer 验证已有 choice 后进入 round 1。 |
| 提交轮次主回答 | `SUBMIT_RESPONSE` | 私密原文进入 sidecar；Session 只保留结构化结果。 |
| 提交可选澄清并开始分析 | `SUBMIT_CLARIFICATION` + facade 创建的 `ActiveOperation` | 组件不得构造 operation。 |
| 不澄清并开始分析 | `CONTINUE_WITHOUT_CLARIFICATION` + facade operation | 同上。 |
| Mock Round Analysis 完成/失败 | `ROUND_ANALYSIS_BUNDLE_RESOLVED/FAILED` | orchestrator 产出正式 application event，完整 bundle 原子提交。 |
| 接受 Diff | `ACCEPT_DIFF` | facade 生成 transition/revision IDs；重复 intent 使用稳定 transition key。 |
| 拒绝 Diff | `REJECT_DIFF` | canonical 文本不变；正式 dissent 由 reducer 建立。 |
| 进入 Plain/Semantic | application facade 激活正式 operation，再调用 Mock orchestrator | 不是 UI event；激活、结果和持久化必须由 facade 串联。 |
| Plain/Semantic 完成/失败 | `PLAIN_SEMANTIC_BUNDLE_RESOLVED/FAILED` | 完整业务 bundle 原子提交。 |
| 选择页边批注/语义花束 | `CHOOSE_FRAGMENT_PLACEMENT` | 直接 placement；按钮防双击只作 UX，幂等由 transition key 保证。 |
| 选择恢复到朴素文本 | `CHOOSE_FRAGMENT_PLACEMENT(restored_to_plain_text)` | 只选择方向，不等于确认正文修改。 |
| 确认/拒绝冻结 proposal | `CONFIRM_/REJECT_SEMANTIC_RESTORATION_PROPOSAL` | 确认时 facade 生成 nextPlainRevisionId；stale 不能应用。 |
| placement 全部完成 | facade 调用 `beginPostPlacementConsistencyOperation` | 组件不自行把 batch 标记 completed。 |
| consistency 成功/失败 | `POST_PLACEMENT_CHECK_SUCCEEDED/FAILED` | 成功后新 drift 必须绑定最终双 revision。 |
| 选择最终肖像 | `CHOOSE_FINAL_PORTRAIT` | 不自动生成摘要。 |
| 提交/跳过最终理由 | `SUBMIT_FINAL_REASON` / `CONTINUE_WITHOUT_FINAL_REASON` + facade operation | 启动 deterministic portrait comparison。 |
| 比较与摘要完成/失败 | `PORTRAIT_SHIFT_COMPUTED`，随后 facade 激活 summary operation，最终 `PORTRAIT_SHIFT_SUMMARY_RESOLVED/FAILED` | 两步正式边界；组件不计算比较。 |
| 请求/重试签名审阅 | `REQUEST_/RETRY_CHARLIE_SIGNATURE_REVIEW` + facade operation | 组件不能发 signed/declined。 |
| 签名审阅完成/失败 | `CHARLIE_SIGNATURE_REVIEW_RESOLVED/FAILED` | mock 与 live 语义由正式 service/orchestrator 决定。 |
| 不请求/在 unavailable 后继续 | `CONTINUE_WITHOUT_SIGNATURE_REVIEW` | not_requested 与 unavailable 保持不同。 |
| 返回修改手稿 | `RETURN_TO_MANUSCRIPT_REVIEW` | 先显示正式失效提示，再 dispatch。 |
| 提交/取消 working draft | `SUBMIT_MANUSCRIPT_REVISION` / `CANCEL_MANUSCRIPT_REVISION` | working draft 未提交前不写 canonical state。 |
| 选择文稿归宿 | `CHOOSE_DISPOSITION` + facade 提供统一 context/operation | reducer 调用统一 finalization evaluator。 |
| 构建/持久化封套 | facade 调用 builder，随后 `FINAL_ENVELOPE_PERSISTED/FAILED` | COMPLETE 与 envelope/idempotency 在同一持久化边界完成。 |
| 开始新体验 | application command `START_NEW_SESSION` | 创建新 sessionId；绝不修改 COMPLETE Session。 |
| 图片失败 | UI-local fallback | 不发送 Session event。 |

---

## 5. 各区域按阶段显示的规则

| 阶段组 | 左/上方叙事区 | 右/下方文稿区 | 主要操作 |
| --- | --- | --- | --- |
| WELCOME | 项目、时长、原创与数据说明 | 不显示 Canvas | 开始 |
| PORTRAIT_PRELUDE | 三张肖像、描述词选择、原创视觉声明 | 不显示文稿 | 提交描述词 |
| PORTRAIT_CHOICE | 三张肖像与已提交描述 | 不显示文稿 | 单选 + 理由 |
| ROUND_* | 当前肖像、对应 evidence card、回应、输入、principle、dissent | precise 始终显示；plain 显示“尚未生成”；pending Diff 仅正式存在时显示 | 主回答、一次澄清或不澄清 |
| ROUND_*_DIFF | 当前轮上下文和修改理由 | 结构化 Diff、base revision、接受/拒绝；不得显示为已提交 | 接受或拒绝 |
| PLAIN_REWRITE / SEMANTIC_REVIEW | 可见但只读，显示正在处理 | precise 保持；plain 不提前伪造；aria-live 报告 | 无业务按钮，仅正式恢复/重试入口 |
| SEMANTIC_PLACEMENT | 语义解释和当前 fragment | 双 revision、drift status、具体 proposal 前后预览、花束/批注 | 三种 placement；恢复路径需二次确认 |
| PORTRAIT_REASSEMBLY | 三张肖像、初始选择、三轮观点 | 当前双文本只读摘要 | 最终选择、理由或跳过 |
| FINAL_SIGNATURE | 最终双文本只读、签名状态说明 | 不提供任何文本编辑控件 | 请求、允许的 retry、继续、返回修改 |
| MANUSCRIPT_REVISION | 失效影响说明 | precise canonical 基线 + working draft；plain 只读 | 提交或取消 |
| FINAL_DISPOSITION | 签名状态简要回顾 | 三个无人格/道德标签的归宿 | 选择归宿 |
| FINALIZING | 全屏只读处理中与恢复说明 | 禁止所有业务编辑 | 只允许正式失败后的重试/返回 |
| COMPLETE | FinalEnvelope 叙事投影 | 技术信息折叠；全部只读 | 开始新体验 |

通用条件：

- `pendingDiff=null` 时没有接受/拒绝控件；
- `plainText=null` 时只能显示“尚未生成”；
- SemanticDrift 的 `stale`、`placement_in_progress`、`current` 原样区分；
- `checking_consistency` 时禁用所有 placement；
- signed、declined、unavailable、not_requested 使用不同标题、解释和图标/文本；
- 页面显示不能由 URL、local component stage 或任意 deep link 决定。

---

## 6. 响应式方案

- 使用 DOM 原生阅读顺序：阶段上下文 → 证据/回应 → 用户操作 → 手稿/审校结果。宽屏只通过 CSS Grid 排成双栏，不改变 DOM 顺序。
- 宽屏 Canvas：`minmax(18rem, 0.9fr) minmax(0, 1.1fr)`；长文本列必须允许收缩。
- 窄屏：单栏，不用会隐藏未选中内容的业务 tab；若后续使用 tab，只能用于纯呈现且具有完整 ARIA keyboard pattern。
- 当前主操作在窄屏可使用非遮挡的底部 action bar；必须为浏览器缩放和系统安全区留空间。
- `overflow-wrap: anywhere`、Unicode NFC 内容不截断；长 URL-like 文本不能撑破列。
- Diff 不用并排文本作为唯一视图；窄屏按阅读顺序展示操作类型、旧文本、新文本、理由和状态。
- 触控目标建议至少 44×44 CSS px；按钮换行，不水平裁剪。
- 肖像卡使用固定比例容器和 `object-fit`；加载失败保留同等语义位置的占位块。
- 支持 200% 浏览器缩放与 320 CSS px 宽度；关键按钮和正文保持可达。

---

## 7. 键盘、焦点和屏幕阅读器方案

- 每次正式 stage 变化后，把焦点移到新 stage 的 `h1`（`tabIndex=-1`）；同 stage 内提交失败则移到错误摘要或首个无效字段。
- 页面提供“跳到主内容”；全局 header 不抢焦点。
- 肖像与归宿使用 `fieldset`/`legend` 和原生 radio；描述词多选在 G2 修补后使用原生 checkbox group。
- 所有文本输入有显式 label、帮助文本和错误关联；不以 placeholder 代替 label。
- Diff 使用 `<ins>`、`<del>` 和带可读名称的 annotation region；同时显示“增加/删除/批注/已接受/已拒绝”文本。
- 异步 operation 容器使用 `aria-busy=true`；开始、成功、失败和恢复结果通过 polite live region 宣告。阻塞错误使用 `role=alert`。
- proposal 确认必须让键盘用户先读到 replacementText、目标位置和 before/after preview，再到确认按钮。
- 签名状态标题直接读出“已签名 / 明确拒绝 / 技术上未完成 / 未请求”；不只靠颜色或图标。
- 图片使用 ContentAccess 提供的 altText；失败占位保留同一 alt 语义并附“图片暂不可用”。装饰元素空 alt。
- 技术信息 disclosure 使用原生 `<details>/<summary>`；不引入需要自写焦点陷阱的 modal。
- 尊重 `prefers-reduced-motion`；阶段转换不依赖动画传达状态。

---

## 8. 错误、恢复和降级 UI

| 场景 | UI 行为 | 正式来源/允许操作 |
| --- | --- | --- |
| Content load/gate 失败 | 进入体验前阻塞；显示可解释原因和重试 | ContentLoader/content gate error；不创建 Session。 |
| IndexedDB 初始化失败 | 阻塞开始或恢复；不降级到内存后假装可恢复 | store create error；重试或说明浏览器限制。 |
| 持久化提交失败 | 保留当前已提交 view；表单 draft 可保留；显示重试 | engine/store error；不得先推进页面。 |
| 并发 conflict | 停止当前提交，加载最新 snapshot 或要求用户刷新 | `Stage4PersistenceConflictError`；禁止静默覆盖。 |
| 恢复完整性/Schema/Contract 失败 | 显示拒绝代码和简化说明；允许开始新 Session | `recoverStage4Session` rejected；不猜测迁移。 |
| 过期 Session | 说明 24 小时规则；允许新 Session | `session_expired`；是否删除由正式 cleanup 决定。 |
| 恢复旧 ActiveOperation | 显示已中断；Mock plain/semantic 仅按 recovery action 自动恢复 | `action` 和 `invalidatedOperationId`；不从 loading UI 推断。 |
| 迟到/重复 result | 业务 view 不变；必要时 polite 提示“已忽略旧结果” | engine `ignored_stale_result`/duplicate。 |
| Agent/Mock operation 失败 | 留在正式 failureTarget；显示 retryable 与安全继续路径 | application failed event + runtimeFailures sidecar。 |
| restoration unavailable | 展示原因；允许选页边批注/花束 | sidecars.restorationOutcomes；不得伪造 proposal。 |
| restoration proposal stale | 显示 staleReason；禁用确认；可拒绝旧 proposal 并回到正式选择 | proposal status + REJECT event；不得猜插入位置。 |
| SemanticDrift stale | 显示绑定的旧 revision；finalization blockers 可见 | state drift + unified FinalizationResult。 |
| consistency check 失败 | 回到可重试 placement 状态；保留已确认决策 | POST_PLACEMENT_CHECK_FAILED。 |
| signature unavailable | 明确为技术失败；按 attempt state 决定 retry/继续 | review snapshot/attempt state；绝不显示 declined。 |
| finalization blocked | 留在 FINAL_DISPOSITION，逐条展示 blockers | unified FinalizationResult；不进入 FINALIZING。 |
| envelope build/persist 失败 | 不显示 COMPLETE/部分封套；回到正式恢复入口 | FINAL_ENVELOPE_PERSIST_FAILED。 |
| 图片加载失败 | 原位 alt + placeholder，主流程继续 | UI-local state；不发 FSM event。 |
| 不可信 Agent 文本 | 纯文本渲染；链接/脚本/tool-like 片段不执行 | React text node；不使用不安全 HTML 注入。 |

本地 UI error state 只能描述呈现和最近一次 command 的技术结果，不能成为新的 Domain Stage 或 persisted business enum。

---

## 9. UI 测试方案

### 9.1 测试分层

1. **现有 Vitest 纯逻辑/架构测试**
   - view projection 对每个 ExperienceStage 的映射；
   - plain 未生成、pending Diff、drift status、签名状态、FinalizationResult 投影；
   - source-boundary test：UI 目录不得导入 reducer、Domain mutation functions 或直接调用 store.commit；
   - COMPLETE projection 只能接收 FinalEnvelope；
   - command intent/transition key 在双击时稳定。
2. **真实浏览器关键路径测试**
   - 推荐只新增 `@playwright/test` 一个测试依赖；不引入 UI 组件库、状态库或第二套路由库；
   - 使用 placeholder Mock 完成 WELCOME → COMPLETE；
   - 首个纵向切片必须覆盖 ROUND_1_DIFF accepted 或 rejected、IndexedDB commit、刷新恢复和重复点击幂等；
   - 使用浏览器原生 IndexedDB、keyboard、focus、viewport 和 image failure。
3. **人工可访问性复核**
   - 键盘完整主路径；
   - 至少一种桌面屏幕阅读器的标题、表单、Diff、status live region 抽查；
   - 320px、窄屏、200% zoom、reduced motion。

`@playwright/test`、Chromium 运行时和测试脚本已在项目负责人确认后加入。

### 9.2 必测矩阵

- WELCOME 到 ROUND_1_DIFF 的 accepted 和 rejected 各一条；
- 双击 accept/reject 只产生一次 revision/state change；
- 刷新后恢复 stage、preciseRevisionId、pendingDiff 处理结果和私密输入边界；
- 完整 Mock 主路径键盘可完成；
- optional clarification 与 continue-without-clarification；
- plain 尚未生成不出现伪造文本；
- 三种 semantic placement；恢复到 plain 必须明确确认 proposal；stale 不能应用；consistency 时禁止继续；
- MANUSCRIPT_REVISION cancel、NFC no-change、actual change 三条路径；
- signed、declined、unavailable、not_requested 的独立展示；任何 UI 都不能发 signed/declined event；
- FinalizationResult blocked、FINALIZING 持久化失败、成功 COMPLETE；
- COMPLETE 刷新只读，新体验创建新 sessionId；
- Agent 文本中的 HTML、Markdown link、script、tool-call-like fixture 纯文本显示；
- 图片 404 fallback；
- 并发 conflict 与迟到 result；
- 320px、移动端单栏、超长文本、Unicode 组合字符和长 URL-like 文本；
- stage 变化焦点进入 h1，错误焦点进入摘要，Diff 有可读增加/删除/批注语义。

### 9.3 Stage 5 首个验收闸门

在扩展完整 UI 前，必须同时通过：

1. WELCOME → PORTRAIT_PRELUDE → PORTRAIT_CHOICE → ROUND_1_PAST_SELF → ROUND_1_DIFF；
2. 至少 accepted 或 rejected 一条正式业务提交；
3. IndexedDB 原子提交；
4. 刷新恢复；
5. 双击幂等；
6. 页面只从提交后的 snapshot 更新；
7. typecheck、相关 Vitest、该浏览器测试实际通过。

---

## 10. 决策记录

项目负责人于 2026-08-09 在核心 UI 编码前明确批准：

1. 按 G1 明确冻结阶段 1—4 Contract 文档状态；
2. 修补 G2 的多描述词 Content/Domain/FSM Contract；
3. 修补 G3 的核心原创草案与归属 bootstrap/content access；
4. 修补并升版 G4 的 FinalEnvelope，并处理 Session/recovery 影响；
5. 补齐 G5 的 executable Contract version constants 与 production vector builder；
6. 采用 I1 application facade、本文组件树和单一路由方案；
7. 新增 `@playwright/test` 及浏览器测试脚本。

因此 Stage 5 STOP 已解除；实现仍保持 Mock-only，且不自动进入 Stage 6。

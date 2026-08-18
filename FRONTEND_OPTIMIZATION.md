# 《最后一页进步报告》前端优化说明

> 给负责视觉、交互和响应式优化的前端同学
>
> 本文描述当前产品语义和实现边界。优化可以重做界面表达，但不能改变体验顺序、状态含义或内容归属。

## 1. 项目是什么

《最后一页进步报告》是一项围绕丹尼尔·凯斯《献给阿尔吉侬的花束》核心矛盾设计的 AI 协作式互动阅读体验。它不是聊天机器人、心理测试、智力下降模拟器、伦理答题游戏，也不是原著遗失章节模拟。

读者会在一次约 8–10 分钟的体验中，重新面对三个阶段的查理，并审校一句原创互动手稿：

> 当未来的我无法理解现在写下的话时，请以现在的意愿为准。

页面要帮助用户看见“不同阶段的自我是否拥有彼此的代表权”，而不是给出一个正确答案。系统记录选择、理由、修改和未解决的分歧，但不评价用户的人格、共情能力或道德立场。

## 2. 用户流程（不可改语义）

欢迎入口不是核心阶段，只负责说明作品性质、原创声明、预计时长和研究数据选择。

| 顺序 | 状态 | 用户任务 | 前端需要表达的重点 |
| --- | --- | --- | --- |
| 0 | `WELCOME` | 了解体验并选择是否同意匿名研究记录 | 拒绝 analytics 也必须可以完整体验 |
| 1 | `PORTRAIT_PRELUDE` | 为三幅肖像选择描述词 | 可多选；系统只记录、不评价 |
| 2 | `INITIAL_CHOICE` | 选择“最像真正查理”的阶段并写理由 | 只能选 `early`、`peak`、`futureFacing` |
| 3 | `ROUND_1` | 讨论过去自我的解释权 | 证据卡 + 查理回应 + 用户回答 + 局部修改提案 |
| 4 | `ROUND_2` | 讨论预测未来是否等于替未来决定 | 与上一轮相同的交互结构 |
| 5 | `ROUND_3` | 讨论当前判断能否限制未来关系 | 三轮固定，不得增加第四轮 |
| 6 | `PLAIN_REWRITE` | 生成并查看精确版/朴素版 | 三轮完成前朴素版必须显示“尚未生成” |
| 7 | `SEMANTIC_REVIEW` | 查看语义偏移和语义碎片 | 明确哪些限定被削弱、丢失或产生歧义 |
| 8 | `SEMANTIC_PLACEMENT` | 处理每个语义碎片 | 放回朴素正文、页边批注、语义花束三选一；正文恢复需要二次确认 |
| 9 | `PORTRAIT_REASSEMBLY` | 重新选择阶段 | 可保留初选、改选、选择三个都是或拒绝唯一答案 |
| 10 | `FINAL_SIGNATURE` | 请求当前查理审阅是否签名 | `signed`、`declined`、`unavailable`、`not_requested` 必须区分；未来查理签名永久空白 |
| 11 | `MANUSCRIPT_REVISION` | 可返回修改精确手稿 | 文本变化会使朴素版、语义审查和签名结果失效并重建 |
| 12 | `DISPOSITION` | 选择文稿归宿 | 未来参考、此刻记录、保持未完成 |
| 13 | `FINALIZING` / `COMPLETE` | 生成并查看只读封套 | 封套不可编辑；重新体验创建新 Session |

实际阶段标题、当前进度和可用按钮由 `Stage5PresentationView` 驱动，不要在组件中自行推断业务状态。

## 3. 当前技术结构

这是一个 Next.js App Router + React 19 + TypeScript 项目，主要运行时为 Node.js 24、pnpm 11。

```text
src/app/page.tsx
  └─ src/stage5/experience-client.tsx   页面投影与交互控件
       └─ Stage5ExperienceFacade         命令入口、初始化、持久化、运行模式
            └─ FSM / Domain / Application / Agent / Content
```

重要目录：

- `src/app/`：Next.js 页面、API Route、全局样式；入口是 `src/app/page.tsx`。
- `src/stage5/experience-client.tsx`：当前主要页面组件，包含欢迎、肖像、三轮审校、双栏文稿、语义碎片、签名、归宿和完成封套的投影。
- `src/stage5/contracts.ts`：前端可消费的 `Stage5PresentationView`、`Stage5Snapshot` 和 `Stage5Commands` 类型。优化 UI 时优先依赖这些类型。
- `src/stage5/facade.ts`：`Stage5ExperienceFacade`，负责将按钮操作转为应用命令，不应被视觉层直接绕过。
- `src/stage5/projection.ts`：把 Session/FSM 状态投影成前端视图。
- `src/fsm/`：状态机、Reducer、阶段守卫和完成封套生成。
- `src/domain/`：领域实体与 Schema；定义 revision、Diff、语义碎片、签名状态等不变量。
- `src/application/`：轮次分析、朴素版/语义审查、肖像摘要、Final Review 编排。
- `src/agent/`、`src/stage6/`：Mock/DeepSeek 候选和服务端运行链路。模型结果先过本地校验，前端不展示未经验证的原始响应。
- `src/content/`、`content/verified/`：正式内容、证据卡、肖像配置、来源和 checksum。
- `src/stage9/`：匿名研究记录；数据默认不采集，用户拒绝后仍可继续。
- `tests/`：按阶段、契约、FSM、集成和 E2E 分组的回归测试。

持久化使用浏览器 IndexedDB。刷新页面应恢复当前 Session；完成状态是只读快照。不要把 React local state 当成业务真相，也不要直接改 Session 对象。

## 4. 当前页面与视觉基线

目前 UI 集中在 `src/stage5/experience-client.tsx` 和 `src/app/globals.css`：

- 纸张、档案、手稿的视觉隐喻；主色为暖纸色、深墨色、砖红强调色和蓝色状态色。
- 顶部 sticky header 显示产品名、运行模式徽标和 6 段核心进度。
- 统一使用 `stage-shell`、`portrait-card`、`document-card`、`evidence-card`、`primary-action` / `secondary-action` 等 class。
- 已有跳过主内容链接、`aria-live` 公告、键盘 focus 样式、图片替代文本和图片失败 fallback。
- 760px 以下切换为单栏；320px 仍是发布检查目标，不得出现横向滚动或被裁剪的主要操作。

优化可以改变排版、层级、动效、组件拆分和信息密度，但请保留：

1. 每个阶段只有一个清晰的主任务；
2. 用户知道当前处于哪一阶段、下一步是什么、是否正在保存或等待模型；
3. 提案、已应用修改、被拒绝修改和技术失败在视觉上有不同状态；
4. 精确版和朴素版始终是两个独立文本层；
5. 语义碎片的三种去向和恢复提案的二次确认不会被折叠成一个“智能优化”按钮；
6. 完成封套明显是只读档案，不伪装成仍可编辑的普通页面。

## 5. 面向前端优化的建议切入点

### 5.1 先做体验层级，再做装饰

- 重新设计阶段导航、进度反馈和当前任务标题，让用户不看长说明也能知道“我现在要做什么”。
- 在双栏审校台中固定左侧上下文、右侧文稿；移动端改为“上下文 → 文稿 → 操作”的顺序，并保留当前版本标签。
- 把高频主操作、次要操作、跳过/返回和危险操作建立稳定的按钮层级。
- 将长文本拆成可扫描的证据卡、回应卡、用户输入区和版本卡，不改变原文内容。

### 5.2 建立可复用的组件边界

建议逐步从大文件中提取纯展示组件，例如：

`ExperienceHeader`、`ResearchConsent`、`PortraitCard`、`RoundReviewPanel`、`EvidenceCard`、`ManuscriptDocument`、`DiffReview`、`SemanticFragmentCard`、`SignatureReviewCard`、`DispositionPicker`、`FinalEnvelope`。

组件通过 props 接收 `Stage5PresentationView` 的切片和回调；不要在展示组件里创建业务 ID、修改 revision、调用 API 或直接操作 IndexedDB。

### 5.3 响应式与可访问性

- 目标宽度至少覆盖 320px、768px、1024px、1440px。
- 触控目标保持至少 44px；chip、radio、按钮和折叠面板都要可键盘操作。
- 阶段切换后将焦点移动到新的 `h1`，并通过 `aria-live` 告知保存、降级和错误状态。
- 肖像必须保留有意义的 alt；图片失败时仍显示阶段标题、描述和选择控件。
- 不用颜色单独传达 `signed`、`declined`、`unavailable`；应同时使用文字和结构提示。
- 遵守 `prefers-reduced-motion`；动效用于方向和状态反馈，不用于制造等待或阻塞。

### 5.4 运行状态的透明表达

页面可能处于 Mock、Live、deterministic、static template 或 unavailable。当前请求模式和实际执行结果由 `executionStatus` 提供。优化状态条时不得把 Mock 写成“AI 已完成”，也不得把技术失败写成查理拒绝。

## 6. 明确不要做的事情

- 不增加评分、积分、好感度、通关/失败、人格标签或心理诊断。
- 不增加第四轮，不把体验改成多分支剧情或自由聊天大厅。
- 不让 Agent 生成结果直接改正文；所有 Diff 必须经过用户确认。
- 不把“拒绝唯一答案”重新解释为某个阶段集合。
- 不把未核验原著内容、模型记忆或生成台词伪装成原文。
- 不把动态图片生成作为核心流程依赖；当前发布版本固定使用 `public/portraits/charlie-original-v2/` 的三张肖像。
- 不在客户端暴露 DeepSeek API Key，不使用 `NEXT_PUBLIC_` 变量承载密钥。
- 不为了视觉效果删除原创声明、数据说明、来源/provenance 或降级提示。

## 7. 本地启动与验证

```bash
pnpm install
pnpm dev
```

复制 `.env.example` 为 `.env.local`。只在需要时配置服务端变量；默认建议先使用 Mock 模式完成 UI 开发。

提交前至少运行：

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm test:e2e
```

如果修改了生产内容、资产或运行模式，还要执行 `pnpm test:stage8:production-scan`，并按 [`docs/release-checklist.md`](./release-checklist.md) 做 320px、键盘、刷新恢复、图片 fallback、完整流程和 `COMPLETE` 只读检查。

## 8. 推荐的优化验收标准

一次完整的前端优化至少应满足：

- 首屏能在 5 秒内让新用户理解作品是什么、不是什么、预计多久完成；
- 用户在任意阶段都能识别当前阶段、主任务、保存/处理中状态和返回路径；
- 320px 宽度无横向溢出，桌面双栏和移动单栏都能完成主流程；
- 全流程可仅用键盘完成，焦点顺序合理，动态状态可被读屏感知；
- 所有业务命令仍通过 `Stage5Commands`，现有 FSM、契约和测试不因 UI 重构而绕过；
- Mock 模式下流程可稳定复现，Live 不可用时界面仍能继续并诚实标注来源；
- `COMPLETE` 封套内容完整、只读，且新体验不会覆盖旧 Session。

## 9. 相关文档

- 产品范围与禁止事项：[`docs/scope-freeze.md`](docs/scope-freeze.md)
- 前端可消费类型：[`src/stage5/contracts.ts`](src/stage5/contracts.ts)
- Agent 边界与降级：[`docs/agent-guide.md`](docs/agent-guide.md)
- 状态机草案：[`docs/state-machine-draft.md`](docs/state-machine-draft.md)
- 用户测试：[`docs/stage9-user-test-guide.md`](docs/stage9-user-test-guide.md)
- 部署与环境：[`docs/deployment.md`](docs/deployment.md)
- 发布检查：[`docs/release-checklist.md`](docs/release-checklist.md)

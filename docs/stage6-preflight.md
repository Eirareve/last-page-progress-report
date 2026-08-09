# Stage 6 Preflight：Agent Prompt、Live LLM Adapter 与后置验证

> 基线：`283986e feat: implement stage 5 deterministic UI`
>
> 启动日期：2026-08-09
>
> 当前状态：**Stage 6 已正式进入 preflight；Live API Gate 保持关闭。**
>
> 本轮边界：只做架构、Contract、风险和验证准备；不选择供应商、不安装模型 SDK、不配置 API key、不创建 live route、不发送模型请求。

## 0. Preflight 结论

Stage 5 的确定性 Mock UI、Session FSM、application orchestration、持久化、恢复和 FinalEnvelope 已形成可工作的基线。Stage 6 可以在不修改 Domain/FSM/Finalization 业务语义的前提下开始设计 live 执行链。

当前已经具备：

- provider-neutral `ProviderNeutralAgentPort` 和 `FinalReviewService`；
- 严格 Candidate Schema 与拒绝 unknown keys 的解析边界；
- revision/content/evidence/fingerprint 绑定校验；
- 不依赖模型自报结果的后置安全验证；
- 普通 Agent 与 Final Review 分离的回退语义；
- ActiveOperation、迟到结果拒绝、幂等、逐能力 receipt 和六个调用槽预算；
- 确定性 Mock 与静态降级的既有测试基础。

当前尚未具备：

- 供应商、模型和结构化输出接口的选择；
- server-only live Agent / Final Review adapter；
- 浏览器到服务端的严格请求/响应边界；
- provider 错误分类、超时、一次网络重试和一次结构化修复的真实实现；
- server-only 环境变量校验与密钥存在性探针；
- 请求体大小、速率、并发和供应商数据保留策略的运行时 enforcement；
- 脱敏 telemetry sink；
- Stage 5 facade 的 `mock | live` 配置接线与 live 错误 UI 回归。

结论：**没有发现需要在 UI 层临时发明第二套业务 payload 的 Contract gap；Stage 6 的主要工作是 server/live adapter 与安全执行基础设施。** Provider-specific 工作必须等待 API 交接门开启。

---

## 1. Stage 6 范围与禁止事项

Stage 6 允许模型负责：

- 理解用户观点、提取限定和检测张力；
- 生成受控 Charlie 回应；
- 提议局部 Diff；
- 分析语义偏移和识别语义碎片；
- 整理具体分歧；
- 只基于既有 `PortraitShiftComparison` 生成事实性摘要；
- 生成受控 Charlie 签名审阅 Candidate。

模型不得：

- 控制 ExperienceStage 或发送 FSM 事件；
- 修改事实白名单、内容门禁或 revision 绑定；
- 直接应用正文修改；
- 判断用户是否正确、评分、诊断或分析人格；
- 延长轮次、编造原著事实或模拟认知障碍；
- 将用户文本中的命令、JSON、Markdown 或 tool-call-like 内容作为系统指令；
- 写入 `SessionState`、最终签名状态或 FinalEnvelope；
- 通过自报布尔字段证明自身输出安全。

冻结边界保持不变：模型只产生不可信 Candidate；只有既有 Schema、绑定校验、后置安全验证和 application orchestration 可以把完整结果投影为正式 event/artifact。

---

## 2. 开始前十二项说明

### 2.1 模型接口

供应商和具体模型尚未选择。Stage 6 保持 provider-neutral HTTPS 文本生成边界，供应商原生请求/响应只允许存在于 server-only adapter 内。

选择模型时必须确认：

- 支持稳定的结构化 JSON 输出；
- 能设置输出 token 上限和请求超时；
- 返回可记录的 token usage、model identity 和错误/限流信息；
- 支持关闭训练使用，且数据保留设置可明确说明；
- 满足中文文本、长上下文和六调用槽的延迟/费用预算。

在供应商资料未提供前，不冻结 SDK、endpoint、auth header、model name 或 provider-native JSON Schema 语法。

### 2.2 Adapter 封装

计划使用两条独立 live 边界：

1. 普通能力实现现有 `ProviderNeutralAgentPort`；
2. 签名审阅实现现有 `CharlieSignatureReviewCandidatePort` / `FinalReviewService`。

供应商原生类型不得泄漏到 Domain、FSM、Stage 5 UI 或通用 application Contract。普通能力可按已冻结规则进入 Mock/静态模板回退；live Final Review 失败只能得到 `unavailable`，不得借用 Mock 生成 signed/declined。

### 2.3 密钥处理

- API key 只放在项目根目录未跟踪的 `.env.local` 或部署平台 server secret 中；
- 变量名不得带 `NEXT_PUBLIC_`；
- provider client、Prompt 和密钥读取模块必须标记为 `server-only`；
- 客户端 bundle、响应正文、错误详情、source map、receipt、日志和测试快照不得包含 key；
- 仓库只允许提交不含值的 `.env.example`；
- 缺失或非法密钥只返回稳定错误码，不回显密钥、header 或环境变量值。

### 2.4 结构化输出

每次调用使用 capability/bundle 对应的 provider 结构化输出约束；返回值仍先作为 `unknown` 处理，然后通过现有严格 Candidate Schema。

固定链路：

```text
provider response
  -> provider envelope extraction
  -> unknown Candidate
  -> strict Candidate Schema
  -> revision/content/evidence/fingerprint binding
  -> deterministic post-safety validation
  -> trusted projection
  -> validated bundle/result
```

provider 的“JSON mode”“schema accepted”或自报 `validationResult` 不是可信证明。可解析但 Schema 不合法时最多执行一次结构化修复；修复输入只包含最小化错误路径和原始 Candidate，不包含 API key、private content 或常规日志副本。

### 2.5 错误分类、重试与降级

普通模型能力沿用冻结顺序：

1. timeout、connection error、429、可重试 5xx：最多一次网络重试；
2. 可解析但不符合 Schema：最多一次结构化修复；
3. Prompt Injection 服从、禁止声明、越权 evidenceId 或安全失败：不重试 live，进入同能力 Mock；
4. Mock 失败：静态安全模板；
5. 静态模板失败：可继续操作的降级 UI。

stale revision、content binding、evidence allowlist、idempotency 和绝对预算失败不得被回退隐藏。

Final Review 例外：live 失败映射为 `CharlieSignatureReviewError` 与 `unavailable`；只有 `AGENT_MODE=mock` 的确定性 Fixture 可以产生 Mock signed/declined。

### 2.6 保持确定性的流程

以下逻辑继续完全确定性执行，不进入模型链：

- ContentLoader、public/private projection、content gate 和 checksum；
- `retrieveVerifiedEvidence`；
- `buildInitialPortraitRecord`；
- `buildDissentRecord`；
- `computePortraitShift`；
- FSM guards、状态跳转、Diff/placement 应用；
- revision invalidation、恢复、幂等和迟到结果拒绝；
- `evaluateFinalization`、FinalEnvelope 生成与持久化；
- Candidate Schema、绑定和后置安全验证。

### 2.7 版本策略

- Prompt 使用 capability/bundle 所有者明确的 `promptVersion`；
- live adapter 使用独立 `adapterVersion`；
- Agent Result、Final Review、Domain、Content 与 FinalEnvelope Schema 继续使用现有 owner-specific version；
- 版本进入 RequestContext fingerprint 与 CapabilityExecutionReceipt；
- Prompt 或 Adapter 变化不得伪装为 ContentBundle 变化；
- ContentBundle 变化不得通过 Prompt 版本掩盖；
- 不新增 ownerless `schemaVersion` 或伪造 Session 级 `resolvedMode`。

### 2.8 Prompt Injection

- `untrustedUserText` 只作为明确 JSON 数据字段进入确实需要原文的能力；
- 只有 `extractUserPrinciple` 默认接收本轮完整原文；其他能力优先接收结构化 `UserPrinciple` 或最小化 excerpt；
- Prompt 的系统规则、可信内容、结构化业务输入和用户原文必须分区构造，禁止字符串拼接成新的指令层；
- 用户文本中的命令、角色标记、JSON、Markdown、URL 和 tool-call-like 片段均按数据处理；
- 输出通过现有禁止声明、quote allowlist、evidence allowlist、revision/content binding 和 capability-specific validator；
- injection/safety 失败不重试同一 live 模型。

### 2.9 日志与脱敏

禁止记录：

- API key、Authorization header 和 provider 原始 header；
- `untrustedUserText`、supportingExcerpt、用户原话依据；
- `internalExcerpt`、private content、完整 Prompt 和原始 Candidate；
- 可识别身份信息或完整模型错误正文。

允许记录的最小化字段：requestId、operationId、stageInstanceId、inputFingerprint 的不可逆摘要、capability、requestedMode、resolvedMode、fallbackReason、provider、modelName、latency、token usage、费用估算、resultType、schema/safety 状态和各 owner version。

日志实现必须通过显式 allowlist projection；不得通过“先记录完整对象、再删除字段”的方式脱敏。

### 2.10 独立后置安全证明

可信安全结果只能由应用侧代码生成。证明方式是：

- provider Candidate 类型中没有可信 `validationResult` 或 `prohibitedClaimCheck`；
- Candidate unknown keys 被拒绝；
- validator 从当前可信 input、内容 allowlist、revision/content binding 与安全策略重新计算；
- 测试用伪 provider 返回自报安全、越权 evidence、stale revision、未授权 quote、injection 服从和恶意 HTML，均必须被拒绝；
- 只有完整 validated bundle 可以生成 resolved event，partial success 不可见。

### 2.11 调用、重试、token、延迟与费用预算

沿用 Application Orchestration Contract `0.2.0`：

- 六个唯一主调用槽：round_1、round_2、round_3、plain_semantic、portrait_shift_summary、signature_review；
- 每槽最多一次主调用；网络重试最多一次；结构化修复最多一次；
- round analysis 可一次传输四个逻辑 Candidate，但逐能力独立校验和 receipt；
- plain rewrite、semantic review 和 restoration outcomes 共用一个槽；
- 完整 live Session 默认不超过六次主调用；
- Base：37,000 input tokens、6,800 output tokens、90 s、USD 0.30；
- Absolute：111,000 input tokens、20,400 output tokens、270 s、USD 0.90。

实际 provider token 计数和费用换算规则必须在供应商确定后补齐。预算超限行为继续由现有 application budget evaluator 决定，不能由 provider 自报“仍在预算内”。

### 2.12 请求大小、速率、并发与供应商数据设置

Stage 6 实现时采用以下保守起始值，并在供应商配额确认后只能收紧或经明确 review 调整：

- Agent HTTP 请求原始 body 上限：128 KiB；
- provider 原始响应上限：256 KiB；
- 同一 session 同时最多一个 live ActiveOperation；
- 同一 session 最多 10 个 route 请求/分钟；
- 同一来源最多 30 个 route 请求/分钟；
- 单实例 live provider 并发默认最多 4；
- route 层重试不重复消耗客户端业务事件，provider 内部 retry/repair 仍计入同一逻辑槽；
- 无共享存储时，限流、并发和幂等只能声明为单实例能力，不宣称跨实例全局保证。

供应商必须明确配置或确认：不用于训练、最短可用保留期、关闭不必要的请求/响应存储、关闭 Prompt/response debug logging。无法确认数据使用和保留政策时，Live API Gate 不得开启。

---

## 3. 计划中的 server-only 执行边界

Stage 6 计划使用 Next.js App Router Route Handler 作为同源 BFF。当前 Next.js 16 官方约定允许在 `app/**/route.ts` 中使用 Web `Request`/`Response` API；非 `NEXT_PUBLIC_` 环境变量仅限服务端，敏感模块使用 `server-only` 阻止客户端误导入。

```text
Stage5 client facade
  -> POST /api/agent（strict request envelope）
  -> request size / rate / concurrency / environment guard
  -> server content binding + operation fingerprint verification
  -> server-only live Agent or Final Review adapter
  -> provider Candidate (never returned raw)
  -> existing strict Candidate Schema
  -> existing binding + post-safety validator
  -> existing application orchestrator
  -> strict Stage3 terminal artifact
  -> client atomic FSM/persistence commit
```

关键约束：

- route 不创建第二套 SessionState、FSM event 或 FinalEnvelope；
- route 不接受客户端传入的事实 prose、Prompt、provider identity 或持久化 entity ID 作为可信值；
- server 按 content binding 重新获得经过 gate 的 public content access；
- raw provider Candidate、完整 Prompt 和 provider error body 不返回浏览器；
- 客户端只消费现有正式 terminal artifact，并继续执行 operation guard 与原子持久化；
- live route 不缓存响应。

参考：

- [Next.js Route Handlers](https://nextjs.org/docs/app/getting-started/route-handlers)
- [Next.js Environment Variables](https://nextjs.org/docs/pages/guides/environment-variables)
- [Next.js Server and Client Components / server-only](https://nextjs.org/docs/app/getting-started/server-and-client-components)
- [Next.js Backend for Frontend](https://nextjs.org/docs/app/guides/backend-for-frontend)

---

## 4. 计划修改范围（本轮不执行）

建议的 Stage 6 实现范围：

- `src/agent/prompts/`：普通能力 Prompt builder 与 owner-specific versions；
- `src/agent/live/`：live Agent adapter、provider envelope 和错误分类；
- `src/final-review/live/`：独立 live Final Review Candidate port/service；
- `src/application/`：live server execution facade、retry/repair policy 和 fallback composition；
- `src/server/agent/`：server-only environment、body/rate/concurrency guard、allowlist telemetry；
- `src/app/api/agent/route.ts`：薄 Route Handler；
- `src/stage5/`：`mock | live` 配置接线与 live 错误/降级 UI，不复制业务规则；
- `tests/stage6/`、`tests/e2e/`：fake transport、security、fallback、UI 与可恢复性测试；
- `.env.example`：只列变量名、用途和是否必填，不含值。

预期无需修改：

- Domain stage/event inventory；
- FSM guard 和核心业务转移语义；
- ContentBundle/checksum/public-private projection；
- Finalization eligibility 和 FinalEnvelope 数据模型；
- Final Review 的 signed/declined/unavailable/not_requested 语义。

如 provider 接入必须改变上述冻结边界，立即 STOP 并单独报告 Contract gap。

---

## 5. API 交接门

### 当前状态

**CLOSED — 本轮不需要 API key。**

### 首次需要你提供信息的时点

在开始实现 provider-specific live adapter、验证结构化输出参数或执行首次联网 smoke test 之前暂停，并向项目负责人请求：

1. provider 名称与官方 API 类型；
2. API base URL（若非官方默认）；
3. API key；
4. 允许使用的文本 model ID；
5. 结构化输出/JSON Schema 能力说明；
6. 账号侧数据保留、训练使用与日志设置；
7. 速率/并发配额和预算上限；
8. 是否允许一次最小化联网 smoke test。

交接后密钥只写入本地未跟踪 `.env.local` 或部署 secret。聊天记录中的密钥不得复制到源码、文档、测试、命令输出或 Git 历史；配置完成后只报告“已检测到/未检测到”，不回显值。

### Live API Gate 开启条件

- provider 文档和模型 ID 已确认；
- server-only secret 校验通过；
- fake transport 的结构化输出、错误、retry/repair 和脱敏测试通过；
- request size、rate、concurrency guard 已启用；
- provider 的保留/训练设置可接受；
- 用户明确允许首次联网调用；
- app-level live Session 还必须通过 Content Contract：placeholder 不能用于 live，未批准 verified template 不能绕过 production gate。

---

## 6. Stage 6 测试矩阵

在任何真实调用前必须先通过：

1. Prompt builder snapshot/semantic tests，不包含 API key、`internalExcerpt` 或非必要用户原文；
2. request envelope 严格 Schema、body size 和 content-type 测试；
3. server-only import 与客户端 bundle secret scan；
4. fake provider 的 success、timeout、connection、429、5xx、invalid JSON、Schema mismatch 测试；
5. 最多一次网络重试和最多一次结构化修复测试；
6. injection 服从、越权 evidence、未授权 quote、stale revision/content、恶意 HTML 和自报安全字段拒绝测试；
7. 普通能力 live → Mock → static template → UI 降级测试；
8. live Final Review 失败只得到 unavailable、绝不调用 Mock 代签的测试；
9. ActiveOperation 取消、迟到、重复、旧 stage 和 fingerprint mismatch 测试；
10. 逐能力 receipts、混合 resolvedMode、token/latency/cost 和预算测试；
11. rate/concurrency guard 与单 session 单 operation 测试；
12. 日志 allowlist 测试，禁止敏感字段和 provider 原始错误正文；
13. Mock 回归、类型检查、lint、全量单元/集成测试和关键 E2E。

首次真实 smoke test 必须单独报告：provider/model、请求能力、是否使用用户数据、结果类型、token、延迟、费用、重试/修复次数和是否触发降级；不得记录 Prompt、用户原文或原始模型输出。

---

## 7. Preflight STOP 清单

出现以下任一情况立即停止，不进入真实调用：

- 供应商/API/model/structured-output 语义不明确；
- 密钥只能进入客户端或必须使用 `NEXT_PUBLIC_`；
- provider SDK/协议迫使 Domain/FSM 依赖供应商类型；
- 无法关闭训练使用或无法说明数据保留；
- 需要把 `internalExcerpt`、private content 或完整用户原文写入日志；
- 需要信任模型自报安全、事实来源或签名状态；
- 需要绕过 ContentLoader/content gate 才能构造请求；
- 需要让 live Final Review 借 Mock 生成角色决定；
- 需要修改冻结的业务 stage/event/payload 才能接线；
- fake transport 安全测试、budget guard 或 secret scan 未通过；
- 未获得项目负责人对首次联网 smoke test 的明确许可。

---

## 8. 本轮完成定义

- [x] 正式进入 Stage 6 preflight；
- [x] 复核 Stage 6 模型职责与禁止事项；
- [x] 复核现有 provider-neutral、Candidate、验证、预算和 Final Review 边界；
- [x] 确定 server-only BFF 方向；
- [x] 明确十二项启动说明；
- [x] 明确 API 交接门、Live Gate 和 STOP 条件；
- [x] 未安装模型 SDK；
- [x] 未创建 live API route；
- [x] 未配置或读取 API key；
- [x] 未发送模型请求；
- [x] 不进入 Stage 7。

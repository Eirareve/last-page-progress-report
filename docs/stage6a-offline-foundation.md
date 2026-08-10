# Stage 6A 离线基础实现报告

> 基线：`23e4759 docs: establish stage 6 preflight`
>
> 日期：2026-08-09
>
> 状态：**离线基础完成；Live API Gate 关闭；未调用模型。**

## 1. 本批目标

在不选择模型供应商、不安装模型 SDK、不配置密钥、不发送网络模型请求的前提下，建立 Stage 6 的 provider-neutral Prompt、浏览器/服务端传输 Contract、server-only 路由、安全 guards、fake provider retry/repair 执行器和脱敏观测基础。

本批不修改 Domain、FSM、ContentBundle、Finalization 或 FinalEnvelope 业务语义，不把 provider 原生类型引入冻结层。

## 2. 已完成

### Prompt 与版本

- 新增 Stage 6 transport、Prompt、server guard 和 telemetry owner-specific versions；
- 为 round analysis、plain/semantic、portrait summary 和 Final Review 建立 provider-neutral Prompt builder；
- `untrustedUserText`、manuscript text 和 dissent text 只进入显式 `untrustedData`；
- system instruction 不拼接用户原文，并明确禁止状态控制、事实扩展、评分诊断和模型自证安全。

### HTTP Contract 与 server-only route

- 新增严格 `stage6LiveRequestSchema` 和 `stage6LiveResponseSchema`；
- client request 不允许提交可信 evidence prose、provider identity、Prompt version 或 Adapter version；
- request execution kind 必须与正式 outer operation capability 对应；
- request input 必须与 revision/content operation binding 一致；
- 新增动态 Node.js `POST /api/agent` Route Handler；
- server config 使用 `server-only`，Stage 6A 中 Live Gate 固定关闭；
- gate 关闭时 route 在读取请求体前返回稳定 503，并使用 `Cache-Control: no-store`。

### 安全 guards

- JSON content-type 检查；
- UTF-8 streaming body 上限，默认 128 KiB；
- provider response 预留上限常量 256 KiB；
- 同 session 10 请求/分钟、同来源 30 请求/分钟；
- 单实例全局并发 4、同 session 并发 1；
- rate-limit key map 有 10,000 key 默认硬上限；
- 代理来源只接受规范 IPv4/IPv6 形式；其他输入折叠为 `unidentified-source`；
- HTTP 错误只返回稳定 code/message，不回显 request body、异常、provider body 或密钥。

### Fake provider 与 retry/repair

- 新增 provider-neutral transport interface 和可排队的 fake transport；
- timeout、rate limit、network error 最多一次网络重试；
- Candidate strict Schema 失败最多一次结构化修复；
- retry/repair 次数、token、latency 和费用观测按真实尝试累计；
- 超时使用真实 deadline 与 AbortSignal；
- 原始 provider exception 和非法 Candidate 不进入返回错误摘要。

### 脱敏 telemetry

- telemetry 使用显式字段 allowlist 构造；
- 不接受“先记录完整对象再删除字段”的做法；
- 测试证明额外传入的 `untrustedUserText`、`internalExcerpt` 和 API key 不进入投影。

## 3. 实际验证

- `pnpm typecheck`：通过；
- `pnpm lint`：通过，无 warning；
- Stage 6A + Stage 3 architecture 定向测试：6 个文件、31 项通过；
- 全量 Vitest：37 个文件、335 项通过；
- placeholder + Mock Next.js build：通过，`/api/agent` 识别为动态服务端 route；
- Stage 5 Playwright 回归：7 项通过；
- Stage 6A route Playwright：1 项通过，证明 closed gate 不读取/反射提交的敏感字符串。

## 4. Contract 与兼容性

- 变更分类：`no-domain/fsm/content/finalization-contract-change`；
- 新增的 Stage 6 transport/Prompt/guard/telemetry version 均有明确 owner；
- Stage 3 架构测试只移除“全仓库不得存在 Agent route”的历史实现期限制，继续禁止 Stage 3 层安装模型 SDK或记录敏感输入；
- Stage 5 仍固定使用 Mock；没有新增 live UI 开关，没有改变已持久化 Session 语义。

## 5. 已知限制与下一门禁

- 没有 provider、model ID、base URL、auth 或结构化输出语法；
- route 的 production config 只能保持 closed；测试可注入 open config 以验证 guards；
- 没有真实 provider response reader，因此 256 KiB response limit 要在 provider adapter 中实现；
- rate limit、并发和幂等仍是单实例能力，不提供跨实例保证；
- `x-forwarded-for` 只有在部署平台覆盖该 header、且 trusted proxy 配置明确时才能作为可靠来源；
- Stage 5 facade 尚未接 live route；
- placeholder 和未批准 verified template 都不能用于 app-level live Session；
- 未创建 `.env.local`，未读取 API key，未发送模型请求。

下一步是 Stage 6B provider handoff。开始前必须向项目负责人请求 provider、model ID、base URL、API key、数据保留/训练设置、配额与一次最小 smoke test 许可；收到信息前停止在当前门禁。

# Stage 6C：Live 应用接线、降级与提交边界

日期：2026-08-09

> 当前状态：Stage 6C 实现已进入全量验收；应用 Live API Gate 继续默认关闭。本阶段的实现与验收不调用 DeepSeek 或其他文本模型。

## 1. 本阶段完成内容

- 浏览器只向同源 `POST /api/agent` 提交严格、最小化的 Stage 6 请求；请求不携带 `internalExcerpt`、密钥、Prompt 或客户端拼装的 verified-fact prose。
- server-only executor 按已通过的 Content Gate 重新取得 verified public content，复算可信语义指纹，再调用普通 Agent 或独立 Final Review service。
- provider 原始 Candidate、完整 Prompt 与原始错误体不会返回浏览器；浏览器只接收既有 Stage 3 terminal artifact。
- terminal artifact 继续通过 Stage 5 facade、ActiveOperation guard、FSM 与 IndexedDB 原子持久化边界提交，没有新建第二套业务状态或事件。
- DeepSeek provider identity 固定在 server-only adapter；浏览器 Contract 不接受 provider、model、adapter 或 Prompt 身份作为可信输入。

## 2. 普通能力降级链

普通 round analysis、plain/semantic review 与 portrait summary 使用同一语义：

1. Live Agent 执行，并执行既有 retry、repair、Schema 与 safety 后置验证；
2. Live 技术失败或 Candidate 验证失败时，使用确定性 Mock Candidate；
3. Mock 也失败时，使用单独版本化的静态安全模板；
4. 三条路径均不可用时，返回显式 unavailable/failed terminal artifact，不伪装为成功。

Content binding、evidence allowlist、可信 fingerprint、幂等与预算连续性错误不会被本地 Mock 隐藏。浏览器只对路由/网络、限流、并发、无效服务器响应或服务器内部技术失败执行普通能力降级。

## 3. Final Review 边界

- Live Final Review 失败只产生 `unavailable`；不会调用 Mock 或静态模板生成 signed/declined。
- Final Review evidence 只能由 server 侧 gated public content resolver 解析。
- UI 的 Live 模式只有一个真实审阅入口；Mock signed/declined/unavailable fixture 按钮只存在于显式 Mock 模式。

## 4. Gate 与配置

Live Gate 只有在以下条件同时满足时才打开：

- `STAGE6_LIVE_API_ENABLED=true`
- `STAGE6_PROVIDER_POLICY_ACCEPTED=true`
- `CONTENT_MODE=verified`
- `AGENT_MODE=live`
- `NODE_TLS_REJECT_UNAUTHORIZED` 不为 `0`

当前 `.env.local` 保持 `STAGE6_LIVE_API_ENABLED=false`。Stage 7 尚未提供经批准的 verified production content，因此应用默认继续运行 Stage 5 Mock 体验，不会因已配置 API key 而自动调用模型。

DeepSeek 数据保留只按当前 Open Platform privacy policy 描述；没有已确认的 API 级 zero-retention 或 training opt-out 配置，项目不声明零保留。

## 5. 会话账本、幂等与预算

- server 使用有容量上限的单进程内存账本缓存已完成 requestId，重复的同一 requestId + operationId + fingerprint 返回同一 terminal artifact。
- requestId、operationId 或 fingerprint 冲突返回稳定的 `idempotency_conflict`；预算状态不一致返回 `budget_state_mismatch`。
- 执行在首个 terminal artifact 前失败时，新建的空会话记录会释放，避免无效请求永久占用账本容量。
- 浏览器在 BFF 不可用时完成的 Mock/静态降级可以增加一个“所有供应商用量均为 0”的新预算槽；server 只吸收这种新增零用量记录。已有记录不能修改或删除，新增非零用量也会拒绝。
- 当前基线明确只保证单 server instance 内的幂等与连续性，不声明跨实例 provider exactly-once。若部署扩展到多实例，需要共享持久化账本或等价协调设施。

## 6. 取消与迟到结果

- 浏览器为每次 Live 请求创建 AbortSignal；页面卸载会主动取消。
- Facade 使用执行代次拒绝取消后仍返回的迟到结果，因此迟到 terminal artifact 不会进入 FSM/IndexedDB commit。
- server 在开始、content load 后及 terminal commit 前检查取消状态；取消结果返回稳定 `request_cancelled`，且不会写入会话账本。
- route 继续使用每 session 1 个、全局 4 个并发上限，以及冻结的 session/source 固定窗口限流。

## 7. UI 状态

Live 模式明确显示：

- Live Agent 处理中；
- 上一步由 Live 完成；
- 已降级到本地 Mock；
- 已降级到静态安全模板；
- Live/Final Review 不可用且没有替代角色决定；
- 纯本地确定性规则完成、没有调用模型。

错误继续进入可访问的 `role="alert"` 区域；执行状态使用 `role="status"`/`aria-live="polite"`。Mock 默认体验的现有文案与行为保持不变。

## 8. 正式验收修复

Stage 6 正式验收发现并完成四项不改变冻结 Contract 的最小修复：

- Final Review 客户端在计算语义指纹时使用真实的 `requestedMode=live`，不再先以 Mock 身份计算、发送前再改写模式；
- Final Review 只把路由、网络、限流、并发和服务内部技术故障映射为 `unavailable`，content binding、幂等、预算连续性、取消等可信边界拒绝不会被隐藏；
- 接通既有 `RETRY_CHARLIE_SIGNATURE_REVIEW`，由冻结的 attempt state 决定是否提供唯一一次 Live 手动重试，Mock 和不可重试/已耗尽失败不显示重试入口；
- 外部 AbortSignal 触发后，provider 执行器不会再发网络重试或结构化修复请求，迟到结果仍由既有 Facade/server commit guard 拒绝。

以上均有离线回归测试覆盖，未调用 DeepSeek 或其他文本模型。

## 9. 测试范围

专项测试覆盖：

- strict request/response 与浏览器响应大小上限；
- closed/open Gate 配置元组与 TLS fail-closed；
- request body、rate、source、concurrency 和错误脱敏；
- Live success、Mock fallback、static-template fallback 与 fallback exhaustion；
- Final Review unavailable 且不调用任何角色 fallback；
- trusted content/fingerprint/budget/idempotency 拒绝；
- 新会话失败释放、零成本本地 fallback 账本协调；
- AbortSignal、server commit 前取消与 Facade 迟到结果拒绝；
- Live loading/degradation/UI copy；
- DeepSeek adapter 的 provider payload 禁传键、retry/repair、response cap 与安全身份。

最终验收结果：

- Stage 6 + UI boundary 专项：13 files / 92 tests 通过；
- 全仓 Vitest：44 files / 402 tests 通过；
- TypeScript：通过；
- ESLint：通过，0 warning；
- Mock/placeholder 优化构建：通过；
- Playwright Chromium：8/8 通过；
- 默认 verified production build：被 `verified_content_unavailable` 正确阻断，因为 Stage 7 approved production content 尚未接入。

## 10. 未解除的外部门禁

Stage 6C 不解除以下条件：

- Stage 7 的 approved verified content/asset 尚未接入；
- 应用 Live Gate 仍关闭；
- 多实例持久化幂等不是当前部署基线；
- 本阶段没有再次执行付费/联网模型 smoke。

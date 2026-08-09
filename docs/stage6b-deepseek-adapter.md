# Stage 6B：DeepSeek live adapter 与首次合成冒烟报告

> 日期：2026-08-09
>
> 当前结论：**provider adapter 已实现并通过离线回归；轮换 key 后的 TLS 安全合成 smoke 已通过。应用 Live API Gate 继续关闭，等待 verified content、隐私接受和 live UI/server orchestration 的独立验收。**

## 1. 已接入的 provider 边界

- Provider：DeepSeek
- API compatibility：OpenAI-compatible Chat Completions
- Base URL：`https://api.deepseek.com`
- Endpoint：`POST /chat/completions`
- Model：`deepseek-v4-pro`
- Secret：仅从 server-side `DEEPSEEK_API_KEY` 读取，本地值位于 Git 忽略的 `.env.local`
- 结构化输出：`response_format: { "type": "json_object" }`，同时在 system message 中提供 Draft 7 JSON Schema；返回值仍先按 `unknown` 处理，再经过既有严格 Zod Candidate Schema
- Thinking：对 Stage 6 结构化业务调用显式关闭
- Retry/repair：timeout、连接错误、429、5xx 最多一次网络重试；可解析但不合 Schema 时最多一次结构化修复
- 应用侧限制保持不变：128 KiB request、256 KiB response、单 session 单 active operation、单实例并发 4、既定 session/source rate limits

没有安装 provider SDK；供应商协议只存在于 DeepSeek adapter 中，Domain、FSM、Finalization 与 Stage 5 UI 不依赖供应商类型。

## 2. 数据与隐私边界

- 不声明 zero retention，也不声明 API 层训练退出。
- 配置只记录 `provider_policy_only`，`zeroRetentionConfirmed` 固定为 `false`。
- `internalExcerpt`、API key、Authorization、secret/password/credential/token 类字段会在 trusted data、untrusted data、输出 JSON Schema 和 structured-repair previous candidate 四条路径上被拒绝。
- API key 不进入请求 body、错误响应、receipt、telemetry、测试 fixture 或 Git。
- provider 原始错误正文不读取、不回传、不记录。
- 应用 Live API Gate 仍是 closed；placeholder content 不能进入 live Final Review，技术失败不会借用 Mock 生成 signed/declined。

## 3. 离线验收

- TypeScript：通过
- ESLint：通过，0 warning
- Vitest：40 files / 361 tests 通过
- Playwright：8 tests 通过
- Next.js Mock 内容模式 production build：通过，`/api/agent` 保持 dynamic server route
- DeepSeek 专项：8 files / 49 tests 通过，覆盖配置锁定、TLS fail-closed、密钥隔离、JSON mode、HTTP 错误映射、响应大小、四条禁传路径、Agent identity 和 Final Review 无 Mock 代签

## 4. 真实 smoke 记录

两次请求均只使用固定合成值 `synthetic: true`，未使用用户文本、项目正文、private content 或 `internalExcerpt`。

首次请求返回严格 `{ "status": "ok" }`，但运行环境存在 `NODE_TLS_REJECT_UNAUTHORIZED=0`，所以只记为功能通过，不计入安全验收。发现问题后没有继续使用原 key。

轮换本地 key、移除 Windows User 环境中的不安全设置并显式清除当前子进程的继承值后，执行一次安全复验：

- Provider/model：DeepSeek / `deepseek-v4-pro`
- 能力：synthetic JSON connectivity
- 结果：严格 `{ "status": "ok" }`
- Input tokens：107
- Output tokens：5
- Provider latency：1,941 ms
- Estimated cost：51 USD micros（USD 0.000051）
- Network retry：0
- Structured repair：0
- Fallback：未触发
- TLS warning：无

## 5. TLS 问题处置

首次 smoke 暴露的 `NODE_TLS_REJECT_UNAUTHORIZED=0` 原先同时存在于当前 Process 和 Windows User 环境，Machine 环境未设置。该值会关闭远端证书身份校验，不能满足安全上线条件。

现已完成：

1. 删除 Windows User 环境中的该设置；
2. 替换 Git 忽略的 `.env.local` 中的 DeepSeek key；
3. 保留 fail-closed 配置校验：只要进程值仍为 `0`，DeepSeek 初始化即失败，请求不会发出；
4. 在证书校验启用的独立子进程中完成安全 smoke，并记录脱敏 observation。

当前 Codex 主进程仍可能保留启动时继承的旧进程值；重启 Codex 后会继承已修复的 User 环境。还应在 DeepSeek 控制台确认旧 key 已撤销。只有在 verified content、隐私接受和 live UI/server orchestration 单独验收后，才 review 是否打开应用 Live API Gate。

## 6. 官方资料

- Chat Completions：https://api-docs.deepseek.com/api/create-chat-completion
- JSON Output：https://api-docs.deepseek.com/guides/json_mode/
- Error Codes：https://api-docs.deepseek.com/quick_start/error_codes/
- Rate Limit：https://api-docs.deepseek.com/quick_start/rate_limit/
- Pricing：https://api-docs.deepseek.com/quick_start/pricing
- Privacy Policy：https://cdn.deepseek.com/policies/en-US/deepseek-privacy-policy.html?os=___

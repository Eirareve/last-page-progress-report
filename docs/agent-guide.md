# Agent 详细说明

## 1. Agent 是什么

本项目的 Agent 不是一个自由聊天窗口，也不是替用户给出伦理答案的裁判。它是一组被 Contract、状态机和本地验证器约束的协作能力：在用户完成每轮表达后，读取当前请求允许的内容，生成结构化候选，再由本地程序决定候选是否可信、是否仍绑定当前 revision、是否可以呈现给用户。

Agent 的目标是帮助参与者看见自己表达中的条件、分歧和语义损失，而不是判断参与者是否“正确”、是否具有共情，或是否发生了真正改变。

## 2. 整体链路

```text
当前会话与本轮输入
  → 本地 Operation / RequestContext
  → production Prompt
  → DeepSeek 结构化候选
  → Adapter 语义投影
  → Schema / binding / revision / evidence / safety 校验
  → Validated Result
  → FSM 事件与原子保存
  → 用户可见结果
```

模型输出始终被视为“不可信候选”。模型不能自行决定可信的 operationId、stageInstanceId、revisionId、fragmentId、diffId、baseline anchor 或 checksum。这些标识由本地 operation/context 生成并在 Adapter 投影时绑定。若请求发出后正文 revision 已变化，严格 validator 会以 `stale_revision` 拒绝旧结果，不会为了让流程通过而放宽校验。

## 3. 文本 Agent 在哪里体现

### 三轮 Round Analysis

每轮围绕不同问题工作：过去自我的解释权、未来预测的边界、未来自我与关系。Agent 可产生用户原则、张力、查理回应、开放分歧和局部 DocumentDiff 候选。修改不会自动写入正文；用户必须明确接受或拒绝。

### Plain / Semantic Review

Agent 比较“精确版”和“朴素版”，指出被削弱、丢失或产生歧义的意义，并形成 SemanticFragment。用户决定将碎片恢复到朴素文本、保留为页边批注，或放入语义花束。恢复正文仍需二次确认，并继续受 revision 与 anchor 校验。

### Portrait Shift Summary

系统根据初始选择、三轮决定和最终选择生成非裁决性的变化摘要。摘要描述表达与选择的变化，不宣称用户已经被说服或完成了正确转变。

## 4. 独立 Final Review

Final Review 与普通分析是独立能力。它只回答“当前查理是否愿意为当前精确 revision 签名”，并返回 `signed`、`declined` 或技术上的 `unavailable`。`not_requested` 表示用户没有请求签名，也不会伪装成角色拒绝。

普通分析失败可以按照已冻结策略使用安全降级；签名审阅不会用演示签名冒充真实角色结果。最终封套会保留实际状态与 provenance。

## 5. DeepSeek 与本地验证各自负责什么

DeepSeek 负责生成语义候选，例如建议文本、理由、非裁决性回应和结构化语义位置。它不负责业务真相、版本身份或最终提交。

本地程序负责：

- 构造本次唯一 request context 与 input fingerprint；
- 绑定 operation、stage instance、precise/plain revision；
- 投影可信 fragment、diff、anchor 标识；
- 校验 Candidate Schema 与结果 Schema；
- 校验证据引用、内容边界和 supporting excerpt；
- 拒绝 stale revision、错误 baseline、越权修改和不安全内容；
- 发送 FSM 事件，并通过 IndexedDB 原子保存；
- 记录 provider、model、Prompt/Adapter/Schema 版本、延迟、token、费用和结果码。

因此，“用了 DeepSeek”并不等于直接展示模型原始回答。页面展示的是通过本地 Contract 与 validator 后的 Validated Result。

## 6. 页面反馈

真实模型模式会显示处理中、真实模型完成、本地安全降级、静态模板或技术未完成等状态。演示模式使用确定性 fixture，便于复现完整流程；页面顶部仍明确标识“本地演示模式”。最终封套记录请求模式和实际执行 provenance，避免把 fallback 或 fixture 说成真实 provider 结果。

## 7. 肖像与 Agnes

三张正式肖像分别对应早期、高峰期和面向未来的查理，文件位于 `public/portraits/charlie-original-v2/`。它们属于已审核内容资产并受 asset manifest/checksum 约束。

Agnes 动态图片生成是可选增强，不支撑任何业务判断或完成条件。当前发布版本固定使用这三张图片，完成页也只投影用户最终选择对应的固定肖像；前端不会请求动态生图。`AGNES_IMAGE_ENABLED` 默认且应保持为 `false`。即使图片加载失败，文本和核心流程仍可继续。

## 8. 失败与降级

- Provider 网络或格式失败：普通分析可按策略降级，并明确显示实际来源。
- Candidate 不符合 Schema：拒绝，不直接展示原始内容。
- revision 或 baseline 不匹配：返回 `stale_revision`，要求基于当前状态重试。
- 内容或证据校验失败：拒绝候选，不修改正式内容或 validator。
- Final Review 不可用：保留 `unavailable`，允许用户按产品规则继续，但不伪造签名。
- 图片不可用：显示可访问的文字 fallback，不阻塞体验。

## 9. 隐私与用户测试

用户自由输入只用于当前体验和必要的模型请求，不进入 Stage 9 analytics。用户测试事件默认关闭，参与者必须先选择同意或拒绝；拒绝后仍可完成全部体验。同意后也只在浏览器本地保存随机 Session ID、阶段时间、结构化选择、完成与降级状态和版本号，最多保留 7 天，可随时删除或由参与者主动下载交给研究主持人。

禁止进入 analytics 或普通日志的内容包括：完整自由输入、用户原话依据、模型完整 Prompt、internalExcerpt、身份信息、人格标签、心理诊断和 API 密钥。

Live 模式仍需把当前能力必要的自由输入和上下文发送给 DeepSeek API；这属于 provider 处理，不等于 analytics。2026-08-10 核对的 [DeepSeek 官方 Context Caching 文档](https://api-docs.deepseek.com/guides/kv_cache)与[官方说明](https://api-docs.deepseek.com/news/news0802/)显示磁盘 context cache 默认启用、按账户隔离，未使用缓存通常在数小时至数天内清理。参与者应在开始前看到这一点，并避免输入姓名、联系方式等敏感信息。

## 10. 运行模式

- `AGENT_MODE=mock`：确定性演示，用于可复现展示和无 provider 环境。
- `AGENT_MODE=live`：启用真实 DeepSeek 路径；还必须同时满足 verified content、Live API Gate、provider policy 和 TLS 条件。
- `CONTENT_MODE=verified`：使用正式内容包和正式三张肖像。
- `AGNES_IMAGE_ENABLED=false`：当前发布要求，禁止动态图片调用。

所有 provider 密钥仅保存在服务端环境变量中，不使用 `NEXT_PUBLIC_` 前缀，不进入客户端、Git、响应或研究导出。

## 11. 当前版本向量

- DeepSeek Prompt：`0.3.0`
- DeepSeek Adapter：`0.3.0`
- provider projection schema：`0.2.0`
- Round Analysis result bundle：`0.1.0`
- Plain/Semantic result bundle：`0.2.0`
- Final Review schema：`0.1.0`
- Stage 9 research schema：`0.1.0`

版本变化会使对应 RC 证据失效并触发受影响回归；冻结 Contract、正式内容、EvidenceCard、肖像资产或 checksum 不会为通过测试而被静默修改。

## 12. 作品平台填写文案

### Agent 简介（500 字内）

《最后一页进步报告》是一项基于《献给阿尔吉侬的花束》核心矛盾创作的 AI 协作式互动阅读体验。Agent 不替用户判断“谁才是真正的查理”，而是在三轮审校中分析用户的理由、提出局部文本修改、比较精确版与朴素版的语义差异，并由独立 Final Review 判断当前查理是否愿意签名。模型输出必须经过本地 Schema、版本绑定、证据与安全校验后才能进入作品；失败时提供可理解的安全降级。三张查理肖像使用已审核固定图片，暂不调用 Agnes 动态生图。

### Agent 使用方式（2000 字内）

打开原始体验链接后，先阅读“用户测试数据说明”，选择是否同意在当前浏览器记录匿名研究事件。拒绝记录不会影响完整体验。随后从三个阶段的查理肖像中选择你最初认为最能代表“真正的查理”的版本，并写下理由。

体验包含三轮审校，依次讨论：过去自我的解释权、对未来变化的预测是否等于替未来决定，以及未来关系能否被当前自我提前安排。每轮提交回答后，Agent 会提炼你的原则与分歧，给出查理视角的回应，并可能提出局部修改建议。建议不会自动改写正文；请逐项选择接受或拒绝。

三轮结束后，比较“精确版”和“朴素版”文稿。Agent 会标出简化过程中被削弱、遗漏或产生歧义的语义碎片。你可以把碎片恢复到正文、保留为页边批注，或放入“语义花束”；恢复正文仍需再次确认。

最后重新选择肖像，查看选择变化摘要，并决定是否请求独立签名审阅。签名由 Final Review 判断当前查理是否愿意为当前版本签名；用户不能代替查理签名。“拒绝签名”“技术不可用”和“未请求”会分别显示。完成后选择文稿归宿并查看最终封套。

Agent 不是裁判，不会判断你的选择是否正确。模型生成内容还会经过版本、证据、Schema 与安全校验；如真实模型不可用，页面会明确显示降级或技术状态。当前版本使用三张已审核固定肖像，不调用 Agnes 动态生图。若同意匿名研究记录，可在完成页下载或删除；不建议输入姓名、联系方式等敏感信息。

### 原始体验链接

https://last-page-progress-report.vercel.app

### Agent 头像素材

`public/brand/last-page-progress-report-agent-avatar.png`

当前没有部署公网 Streamable HTTP MCP 接口，“自建 MCP 接口地址”应留空。

# 最后一页进步报告

《最后一页进步报告》是一项基于《献给阿尔吉侬的花束》核心矛盾创作的 AI 协作式互动阅读体验。它邀请参与者在三个认知阶段、三轮审校、一次语义安放和一次独立签名审阅中，思考“哪一个阶段的自我有权代表真正的查理”。

- 在线体验：https://last-page-progress-report.vercel.app
- [Agent 详细说明](docs/agent-guide.md)
- [真实用户测试指南](docs/stage9-user-test-guide.md)
- [部署与环境配置](docs/deployment.md)
- [发布检查清单](docs/release-checklist.md)
- 作品平台头像：`public/brand/last-page-progress-report-agent-avatar.png`

## 核心边界

- Agent 不判断用户观点正确与否，不做人格、心理或道德裁决。
- DeepSeek 只生成非可信候选；revision、fragment、diff、anchor 等可信绑定由本地运行时产生。
- 候选必须通过 Schema、请求绑定、revision、证据、内容和安全校验后才能形成有效结果。
- Agent 不能绕过用户确认直接修改正文。
- Final Review 独立判断当前查理是否愿意签名；明确拒签、技术不可用和未请求不会混同。
- 三张查理肖像均为已审核固定素材；当前发布版本不调用 Agnes 动态图片生成。

## 本地运行

```bash
pnpm install
pnpm dev
```

复制 `.env.example` 为 `.env.local`，只填写本机需要的服务端变量。不要提交 `.env.local` 或任何 API 密钥。

## 验证

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm test:stage8:production-scan
pnpm test:e2e
```

真实 DeepSeek smoke 只在明确需要且已安全配置时单次运行：

```bash
pnpm test:smoke:deepseek
```

## 内容与版权说明

项目中的原著相关事实以已核验摘要呈现。互动手稿、问题、策展解释和 Agent 生成内容均不冒充原著引文或遗失章节。正式内容和肖像资产受内容包、来源记录及 checksum 门禁约束。

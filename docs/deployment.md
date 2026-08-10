# 部署说明

## 目标

项目使用 Vercel 托管：https://last-page-progress-report.vercel.app

生产部署必须使用 Node.js 24 与 pnpm 11.11.0，执行 `pnpm build`，并通过正式内容门禁。仓库中的 `.env.example` 只包含变量名和安全默认值；真实密钥只能配置在 Vercel 项目环境变量中。

## 推荐生产变量

```text
APP_ENV=production
CONTENT_MODE=verified
AGENT_MODE=live
STAGE6_LIVE_API_ENABLED=true
STAGE6_PROVIDER_POLICY_ACCEPTED=true
DEEPSEEK_API_KEY=<Vercel secret>
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_MODEL=deepseek-v4-pro
DEEPSEEK_REQUEST_TIMEOUT_MS=20000
AGNES_IMAGE_ENABLED=false
```

若暂时不调用 DeepSeek，将 `AGENT_MODE=mock`、`STAGE6_LIVE_API_ENABLED=false`；页面会明确显示本地演示模式。不要仅关闭页面提示而保留容易误解的运行状态。

当前版本不调用 Agnes。不要在生产环境设置 `AGNES_IMAGE_ENABLED=true`。三张固定肖像已经提交到 `public/portraits/charlie-original-v2/`。

## 发布步骤

1. 从受保护 `main` 创建发布分支并提交变更。
2. 运行 typecheck、lint、完整测试、生产 build、production scan 与 Playwright。
3. 检查 `.next/BUILD_ID` 与发布候选 ID。
4. 推送分支并通过 PR 合并，不直接覆盖 `main`。
5. 在 Vercel Preview 验证 CSP、安全响应头、固定图片、移动端、键盘、刷新恢复和 COMPLETE。
6. 合并后等待 Production Deployment 完成。
7. 对生产 URL 执行一次代表性 smoke；不通过反复调用 provider 挑选随机成功结果。

## 回滚

优先在 Vercel 将流量切回上一个已验证 deployment。若变更触及正式内容或资产，应恢复到上一个完整 ContentBundle/asset manifest，而不是只替换单个文件。不得把失败的候选继续标记为可测试版本。

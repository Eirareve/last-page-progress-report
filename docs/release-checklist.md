# 阶段 10 发布检查清单

## 自动检查

- [ ] `pnpm typecheck`
- [ ] `pnpm lint`
- [ ] `pnpm test`
- [ ] `pnpm build`
- [ ] `.next/BUILD_ID` 与发布候选一致
- [ ] `pnpm test:stage8:production-scan`
- [ ] `pnpm test:e2e`
- [ ] 正式内容门禁、ContentBundle 与 asset manifest 一致
- [ ] API 请求大小、速率和并发限制测试通过
- [x] 已于 2026-08-10 核对 DeepSeek 官方 API context cache 文档：缓存默认启用、账户隔离，未使用条目通常在数小时至数天内清理；项目 UI/测试指南已披露第三方处理
- [ ] CSP、X-Content-Type-Options、Referrer-Policy、frame 限制与 Permissions-Policy 生效
- [ ] 生产产物不包含 placeholder、密钥、测试 fixture 或私有内容

## 人工检查

- [ ] desktop Chromium 完整流程
- [ ] 320px Chromium 完整流程且无横向裁剪
- [ ] 键盘完整主流程与焦点移动
- [ ] 三张正式肖像、替代文本及图片失败 fallback
- [ ] 数据说明；同意与拒绝均可继续
- [ ] 拒绝 analytics 后不产生研究事件
- [ ] 同意后只保存 allowlist 字段，并可下载、删除
- [ ] refresh/resume 与双标签页只读/复制路径
- [ ] signed、declined、unavailable、not_requested 不混同
- [ ] COMPLETE 只读，开始新体验生成新 Session ID
- [ ] 原著来源、原创声明、Agent/模型来源提示清楚
- [ ] Agnes 未调用，完成页使用固定肖像

## 部署后 smoke

- [ ] https://last-page-progress-report.vercel.app 可访问
- [ ] 正式 build/commit 与本次发布一致
- [ ] 静态资源无意外 404；故意缺失资源返回 404
- [ ] Live 模式只执行一次代表性 DeepSeek smoke 并记录 provenance；若本次部署为 Mock，明确记录真实 provider NOT_RUN
- [ ] 未执行、失败、N/A 和仅人工项目分别列出，不写成 PASS

## 最终报告状态格式

每一项只允许记录为 `PASS`、`FAIL`、`NOT_RUN` 或 `MANUAL`。`MANUAL` 必须附执行人、时间和实际观察；供应商没有提供的数据写 `not_provided`，不能补造数值。线上尚未部署的新配置必须写 `NOT_RUN`，不能因为本地文件存在就写 `PASS`。

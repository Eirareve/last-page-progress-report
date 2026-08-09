# Stage 7 完成报告

状态：已完成，Stage 8 handoff 已冻结。

## 人工批准时间

- 内容记录批准：`2026-08-09T18:13:12.028Z`
- Master Charlie B 选择：`2026-08-09T19:18:59.646Z`
- 三张固定 portrait、fallback 与 ASSET_INPUT_MANIFEST 批准：`2026-08-09T19:42:24.0561146Z`
- Stage 8 handoff 冻结：`2026-08-09T19:58:32.7522680Z`

批准人和核验人均为 `project-owner`。

## Production verified bundle

- contentBundleId：`last-page-verified-stage7`
- Content/Schema/Bundle version：`0.2.0`
- internalContentBundleChecksum：`sha256:f2cc2f727dc94428bbac7006ee55963f941516ade11f13f002d4fad3bf0f962f`
- public contentBundleChecksum：`sha256:d2431aaf6b42103accd549c8562d11dfe656ba1788e790c9c3f5e6c3e29bb53e`
- production `evaluateContentGate(...)`：passed

双 checksum 均由仓库现有 `sealVerifiedContentBundle`、canonical JSON 与 SHA-256 实现生成。审核包 transport/package SHA-256 未被用作 ContentBundle checksum。

## 正式资产

三张生产图位于 `public/portraits/charlie-original-v2/`，分别覆盖 `early`、`peak`、`futureFacing`。生产文件字节哈希与获批候选完全一致；每张图以自身 assetId 作为稳定 fallback。Master B 仅保留为内部 identity reference，未批准公开使用。

V1 rejected 候选、V2 内部淘汰版本及其原始 checksum 均保留在 `stage7-review/assets/`，未被覆盖或改为公开批准。

## 隐私与投影边界

六条 `internalExcerpt` 只存在于 private authoring / 人工核验数据。最终 public bundle、Agent/Final Review 投影、动态图像 prompt 与普通 runtime payload 均不包含这些字段或文本。

未修改 ContentBundle、ContentLoader、canonicalization、checksum、public/private projection、唯一 `evaluateContentGate(...)`、Domain/Runtime/Provenance、Agent/Final Review、FSM 或 Finalization Contract。

## Optional Agnes dynamic portrait

动态最终肖像只在 `COMPLETE` 后以非阻塞增强方式请求；输入只包含三个严格枚举字段，经确定性 prompt builder 转为受控文案，并以批准固定肖像作为 image-edit reference。同一 server runtime 中每个 session 只创建一次主生成任务。

未配置 provider、非 verified 模式、超时、限流、HTTP 错误或无效图片响应均直接返回批准固定图。该路径不属于事实、证据或 Agent capability，不参与 FSM、Finalization 或 COMPLETE 判定。

Agnes 接入遵循官方当前文档的 `/v1/images/generations`、`extra_body.image` 与 `extra_body.response_format` 请求形状；model、尺寸、比例、超时均保持服务端 runtime 配置，API key 仅从 `AGNES_API_KEY` 读取。

## 验证结果

- 全量单元/集成测试：51 个文件、429 项通过
- TypeScript：通过
- ESLint：通过
- Stage 8 handoff gate/泄漏测试：随 handoff 文件冻结并纳入回归

冻结输入：`stage8-input/STAGE8_HANDOFF.json`

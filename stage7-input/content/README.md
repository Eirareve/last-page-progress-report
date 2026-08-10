# Stage 7 Content Review Package — DRAFT

状态：**NOT YET APPROVED / NOT READY FOR IMPLEMENTATION**

这个包整理了当前已具备的 Stage 7 正式内容候选，但不授权 Codex 修改仓库。

## 包含内容

1. `01-edition-record.draft.json`
   - 单一中文核验版草案
   - editionId: `flowers-algernon-zh-cn-gxnu-2015-9787549565115`

2. `02-verified-facts.draft.json`
   - 6 条 VERIFIED_FACT 候选
   - Round 1: 2 条
   - Round 2: 2 条
   - Round 3: 2 条

3. `03-curatorial-interpretations.draft.json`
   - 3 条策展解释

4. `04-evidence-cards.draft.json`
   - 三轮 Evidence Card 正式文本候选

5. `05-CONTENT_INPUT_MANIFEST.draft.json`
   - Stage 7 外部输入审计 manifest 草案
   - **不是 ContentBundle Contract**
   - `inputChecksum` 暂不伪造，交由 Codex 按冻结输入和仓库现有规则计算

6. `06-approval-record.draft.md`
   - 人工批准清单

## 核验版信息

- 书名：献给阿尔吉侬的花束
- 原作名：Flowers for Algernon
- 作者：Daniel Keyes
- 译者：陈澄和
- 出版社：广西师范大学出版社
- ISBN：978-7-5495-6511-5
- 2015年4月第1版 / 第1次印刷
- 用户再次确认总页数：288

## sourceLocation 策略

不要求句子级精确页码。本草案只断言用户提供目录能够支持的报告范围：

- 进步报告-8：20–34
- 进步报告-9：35–57
- 进步报告-15：199–204
- 进步报告-16：205–255
- 进步报告-17：256–288

再用 `locatorNote` 标记日期或事件位置。

这只是为了满足现有要求正整数 pageStart/pageEnd 的 sourceLocation Schema；
如果仓库 Contract 对 sectionType / enum 值有更严格定义，Codex 只能**映射到现有值**，不能借 Stage 7 修改 Contract。

## 内容边界

- `VERIFIED_FACT` 只表达原著中可以人工核验的事件/状态。
- `CURATORIAL_INTERPRETATION` 明确是项目解释，不代表作者唯一结论。
- Evidence Card 使用项目自己的概述文本。
- 不公开长篇原著译文。
- `internalExcerpt` 保留在内部核验边界。
- 不使用模型记忆、搜索结果或视觉素材补充新的原著事实。

## 当前仍缺

本包**没有**解决视觉资产：

- 三幅固定正式 portrait
- 对应 fallback
- ASSET_INPUT_MANIFEST
- creator / creationMethod / licenseOrPermission / approvedForPublicUse / altText
- 可选 Agnes 最终动态肖像的供应商与授权审核

因此，即使内容包人工批准，Stage 7 整体仍需完成视觉资产审核后才能最终 READY。

## 给 Codex 的建议指令

只做只读 Intake Review：

1. 检查这些 semantic draft 是否可无损映射到仓库冻结的 Content Schema 0.2.0；
2. 不修改 Contract；
3. 不修改文件；
4. 对 enum / wrapper / field-name 差异只报告 mapping；
5. 计算冻结输入所需的 inputChecksum 方案，但本轮不写入仓库；
6. 检查 factIds / interpretationIds / editionId 引用完整性；
7. 检查 existing ORIGINAL_INTERACTION 的实际文件与本 manifest 的 CONTENT-014 是否可批准；
8. 输出 READY FOR HUMAN APPROVAL 或 blockers；
9. 不开启 production verified gate；
10. 不进入 Stage 8。

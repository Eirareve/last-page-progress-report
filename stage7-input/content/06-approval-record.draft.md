# Stage 7 Content Approval Record — DRAFT

> 当前状态：**PENDING HUMAN APPROVAL**
>
> 本文件只是审核签字页草案。填写“批准”前，不得将本包视为 production verified content。

## A. 版本批准

- [ ] 批准 `editionId = flowers-algernon-zh-cn-gxnu-2015-9787549565115`
- [ ] 确认核验版本为：广西师范大学出版社，陈澄和译，ISBN 978-7-5495-6511-5
- [ ] 确认本次 Stage 7 使用单一中文核验版，不新增“英文原版 + 中文译本”双 edition Contract
- [ ] 接受 sourceLocation 使用“整篇进步报告页码范围 + locatorNote”的方式满足现有正整数页码 Schema
- [ ] 确认总页数 288 仅作为外部审核元数据，不要求新增 ContentBundle 字段

## B. VERIFIED_FACT 批准

- [ ] VF-R1-001
- [ ] VF-R1-002
- [ ] VF-R2-001
- [ ] VF-R2-002
- [ ] VF-R3-001
- [ ] VF-R3-002

## C. CURATORIAL_INTERPRETATION 批准

- [ ] CI-R1-001
- [ ] CI-R2-001
- [ ] CI-R3-001

确认：
- [ ] 上述解释不是作者唯一结论
- [ ] 不得被重新分类为 VERIFIED_FACT

## D. Evidence Card 批准

- [ ] EC-R1-PAST-SELF
- [ ] EC-R2-FUTURE-PREDICTION
- [ ] EC-R3-FUTURE-RELATIONSHIPS

确认：
- [ ] publicText 为项目团队概述，不是小说原文
- [ ] 只引用本包中批准后的 factIds / interpretationIds
- [ ] prohibitedClaims 保留在正式记录中
- [ ] 不新增第四轮

## E. ORIGINAL_INTERACTION

- [ ] 批准沿用仓库现有 ORIGINAL_INTERACTION
- [ ] Codex 已只读确认实际文件路径、内容及其是否与冻结 Scope 一致
- [ ] 不把原创手稿或 UI 文案标为 VERIFIED_FACT

## F. 隐私 / 版权 / public-private 边界

- [ ] `internalExcerpt` 只用于内部核验
- [ ] 客户端 / public bundle / Agent Prompt / FinalReview 输入不包含 `internalExcerpt`
- [ ] 公开 Evidence Card 使用人工审核后的 publicSummary / publicText
- [ ] 不使用本包中的长篇原著正文作为公开产品内容

## G. 人工批准信息

- verifiedBy / approvedBy: __________________
- verifiedAt / approvedAt: __________________
- approval decision: APPROVED / REJECTED
- notes: ___________________________________

## H. Stage 7 实施授权

只有完成以上审批后，才可单独发送：

> “我批准本版 Stage 7 CONTENT_INPUT_MANIFEST 和内容记录。现在授权开始 Stage 7 正式内容接入；不得修改已冻结 Contract，发现 gap 必须停止并报告。”

本批准**不包含视觉资产批准**。ASSET_INPUT_MANIFEST、三幅固定 portrait、fallback 和可选运行时图像生成仍需单独审核。

# 《最后一页进步报告》Codex 协作开发指南

> 文档版本：v1.2.7-draft（阶段 8 review 修补版，未冻结）
>
> 本文件为 review 草案，不自动改变已冻结 Contract。正式开发时，`/docs/scope-freeze.md` 是产品范围唯一事实来源；Domain/Runtime/Provenance/Finalization、Agent、Final Review、FSM 等以各自最新已确认 Contract 为准。本文中尚未确认的修订需在执行前冻结。

## 修订说明

v1.2.7-draft 基于 v1.2.6 做阶段 8 release-candidate review 修补，不改变阶段 0—7 已冻结产品语义与 Contract。建议变更包括：

- 阶段 8 从“测试清单”收敛为“冻结 Release Candidate 的完整联调与验收阶段”，增加开始前 STOP 条件；
- 增加 `RC_TEST_MANIFEST`，绑定 Git commit/build、Prompt/Adapter/Schema、正式 content bundle、asset manifest、目标运行模式与模型配置；该 manifest 仅为 QA/release artifact，不进入 Domain/SessionState Contract；
- 明确 RC 输入变化后的测试失效规则：正式内容/资产变化必须返回阶段 7 重新门禁；代码、Prompt、Adapter、Schema、模型配置等变化必须生成新的 RC revision 并重新执行受影响测试；
- 增加 Contract gap STOP：阶段 8 允许修复已冻结 Contract 范围内的实现缺陷，但不得为了让联调通过而静默修改 Domain/Runtime/Provenance/Agent/Final Review/FSM/Finalization/ContentBundle Contract；
- 将 Agent/FinalReview 异常验证拆分为 controlled integration 与真实 provider smoke，避免要求真实供应商稳定制造非法 JSON、超时或特定 signed/declined 角色结论；
- 明确 mock/live 两种无网络路径，保证 live FinalReview 技术失败保持 `unavailable`，不得被 Mock 冒充为角色签名决定；
- 增加 `evaluateFinalization(...)` integration matrix、调用次数/retry/token/latency/费用预算验证、Prompt injection/日志脱敏/敏感数据泄漏负测试；
- 增加 release blocker 判定、阶段 8 完成条件、输出格式与阶段 9 冻结交接；未执行、失败、N/A 和仅人工验证项不得被宣称为通过。

v1.2.6-draft 基于 v1.2.5 做执行性精简，并重点 review 阶段 4。建议变更包括：

- 删除旧版本逐版修订长记录，仅保留当前执行相关摘要，历史细节回到 Git/Contract 历史追溯；
- 删除“可直接发给队友的完整版项目说明”，避免与 Scope Freeze、总控 Prompt 和体验流程形成第四套产品描述；
- 删除已被分阶段 Prompt 与 Issue 模板覆盖的“第一批任务”，避免旧批次名称和旧版本号继续影响执行；
- 阶段 3 增加 `SemanticRestorationProposal` 生产边界完成门，防止阶段 4 临时发明第十项 Agent 能力或未冻结 payload；
- 阶段 4 收敛 FSM 与 application/orchestration 边界：供应商级超时、修复、Mock fallback 等不再作为 Session FSM 事件；
- 补齐语义回填 proposal 确认事件、可选澄清/最终理由跳过路径、MANUSCRIPT_REVISION 取消语义、Plain/Semantic 原子 Bundle 的状态归属；
- 补齐 ActiveOperation 刷新失效、SignatureReviewAttemptState、IndexedDB 原子提交、FINALIZING 恢复与阶段 4 完成条件。
- 阶段 7 补齐正式内容/视觉资产接入门禁：严格继承阶段 2 已冻结 ContentBundle/checksum Contract，增加输入 manifest 可追溯、真实模型 public projection 回归、阶段完成条件与阶段 8 冻结交接。

v1.2.5 对阶段 2—3 的 production 内容门禁、placeholder/verified 边界、`CapabilityExecutionReceipt` 分层、provider-neutral Agent/Final Review Contract 与阶段 3 architecture STOP 条件继续有效。

历史版本 v1.2—v1.2.4 的详细变更不再在本执行母版重复展开；其冻结结果已经体现在当前 Scope Freeze、Domain/Runtime/Provenance/Finalization、Agent、Final Review 与命名 Contract 中。需要追溯时以 Git commit/tag 和对应 Contract 历史为准。

---

## 一、当前项目定义

### 项目名称

**《最后一页进步报告》**

副标题：

> **这句话能留给未来的我吗？**

### 一句话产品定义

> 作品先让读者从三个认知阶段中选出一个“最像真正查理的人”，再通过三轮原著证据和动态手稿审校，让读者重新面对被自己排除的另外两个查理。最后，三幅场景肖像图、两版手稿和无法完整传递的意义，被放入一封无人可以替未来签收的信。

这不是：

- 书籍问答机器人；
- 单纯与查理聊天；
- 智力下降模拟器；
- 心理测试；
- 伦理答题游戏；
- 多分支剧情。

它是一项围绕《献给阿尔吉侬的花束》的 **AI Agent 互动阅读体验**。

---

## 二、完整体验流程

### 1. 感受序章：三次看见查理

用户依次看到三幅统一风格的原创场景肖像图：

- 仍然相信笑声和友谊的查理；
- 拥有高度理解能力、但变得孤独的查理；
- 已经知道未来会发生变化、试图留下文字的查理。

用户为每幅图选择描述词，并回答：

> 这三个阶段中，哪一个最接近你心中“真正的查理”？

系统只记录，不评价。用户还需写下一句选择理由。

### 2. 三轮递进审校

用户与处于认知高峰阶段的查理，共同修改一句话：

> 当未来的我无法理解现在写下的话时，请以现在的意愿为准。

三轮分别讨论：

1. **过去自我的解释权**  
   现在的查理是否有权否定过去的查理？

2. **对未来的预测边界**  
   能够预测未来，是否等于能够替未来作决定？

3. **未来自我与他人的连接**  
   现在的恐惧、自尊和判断，是否有权提前限制未来查理与他人的关系？

### 3. 双栏 Canvas

精确版本从第一轮开始维护；朴素版本在三轮审校结束后生成。生成朴素版本后，两版文本同时展示并进入语义审查。

左栏显示：

- 原著证据卡；
- 查理的回应；
- 用户自由输入；
- 用户主张摘要；
- 双方尚未解决的分歧。

右栏显示：

- 当前精确版本；
- 朴素版本区域：三轮完成前显示“尚未生成”，三轮完成后显示正式朴素版本；
- 局部文字 Diff；
- 修改理由；
- 版本历史；
- 语义偏移；
- 页边批注；
- 无法完整传递的意义碎片。

### 4. 语义碎片与语义花束

当精确版本被转写为朴素版本时，Agent 找出没有被完整保留的限定，例如：

- 重要参考；
- 不可撤销；
- 仅依据；
- 明确表达；
- 不得忽略。

用户决定将这个意义：

1. 放回朴素版本正文；
2. 保留为页边批注；
3. 放入“未能抵达未来的语义花束”。

进入语义碎片处理时，系统创建 `SemanticPlacementBatch` 并冻结当前 precise/plain baseline revisions。`saved_as_margin_note` 与 `placed_in_bouquet` 的 placement 选择本身构成直接确认；`restored_to_plain_text` 必须先生成并展示冻结的 `SemanticRestorationProposal`，至少明确回填文字、目标 stable anchor、应用前后预览和 proposalHash，用户确认该具体 proposal 后才构成直接确认。系统在同一批次内按稳定 anchor 或确定性 rebase 生成工作中的新 `plainRevisionId`，不再创建第二个 pending Diff；anchor/hash 冲突时不得猜测位置，必须使 proposal 失效并重新生成、重新确认。所有碎片处理完成后只执行一次有限 consistency check；该检查不得再次创建新的语义碎片，并必须生成绑定最终 precise/plain revisions 的新 `SemanticDrift=current`。批次之外的正文修改会使该批次失效并要求重新语义审查。

这不是评分机制，没有标准答案。

### 5. 查理肖像重新拼合

完成三轮后，用户重新看到序章中的三幅场景肖像图。

系统展示：

- 用户最初选择了哪一个“真正的查理”；
- 三轮中用户分别为其他阶段保留了什么权利；
- 用户最终是否仍然只承认一个阶段。

用户可以：

- 保留最初选择；
- 改选另一个阶段；
- 选择三个都是；
- 拒绝给出唯一答案。

### 6. 最终封套

最终生成一封：

> **给未来的查理**

封套必须由 `evaluateFinalization(state, context)` 判定为 eligible 的结构化 SessionState 确定性生成，包含：

- 最终精确版本；
- 最终朴素版本；
- 修改历史；
- 语义偏移与已处理的语义碎片；
- 三张查理肖像卡；
- 用户初始判断、最终判断与事实性变化摘要；
- 尚未解决的分歧；
- 语义花束；
- 现在的查理签名审阅状态；
- 永远空白的未来查理签名；
- 文稿归宿；
- 原著依据、策展解释与原创互动的内容归属说明；
- 生成时使用的 Contract、Prompt、Adapter、Schema、内容包版本、Session requested Agent mode、逐能力 `CapabilityExecutionReceipt`、`integrityChecksum` 与可选服务端 `FinalEnvelopeAttestation`。

用户决定文稿归宿：

1. 作为未来参考保存；
2. 作为此刻记录保存；
3. 保持未完成。

---

## 三、新 Codex 会话总控 Prompt

```text
你将作为本项目的高级全栈工程师、AI Agent 架构师和技术产品负责人，协助我逐步开发一个可运行、可测试、可部署、可用于黑客松演示的 AI Agent 互动阅读 MVP。

项目名称：

《最后一页进步报告》

副标题：

“这句话能留给未来的我吗？”

你必须将以下内容视为已经冻结的产品范围。除非我明确修改 Scope Freeze，否则不得自行增加角色、玩法、轮次、评分、剧情或产品模块。正式开发时，`/docs/scope-freeze.md` 是产品范围的唯一事实来源；该文件使用稳定文件名，版本号写入文件元数据并由 Git commit/tag 留存。其他 Prompt、Issue、分支说明和实现与其冲突时，以已确认的最新 Scope Freeze 为准。

━━━━━━━━━━━━━━━━━━
一、项目定位
━━━━━━━━━━━━━━━━━━

本项目基于丹尼尔·凯斯的《献给阿尔吉侬的花束》。

它不是：

1. 书籍问答机器人；
2. 普通角色聊天机器人；
3. 智力下降模拟器；
4. 心理测试；
5. 伦理答题游戏；
6. 多角色剧情游戏；
7. 原著遗失章节模拟。

核心产品定义：

作品先让读者从三个认知阶段中选出一个“最像真正查理的人”，再通过三轮原著证据和动态手稿审校，让读者重新面对被自己排除的另外两个查理。

最终，三幅场景肖像图、两版手稿、尚未解决的分歧和无法完整传递的意义，被放入一封无人可以替未来签收的信。

目标读者：

已经知道小说主要情节，却容易将早期查理仅仅视为“值得同情的人”、将高智时期查理仅仅视为“傲慢天才”的青年读者。

阅读困难：

读者容易对不同阶段的查理形成单一、割裂的印象，并默认理解能力更强的人拥有更高的解释权和决定权。

核心命题：

同一个生命在不同认知阶段表达了相互冲突的意愿，哪一个阶段的自我有权代表“真正的他”？

━━━━━━━━━━━━━━━━━━
二、完整体验结构
━━━━━━━━━━━━━━━━━━

目标体验时长为 8—10 分钟，但实际稳定性需要通过测试验证。

整个体验分为六部分。

第一部分：感受序章——三次看见查理

用户依次看到三幅统一风格的原创场景图：

1. 仍然相信笑声与友谊的查理；
2. 拥有高度理解能力、但变得孤独的查理；
3. 已经知道未来会发生变化、试图留下文字的查理。

用户需要：

1. 为每幅图选择一个或多个描述词；
2. 从三个阶段中选择一个“最接近真正查理”的阶段；
3. 写下一句理由。

系统不得评价用户，只记录初始判断。

第二部分：第一轮审校——过去自我的解释权

通过经过人工核验的原著证据，检验现在的查理是否有权否定过去查理对自身经历的理解。

第三部分：第二轮审校——对未来的预测边界

检验现在的查理能够预测未来变化，是否等于能够替未来的自己作出决定。

第四部分：第三轮审校——未来自我与他人的连接

检验现在的恐惧、自尊或判断，是否有权提前限制未来查理与他人的关系。

第五部分：肖像重新拼合

系统重新展示三幅场景肖像图，并比较用户开始时和结束时的判断。

用户可以：

1. 保留原选择；
2. 改选另一个阶段；
3. 选择三个都是；
4. 拒绝给出唯一答案。

系统只能描述本次体验中的判断变化，不得诊断用户。

第六部分：未被签收的封套

最终封套必须由 `evaluateFinalization(state, context)` 判定 eligible 的结构化 SessionState 确定性生成，并作为只读快照保存。至少包含：

1. 最终精确版本；
2. 最终朴素版本；
3. 修改历史；
4. 语义偏移与已处理的语义碎片；
5. 尚未解决的分歧；
6. 三张场景肖像图；
7. 初始判断、最终判断与事实性变化摘要；
8. 语义花束；
9. 现在的查理签名审阅状态；
10. 永远为空的未来查理签名；
11. 文稿归宿；
12. VERIFIED_FACT、CURATORIAL_INTERPRETATION 和 ORIGINAL_INTERACTION 的内容归属说明；
13. 生成时使用的 Contract、Prompt、Adapter、Schema、内容包版本、Session requested Agent mode、逐能力 `CapabilityExecutionReceipt`、`integrityChecksum` 与可选服务端 `FinalEnvelopeAttestation`。

━━━━━━━━━━━━━━━━━━
三、核心手稿
━━━━━━━━━━━━━━━━━━

整场体验只围绕一句原创草案进行审校：

“当未来的我无法理解现在写下的话时，请以现在的意愿为准。”

该句不是原著引文。

界面必须明确显示：

“以下内容为基于原著核心矛盾设计的原创互动草案，并非小说原文或遗失章节。”

不得将其扩展成完整遗嘱、多条协议或法律文件。

━━━━━━━━━━━━━━━━━━
四、双栏 Canvas
━━━━━━━━━━━━━━━━━━

左栏：原著证据与协商区

至少包含：

1. 当前阶段；
2. 经人工核验的原著证据卡；
3. 查理当前的主张、疑问和异议；
4. 用户自由输入；
5. Agent 提取的用户主张、限定与例外；
6. 当前尚未解决的分歧；
7. 当前使用的肖像或场景图。

右栏：最后一页手稿

至少包含：

1. 当前精确版本；
2. 朴素版本区域；
3. 当前局部 Diff；
4. 修改理由；
5. 版本历史；
6. 语义偏移分析；
7. 页边分歧批注；
8. 语义碎片；
9. 语义花束；
10. 最终签名区；
11. 三种文稿归宿。

条件显示规则：

- 精确版本从第一轮开始显示；
- 朴素版本在三轮完成前只显示“尚未生成”；
- 语义偏移和语义碎片在 SEMANTIC_REVIEW 后显示；
- 最终签名区仅在 FINAL_SIGNATURE 阶段显示；
- 文稿归宿仅在 FINAL_DISPOSITION 阶段显示。

━━━━━━━━━━━━━━━━━━
五、双层文本
━━━━━━━━━━━━━━━━━━

精确版本从第一轮开始维护。三轮审校完成后生成朴素版本；从朴素版本生成完成起，右栏同时维护两个文本版本。生成前，朴素版本区域只能显示“尚未生成”，不得提前伪造内容。

1. 精确版本

尽可能保留查理此刻希望表达的逻辑条件、限定和例外。

2. 朴素版本

使用较少抽象术语重新表达相同意图。

朴素版本不是正确答案，也不能保证未来查理一定能够理解。

它只用于检查：

1. 哪些意义仍被保留；
2. 哪些限定被削弱；
3. 哪些意义丢失；
4. 哪些歧义出现；
5. 语言变化可能造成什么权利或关系后果。

禁止通过错别字、所谓低智语言、词汇障碍、动画故障或夸张表情模拟认知障碍。

━━━━━━━━━━━━━━━━━━
六、语义碎片与语义花束
━━━━━━━━━━━━━━━━━━

当精确版本被转换成朴素版本时，Agent 可以识别一个或多个没有被完整保留的关键限定。

每个语义碎片至少包含：

1. id：稳定标识；
2. phrase：原有词语或限定；
3. reason：为什么没有被完整保留；
4. consequence：丢失后可能造成的权利或关系后果；
5. sourcePreciseRevisionId：对应的精确版本修订；
6. sourcePlainRevisionId：对应的朴素版本修订；
7. placement：用户如何处理它；
8. resolvedAt：处理完成时间；
9. restorationProposalId：仅在 `restored_to_plain_text` 时必填，指向用户已确认的冻结 `SemanticRestorationProposal`。

placement 只能为：

1. restored_to_plain_text
2. saved_as_margin_note
3. placed_in_bouquet

进入 SEMANTIC_PLACEMENT 时必须创建 `SemanticPlacementBatch`，冻结 source precise/plain baseline revisions。`restored_to_plain_text` 只修改朴素版本，不修改精确版本；系统必须先生成 `SemanticRestorationProposal`，至少包含 fragmentId、baselinePlainRevisionId、targetAnchor、replacementText、previewText、proposalHash 和 proposalVersion。UI 必须展示具体回填文字与应用前后预览，用户确认该冻结 proposal 后才可应用。系统在该 batch 内按 stable anchor 或确定性 rebase 生成新的 working plainRevisionId 和 RevisionEntry，不再创建第二个 pending Diff；若 working revision 上的 anchor、原文 hash 或 proposalHash 不匹配，必须将该 proposal 标记为 stale，禁止自动猜测插入位置，并要求重新生成、重新确认。该 revision 变化不终止剩余碎片的 placement，但原 SemanticDrift 只能作为 batch baseline，不能继续视为 current。所有碎片处理完成后只执行一次 post-placement consistency check；该检查可以更新 preserved、lost、ambiguities 和 consequences，不得再次创建新的 SemanticFragment，并必须生成绑定最终双 revision 的新 SemanticDrift=current。

语义花束不是得分、奖励或收藏系统。

它只是最终保存“没有被完整传递给未来的意义”。

━━━━━━━━━━━━━━━━━━
七、签名与文稿归宿
━━━━━━━━━━━━━━━━━━

最终签名区包含：

现在的查理：____________
未来的查理：____________

规则：

1. 初始阶段不得显示已签署；
2. 用户只能请求现在的查理审阅当前文本，不得直接触发 signed 或 declined；
3. 系统或 Agent 必须基于当前 preciseRevisionId、plainRevisionId、已核验证据和未解决分歧返回签名审阅结果；
4. 只有审阅结果为 signed 时才显示现在的查理签名；
5. 审阅结果可以是 declined；模型、网络或校验失败时必须记为 unavailable，不得伪装成角色拒绝；
6. 用户可以不请求签名并继续，此时状态记为 not_requested；declined 仅在角色明确拒绝时使用，未请求或技术失败不得冒充拒绝；
7. 未来查理的签名永久留空；
8. 用户不得代签；
9. 现在的查理不得替未来查理签名；
10. `FINAL_SIGNATURE` 中的“最终文本审阅”仅表示只读检查，不允许直接编辑 preciseText、plainText、revision 或语义 placement；
11. 用户需要修改文本时必须发送 `RETURN_TO_MANUSCRIPT_REVIEW`。进入修改路径后，旧 `currentCharlieSignatureReview` 和签名状态必须清除或失效；任何实际 revision 变化都必须使旧 SemanticDrift、SemanticPlacementBatch 结果及其他 revision-bound 摘要失效，并在重新完成语义审查后才能返回 `FINAL_SIGNATURE`。

用户最终决定文稿的保存性质：

1. 作为未来参考保存；
2. 作为此刻记录保存；
3. 保持未完成。

不得为三个选项添加人格、道德、心理或哲学流派标签。

━━━━━━━━━━━━━━━━━━
八、Agent 必须具备的九项能力
━━━━━━━━━━━━━━━━━━

1. retrieveVerifiedEvidence

只从人工核验白名单读取原著事实。

禁止根据模型记忆补充情节。

2. buildInitialPortraitRecord

根据已经通过输入 Schema 校验的序章提交，构建 `InitialPortraitRecord` 建议值，包括：

- 三幅场景肖像图的描述词；
- 被选择为“真正的查理”的阶段；
- 用户给出的理由。

该能力是纯构建函数，只返回结构化记录，不得直接写入 `SessionState`，也不得判断用户选择是否正确。

3. extractUserPrinciple

从用户自由表达中提取：

- 核心主张；
- 判断理由；
- 限定条件；
- 例外；
- 用户原话依据。

不得输出人格标签。

4. detectTension

检测：

- 用户当前观点与此前观点的张力；
- 查理自身立场中的张力；
- 用户初始肖像选择与当前判断的张力；
- 精确版本与朴素版本的冲突。

不得把正常的观点发展自动判断成矛盾。

5. generateCharlieResponse

依据当前轮次、已核验证据、当前手稿和用户输入，生成受控的查理回应。输出应区分：

- 当前立场；
- 对用户观点的承认；
- 仍然存在的保留；
- 一个可回答的问题。

不得引入白名单之外的原著事实，不得作最终裁决，不得控制状态跳转。

6. proposeDocumentDiff

只能提出局部修改。

支持：

- insert
- replace
- delete
- annotate

所有由 proposeDocumentDiff 提议的正文修改必须进入 proposed，经用户确认后才能应用。

7. compareSemanticDrift

输出：

- preserved
- lost
- ambiguities
- consequences
- semanticFragments

8. buildDissentRecord

根据已经校验的查理立场、用户立场和当前上下文，构建 `DissentRecord` 建议值，包括：

- 查理立场；
- 用户立场；
- 分歧焦点；
- 当前解决状态。

该能力只返回结构化记录，不得直接修改 `SessionState`，也不得生成分数或指数。

9. summarizePortraitShift

接收纯领域函数 `computePortraitShift` 生成的 `PortraitShiftComparison`，以及允许引用的证据和修改记录，生成事实性自然语言摘要。摘要可以说明：

- 用户最初的肖像选择；
- 三轮审校中的观点；
- 用户最终选择；
- 哪些证据或修改与变化相关。

`computePortraitShift(...): PortraitShiftComparison` 必须完全确定性；`summarizePortraitShift` 只能读取该结构，不得自行重新推断、重新计算或篡改事实，只能做事实性描述，不得写“用户克服了偏见”之类评价。

━━━━━━━━━━━━━━━━━━
九项能力之外的正式 Final Review Contract
━━━━━━━━━━━━━━━━━━

签名审阅不属于九项通用 Agent 能力，也不构成第十项 Agent 能力；不得复用 `generateCharlieResponse` 的 operation。正式服务固定为：

```text
FinalReviewService
└── reviewCharlieSignature
```

必须定义并版本化：

- `CharlieSignatureReviewInput`
- `CharlieSignatureReviewCandidate`
- `CharlieSignatureReviewResult`
- `CharlieSignatureReviewError`

`CharlieSignatureReviewInput` 至少包含当前 `preciseRevisionId`、`plainRevisionId`、两版当前文本、允许使用的 `evidenceIds`、当前未解决分歧、`contentBundleId`、`contentBundleVersion`、`contentBundleChecksum` 和 `finalReviewSchemaVersion`。`requestedMode`、`requestId`、签名审阅的 `promptVersion` 与 `adapterVersion` 必须通过 `RequestContext` 传入，不属于该语义输入；最终实际执行来源由 `CapabilityExecutionReceipt` 记录。

签名审阅调用边界必须同时接收 `CharlieSignatureReviewInput` 与 `RequestContext`，并在类型和运行时 Schema 层保持二者分离。服务端必须根据内容包标识和 evidenceIds 解析允许公开给模型的证据内容，不得信任客户端回传的证据正文，也不得将 `internalExcerpt` 发送给模型。

模型只能返回 `CharlieSignatureReviewCandidate`。Candidate 至少包含 `status`、`reason` 和 `evidenceIds`，不得包含 `validationResult`、`safetyPassed` 或任何自证安全字段。Adapter 完成 Candidate Schema 校验、revision/content binding 校验、证据集合校验和后置安全验证后，才可生成可信的 `CharlieSignatureReviewResult`。

`CharlieSignatureReviewResult` 至少包含 `status`、`reason`、`preciseRevisionId`、`plainRevisionId`、`contentBundleVersion`、`contentBundleChecksum`、`evidenceIds` 和由后置验证器生成的 `validationResult`。`status` 只能是 signed 或 declined；`unavailable` 由服务编排层在技术失败时生成，不得由模型扮演角色决定输出。

`CharlieSignatureReviewError` 至少区分 timeout、rate_limited、network_error、invalid_output、schema_validation_failed、safety_validation_failed、stale_revision、content_not_found、content_version_mismatch 和 idempotency_conflict。

FinalReviewService 只返回结果，不得直接写入 `SessionState`。FSM 根据服务结果或错误更新 `currentCharlieSignatureStatus`。合法主路径为 hidden → pending → signed/declined/unavailable；not_requested 只能由用户跳过审阅事件产生。live 模式进入 unavailable 后，用户可在双 revision 与内容包未变化时手动重试一次；自动 Mock 回退仍被禁止。每次签名审阅都必须生成 `CapabilityExecutionReceipt`；技术失败时 resolvedMode=unavailable，不得生成 mock 角色结论。`FINAL_SIGNATURE` 保持只读，任何返回修改路径的操作都必须使旧审阅结果失效。

━━━━━━━━━━━━━━━━━━
九、图像与视觉资产规则
━━━━━━━━━━━━━━━━━━

序章三幅场景肖像图应优先使用赛前制作好的统一风格原创素材。

要求：

1. 三幅场景肖像图中的人物设计一致；
2. 不使用影视演员形象；
3. 不复制书籍封面或受版权保护的插图；
4. 不使用夸张的认知障碍表情；
5. 不用图片代替原著证据；
6. 图片只负责建立感受和承载用户判断；
7. 原著事实仍必须来自人工核验白名单。

运行时实时生成最终肖像只能作为非阻塞增强功能。

若生成失败，必须回退到三联画模板，不得影响核心体验完成。

━━━━━━━━━━━━━━━━━━
十、内容管理规则
━━━━━━━━━━━━━━━━━━

在我提供人工核验内容前：

1. 所有原著证据使用占位符；
2. 不写角色原声台词；
3. 不写报告编号；
4. 不写具体日期；
5. 不写具体人物行为；
6. 不根据模型知识补全小说内容；
7. 不自行搜索并写入原著事实。

内容必须分为三类：

A. VERIFIED_FACT

小说中明确存在且已人工核验的事实。

B. CURATORIAL_INTERPRETATION

团队基于事实提出的一种解释，不代表作者唯一结论。

C. ORIGINAL_INTERACTION

本项目原创的互动文本、问题、手稿、视觉说明和界面内容。

三类内容必须在数据层和界面层中可区分。

━━━━━━━━━━━━━━━━━━
十一、明确禁止
━━━━━━━━━━━━━━━━━━

1. 模拟认知障碍；
2. 生成错别字或低智口吻；
3. 用户评分；
4. 人格诊断；
5. 同理心指数；
6. 好感度；
7. 通关或失败；
8. 盖章；
9. 说服查理成功；
10. 多角色大厅；
11. 第四轮伦理问题；
12. 自由扩展剧情；
13. 将用户描述为缺乏共情；
14. 将查理塑造成正确答案裁判；
15. 未经核验的原著内容；
16. 伪造原著台词；
17. 假装这是遗失章节；
18. Agent 未经确认直接修改正文；
19. 运行时图片生成成为流程阻塞点；
20. 引入 NFT、区块链、积分或收藏系统。

━━━━━━━━━━━━━━━━━━
十二、技术原则
━━━━━━━━━━━━━━━━━━

1. 先冻结领域和 Agent Contract，再实现无 LLM 的确定性 Mock 流程；
2. 使用显式有限状态机；
3. 状态机控制流程，模型不得控制流程跳转；
4. Canvas 状态结构化保存；
5. 原著证据使用人工维护的静态白名单；
6. 工具输出经过运行时 Schema 校验和后置安全验证；
7. Agent 提议的正文 Diff 必须经过用户确认；语义碎片的 `restored_to_plain_text` 由用户 placement 选择直接确认；
8. 所有模型调用都有按错误类型定义的降级方案；
9. 前端不依赖模型生成 HTML；
10. LLM 使用 Adapter 封装；
11. 敏感密钥只使用环境变量；
12. 必须包含单元测试、契约测试、集成测试和关键路径 E2E；
13. 必须具有基础可访问性；
14. 已有仓库时优先沿用现有技术栈；
15. 空仓库时先提出技术方案，不直接建立大型架构；
16. 不无必要引入数据库、向量数据库、多 Agent 框架或复杂工作流系统；
17. production 不得加载 placeholder 内容；
18. COMPLETE 后 Session 快照只读，重新体验必须创建新的 sessionId；
19. 基础响应式、键盘导航、错误和降级状态不得推迟到最终阶段首次实现；
20. 语义确定性与运行元数据必须分离：相同输入、Fixture 和 Mock 版本必须得到相同业务结果；`sessionId` 等持久标识由 `IdGenerator` 生成，时间戳由 `Clock` 提供；Session 选择的模式保存在 `SessionConfiguration.requestedAgentMode`，单次调用的请求元数据通过 `RequestContext` 传递，最终实际来源、fallback 和版本信息通过逐能力 `CapabilityExecutionReceipt` 固化；
21. 用户自由输入默认只在当前 Session 的受控存储中使用，不进入分析事件、服务端日志或模型调试日志；
22. UI、FSM、领域 reducer 与模型 Adapter 之间必须设置 application/orchestration 层；Adapter 不得直接驱动状态迁移，FSM 不得直接解析供应商响应；
23. 所有异步能力必须绑定 `ActiveOperation`、`stageInstanceId`、输入指纹和相关 revision；迟到、重复、已取消或输入不匹配的结果必须被 Guard 拒绝；
24. 模型输出必须经过 Candidate Schema、业务绑定校验和后置安全验证后才能转为 Validated Result；模型不得提供可信的验证结论；
25. 九项逻辑能力保持独立 Contract，但允许由编排器合并为受预算约束的一次模型调用；每个阶段和完整 Session 的主调用、重试、修复、延迟与 token 预算必须在阶段 3 冻结；
26. 编排 Bundle 必须采用“分项校验与降级、完整业务 Bundle 原子提交”：FSM 不得接收会形成半轮状态的子结果独立写入；
27. 浏览器生成的内容门禁结果和封套 checksum 只能证明本地一致性或检测损坏，不能作为防篡改签名；需要可信证明时必须使用服务端签发并可验证的 attestation；
28. `FINAL_SIGNATURE` 为只读阶段，任何文本修改必须先进入 `MANUSCRIPT_REVISION`，再重新执行朴素改写与语义审查，并使旧 revision-bound 结果失效。

━━━━━━━━━━━━━━━━━━
十三、建议状态数据、命名与最终化条件
━━━━━━━━━━━━━━━━━━

至少维护：

{
  "sessionSchemaVersion": "",
  "sessionId": "",
  "stage": "",
  "stageInstanceId": "",
  "contentBundleId": "",
  "contentBundleVersion": "",
  "contentBundleChecksum": "",
  "sessionConfiguration": {
    "requestedAgentMode": "mock"
  },
  "runtime": {
    "activeOperation": null,
    "lastError": null
  },
  "provenance": {
    "capabilityExecutionReceipts": []
  },
  "portraitPrelude": {
    "descriptors": {
      "early": [],
      "peak": [],
      "futureFacing": []
    },
    "initialPortraitChoice": null,
    "initialReason": "",
    "finalPortraitChoice": null,
    "finalReason": null,
    "portraitShiftSummary": null
  },
  "manuscript": {
    "preciseText": "",
    "preciseRevisionId": "",
    "plainText": null,
    "plainRevisionId": null,
    "revisionHistory": [],
    "pendingDiff": null
  },
  "rounds": {
    "round1": { "responseSubmitted": false, "clarificationCount": 0 },
    "round2": { "responseSubmitted": false, "clarificationCount": 0 },
    "round3": { "responseSubmitted": false, "clarificationCount": 0 }
  },
  "userPrinciples": [],
  "charliePositions": [],
  "openDissents": [],
  "evidenceUsed": [],
  "semanticDrift": {
    "preciseRevisionId": "",
    "plainRevisionId": "",
    "analysisVersion": "",
    "status": "current"
  },
  "semanticPlacementBatch": null,
  "semanticFragments": [],
  "bouquet": [],
  "currentCharlieSignatureStatus": "hidden",
  "currentCharlieSignatureReview": null,
  "signatureReviewAttemptState": null,
  "futureCharlieSignatureStatus": "blank",
  "finalDisposition": null,
  "finalEnvelope": null,
  "completedAt": null
}

必须区分：

- `InitialPortraitChoice`：只能是 early、peak、futureFacing；
- `FinalPortraitChoice`：可以是三个阶段之一、all_three 或 no_unique_answer；
- `SessionConfiguration.requestedAgentMode`：只能是 mock 或 live，表示 Session 请求的执行模式；不得用一个 Session 级 resolvedMode 概括混合执行，实际结果由逐能力 `CapabilityExecutionReceipt` 记录；
- `ActiveOperation`：至少包含 operationId、requestId、capability、stage、stageInstanceId、inputFingerprint、相关双 revision、attempt 和 status；它属于 runtime/application 状态，不进入最终语义快照，恢复时只能用于判断旧请求失效，不得恢复为仍在执行；
- `SemanticPlacementBatch`：至少包含 baselinePreciseRevisionId、baselinePlainRevisionId、workingPlainRevisionId、fragmentIds、decisions、已确认 restorationProposalIds 和 status；
- `CurrentCharlieSignatureStatus`：hidden、pending、signed、declined、unavailable、not_requested；
- `currentCharlieSignatureReview`：只保存从已验证 Final Review 结果投影得到的 `SignatureReviewSnapshot`，或明确的 unavailable 摘要；不得把供应商原始响应、Candidate 或完整服务错误对象写入 Domain；
- `signatureReviewAttemptState`：保存当前签名审阅 inputFingerprint、attemptCount、maxAttempts、lastRequestId 和 lastFailureCode，使手动重试限制可跨刷新验证；
- `FutureCharlieSignatureStatus`：只能是字面量 blank；
- `DocumentTarget`：precise_text、plain_text、margin_note；
- `SemanticFragmentPlacement`：restored_to_plain_text、saved_as_margin_note、placed_in_bouquet；
- `FinalDisposition`：future_reference、present_record、unfinished；
- `CapabilityExecutionReceipt`：至少包含 capability、operationId、requestId、requestedMode、resolvedMode、outcome、fallbackReason、promptVersion、adapterVersion、resultSchemaVersion、inputFingerprintDigest、startedAt 和 completedAt；resolvedMode 只能是 deterministic、live、mock、static_template 或 unavailable，outcome 只能是 succeeded、failed 或 skipped，同一 Session 可以混合；
- `ContentGateEvaluation`：本地确定性门禁结果，绑定 contentBundleId、contentBundleVersion、checksum、contentSchemaVersion 和目标环境，但不构成数字签名或防篡改证明；
- `ContentGateAttestation`：可选的服务端签名/MAC 证明，绑定 ContentGateEvaluation；只有完成服务端验证后才能称为 attested；
- `FinalEnvelopeAttestation`：可选的服务端签名/MAC 证明，至少绑定 finalEnvelopeId、integrityChecksum、contentBundleChecksum、finalEnvelopeSchemaVersion 和 executionReceiptsDigest；没有该证明时，integrityChecksum 只能用于损坏检测。

命名规范：

1. TypeScript 函数和 Agent 能力使用 camelCase；
2. 类型和 Schema 使用 PascalCase；
3. JSON 枚举值使用 snake_case；
4. FSM 状态和事件使用 UPPER_SNAKE_CASE；
5. Diff 状态统一为 proposed、accepted、rejected，不再使用 pending_confirmation 作为第二套状态名；
6. `pendingDiff` 只表示当前 Session 中尚待处理的 Diff 槽位。

`evaluateFinalization(state, context): FinalizationResult` 必须是唯一、可测试的最终化判定。`isFinalizable(state, context)` 如保留，只能是读取 `evaluateFinalization(...).eligible` 的薄封装，不得复制条件。

`FinalizationContext` 至少包含由内容加载器确定性生成的 `ContentGateEvaluation`；evaluation 必须绑定 contentBundleId、contentBundleVersion、checksum、contentSchemaVersion 和目标环境。它只表示当前运行时完成了规定校验，不是密码学证明。FinalizationContext 还必须包含 `requiresContentGateAttestation`；部署若要求服务端内容门禁证明，则必须额外提供并验证 `ContentGateAttestation`；未配置或未要求 attestation 不影响纯客户端 Mock 体验，但 UI 和封套不得将本地 evaluation 描述为“可信签名”。`FinalizationResult` 必须返回 eligible 或结构化 blockers，供 UI、FSM、测试和 Envelope Builder 共同使用。

至少要求：

1. 三轮全部完成；
2. preciseText、preciseRevisionId、plainText 和 plainRevisionId 均有效；
3. SemanticDrift 对应当前 preciseRevisionId 和 plainRevisionId，状态为 current；
4. 所有 SemanticFragment 已完成 placement，且不存在进行中或失效的 SemanticPlacementBatch；
5. pendingDiff 为 null；
6. runtime.activeOperation 为 null；
7. finalPortraitChoice 非空；
8. currentCharlieSignatureStatus 为 signed、declined、unavailable 或 not_requested；
9. futureCharlieSignatureStatus 为 blank；
10. finalDisposition 非空；
11. ContentGateEvaluation 与 Session 中的内容包和目标环境完全匹配且状态为 passed；若 `FinalizationContext.requiresContentGateAttestation=true`，还必须存在通过服务端公钥或共享密钥验证的 ContentGateAttestation。

`openDissents` 可以非空；保留分歧不阻止最终化。`finalDisposition=unfinished` 也可以进入 COMPLETE，因为 COMPLETE 表示体验和快照完成，不表示手稿在语义上达成一致。

在 `SemanticPlacementBatch` 之外，任何 preciseRevisionId 或 plainRevisionId 变化后，旧 SemanticDrift 必须标记为 stale。批次内的 `restored_to_plain_text` 只能应用用户已确认且仍匹配 anchor/hash 的 SemanticRestorationProposal，并可以更新 workingPlainRevisionId；原 SemanticDrift 只能作为该批次决策的 baseline，不能继续被标记为 current。批次结束后的单次 consistency check 必须生成绑定最终双 revision 的新 SemanticDrift=current。

你可以调整技术结构，但不得改变产品语义。

━━━━━━━━━━━━━━━━━━
十四、工作方式
━━━━━━━━━━━━━━━━━━

必须按阶段工作，不得一次完成整个项目。

每一阶段开始时：

1. 检查当前仓库；
2. 说明本阶段目标；
3. 列出计划修改文件；
4. 说明数据接口影响；
5. 说明测试方案；
6. Contract、依赖、核心状态、目录移动或大规模修改必须等待我确认；已批准 Issue 范围内的普通实现可以连续完成，不必为每个小改动重复等待。

每一阶段结束时：

1. 总结完成内容；
2. 列出修改文件；
3. 说明关键设计决策；
4. 列出实际执行的命令；
5. 报告实际测试结果；
6. 说明已知限制；
7. 给出人工验证步骤；
8. 不自动开始下一阶段。

不得宣称未执行的测试通过。

现在不要写代码，不要创建文件，也不要自行决定技术栈。

在收到本总控 Prompt 后的首次响应中，请只输出：

1. 对项目目标的简要复述；
2. 十条最重要的不可违反约束；
3. 推荐开发阶段顺序；
4. 开始阶段 0 前必须由我回答的阻塞问题，最多三个。

产品范围、内容限制、禁止事项和技术原则在后续阶段持续有效；后续输出格式以当前阶段 Prompt 为准。
```

---

## 四、分阶段 Codex Prompt

### 阶段 0：仓库审计、部署能力矩阵与最小技术方案

```text
现在执行阶段 0：仓库审计、部署能力矩阵与最小技术方案。

本阶段的目标是基于当前仓库、预期部署平台和浏览器运行环境的真实能力，确定后续开发路径，并识别阶段 1 开始前必须冻结的契约边界。本阶段只允许进行只读检查和技术规划，不得修改项目。

一、操作边界

本阶段不得：

1. 创建、修改、移动或删除任何文件；
2. 安装、删除或升级依赖；
3. 修改 lockfile、配置文件或环境变量文件；
4. 初始化脚手架、数据库、KV、外部服务或部署项目；
5. 执行 formatter、migration、代码生成或会重写文件的命令；
6. 执行可能生成构建产物、缓存、覆盖率文件或测试快照的命令；
7. 清理、重置、stash 或覆盖当前 Git 工作区；
8. 提交代码或切换、创建分支；
9. 发送真实模型请求、写入远程存储或触发真实部署；
10. 为验证猜测而临时修改配置。

如某项检查可能产生文件、远程副作用或费用，请不要执行，只说明建议命令、预期证据和风险。

二、仓库审计

请检查并报告：

1. 当前工作目录、Git 仓库状态、当前分支和 HEAD commit；
2. 是否存在未提交修改、未跟踪文件、submodule 或生成文件；
3. 顶层目录、主要源码目录和文档目录；
4. 应用入口、路由结构和页面边界；
5. 已有技术栈及其版本依据；
6. 包管理器、lockfile 和 workspace/monorepo 配置；
7. 构建、开发、类型检查、lint、测试和部署脚本；
8. 前端框架、样式方案和组件系统；
9. 状态管理方式及其持久化边界；
10. API、服务端函数、server action、edge function 或后端结构；
11. 已有 LLM、Agent、AI SDK 或第三方模型接口；
12. Schema、类型系统、序列化和运行时数据校验方式；
13. 单元测试、组件测试、契约测试和端到端测试配置；
14. 环境变量、密钥、客户端公开变量和服务端秘密的管理方式；
15. 日志、错误追踪、analytics、脱敏和降级机制；
16. 部署配置、目标运行时和静态托管限制；
17. 内容、图片和其他静态资源的存放、构建和缓存方式；
18. 与本项目需求可能冲突的已有实现；
19. 是否已有 Scope Freeze、Domain、Agent、Final Review、FSM、Finalization、Runtime 或命名 Contract，以及它们是否存在重复定义；
20. 是否已有 schema migration、内容包版本、快照版本或恢复机制；
21. 是否已有 IndexedDB、localStorage、Web Locks、BroadcastChannel 或其他浏览器持久化/并发代码；
22. 是否已有请求幂等、重试、取消、AbortSignal、requestId 或迟到响应处理；
23. 是否已有 CSP、安全响应头、请求体大小、速率和并发限制；
24. 是否已有服务端签名、MAC、KV、数据库或平台原生 idempotency 支持。

每项重要判断都必须提供对应的文件路径、配置项或命令输出依据，并标记为：

- CONFIRMED：有明确仓库或平台证据；
- INFERRED：根据现有文件推断；
- UNKNOWN：仓库和已提供平台信息中无法确认。

不得把推断写成已确认事实。没有提供部署平台账号、控制台或外部配置时，相关能力必须标记为 UNKNOWN，不得根据框架默认能力代替真实部署能力。

三、仓库成熟度判断

将当前仓库判断为以下一种状态，并说明依据：

1. EMPTY：没有有效应用入口、包清单或可复用源代码；
2. PROTOTYPE：存在可运行或可展示内容，但缺少完整状态约束、测试、错误处理、部署或工程边界；
3. ESTABLISHED：已有明确应用结构、构建流程、测试、环境配置和部署路径，可以增量开发。

成熟度判断只描述当前工程基础，不代表产品契约已冻结。即使仓库为 ESTABLISHED，只要状态、Agent、Final Review 或最终化仍有多套定义，阶段 1 仍必须先完成契约收敛。

四、现有资产处理建议

列出相关模块并标记：KEEP、EXTEND、ADAPT、REPLACE、DEFER 或 UNKNOWN。

至少覆盖：

- 页面与路由；
- UI 组件；
- 状态管理；
- API/服务端函数；
- LLM 接口；
- 内容加载方式；
- Domain/Schema；
- FSM；
- 持久化；
- 日志与 analytics；
- 测试；
- 部署配置；
- 安全响应头与请求限制。

每个 REPLACE 建议必须说明：现有实现为什么无法通过适配满足 Contract、替换风险、迁移方式和回滚方式。

五、部署与运行能力矩阵

必须单独输出部署能力矩阵，至少检查：

1. 是否支持纯静态部署；
2. 是否支持 Node、serverless、edge 或其他服务端运行时；
3. 是否存在 build-time hook；
4. 是否存在 server-start hook；若不存在，production 内容门禁应如何改为 build-time 或首请求门禁；
5. 是否支持服务端环境变量和密钥隔离；
6. 是否支持 API 请求体大小、速率和并发限制；
7. 是否支持 CSP 和基础安全响应头；
8. 是否支持持久 KV、数据库或供应商原生 idempotency key；
9. 是否支持保存和轮换 attestation 私钥；
10. 是否支持请求超时、取消和流式响应；
11. 目标浏览器是否支持 IndexedDB、Web Locks 和 BroadcastChannel；
12. 不支持 Web Locks 时是否可以实现 ownerToken + expectedRevision 乐观冲突检测；
13. 是否支持离线或无网络 Mock 路径；
14. 真实模型供应商是否提供数据保留、训练使用和日志关闭设置。

每项能力标记为 SUPPORTED、PARTIAL、UNSUPPORTED 或 UNKNOWN，并说明对架构和发布档位的影响。

六、Contract 拓扑与依赖边界

请检查并提出正式 Contract 拆分建议，至少区分：

- `/docs/scope-freeze.md`：产品范围、禁止事项和体验语义；
- Domain Contract：纯领域实体、不变量和 reducer 可接受的数据；
- Runtime Contract：ActiveOperation、RequestContext、重试、取消、指纹和运行元数据；
- Provenance Contract：CapabilityExecutionReceipt、执行来源和版本向量；
- Agent Tool Contract：九项逻辑能力的 Candidate/Validated Result；
- Final Review Contract：签名审阅输入、Candidate、Result、Error 和 Service；
- State Machine Contract：阶段、事件、Guard、原子提交和恢复；
- Finalization Contract：唯一最终化条件、blockers 和 Envelope Builder 边界；
- Naming Contract：枚举、版本字段、文件和事件命名。

必须识别：

1. Domain 是否引用了 Adapter、模型供应商或 FinalReviewService 类型；
2. FSM 是否解析供应商原始响应；
3. Adapter 是否直接修改 SessionState 或发送跳转；
4. 同一枚举、状态、版本字段或最终化条件是否存在多套定义；
5. `schemaVersion` 是否被多个不同层级复用而无法判断归属；
6. `RETURN_TO_MANUSCRIPT_REVIEW` 是否存在真实可编辑状态；
7. `START_NEW_SESSION` 是否被错误建模为 terminal Session 内事件；
8. Round 与 Plain/Semantic 结果是否存在半提交风险。

七、最小可行架构

架构必须支持：

- 确定性 Mock Agent；
- 显式有限状态机；
- 静态人工核验内容白名单；
- 三幅场景肖像图序章；
- 双栏 Canvas；
- 局部 Diff 确认；
- 精确版本与朴素版本；
- 语义偏移、语义碎片和语义花束；
- `MANUSCRIPT_REVISION` 可编辑返回路径；
- Round Analysis 完整 Bundle 原子提交；
- Plain Rewrite 与 Semantic Review 的原子业务提交边界；
- 肖像重新拼合；
- 最终封套；
- LLM Adapter；
- 普通 LLM 辅助能力失败时的 Mock 回退；live 签名审阅失败时进入 unavailable，不得以 Mock 生成角色决定；
- 逐能力 execution receipt，能够准确记录 deterministic、live、mock、static_template 或 unavailable；
- 自动化测试；
- 基础可访问性；
- 无服务端数据库也可以完成核心体验；
- 图片或模型失败时主流程仍可完成；
- 状态转移幂等和迟到结果拒绝；
- 可选的服务端 attestation 与服务端幂等增强，但不得将其伪装成纯客户端已有保证。

优先沿用现有技术栈。每个新增依赖必须说明必要性、成本、维护风险和无依赖替代方案。

请给出推荐方案、一个合理备选方案，以及推荐方案优于备选方案的原因。

不得无必要引入数据库、向量数据库、多 Agent 框架、复杂工作流平台、微服务、消息队列、实时协同系统或自定义认证系统。

八、幂等与一致性保证边界

必须明确区分：

1. 状态转移幂等：相同已验证事件只能对 SessionState 生效一次；这是客户端/FSM/持久化层必须保证的要求；
2. 结果提交幂等：重复、迟到、取消或不匹配的结果不得重复写入状态；这是必须保证的要求；
3. 供应商调用 exactly-once：没有持久服务端 idempotency store 或供应商原生幂等能力时不保证；
4. 请求重试：可能产生重复供应商调用，但不得产生重复业务提交；
5. `idempotency_conflict`：只有存在可验证的 requestId→inputFingerprint 记录时才能跨进程可靠判断；纯客户端或无状态服务只能保证当前 Session/当前存储范围内的冲突检测。

不得把“不会重复修改 SessionState”描述为“模型供应商只被调用一次”。

九、目录建议

优先提出最小增量调整。只有仓库为空时，才提出完整新目录。

标明现有目录、建议新增目录、建议新增文件、职责和依赖方向。若建议新增 `runtime-contract.md` 或 provenance 文件，必须说明它与 Domain、Agent 和 FSM 的依赖方向。

十、状态、持久化与恢复建议

说明：

1. SessionState 存放位置；
2. 刷新恢复方式；
3. 无服务端数据库时的本地持久化范围；
4. 允许保存到浏览器的数据；
5. 不得持久化的数据；
6. IndexedDB transaction 的提交和失败回滚；
7. 页面刷新后旧 ActiveOperation 为什么必须失效；
8. stageInstanceId 如何重新生成；
9. Web Locks 与 fallback 冲突路径；
10. 最终封套如何从结构化状态确定性生成；
11. `START_NEW_SESSION` 为什么属于应用级命令而不是 COMPLETE Session 的领域修改；
12. COMPLETE 快照和进行中 Session 的不同恢复策略；
13. 签名审阅尝试次数如何跨刷新保留；
14. 最终化检查与 FINALIZING operation 的先后顺序。

十一、风险清单

至少检查：

- 未经核验内容；
- 原创内容误标；
- LLM 控制跳转；
- 输出绕过 Schema；
- 未确认 Diff；
- 缺少可编辑的手稿返回状态；
- Round 或 Plain/Semantic 半提交；
- deterministic 能力无法准确记录 resolvedMode；
- 单一 schemaVersion 混用；
- 幂等能力被过度承诺；
- 密钥泄露；
- 模型或图片失败；
- 状态丢失；
- IndexedDB 半写入或 quota；
- 跨标签页覆盖；
- 静态部署不支持 server-start 门禁；
- 部署运行时冲突；
- 新增依赖集成风险。

每项风险给出等级、证据、缓解方式、责任 Contract 和处理阶段。

十二、阶段依赖与下一步

重点说明阶段 1 的输入条件、预计修改文件、必须冻结的架构决定、可延后决定、可并行工作和不能并行修改的核心文件。

阶段 1 开始前至少要明确：

1. Domain、Runtime、Provenance、Agent、Final Review、FSM 和 Finalization 的依赖方向；
2. `MANUSCRIPT_REVISION` 的编辑目标和返回路径；
3. `ResolvedExecutionMode` 是否包含 deterministic；
4. `PortraitShiftComparison` 如何表达 no_unique_answer；
5. 最终化检查与 FINALIZING operation 的顺序；
6. 状态转移幂等与供应商 exactly-once 的保证边界；
7. 版本字段命名策略；
8. 部署平台是否支持 server-start、服务端秘密、可选 KV 和 attestation。

十三、阻塞问题

列出零到三个真正阻止阶段 1 开始的问题。每个问题说明阻塞原因、缺少信息、默认假设和风险。

只有以下情况应列为阻塞：不同选择会改变核心 Contract、数据迁移或部署可行性。可以使用安全默认值继续的事项不得伪装成阻塞。

十四、输出格式

1. 执行过的只读检查；
2. 仓库状态摘要；
3. 审计证据表；
4. 仓库成熟度判断；
5. 可复用资产与冲突矩阵；
6. 部署与运行能力矩阵；
7. Contract 拓扑和依赖图；
8. 推荐最小架构；
9. 备选架构及取舍；
10. 幂等与一致性保证边界；
11. 增量目录建议；
12. 状态、持久化和恢复方案；
13. 风险清单；
14. 阶段依赖关系；
15. 阶段 1 的输入条件；
16. 零到三个阻塞问题；
17. 本阶段未执行的操作。

不得修改文件，不得宣称检查过未读取的文件或运行过未执行的命令，不得开始阶段 1。
```

### 阶段 1：领域模型、运行时基础、Provenance 与最终化契约

```text
现在执行阶段 1：建立领域模型、运行时基础、执行 provenance 与最终化契约。

本阶段只冻结纯领域语义、跨层运行元数据、状态阶段标识、版本命名和最终化基础。不实现真实 Agent Adapter、模型 Prompt、完整 Candidate/Validated Bundle 或 FinalReviewService；这些服务层契约在阶段 3 基于本阶段的基础类型继续冻结。

一、开始修改前

开始修改前，先列出：

1. 计划创建和修改的文件；
2. Domain、Runtime、Provenance、FSM、Agent、Final Review 和 Finalization 的依赖方向；
3. 状态模型和新增 `MANUSCRIPT_REVISION` 路径；
4. 运行时 Schema 方案；
5. 版本字段和命名规范；
6. `evaluateFinalization`、`FinalizationContext`、`ContentGateEvaluation`、可选 `ContentGateAttestation` 与 blockers 定义；
7. 状态转移幂等与供应商调用幂等的保证边界；
8. 向后兼容、状态迁移或拒绝恢复方案；
9. 稳定文本 anchor 的字符索引、Unicode normalization 和 hash 规则；
10. 测试方案。

涉及 Contract、依赖、核心状态、版本字段或目录移动时，等待我确认后再修改。

二、Contract 文件和依赖方向

本阶段至少建立或更新：

- `/docs/domain-contract.md`；
- `/docs/runtime-contract.md`；
- `/docs/naming-contract.md`；
- `/docs/finalization-contract.md`；
- `/docs/state-machine-draft.md` 中的阶段标识、kind 和关键返回路径；
- 对应的 TypeScript 类型、运行时 Schema 和契约测试。

依赖方向必须满足：

```text
Scope Freeze
  ↓
Domain Contract
  ↓
Runtime / Provenance 基础类型
  ↓
Application / FSM / Agent / Final Review
```

- Domain 不得依赖模型 SDK、Adapter、供应商响应、FinalReviewService 或 UI；
- Runtime Contract 只定义 operation、request、重试、指纹、版本和执行来源，不包含角色语义；
- Agent 和 Final Review 可以依赖 Domain/Runtime 基础类型，Domain 不得反向依赖它们；
- FSM 只接收已验证的领域/应用事件，不解析供应商原始响应；
- Adapter 不得直接修改 SessionState。

三、本阶段必须定义的 Domain 类型

至少定义：

- SessionState
- ExperienceStage
- StageKind
- CharlieStage
- PortraitPrelude
- InitialPortraitChoice
- FinalPortraitChoice
- PortraitDescriptor
- PortraitShiftComparison
- ManuscriptState
- ManuscriptRevisionIntent
- RevisionEntry
- DocumentDiff
- DiffProposalResult
- DocumentTarget
- EvidenceCard
- VerifiedFact
- CuratorialInterpretation
- OriginalInteraction
- UserPrinciple
- CharliePosition
- CharlieResponse
- DissentRecord
- SemanticDrift
- SemanticFragment
- SemanticFragmentPlacement
- SemanticPlacementBatch
- StableTextAnchor
- SemanticRestorationProposal
- BouquetEntry
- CurrentCharlieSignatureStatus
- SignatureReviewSnapshot
- SignatureReviewAttemptState
- FutureCharlieSignatureStatus
- FinalDisposition
- FinalEnvelope
- InitialPortraitRecord

`SignatureReviewSnapshot` 只是保存在领域状态中的已验证结果投影或 unavailable 摘要，不等同于阶段 3 的 `CharlieSignatureReviewResult` 服务 Contract。Domain 不得保存供应商原始响应或完整服务错误对象。

四、本阶段必须定义的 Runtime 与 Provenance 类型

至少定义：

- SessionConfiguration
- AgentMode
- ResolvedExecutionMode
- ExecutionOutcome
- CapabilityExecutionReceipt
- ActiveOperation
- RequestContext
- OperationResultGuardInput
- StateTransitionIdempotencyRecord
- ContractVersionVector
- Clock
- IdGenerator

冻结：

```text
AgentMode = mock | live

ResolvedExecutionMode =
  deterministic | live | mock | static_template | unavailable

ExecutionOutcome =
  succeeded | failed | skipped
```

规则：

1. `deterministic` 用于本地纯领域函数、静态白名单读取和不经过模型的确定性服务；
2. `unavailable` 表示该能力未能产生可用结果来源，不等同于角色拒绝或业务判断；
3. `ExecutionOutcome` 与 `resolvedMode` 分离，避免用 unavailable 同时表示所有失败和跳过；
4. 同一 Session 可以混合 deterministic、live、mock、static_template 与 unavailable；
5. FinalEnvelope 不得生成单一 Session 级 resolvedMode；
6. 每个逻辑能力必须有独立 receipt，即使多个能力共享一次供应商请求；
7. receipt 至少包含 capability、operationId、requestId、requestedMode、resolvedMode、outcome、fallbackReason、promptVersion、adapterVersion、resultSchemaVersion、inputFingerprintDigest、startedAt、completedAt；
8. tokenUsage、modelName、provider、durationMs 和 resultDigest 可以作为可选字段，但存在时必须由运行时记录，不得由模型自报。

五、本阶段明确不定义的服务层类型

以下完整 Contract 延后到阶段 3：

- RoundAnalysisCandidateBundle
- ValidatedRoundAnalysisBundle
- PlainSemanticReviewCandidateBundle
- ValidatedPlainSemanticBundle
- 各 Agent 能力的 Candidate 与 Validated Result
- CharlieSignatureReviewInput
- CharlieSignatureReviewCandidate
- CharlieSignatureReviewResult
- CharlieSignatureReviewError
- FinalReviewService

本阶段可以为它们保留模块路径和依赖方向，但不得把这些服务层类型放进 `/src/domain`，也不得为了提前通过编译而定义临时 payload。

阶段 3 必须继承以下原子提交要求：

- RoundAnalysis 只有完整 `ValidatedRoundAnalysisBundle` 可以提交给 FSM；
- Plain Rewrite 与首次 Semantic Review 必须形成一个完整 `ValidatedPlainSemanticBundle` 或等价的单一原子业务结果；
- FSM 不得观察到只有 plainRevision、但没有绑定该 revision 的 SemanticDrift 的中间业务状态。

六、PortraitShiftComparison

必须冻结为能正确表达 `no_unique_answer` 的判别联合：

```ts
type PortraitShiftComparison =
  | {
      comparisonKind: "comparable";
      initialChoice: InitialPortraitChoice;
      finalChoice: Exclude<FinalPortraitChoice, "no_unique_answer">;
      initialIncludedStages: CharlieStage[];
      finalIncludedStages: CharlieStage[];
      changed: boolean;
      newlyIncludedStages: CharlieStage[];
      excludedStages: CharlieStage[];
      relatedEvidenceIds: string[];
      relatedRevisionIds: string[];
    }
  | {
      comparisonKind: "no_unique_answer";
      initialChoice: InitialPortraitChoice;
      finalChoice: "no_unique_answer";
      initialIncludedStages: CharlieStage[];
      finalIncludedStages: null;
      changed: true;
      newlyIncludedStages: [];
      excludedStages: [];
      relatedEvidenceIds: string[];
      relatedRevisionIds: string[];
    };
```

```text
computePortraitShift(...): PortraitShiftComparison
```

`computePortraitShift` 必须完全确定性。`summarizePortraitShift` 只能读取该结构，不得把 `no_unique_answer` 重新解释成某个阶段集合，也不得自行重新计算或修改事实。

七、阶段标识

阶段至少包括：

- WELCOME
- PORTRAIT_PRELUDE
- PORTRAIT_CHOICE
- ROUND_1_PAST_SELF
- ROUND_1_DIFF
- ROUND_2_FORECAST
- ROUND_2_DIFF
- ROUND_3_RELATIONSHIP
- ROUND_3_DIFF
- MANUSCRIPT_REVISION
- PLAIN_REWRITE
- SEMANTIC_REVIEW
- SEMANTIC_PLACEMENT
- PORTRAIT_REASSEMBLY
- FINAL_SIGNATURE
- FINAL_DISPOSITION
- FINALIZING
- COMPLETE

每个阶段必须标记：

- kind：user_interactive、system_transient 或 terminal；
- entryAction；
- allowedEvents；
- successTarget；
- failureTarget；
- timeoutPolicy；
- refreshPolicy。

至少冻结：

- `MANUSCRIPT_REVISION.kind=user_interactive`；
- `PLAIN_REWRITE`、`SEMANTIC_REVIEW`、`FINALIZING` 为 system_transient；
- `COMPLETE` 为 terminal；
- `START_NEW_SESSION` 是应用级命令，不是修改 COMPLETE Session 的领域事件。

八、返回修改手稿路径

冻结以下路径：

```text
FINAL_SIGNATURE
→ RETURN_TO_MANUSCRIPT_REVIEW
→ MANUSCRIPT_REVISION
→ SUBMIT_MANUSCRIPT_REVISION
→ PLAIN_REWRITE
→ SEMANTIC_REVIEW
→ SEMANTIC_PLACEMENT（如存在碎片）
→ FINAL_SIGNATURE
```

规则：

1. FINAL_SIGNATURE 保持只读；
2. RETURN_TO_MANUSCRIPT_REVIEW 必须清除或失效旧 `SignatureReviewSnapshot` 和签名状态；
3. MANUSCRIPT_REVISION 只允许用户授权修改 `precise_text`；
4. plainText 不允许在该阶段直接编辑，只能由 PLAIN_REWRITE 重新生成，或在 SEMANTIC_PLACEMENT 中通过已确认 `SemanticRestorationProposal` 修改；
5. 提交实际修改后生成新的 preciseRevisionId；
6. 旧 plainRevisionId、SemanticDrift、SemanticPlacementBatch、语义摘要和其他 revision-bound 输出必须标记 stale 或清除；
7. 没有产生实际文本变化时不得创建空 RevisionEntry；用户可以取消返回并回到 FINAL_SIGNATURE，但旧签名审阅只有在未被清除且绑定仍有效时才可继续使用；
8. 从修改路径返回 FINAL_SIGNATURE 前必须重新生成 plainText、重新完成语义审查和所有必要 placement；
9. `returnTarget` 如保留，必须是正式类型字段并只用于导航恢复，不得替代状态转移 Guard。

九、版本字段

禁止继续使用无法判断归属的单一 `schemaVersion` 代表所有层。

至少定义：

```ts
type ContractVersionVector = {
  sessionSchemaVersion: string;
  contentSchemaVersion: string;
  agentContractVersion: string;
  finalReviewSchemaVersion: string;
  finalEnvelopeSchemaVersion: string;
};
```

规则：

1. SessionState 使用 `sessionSchemaVersion`；
2. 内容包使用 `contentBundleVersion` 和 `contentSchemaVersion`；
3. Agent Candidate/Validated Result 使用 `agentContractVersion` 和其具体 result schema version；
4. 签名审阅使用 `finalReviewSchemaVersion`；
5. FinalEnvelope 使用 `finalEnvelopeSchemaVersion`；
6. CapabilityExecutionReceipt 使用 `resultSchemaVersion`，并可同时记录对应 contract version；
7. 恢复、迁移、拒绝恢复和只读兼容必须明确比较哪一个版本字段；
8. 后续阶段 Prompt 中仍存在的泛化 `schemaVersion` 在执行前必须映射到该向量中的具体字段，不得新增新的歧义字段。

十、稳定文本 Anchor

`StableTextAnchor` 必须冻结：

- revisionId；
- start/end 的字符索引模型；
- selectedText 或 oldText；
- selectedTextHash/oldTextHash；
- prefix/suffix context 或其 hash；
- Unicode normalization 规则；
- hash 输入编码；
- anchorVersion。

字符索引模型必须根据阶段 0 确认的运行栈明确写入 Contract。TypeScript/浏览器实现如采用 UTF-16 code unit offset，必须在类型名、文档和测试中明确，不得称为通用“字符数”。hash 前是否执行 NFC normalization 必须固定。前端显示层可以按 grapheme cluster 处理光标和截断，但持久化 anchor 不得混用不同索引模型。

十一、签名审阅尝试状态

定义：

```ts
type SignatureReviewAttemptState = {
  inputFingerprint: string;
  attemptCount: number;
  maxAttempts: number;
  lastRequestId: string | null;
  lastFailureCode: string | null;
};
```

规则：

1. mock 与 live 的尝试状态分别按当前 inputFingerprint 计算；
2. live 首次技术失败后最多允许一次手动重试；
3. 双 revision、内容包或 finalReviewSchemaVersion 变化后必须生成新的 inputFingerprint 和新的尝试状态；
4. 页面刷新后 attemptCount 必须可恢复；
5. ActiveOperation.attempt 只描述当前运行操作，不替代持久化的业务重试次数；
6. unavailable、not_requested 和 declined 必须保持不同语义。

十二、类型和不变量

至少冻结：

1. InitialPortraitChoice 只能是 early、peak、futureFacing；
2. FinalPortraitChoice 可以是上述三个阶段之一、all_three 或 no_unique_answer；
3. CurrentCharlieSignatureStatus 只能是 hidden、pending、signed、declined、unavailable、not_requested；
4. FutureCharlieSignatureStatus 只能是字面量 blank；
5. ContentItem 使用 contentType 判别联合，三类内容不可混淆；
6. ManuscriptState 必须分别维护 preciseRevisionId 和 plainRevisionId；
7. DocumentDiff 必须是以 operation 判别的 insert、replace、delete、annotate 联合；
8. DocumentDiff 共享字段至少包含 id、baseRevisionId、documentTarget、targetAnchor、reason、evidenceIds、principleIds、status、createdAt 和 confirmedAt；不同 operation 只能携带其合法字段；
9. baseRevisionId、anchor 和 oldText/hash 不匹配时不得应用；
10. DocumentTarget 只能是 precise_text、plain_text、margin_note；insert/replace/delete 只允许正文目标，annotate 可以针对正文或 margin_note，具体矩阵必须写入 Contract 和测试；
11. Diff status 只能是 proposed、accepted、rejected；
12. 拒绝的提案进入提案审计记录，但不得伪装成正文 RevisionEntry；
13. DiffProposalResult 必须是 `{ kind: "diff", diff: DocumentDiff }` 或 `{ kind: "no_change", reason: string }`；no_change 不得伪装成空 Diff；
14. SemanticDrift 必须记录 preciseRevisionId、plainRevisionId、analysisVersion 和 status；status 至少区分 current、stale、placement_in_progress；
15. SemanticPlacementBatch 必须冻结 baseline 双 revision，并维护 workingPlainRevisionId、逐项决策、已确认 restorationProposalIds 和 in_progress/checking_consistency/completed/invalidated 状态；
16. 每个 restored_to_plain_text 决策必须引用仍与 anchor/hash/proposalHash 匹配的 SemanticRestorationProposal；
17. SemanticFragmentPlacement 只能是 restored_to_plain_text、saved_as_margin_note、placed_in_bouquet；
18. FinalDisposition 只能是 future_reference、present_record、unfinished；
19. FinalEnvelope 是生成时的只读快照；
20. 语义确定性业务函数不得直接读取当前时间或生成随机 ID，必须通过 Clock 和 IdGenerator 注入；
21. RequestContext 只传递运行元数据，不得影响相同业务输入的语义结果；
22. 所有异步结果必须匹配 ActiveOperation 的 operationId、requestId、stageInstanceId、inputFingerprint、capability 和相关 revision；
23. 页面刷新后旧 ActiveOperation 不得恢复为仍在执行；
24. `ContentGateEvaluation` 和 `integrityChecksum` 不构成防篡改证明；
25. 只有验证成功的服务端 ContentGateAttestation 或 FinalEnvelopeAttestation 可以将绑定对象标记为 attested；
26. 同一 Session 的逐能力 receipts 可以混合多种 resolvedMode；
27. Domain reducer 不得接收供应商原始响应或未验证 Candidate；
28. START_NEW_SESSION 必须创建新 sessionId，不得修改旧 COMPLETE 快照。

十三、最终化顺序和唯一判定

`evaluateFinalization(state, context): FinalizationResult` 必须是唯一、可测试的最终化判定。`isFinalizable(state, context)` 如保留，只能读取 `evaluateFinalization(...).eligible`，不得复制条件。

必须冻结调用顺序：

```text
CHOOSE_DISPOSITION 完成
→ 确认 runtime.activeOperation=null
→ evaluateFinalization(state, context)
→ eligible=false：停留并展示结构化 blockers
→ eligible=true：进入 FINALIZING
→ 创建 finalization ActiveOperation
→ 构建和持久化 FinalEnvelope
→ 清除 ActiveOperation
→ COMPLETE
```

规则：

1. 不得先创建 finalization ActiveOperation 再调用会要求 activeOperation=null 的 evaluateFinalization；
2. FINALIZING 内部失败不得生成部分 COMPLETE 快照；
3. FinalEnvelope 构建和持久化必须作为一个可回滚的业务提交边界；
4. 持久化失败时保持未完成状态，提供重试或安全导出，不得声称 COMPLETE；
5. Envelope Builder、FSM、UI 和测试必须消费同一个 FinalizationResult；
6. COMPLETE 后 Session 不可编辑；
7. START_NEW_SESSION 由应用层创建新 Session，不是对 COMPLETE 的 mutation。

十四、幂等保证

必须定义并测试：

1. 相同已完成 Diff、placement、签名继续或 finalization 事件不能重复生效；
2. operationId/requestId/inputFingerprint/stageInstanceId/revision 不匹配的结果必须丢弃；
3. 相同事件重复到达时 reducer 结果稳定；
4. IndexedDB transaction 中止不能产生半状态；
5. `StateTransitionIdempotencyRecord` 的保存范围和清理策略；
6. 相同 requestId 配不同 inputFingerprint 在已有可验证记录范围内返回 idempotency_conflict；
7. 无持久服务端存储时，不得承诺跨实例的供应商调用 exactly-once；
8. 网络重试可以重复调用供应商，但不得重复提交业务结果或重复收费声明为“已避免”。

十五、测试必须验证

至少验证：

1. futureCharlieSignatureStatus 不能变为 signed；
2. 未确认 Diff 不得写入正文；
3. 已接受或拒绝的 Diff 不能再次处理；
4. baseRevisionId 不匹配的 Diff 不能应用；
5. preciseRevisionId 和 plainRevisionId 不得混用；
6. 批次之外任一文本 revision 变化后旧 SemanticDrift 变为 stale；
7. placement batch 内回填不会中断剩余决策，但结束后必须生成绑定最终双 revision 的新 current SemanticDrift；
8. restored_to_plain_text 只能修改朴素版本，且只能应用用户已确认并仍匹配 anchor/hash/proposalHash 的 SemanticRestorationProposal；
9. 初始肖像不能选择 all_three 或 no_unique_answer；
10. `no_unique_answer` 生成 comparisonKind=no_unique_answer，finalIncludedStages=null，且不伪造 newlyIncludedStages/excludedStages；
11. finalReason 可以为空且不阻塞最终化；
12. 未处理完的语义碎片不能进入最终化；
13. 有 pending Diff 时不能生成最终封套；
14. openDissents 非空不阻止最终化；
15. finalDisposition=unfinished 仍可完成体验；
16. 最终封套只能从 evaluateFinalization(...).eligible=true 的状态生成；
17. evaluateFinalization 在创建 finalization ActiveOperation 前执行；
18. FINALIZING 失败不会生成 COMPLETE 或部分最终快照；
19. COMPLETE 后 Session 快照不能继续修改；
20. START_NEW_SESSION 创建新的 sessionId 且不修改旧 COMPLETE 快照；
21. 内容三分类不能混淆；
22. 旧 sessionSchemaVersion 能迁移或被明确拒绝恢复；
23. 固定 Clock 和 IdGenerator 时，相同输入产生相同业务结果；
24. deterministic 领域能力生成 resolvedMode=deterministic 的 receipt；
25. execution outcome 与 resolvedMode 分离；
26. 同一 Session 的 receipts 可以混合 deterministic、live、mock、static_template 和 unavailable；
27. FinalEnvelope 不得伪造单一 Session resolvedMode；
28. SignatureReviewAttemptState 在刷新后保留 attemptCount；
29. 双 revision、内容包或 finalReviewSchemaVersion 变化后签名尝试状态重置；
30. unavailable、not_requested 和 declined 不可互相替代；
31. FINAL_SIGNATURE 内不能修改正文；
32. RETURN_TO_MANUSCRIPT_REVIEW 进入 MANUSCRIPT_REVISION，而不是直接进入 system_transient 的 SEMANTIC_REVIEW；
33. MANUSCRIPT_REVISION 只修改 precise_text；
34. 实际 precise revision 变化后旧 plain revision 和 revision-bound 结果失效；
35. 没有实际文本变化时不创建空 RevisionEntry；
36. StableTextAnchor 对约定字符索引、Unicode normalization 和 hash 规则稳定；
37. 旧 requestId、旧 stageInstanceId、旧 revision、重复完成或已取消结果不能写入当前状态；
38. 相同事件重复到达只能生效一次；
39. 相同 requestId 与不同 inputFingerprint 只在存在可验证记录时返回 idempotency_conflict；
40. 纯客户端或无状态服务测试不得宣称供应商调用 exactly-once；
41. ContentGateEvaluation 与 integrityChecksum 不会被展示为可信签名；
42. ContractVersionVector 各字段不会被单一 schemaVersion 覆盖或混用；
43. Domain 编译依赖中不包含模型 SDK、Agent Adapter 或 FinalReviewService；
44. FSM 和 Domain reducer 不接受未验证 Candidate 或供应商原始响应；
45. Plain/Semantic 原子业务结果的接口位置已预留，且不得定义两个可形成半状态的独立提交入口。

十六、完成条件

完成后必须：

1. 运行类型检查和本阶段契约测试；
2. 输出实际执行的命令和测试结果；
3. 列出新增或修改的 Contract 版本；
4. 列出迁移、拒绝恢复和只读兼容影响；
5. 确认阶段 3 不需要反向修改 Domain 才能定义 Agent/Final Review Contract；
6. 不进入阶段 2 或阶段 3。
```

### 阶段 2：内容白名单、占位证据与生产门禁

```text
现在执行阶段 2：建立原著版本模板、事实白名单、占位证据卡和 production 内容门禁。

阶段 0、1 已经执行完成。本阶段必须继承阶段 0 已确认的部署能力矩阵和阶段 1 已冻结的 Domain、Runtime、Provenance 与 Finalization 基础契约，不得为了实现内容层反向修改阶段 0、1 已冻结内容。

目前不得填写任何模型自行记忆的小说内容。所有未核验原著内容必须使用明确占位符。

一、开始修改前

开始修改前先输出：

1. 阶段 0 已确认的 production 部署入口能力：build-time、server-start、首请求或其他等价边界分别是 SUPPORTED、PARTIAL、UNSUPPORTED 还是 UNKNOWN；
2. 计划创建和修改的内容、Schema、loader、gate 和测试文件；
3. `ContentGateEvaluation` 的现有阶段 1 Contract 路径和字段来源；
4. 内部完整内容包与客户端公开运行时内容包的 canonicalization/checksum 方案；
5. placeholder 内容与 verified 内容的隔离方案；
6. ContentLoader/content access interface 与后续 Agent/Orchestrator 的依赖方向；
7. 环境组合矩阵和 production 失败策略；
8. 测试方案。

若实现需要修改阶段 1 已冻结的 Domain 类型、`ContentGateEvaluation` 语义、版本字段或依赖方向，停止并报告 Contract gap；不得自行回改阶段 1。

二、建立内容与门禁基础

建立：

1. 原著版本说明模板；
2. 原著事实白名单模板；
3. 三张占位证据卡；
4. 三幅占位场景肖像图配置；
5. 内容加载器与统一 content access interface；
6. 内容 Schema 校验；
7. 唯一的 deterministic `evaluateContentGate(...)` 与 production gate 接入；
8. 内容包版本与 canonical checksum 机制；
9. 客户端公开 payload 生成器；
10. 环境组合矩阵。

三、运行模式与环境矩阵

运行模式至少包括：

- CONTENT_MODE=placeholder | verified
- AGENT_MODE=mock | live
- APP_ENV=development | test | production

合法组合至少明确：

- development + placeholder + mock：允许；
- development + verified + mock/live：允许；
- test + placeholder/verified + mock：允许；
- production + verified + mock/live：允许；
- production + placeholder：禁止并使可执行的 production gate 失败。

门禁规则：development 和 test 可以加载 placeholder；production 只能加载 verified。任何实际 production gate 发现 placeholder、未批准内容、Schema 失败或 checksum 不匹配时必须失败，不得静默隐藏、自动切换到 placeholder 或继续启动。

四、Production Gate 唯一 evaluator 与部署入口

必须实现唯一的 deterministic `evaluateContentGate(...)`。该 evaluator：

1. 消费已经过内容 Schema 校验的内容包、目标 APP_ENV、CONTENT_MODE、内容包 ID/版本/checksum 和阶段 1 Contract 要求的其他输入；
2. 返回阶段 1 已冻结的 `ContentGateEvaluation`；
3. 不得定义 `ProductionGateResult`、`ContentValidationResult`、`ContentVerificationResult` 等第二套可与 `ContentGateEvaluation` 竞争的门禁结果；
4. 不负责生成或伪造 `ContentGateAttestation`；需要可信 attestation 时只能走阶段 1 已冻结的可选服务端证明边界。

production gate entrypoint 必须继承阶段 0 已确认的平台能力：

- 若 build-time hook 已确认可用，则接入 build-time；
- 若 server-start hook 已确认可用，则同时接入 server-start；
- 若 server-start 不可用但阶段 0 已确认首请求或其他等价 production 边界，则接入该边界；
- 不得为了满足本 Prompt 人为实现阶段 0 已确认目标平台不存在的 server-start hook；
- 至少必须存在一个在目标 production 部署路径中不可绕过的可执行门禁入口；若阶段 0 结果表明没有任何可执行 production gate，则停止并报告部署阻塞，不得假装 production gate 已实现。

所有已实现的 production gate entrypoint 必须调用同一个 `evaluateContentGate(...)`，不得复制或分叉环境判断、checksum 判断和 verified/placeholder 规则。对相同输入必须产生等价 `ContentGateEvaluation`。

五、占位证据与 VerifiedFact 边界

三张占位证据卡：

- past-self-placeholder
- future-forecast-placeholder
- relationship-placeholder

三幅场景肖像图配置：

- early-charlie-placeholder
- peak-charlie-placeholder
- future-facing-charlie-placeholder

placeholder 只用于 development/test 和后续确定性 Mock 流程。必须满足：

1. placeholder 记录不得伪装成 `VerifiedFact`；
2. placeholder 不得写入 verified 内容包，不得设置能够被解释为“已人工核验”的 verificationStatus；
3. placeholder 不得被 `retrieveVerifiedEvidence` 作为已核验事实返回；
4. placeholder EvidenceCard/fixture 可以由 ContentLoader 在 placeholder mode 下提供给 Mock orchestration 或 UI，但其 provenance 必须明确为 placeholder；
5. 不得为了让 Mock 流程通过而制造虚假的 editionId、verifiedBy、verifiedAt、sourceLocation 或事实正文；
6. production 必须在内容门禁层拒绝任何 placeholder 内容。

VerifiedFact 至少包含：

- id
- contentType
- theme
- round
- verifiedFact
- sourceLocation
- internalExcerpt
- publicSummary
- publicPresentationMode
- allowedInterpretations
- prohibitedInferences
- copyrightStatus
- verifiedBy
- verifiedAt
- verificationStatus
- editionId

sourceLocation 必须结构化，至少包含 editionId、sectionType、sectionLabel、pageStart、pageEnd 和 locatorNote。

internalExcerpt 仅供团队核验，默认不得发送到客户端、不得进入模型 Prompt、不得公开展示。客户端 bundle 和公开 API payload 中不得包含该字段；公开界面使用单独审核的 publicSummary。

EvidenceCard 至少包含：

- id
- round
- factIds
- interpretationIds
- publicText
- question
- allowedFollowUps
- prohibitedClaims
- attribution

六、内容包、公开 Payload 与 Checksum

内容包至少记录：

- contentBundleId
- contentBundleVersion
- editionId
- contentSchemaVersion
- verifiedAt
- verifiedBy
- checksumAlgorithm
- checksum

checksum 必须基于冻结的 canonical JSON 规则生成，明确对象键排序、数字表示、Unicode 规范化、数组顺序、换行处理以及 checksum 字段自身是否排除；禁止依赖当前时间、本地路径或运行时对象插入顺序。

必须分别生成并命名：

1. `internalContentBundleChecksum`：内部完整内容包的 checksum，可以覆盖仅供团队核验的私有字段，例如 `internalExcerpt`；不得发送到客户端，不得写入 SessionState 作为运行时内容绑定；
2. `contentBundleChecksum`：客户端公开运行时内容包的 canonical checksum。阶段 1 已存在的 `SessionState.contentBundleChecksum`、`ContentGateEvaluation`、后续 Final Review 输入绑定和 FinalEnvelope provenance 一律使用这一公开运行时 checksum。

不得使用同一个模糊的 `checksum` 值同时代表内部私有包和公开运行时包。若文件格式仍保留通用 `checksum` 字段，必须通过 manifest 层或明确的对象边界保证其所属 representation 唯一可判断。

恢复 Session 时如 contentBundleVersion 或 `contentBundleChecksum` 不匹配，必须按阶段 1 已冻结的恢复矩阵迁移、明确拒绝恢复或以只读方式展示旧快照，不得静默套用新内容。

七、内容访问边界

后续 Agent、FinalReviewService 和 application/orchestration 层不得直接 import、读取或解析 `/content/*.json` 原始文件来绕过阶段 2 的 Schema、public/private stripping、checksum 和 gate。

依赖方向固定为：

Content source files
→ Content Schema validation
→ canonicalization/checksum
→ ContentLoader / content access interface
→ `evaluateContentGate(...)` / `ContentGateEvaluation`
→ application/orchestration / UI / 后续服务

公开给客户端或模型的内容必须从已校验且经过 public projection 的 content access interface 获取。`internalExcerpt` 只能停留在内部核验边界。

八、测试

需要测试：

1. 未核验事实不能发布；
2. 缺少来源或 editionId 的事实不能发布；
3. 不存在的事实 ID 不能被证据卡引用；
4. 图片配置不能伪装成原著证据；
5. 原创互动内容不能标成 VERIFIED_FACT；
6. CURATORIAL_INTERPRETATION 不能伪装成作者唯一结论；
7. internalExcerpt 不能进入公开 payload、客户端 bundle 或模型 Prompt；
8. production 不能加载 placeholder 内容；
9. placeholder 只能存在于 placeholder 内容路径/内容包，不得进入 verified bundle；
10. placeholder 不能被 `retrieveVerifiedEvidence` 识别为 VerifiedFact；
11. 同一内容 ID 不能重复；
12. verifiedBy 和 verifiedAt 必须有效；
13. EvidenceCard 不能引用未批准的解释；
14. 所有目标部署平台实际支持并接入的 production gate entrypoint 都调用同一 `evaluateContentGate(...)`，并对相同输入产生等价 `ContentGateEvaluation`；不得要求不存在的 server-start hook；
15. production 没有任何不可绕过门禁入口时必须明确失败并报告部署阻塞；
16. checksum 对等价 canonical JSON、Unicode 边界和不同对象键插入顺序稳定；
17. `internalContentBundleChecksum` 与 `contentBundleChecksum` 不得混用，Session/runtime binding 只使用公开运行时 `contentBundleChecksum`；
18. contentBundleVersion 或 `contentBundleChecksum` 不匹配时不会静默恢复；
19. 所有 APP_ENV、CONTENT_MODE、AGENT_MODE 组合按矩阵处理；
20. 后续 application/Agent 测试不能通过直接读取原始内容 JSON 绕过 ContentLoader/content access interface。

九、阶段 2 完成条件

完成后必须：

1. 运行类型检查、内容 Schema 测试、checksum 测试和 production gate 测试；
2. 输出实际执行的命令和实际测试结果；
3. `ContentBundle` 与客户端 public payload Schema 已冻结；
4. APP_ENV/CONTENT_MODE/AGENT_MODE 矩阵有自动化测试；
5. production placeholder gate 的负测试通过；
6. `ContentGateEvaluation` 由唯一 evaluator 实际生成，且没有第二套门禁结果；
7. `internalContentBundleChecksum` 与公开运行时 `contentBundleChecksum` 的职责和持久化边界唯一明确；
8. `internalExcerpt` 无法进入 public payload；
9. evidenceId、interpretationId 和 editionId 引用完整性可自动验证；
10. placeholder Mock 内容不会伪装为 VerifiedFact；
11. 阶段 3 可以只通过 ContentLoader/content access interface 消费内容，不需要直接读取原始内容 JSON；
12. 列出任何 UNKNOWN/PARTIAL 部署能力及其对 production gate 的剩余影响；
13. 不进入阶段 3。

不要写查理台词，不接入 LLM，不安装模型供应商 SDK。
```

### 阶段 3：Agent 契约、确定性领域服务与 Mock Adapter

```text
现在执行阶段 3：实现九项 Agent 能力的接口、契约测试、确定性领域服务、Mock Adapter、Final Review Contract 与 application/orchestration 契约。

阶段 0、1 已经执行完成，阶段 2 的内容访问边界和 `ContentGateEvaluation` 已冻结。本阶段不得反向修改阶段 1 Domain/Runtime/Provenance/Finalization 基础契约，也不得绕过阶段 2 ContentLoader/content access interface 直接读取原始内容 JSON。

本阶段只冻结 live execution 的接口、Candidate/Validated Result、错误语义、降级策略、调用预算和 provider-neutral Adapter 边界；不得安装真实模型供应商 SDK，不得创建 production provider client，不得发送真实模型网络请求，不得编写 production Prompt。真实 Agent Prompt、真实 LLM Adapter 和供应商集成仍在阶段 6 实现。

一、编码前先定义

编码前先定义：

1. 输入输出 Schema；
2. capabilityKind；
3. 错误类型；
4. 降级规则；
5. 幂等规则；
6. 状态机与能力的边界；
7. Candidate 与 Validated Result 的分层和后置安全验证器；
8. Fixture、Clock、IdGenerator 和 Mock 版本规则；
9. application/orchestration 层与 provider-neutral 模型调用计划；
10. 每轮、完整 Session 的调用次数、延迟、token 和费用预算；
11. ContentLoader/content access interface 如何向能力提供 verified evidence 或 placeholder Mock context；
12. `CapabilityExecutionReceipt` 的 application/orchestration 记录位置与 deterministic/live/mock/static_template/unavailable 映射；
13. 阶段 1 `ContractVersionVector` 中 agentContractVersion、finalReviewSchemaVersion 和各具体 result schema version 的映射。

涉及 Contract 或核心接口时，等待我确认后再修改。

Architecture STOP 条件：如果定义 Agent Candidate、Validated Result、Bundle、FinalReviewService 或 orchestrator 时发现必须修改阶段 1 已冻结的 Domain 实体、不变量、依赖方向、`ContentGateEvaluation`、`ContractVersionVector` 或版本字段，立即停止并报告 Contract gap。不得为了通过编译：

- 向 `/src/domain` 添加 Agent/service 临时 payload；
- 让 Domain 引用 Adapter、模型供应商、FinalReviewService 或 Candidate 类型；
- 新增与阶段 1 已有领域类型竞争的第二套临时类型；
- 新增无法判断归属的通用 `schemaVersion`；
- 静默回改阶段 0、1 已冻结 Contract。

二、九项能力与 Bundle

编排层必须定义 `RoundAnalysisCandidateBundle`、`ValidatedRoundAnalysisBundle`、`PlainSemanticReviewCandidateBundle`、`ValidatedPlainSemanticBundle` 和各子结果的 Validated Result；Candidate Bundle 只是减少模型调用的传输结构，不改变九项逻辑能力的独立 Contract。每个子 Candidate 可以独立校验并按能力降级，但只有所有必需槽位都得到 Validated Result 或确定性安全降级后，才能构建完整 Validated Bundle。

九项能力：

1. retrieveVerifiedEvidence
2. buildInitialPortraitRecord
3. extractUserPrinciple
4. detectTension
5. generateCharlieResponse
6. proposeDocumentDiff
7. compareSemanticDrift
8. buildDissentRecord
9. summarizePortraitShift

能力分类：

- retrieveVerifiedEvidence：deterministic_domain_service；只读取阶段 2 已校验的 verified content access interface；
- buildInitialPortraitRecord：deterministic_domain_service；
- buildDissentRecord：deterministic_domain_service；
- computePortraitShift：九项能力之外的 deterministic_domain_function；
- summarizePortraitShift：llm_assisted_service，只能消费 `computePortraitShift` 返回的 `PortraitShiftComparison` 并生成摘要；
- extractUserPrinciple、detectTension、generateCharlieResponse、proposeDocumentDiff、compareSemanticDrift：llm_assisted_service，但必须有确定性 Mock；
- FinalReviewService.reviewCharlieSignature：九项能力之外的正式 final_review_service；
- 任何能力或服务均不得直接修改 SessionState；
- application/orchestration 层负责调用能力、验证 Candidate、映射错误、记录 execution receipt 并向 FSM 发送已验证事件；FSM 不直接解析供应商输出，Adapter 不直接发送状态跳转；
- 九项能力保持独立逻辑 Contract，但允许 `RoundAnalysisOrchestrator` 在一次主模型调用中返回 `RoundAnalysisCandidateBundle`，分别承载 principle、tension、CharlieResponse 和 Diff Candidate，并对每一部分独立校验；
- 编排器采用“分项校验与降级、完整 Bundle 原子提交”：某个子 Candidate 失败时可以仅对该能力使用 Mock 或 static template，但不得先把其他成功子结果写入 FSM；只有完整 `ValidatedRoundAnalysisBundle` 构建成功后才发送一个原子结果事件；PLAIN_REWRITE 与首次 SEMANTIC_REVIEW 同样必须在完整 `ValidatedPlainSemanticBundle` 就绪后原子写入 plain revision、SemanticDrift、SemanticFragments 和 receipts；若任一必需槽位无法得到安全结果，整次业务操作失败并进入可恢复降级 UI；
- 每个逻辑能力的每次执行都必须由 application/orchestration 层生成独立 `CapabilityExecutionReceipt`，即使多个能力共享同一次供应商请求，也要分别记录最终 resolvedMode、outcome 和 fallbackReason；
- deterministic Domain service/function 本身不得创建、读取或依赖 `CapabilityExecutionReceipt`、`RequestContext`、`ActiveOperation`、startedAt/completedAt 或其他运行元数据；orchestrator 在调用成功/失败后投影相应 receipt，其中纯领域确定性能力使用 resolvedMode=deterministic；
- 默认预算为每轮最多一次主模型调用，PLAIN_REWRITE 与 SEMANTIC_REVIEW 合计最多一次主调用，PortraitShift 摘要最多一次主调用，签名审阅独立最多一次主调用；完整 live Session 默认不超过六次主调用，网络重试和结构化修复仍各最多一次。超过预算必须进入明确降级，不得静默追加调用。

三、Placeholder 与 Verified Evidence 执行边界

`retrieveVerifiedEvidence` 的语义保持严格：只有阶段 2 verified 内容路径中的人工核验事实可以返回 `VerifiedFact`。未核验、placeholder、缺少来源或内容绑定失败必须返回明确错误，不得把 placeholder 包装成 VerifiedFact。

为了支持阶段 4 的完整 placeholder Mock 流程：

1. CONTENT_MODE=placeholder 时，Mock orchestration 可以从阶段 2 ContentLoader/content access interface 读取明确标识为 placeholder 的 EvidenceCard/fixture context；
2. 该 placeholder context 不经过 `retrieveVerifiedEvidence` 伪装成 VerifiedFact；
3. Mock `generateCharlieResponse`、Mock diff、Mock semantic 等能力可以消费预先冻结的 placeholder fixture/context，但输出不得声称来源为原著核验事实；
4. CONTENT_MODE=verified 时，需要原著事实的能力必须从 verified content access interface 和允许的 evidenceIds 获取；
5. Agent、Mock Adapter、FinalReviewService 均不得直接 import `/content/*.json` 绕过阶段 2 的校验、projection 和 gate。

四、实现原则

- 工具只返回建议或结构化结果，由 FSM 和领域 reducer 决定是否写入；
- 所有 Candidate 输出经过运行时 Schema 校验、revision/content/evidence 绑定和后置安全验证后才能成为 Validated Result；
- 未核验证据返回明确错误；
- Diff 一次最多包含一个正文操作；
- Diff 必须明确 documentTarget；
- replace 必须提供与目标 revision 完全匹配的 oldText；
- annotate 不得修改正文；
- baseRevisionId 过期时返回 STALE_REVISION；
- 幂等键由 requestId 与 inputFingerprint 共同验证；在存在可验证 idempotency record 的范围内，相同 requestId、相同指纹的重试必须保持业务提交幂等，相同 requestId 配不同指纹必须返回 IDEMPOTENCY_CONFLICT；无持久服务端存储时不得宣称跨实例供应商调用 exactly-once；
- compareSemanticDrift 必须绑定 preciseRevisionId 和 plainRevisionId，并输出 semanticFragments；
- restored_to_plain_text 不通过 proposeDocumentDiff 再生成第二次待确认修改；
- `computePortraitShift(...): PortraitShiftComparison` 必须完全确定性，并返回可供测试的结构化事实差异；
- `summarizePortraitShift` 只能读取 `PortraitShiftComparison`，不得自行重新推断事实，也不能输出人格评价；
- buildDissentRecord 不评分；
- buildInitialPortraitRecord 不判断用户选择是否正确；
- generateCharlieResponse 不能引入白名单之外的原著事实；
- FinalReviewService.reviewCharlieSignature 使用独立 Contract，不得作为 generateCharlieResponse 的 operation；
- `CharlieSignatureReviewInput` 只承载业务语义；`requestedMode`、`requestId`、`promptVersion` 和 `adapterVersion` 只能通过 `RequestContext` 传入；最终 resolvedMode 只能来自 application/orchestration 记录的 CapabilityExecutionReceipt；
- `extractUserPrinciple` 必须接收当前提交的 `untrustedUserText`；其他能力优先使用结构化 UserPrinciple，只有必要时才接收经过最小化裁剪的用户原文；
- 所有 Agent Candidate/Validated Result 使用阶段 1 `ContractVersionVector` 中明确的 `agentContractVersion` 与具体 result schema version；Final Review 使用 `finalReviewSchemaVersion`；不得新增单一通用 `schemaVersion`。

五、FinalReviewService 独立 Contract

FinalReviewService 必须独立定义：

- CharlieSignatureReviewInput Schema，只包含业务语义字段，并绑定双 revision、内容包 ID/版本/公开运行时 `contentBundleChecksum` 与 finalReviewSchemaVersion；
- RequestContext Schema，至少包含 `requestedMode`、`requestId`、`promptVersion`、`adapterVersion`、`stageInstanceId` 和 `inputFingerprint`；
- CharlieSignatureReviewCandidate Schema；
- CharlieSignatureReviewResult Schema；
- CharlieSignatureReviewError 判别联合；
- live 与 mock 模式的不同降级策略；
- stale revision、内容缺失、contentBundleVersion/`contentBundleChecksum` 不匹配和安全验证失败的映射规则。

本阶段可以实现 Mock FinalReviewService；不得实现真实 live provider。live 路径只冻结 provider-neutral 调用接口、错误分类和降级语义，供阶段 6 接入真实模型。

六、Candidate → Validated Result 与后置安全验证

所有 LLM-assisted 能力和 Final Review 的 provider-neutral contract 统一采用：供应商原始响应 → Candidate Schema → revision/content/evidence 绑定校验 → 后置安全验证 → Validated Result。阶段 3 仅用 Mock/fixture 响应验证该流水线，不发送真实模型请求。模型不得输出可信的 validationResult；验证失败不得把 Candidate 写入 SessionState。

后置安全验证器负责检查：

1. evidenceIds 是否全部在本次允许集合；
2. 是否出现 prohibitedClaims 或 prohibitedInferences；
3. 是否包含未授权引文或 internalExcerpt；
4. 是否出现评分、人格诊断、最终裁决或模拟认知障碍；
5. Diff 是否满足 documentTarget、baseRevisionId 和单操作约束；
6. CharlieResponse 是否只有一个可回答问题；
7. 输出长度、字段和枚举是否合法；
8. contentBundleId、contentBundleVersion、公开运行时 `contentBundleChecksum` 与允许 evidence 集是否匹配。

模型不得通过输出 `prohibitedClaimCheck=true`、`validationResult=true` 或任何自证字段证明安全。最终检查结果必须由 Adapter/application 后置验证器生成。

七、Mock 确定性与 Contract Tests

Mock Adapter 与 Mock FinalReviewService 必须满足：相同业务输入、相同 Fixture、相同 Mock 版本、固定 Clock 和固定 IdGenerator 返回相同业务输出。sessionId、requestId、createdAt 等运行元数据可以不同，但不得影响文本、Diff、碎片、mock 签名审阅结论和状态转移。

每项能力与 FinalReviewService 都要有 contract tests。Mock 路径必须能稳定驱动完整流程。编排契约测试至少覆盖：

1. RoundAnalysis 四个子结果全部来自同一逻辑执行源并成功构建完整 Bundle；
2. 部分子结果降级为 mock/static_template 时，其他成功子结果不会提前写入 FSM；
3. 必需槽位无法降级时整 Bundle 失败；
4. PlainSemanticReview 只有完整 `ValidatedPlainSemanticBundle` 才能提交；
5. 任何情况下 FSM 都看不到半轮提交或只有 plainRevision、没有绑定 drift 的中间状态；
6. deterministic 能力的 receipt 由 orchestration 记录为 resolvedMode=deterministic，Domain service 本身不依赖 runtime/provenance 类型；
7. placeholder mode 的完整 Mock 流程不会生成虚假的 VerifiedFact；
8. verified mode 不允许 placeholder evidenceIds；
9. ContentLoader/content access interface 之外的直接原始内容文件读取在 Agent/application 层被测试或静态规则禁止；
10. Mock FinalReviewService 可以确定性返回 signed/declined；live 失败语义只定义为 unavailable 路径，不得自动进入 Mock 角色决定；
11. Candidate 安全验证失败时 Candidate 不进入 SessionState；
12. agentContractVersion、resultSchemaVersion 和 finalReviewSchemaVersion 不会被通用 schemaVersion 混用。

八、阶段 3 完成条件

完成后必须：

1. 运行类型检查和本阶段全部 contract tests；
2. 输出实际执行的命令和实际测试结果；
3. 九项能力都有明确 capabilityKind、输入输出 Schema、错误和降级契约；
4. RoundAnalysisCandidateBundle/ValidatedRoundAnalysisBundle 与 PlainSemanticReviewCandidateBundle/ValidatedPlainSemanticBundle 已冻结；
5. FinalReviewService 独立 Contract 与 Mock FinalReviewService 已完成；
6. Candidate → Validated Result 后置验证器有独立测试；
7. `CapabilityExecutionReceipt` 由 application/orchestration 层统一记录，纯 Domain 不依赖 runtime/provenance；
8. placeholder Mock flow 与 verified evidence flow 的边界有自动化测试；
9. 没有安装真实模型供应商 SDK、没有真实 provider client、没有真实网络模型请求、没有 production Prompt；
10. 阶段 1 已冻结的 Domain、Runtime、Provenance、Finalization 基础 Contract 没有被静默回改；如发现 Contract gap，必须列为阻塞而不是自行修补；
11. 阶段 4 可以只消费已冻结的 Validated Bundle、FinalReview 结果/错误、receipt 和 application events，不需要自行定义临时 Agent payload；
12. `restored_to_plain_text` 所需的 `SemanticRestorationProposal` 生产边界必须在进入阶段 4 前明确：优先让 `ValidatedPlainSemanticBundle` 为每个可回填碎片携带已通过 Schema、revision/anchor/hash 校验的冻结 proposal（或明确的不可安全回填结果），避免阶段 4 新增“第十项 Agent 能力”或临时服务 payload；若采用独立 proposal service，也必须在本阶段冻结 provider-neutral Contract、Mock、验证和预算；
13. 不进入阶段 4。
```

### 阶段 4：有限状态机、持久化与完整 Mock 流程

```text
现在执行阶段 4：实现无 LLM 的有限状态机、持久化和确定性 Mock 流程。

本阶段只消费阶段 1—3 已冻结的 Domain/Runtime/Provenance/Finalization、Content access、Validated Bundle、Final Review 与 application event Contract，不新增模型供应商 SDK、不发送真实模型请求，也不得为通过编译自行发明新的 Agent payload。

一、开始前的 STOP 条件

开始编码前先核对：

1. `ValidatedRoundAnalysisBundle` 与 `ValidatedPlainSemanticBundle` 已冻结；
2. `SemanticRestorationProposal` 的生产边界已冻结：阶段 4 可以直接取得已校验 proposal，或调用已冻结的独立 proposal service；不得在 FSM 内现场生成 replacementText、targetAnchor 或 proposalHash；
3. `CharlieSignatureReviewResult/Error`、`CapabilityExecutionReceipt`、`ActiveOperation`、`SignatureReviewAttemptState` 与 `evaluateFinalization` 已冻结；
4. Stage/事件命名和持久化版本字段只有一套定义。

任一项缺失时立即停止并报告 Contract gap；不得在 `/src/fsm` 或 persistence 层定义临时替代类型。

二、编码前先输出

1. 状态图；
2. 状态转移表；
3. 每个状态的 kind、entryAction、allowedEvents、successTarget、failureTarget、timeoutPolicy 和 refreshPolicy；
4. Guard 和不变量；
5. 每轮主要回答、可选澄清和 Diff 的推进规则；
6. 跳过、拒绝、失败和降级规则；
7. 页面刷新、旧 ActiveOperation 失效和 system_transient 恢复规则；
8. `evaluateFinalization` 的唯一调用位置及 `isFinalizable` 薄封装边界；
9. SessionState、运行元数据、用户原文、结构化原则、analytics 与 COMPLETE 快照的存储边界；
10. IndexedDB transaction、幂等记录、receipts 与业务状态的原子提交边界。

涉及 State Machine Contract、核心状态或持久化格式时，等待我确认后再修改。

三、状态分类与 Plain/Semantic 原子提交归属

状态分类至少明确：

- user_interactive：WELCOME、PORTRAIT_PRELUDE、PORTRAIT_CHOICE、三轮输入与 Diff、MANUSCRIPT_REVISION、SEMANTIC_PLACEMENT、PORTRAIT_REASSEMBLY、FINAL_SIGNATURE、FINAL_DISPOSITION；
- system_transient：PLAIN_REWRITE、SEMANTIC_REVIEW、FINALIZING；
- terminal：COMPLETE。

`PLAIN_REWRITE` 与 `SEMANTIC_REVIEW` 必须保留既有 Stage 名，但不得拆成两个可观察到半状态的业务提交：

1. 推荐由 PLAIN_REWRITE 的 entryAction 创建一次 PlainSemanticReview ActiveOperation；
2. `PLAIN_SEMANTIC_BUNDLE_RESOLVED` 在一个 reducer + persistence transaction 中同时提交新的 plain revision、SemanticDrift、SemanticFragments、可用的 SemanticRestorationProposal 与 receipts；
3. 成功后进入 SEMANTIC_REVIEW；该状态只做确定性完整性检查和下一状态分支，不发送第二次模型/Mock 主调用；
4. 有碎片进入 SEMANTIC_PLACEMENT，无碎片直接进入 PORTRAIT_REASSEMBLY；
5. 任何实现都不得出现“plainText 已更新但对应 SemanticDrift/Fragments 尚未提交”的可恢复状态。

四、核心状态机保证

状态机必须保证：

1. 用户完成序章后才能进入第一轮，初始肖像选择和理由均必填；
2. 三轮顺序固定；
3. 每轮最多一次主要回答和一次可选澄清，`clarificationCount <= 1` 由 Guard 强制；
4. 用户必须有明确的“跳过本轮澄清继续”路径，不能依赖 UI 伪造 `ADVANCE`；
5. Diff 可以接受、拒绝或为 no_change；只有 accepted Diff 才修改正文，且必须绑定当前目标 revision；
6. 第三轮完成前不能创建朴素版本或进入肖像重新拼合；
7. SemanticDrift 必须绑定当前 preciseRevisionId/plainRevisionId；
8. 进入 SEMANTIC_PLACEMENT 时创建 SemanticPlacementBatch、冻结 baseline 双 revision，并将原 SemanticDrift 从 current 转为 placement_in_progress；
9. `saved_as_margin_note` 与 `placed_in_bouquet` 可由 placement 选择直接确认；
10. `restored_to_plain_text` 不能仅靠 `CHOOSE_FRAGMENT_PLACEMENT` 生效：必须展示并确认具体 `SemanticRestorationProposal` 后才能应用；anchor/hash/proposalHash 不匹配时 proposal 失效并重新生成/确认；
11. 所有碎片处理完成后只执行一次 post-placement consistency check；检查期间 batch.status=checking_consistency，禁止继续 placement；成功后生成绑定最终双 revision 的新 SemanticDrift=current，且不得创建新碎片；
12. PORTRAIT_REASSEMBLY 完成后按 `FINAL_SIGNATURE → FINAL_DISPOSITION` 顺序推进；
13. `SUBMIT_FINAL_REASON` 可选，必须有显式“无最终理由继续”路径；
14. FINAL_SIGNATURE 只读；用户不能直接触发 signed/declined，futureCharlieSignatureStatus 永远为 blank；
15. `RETURN_TO_MANUSCRIPT_REVIEW` 立即使旧签名审阅失效并进入 MANUSCRIPT_REVISION；
16. MANUSCRIPT_REVISION 在 `SUBMIT_MANUSCRIPT_REVISION` 前不得修改 canonical preciseText/revision；提交时若文本无实际变化，不创建空 RevisionEntry；若有变化，原子创建新 precise revision 并使旧 plain revision、SemanticDrift、SemanticPlacementBatch、签名审阅和其他 revision-bound 结果失效；
17. `CANCEL_MANUSCRIPT_REVISION` 丢弃未提交编辑并返回 FINAL_SIGNATURE；由于旧签名审阅已在 RETURN 时失效，返回后签名状态恢复为可重新请求的未审阅状态，不得恢复旧 signed/declined 结果；
18. 每个异步操作必须创建 ActiveOperation；结果事件必须匹配 operationId、requestId、stageInstanceId、inputFingerprint、capability 和相关 revision；
19. RoundAnalysis 只接收完整 `ValidatedRoundAnalysisBundle`；Plain/Semantic 只接收完整 `ValidatedPlainSemanticBundle`；
20. `BUILD_FINAL_ENVELOPE` 必须在 runtime.activeOperation=null 时先调用唯一 `evaluateFinalization`；eligible=true 后才进入 FINALIZING 并创建 finalization ActiveOperation；
21. openDissents 非空和 finalDisposition=unfinished 不阻止最终化；
22. FinalEnvelope 构建、幂等记录与 COMPLETE 快照持久化必须是一个可回滚的业务提交边界；
23. FINALIZING 失败或持久化失败不得产生部分 COMPLETE；
24. COMPLETE 后当前 Session 不可修改；新体验由应用级 `START_NEW_SESSION` 创建新 sessionId。

五、事件边界

用户事件至少包括：

- START
- SET_PORTRAIT_DESCRIPTORS
- CHOOSE_INITIAL_PORTRAIT
- SUBMIT_INITIAL_REASON
- SUBMIT_RESPONSE
- SUBMIT_CLARIFICATION
- CONTINUE_WITHOUT_CLARIFICATION
- ACCEPT_DIFF
- REJECT_DIFF
- CHOOSE_FRAGMENT_PLACEMENT
- CONFIRM_SEMANTIC_RESTORATION_PROPOSAL
- REJECT_SEMANTIC_RESTORATION_PROPOSAL
- CHOOSE_FINAL_PORTRAIT
- SUBMIT_FINAL_REASON
- CONTINUE_WITHOUT_FINAL_REASON
- REQUEST_CHARLIE_SIGNATURE_REVIEW
- CONTINUE_WITHOUT_SIGNATURE_REVIEW
- RETRY_CHARLIE_SIGNATURE_REVIEW
- RETURN_TO_MANUSCRIPT_REVIEW
- SUBMIT_MANUSCRIPT_REVISION
- CANCEL_MANUSCRIPT_REVISION
- CHOOSE_DISPOSITION

`START_NEW_SESSION` 是应用级命令，不属于当前 Session FSM 用户事件。

服务/application 结果事件至少包括：

- ROUND_ANALYSIS_BUNDLE_RESOLVED
- ROUND_ANALYSIS_BUNDLE_FAILED
- PLAIN_SEMANTIC_BUNDLE_RESOLVED
- PLAIN_SEMANTIC_BUNDLE_FAILED
- POST_PLACEMENT_CHECK_SUCCEEDED
- POST_PLACEMENT_CHECK_FAILED
- PORTRAIT_SHIFT_COMPUTED
- PORTRAIT_SHIFT_SUMMARY_RESOLVED
- CHARLIE_SIGNATURE_REVIEW_RESOLVED
- CHARLIE_SIGNATURE_REVIEW_FAILED
- FINAL_ENVELOPE_PERSISTED
- FINAL_ENVELOPE_PERSIST_FAILED

FSM 不接收供应商级 `AGENT_TIMEOUT`、`AGENT_RATE_LIMITED`、`AGENT_INVALID_OUTPUT`、`REPAIR_STRUCTURED_OUTPUT`、`USE_MOCK_FALLBACK`、`USE_STATIC_TEMPLATE` 等编排细节。它们由 application/orchestration 层映射成上述 operation-level resolved/failed 事件及结构化 failureReason。图片加载失败属于阶段 5 UI fallback，不进入 Session FSM。

所有成功/失败结果事件必须携带与当前 ActiveOperation 对应的 operationId、requestId、stageInstanceId、inputFingerprint、capability、相关 revision；需要 provenance 的结果同时携带对应 receipts。迟到、重复、取消、旧 stage 或输入不匹配结果只能记录最小化运行元数据并丢弃，不得修改业务状态。

六、签名审阅语义

1. `REQUEST_CHARLIE_SIGNATURE_REVIEW` 创建签名审阅 ActiveOperation，并把当前状态置为 pending；
2. `CONTINUE_WITHOUT_SIGNATURE_REVIEW` 只产生 not_requested；
3. `CHARLIE_SIGNATURE_REVIEW_RESOLVED` 只接受已验证的 signed/declined；
4. 技术失败通过 `CHARLIE_SIGNATURE_REVIEW_FAILED` 映射为 unavailable，不得伪造 declined；
5. live 模式 unavailable 后，在双 revision、内容包和 finalReviewSchemaVersion 未变化时最多手动重试一次；
6. `SignatureReviewAttemptState.attemptCount` 必须跨刷新恢复；ActiveOperation.attempt 不替代它；
7. 页面恢复时若发现签名状态为 pending 但对应 ActiveOperation 已失效，不得继续显示“仍在请求中”；必须按已冻结的恢复策略转为可解释的 interrupted/unavailable 状态或重新请求入口，并保持重试预算一致；
8. live 签名审阅永远不得自动 Mock 回退。

七、持久化、恢复与并发

- 完整用户自由输入只保存在当前 Session 的受控本地存储，不进入常规服务端持久化或 analytics；
- 未完成 Session 使用既定 expiresAt=最后一次有效保存时间+24 小时规则；到期清理在下一次启动、恢复、列表展示或访问时执行；
- COMPLETE Session 默认只保存在当前设备，并提供清除入口；现有保留上限和清理策略继续沿用已冻结规则；
- analytics 同意状态与体验 SessionState 分开；
- Session 与 COMPLETE 快照使用 IndexedDB transaction；localStorage 只可保存不含用户正文的小型非领域偏好；
- 一次业务状态转移要求持久化时，SessionState、`StateTransitionIdempotencyRecord`、相关 receipts 和 revision/provenance 变化必须在同一事务成功后才对外视为已提交；事务中止不得留下半状态；
- Web Locks + BroadcastChannel 为首选同 sessionId 并发方案；无 Web Locks 时使用 ownerToken + expectedRevision；冲突禁止静默覆盖；
- 页面恢复必须校验 sessionSchemaVersion、contentSchemaVersion、contentBundleId、contentBundleVersion、contentBundleChecksum 和快照完整性；
- 恢复后旧 ActiveOperation 一律不得恢复为 still running；必须清除/标记 abandoned，并生成新的 stageInstanceId；
- 对 mock/deterministic system_transient 可以基于已持久化输入重新执行；未来 live operation 不得因刷新自动重复供应商调用，必须进入已冻结的 interrupted/retry/fallback 路径；
- PLAIN_REWRITE/SEMANTIC_REVIEW 恢复不得产生半 bundle；FINALIZING 恢复时若原子 COMPLETE 事务未提交，回到可安全重试最终化的状态；若 COMPLETE 快照已完整提交，直接按 COMPLETE 只读恢复；
- 未完成 Session + breaking schema 明确拒绝恢复；存在兼容迁移则迁移；COMPLETE + 旧 Schema/旧内容包只读展示原快照；integrityChecksum 失败拒绝作为完整快照展示。

八、测试

至少覆盖：

1. 从 WELCOME 到 COMPLETE 的完整 placeholder Mock 流程，无 UI 也能通过集成测试；
2. 三轮顺序、clarificationCount 上限、跳过澄清和 no_change Diff；
3. Diff 接受/拒绝幂等，旧 revision Diff 被拒绝；
4. RoundAnalysis/PlainSemantic Bundle 不存在半提交；
5. `restored_to_plain_text` 必须经过具体 proposal 确认；proposal stale 后不能应用；其他两种 placement 可直接确认；
6. placement consistency check 失败可恢复，成功后只生成一个 current SemanticDrift 且不新增碎片；
7. RETURN/CANCEL/SUBMIT_MANUSCRIPT_REVISION 三条路径；取消不产生 revision，实际修改会使所有 revision-bound 结果失效；
8. finalReason 可选、openDissents 非空、finalDisposition=unfinished 均按 Contract 推进；
9. 签名 signed/declined/unavailable/not_requested 不混淆，pending 恢复不会永久卡死，attemptCount 跨刷新保留；
10. 旧 operationId/requestId/stageInstanceId/inputFingerprint/revision、重复完成和取消结果均不能写入；
11. IndexedDB transaction 中止、quota、损坏快照、breaking migration、COMPLETE 只读；
12. Web Locks 互斥与 ownerToken/expectedRevision fallback 冲突；
13. SessionState + idempotency record + receipts 原子持久化；
14. `evaluateFinalization` 只在 activeOperation=null 时调用，FINALIZING 失败不生成部分 COMPLETE；
15. 固定 Fixture、Clock、IdGenerator 和 Mock 版本时，相同业务输入得到相同业务输出。

九、阶段 4 完成条件

完成后必须：

1. 输出状态图、状态转移表和每个状态的完整策略表；
2. 类型检查、FSM 单元测试、持久化测试和完整 Mock 集成测试全部实际执行并报告结果；
3. 无 UI 条件下可以从新 Session 确定性走到 COMPLETE，并覆盖至少一条 Diff 拒绝、一条语义碎片回填、一条保留分歧和一种非 signed 签名路径；
4. 页面恢复不会恢复旧 ActiveOperation 为 running，不会出现永久 pending；
5. 所有关键业务提交在 IndexedDB 中无半写入；
6. 阶段 4 未新增临时 Agent/Final Review payload，未绕过 ContentLoader/content access interface；
7. 未安装真实模型 SDK、未发送真实模型请求；
8. 列出修改文件、实际命令、测试结果、迁移/恢复影响和已知限制；
9. 不进入阶段 5。
```


### 阶段 5：低保真完整 UI 与确定性纵向切片

```text
现在执行阶段 5：先实现一个确定性纵向切片，再扩展低保真完整前端，并接入阶段 4 的 Mock 流程。

本阶段的任务不是重新实现业务规则，而是将阶段 4 已冻结、已测试的 SessionState、FSM、application/orchestration、持久化、恢复与最终化流程投影为一个可访问、可恢复、可完整操作的低保真 UI。

一、开始前的 STOP 条件

开始编码前先确认：

1. 阶段 4 完成条件全部通过，并已有实际类型检查、FSM 单元测试、持久化测试和完整 Mock 集成测试结果；
2. State Machine Contract、SessionState、application events、持久化接口、FinalizationResult 与 FinalEnvelope Schema 已冻结；
3. UI 所需业务状态可以从现有 SessionState、Runtime 状态、application view projection 或已冻结服务结果中读取或确定性推导；
4. 阶段 5 不新增或修改 Domain/FSM/Agent/Final Review payload，不为页面方便自行增加业务枚举、阶段、事件或 revision-bound 状态；
5. UI 不需要绕过 ContentLoader/content access interface 才能展示证据、内容归属或占位内容；
6. `MANUSCRIPT_REVISION`、Semantic Placement、FINAL_SIGNATURE、FINAL_DISPOSITION、FINALIZING 与 COMPLETE 的阶段 4 语义均已有可消费的事件和状态表示。

任一项缺失时立即停止并报告 Contract gap；不得在 React/Vue/Svelte 组件、route loader、UI store 或临时 hook 中定义第二套业务真相来继续实现。

二、编码前先输出

编码前先输出：

1. 页面信息架构；
2. 组件树；
3. 状态来源与 view projection；
4. 用户交互到 FSM/application event 的映射表；
5. 各区域按阶段显示的规则；
6. 响应式方案；
7. 键盘、焦点和屏幕阅读器方案；
8. 错误、恢复和降级 UI；
9. UI 测试方案。

涉及核心组件结构、路由、依赖，或发现必须修改阶段 1—4 已冻结 Contract 时，等待我确认后再修改。

三、UI 与业务状态边界

必须遵守：

1. UI 不得直接修改 `SessionState`、canonical precise/plain text、revision、SemanticDrift、SemanticPlacementBatch、签名状态、finalDisposition 或 FinalEnvelope；
2. 所有用户业务操作必须映射为阶段 4 已冻结的用户事件或 application command；组件不得直接调用 Domain reducer 来伪造状态跳转；
3. 页面跳转、区域显示、可操作性和禁用状态必须由当前 FSM state、已冻结 guard 结果或确定性 view projection 决定，不得在 UI 内复制第二套流程条件；
4. UI 不得重新实现 `evaluateFinalization`。最终化按钮、blockers 和错误展示必须消费统一的 `FinalizationResult`；
5. system_transient 状态可以显示 loading/recovery UI，但 UI loading state 不得成为新的 Domain Stage；
6. 仅属于呈现的 accordion、tab、modal、focus target、临时表单 draft 等可以保存在组件/UI 状态；这些状态不得改变业务语义；
7. 路由、刷新、deep link 或手工修改客户端导航位置都不得构造非法 `ExperienceStage`；可显示的业务页面必须由已恢复且通过校验的 SessionState/FSM state 决定；
8. 图片加载失败属于 UI fallback，不发送 Session FSM 事件；
9. Agent/Final Review 的文本字段一律按不可信数据安全渲染，默认不得使用未经净化的 HTML 注入。

四、确定性纵向切片

先跑通以下纵向切片：

WELCOME
→ PORTRAIT_PRELUDE
→ PORTRAIT_CHOICE
→ ROUND_1_PAST_SELF
→ ROUND_1_DIFF

该纵向切片不能只做到“进入 ROUND_1_DIFF 页面”。验收时必须至少完整处理一次 ROUND_1_DIFF：

1. accepted 或 rejected 任一路径能够通过正式事件完成；
2. accepted 时只按阶段 4 Contract 更新目标 precise revision；rejected 时 canonical 正文不改变；
3. 状态、revision/provenance 与幂等记录按阶段 4 持久化边界成功提交；
4. UI 根据提交后的正式 SessionState 更新，不维护第二套已接受/已拒绝真相；
5. 页面刷新后能够恢复到正确阶段和文本版本；
6. 重复点击或重复事件不会产生第二次业务状态变化。

该切片验收后，再扩展到完整 Mock 路径；不得为了提前展示后续页面而跳过 FSM。

五、页面与交互区域

一）欢迎页面

- 项目简介；
- 预计体验时长；
- 原创互动声明；
- 内容与数据说明；
- 开始按钮。

二）序章页面

- 三幅场景肖像图卡；
- 描述词选择；
- “真正的查理”选择；
- 理由输入；
- 原创视觉声明。

三）双栏 Canvas

左栏：

- 当前轮次；
- 当前场景肖像图；
- 证据卡；
- 查理 Mock 回应；
- 用户输入；
- 用户主张摘要；
- 当前分歧。

右栏：

- 精确版本及 preciseRevisionId；
- 朴素版本及 plainRevisionId；
- pending Diff；
- 接受或拒绝；
- 版本历史；
- 语义偏移及其绑定的两版 revision；
- 语义碎片；
- restored_to_plain_text 的冻结回填文字、目标位置与应用前后预览；
- 语义花束；
- 页边批注。

条件显示：

- 精确版本从第一轮开始显示；
- pending Diff 仅在存在正式 proposed Diff 时显示；
- 朴素版本在 PLAIN_REWRITE 前显示“尚未生成”；
- 语义偏移和语义碎片在 SEMANTIC_REVIEW 后显示；
- SemanticDrift stale、placement_in_progress 或其他非 current 状态必须明确展示，不得将旧分析呈现为当前结果；
- SemanticDrift stale 时禁止进入最终化，并展示来自统一 FinalizationResult 或当前阶段策略的可解释原因；
- FINAL_SIGNATURE 只显示最终文本只读审阅、请求签名审阅、跳过、允许的手动重试和状态说明；该阶段不得提供直接文本编辑控件；
- 签名区提供“请求查理审阅”“继续但不完成审阅”和“返回修改手稿”，不得提供“替查理签名”按钮；
- “返回修改手稿”发送 `RETURN_TO_MANUSCRIPT_REVIEW`、进入 MANUSCRIPT_REVISION，并明确提示旧签名审阅、朴素版本和 revision-bound 语义结果将失效；
- unavailable 必须显示为技术上未能完成审阅，不得显示为角色拒绝；
- not_requested 必须显示为用户未请求审阅，不得显示为技术失败或角色拒绝；
- 文稿归宿仅在 FINAL_DISPOSITION 显示。

四）手稿修改模式（MANUSCRIPT_REVISION）

必须提供真实可操作的返回修改路径：

- 只允许编辑 precise text，不允许直接编辑 plain text；
- 明确区分未提交 working draft 与 canonical precise revision；
- 提供“提交修改”和“取消修改”；
- `SUBMIT_MANUSCRIPT_REVISION` 前不得在 UI 中假装 preciseRevisionId 已变化；
- 提交实际修改前明确提示：新的 precise revision 会使旧 plain revision、SemanticDrift、SemanticPlacementBatch、签名审阅及其他 revision-bound 结果失效，并重新进入 PLAIN_REWRITE / SEMANTIC_REVIEW 流程；
- 文本无实际变化时不得在 UI 中伪造新 RevisionEntry；
- `CANCEL_MANUSCRIPT_REVISION` 丢弃未提交 draft 并按阶段 4 规则返回 FINAL_SIGNATURE，不恢复旧 signed/declined 审阅结果；
- 刷新恢复时不得把仅存在于未持久化 UI draft 的文字当成 canonical manuscript。

五）语义碎片处理（SEMANTIC_PLACEMENT）

每个 fragment 必须展示当前处理状态和允许操作，不得简化成一个可以绕过 proposal 确认的三选一表单。

至少支持：

- unresolved；
- placement selected；
- awaiting_restoration_confirmation；
- resolved；
- restoration proposal stale / unavailable 的可解释状态。

规则：

- `saved_as_margin_note` 与 `placed_in_bouquet` 按阶段 4 规则直接确认 placement；
- `restored_to_plain_text` 必须先显示冻结的 `SemanticRestorationProposal`，包括回填文字、目标位置、应用前后预览和必要的 stale 提示；
- 只有用户确认仍有效的 proposal 后才能应用回填；不得把选择 restored_to_plain_text 本身当成正文修改确认；
- proposal stale 时禁止继续应用旧 proposal，并提供重新生成/重新进入可操作状态的正式路径；
- consistency check 期间显示处理中状态并禁止继续 placement；
- consistency check 成功后显示绑定最终双 revision 的新 `SemanticDrift=current`，不得继续把 batch baseline 当作 current；
- restored_to_plain_text 产生新的 working/final plainRevisionId 时，不得出现第二个 pending Diff UI。

六）肖像重新拼合页面

- 三幅场景肖像图；
- 初始选择；
- 用户三轮观点；
- 最终选择；
- 可选最终理由；
- 事实性变化摘要。

七）最终签名与文稿归宿

FINAL_SIGNATURE：

- 当前 precise/plain revision 和最终文本只读展示；
- 当前查理签名审阅状态；
- 请求审阅、允许的手动重试、继续但不请求审阅、返回修改手稿；
- pending、signed、declined、unavailable、not_requested 必须使用不同且非误导性的文案；
- futureCharlieSignatureStatus 永远显示为空白，不提供用户代签入口。

FINAL_DISPOSITION：

- 只显示阶段 4 已冻结的三种文稿归宿；
- 不增加人格、道德、心理或哲学标签；
- 选择后通过正式事件进入最终化判定，不由 UI 直接创建 FinalEnvelope。

八）最终化与最终封套

FINALIZING 前：

- UI 必须消费统一的 `evaluateFinalization(state, context)` / `FinalizationResult`；
- eligible=false 时停留在合法阶段并展示结构化 blockers；
- 不得把按钮禁用条件、隐藏条件或自写 if/else 当作第二套最终化规则。

FINALIZING：

- 显示明确的只读处理中状态；
- 不允许继续修改 manuscript、placement、portrait choice、signature 或 disposition；
- FinalEnvelope 构建或持久化失败时不得显示 COMPLETE 或部分完成封套；
- 失败 UI 必须提供阶段 4 已允许的安全重试或恢复入口，并保留可解释错误信息；
- 刷新恢复必须遵守阶段 4 FINALIZING 恢复规则，不得仅根据页面 loading 状态推断 operation 仍在执行。

COMPLETE / 最终封套页面：

必须直接读取统一的 FinalEnvelope Schema，包含：

- 封套正面；
- 两版文本及 revision；
- 修改历史；
- 语义偏移和已处理碎片；
- 三张场景肖像图；
- 判断变化；
- 语义花束；
- 分歧；
- 签名审阅状态；
- 文稿归宿；
- 原创声明；
- 原著依据和内容归属；
- 降级状态说明；
- Contract、Prompt、Adapter、Schema、内容包版本、Session requested Agent mode、逐能力 `CapabilityExecutionReceipt`、`integrityChecksum` 与可选服务端 `FinalEnvelopeAttestation`。

FinalEnvelope Schema 是唯一数据源，但 UI 可以建立纯 presentation projection：

- 面向用户的叙事内容默认展开；
- Contract、Prompt、Adapter、Schema、receipts、checksum 和 attestation 可放在“技术信息/生成信息”折叠区域；
- presentation projection 不得重新计算、篡改或补写 FinalEnvelope 数据；
- COMPLETE Session 保持只读；开始新体验必须走应用级 `START_NEW_SESSION` 并创建新 sessionId。

六、响应式、可访问性与错误 UI

阶段 5 必须实现基础响应式、键盘操作、焦点管理、屏幕阅读器语义和核心错误状态，不得推迟到阶段 10 首次实现。

至少要求：

1. 移动端双栏转换为有序单栏或标签页，并保持阅读和操作顺序确定；
2. 状态切换后焦点进入新阶段主标题或明确的状态通知，不产生焦点丢失；
3. Diff 的增加、删除、批注和接受/拒绝状态不只依赖颜色；
4. 异步处理中提供可访问状态提示；
5. 图片缺失有替代文本和占位图，且图片失败不阻塞主流程；
6. 持久化失败、恢复失败、冲突、stale proposal、stale SemanticDrift 和 finalization blocker 均有可继续操作或明确停止的 UI；
7. 超长文本、Unicode 组合字符、长 URL-like 文本、窄屏和浏览器缩放不得导致关键按钮或正文不可访问；
8. UI 不把 `integrityChecksum`、ContentGateEvaluation 或无服务端证明的本地状态描述为可信签名或防篡改证明。

七、测试

至少覆盖：

1. 键盘可以完成序章选择，并可以完成完整 Mock 主路径的关键业务操作；
2. Diff 接受和拒绝不只依赖颜色；
3. 状态切换后焦点移动到新页面标题或等价主焦点位置；
4. 屏幕阅读器能区分删除、增加和批注；
5. 移动端双栏转换为有序单栏或标签页；
6. 图片缺失时有替代文本和占位图；
7. 路由、刷新、deep link 或客户端导航位置不能构造非法 ExperienceStage，也不能绕过状态机；
8. 朴素版本不会提前显示伪造内容；
9. 用户不能触发 CHARLIE_SIGN 或 CHARLIE_DECLINE_SIGN；
10. unavailable 不会显示为 declined，not_requested 不会显示为 unavailable；
11. restored_to_plain_text 必须经过具体 proposal 确认，生成新 plainRevisionId 且不会出现第二个 pending Diff；
12. stale restoration proposal 不能应用，stale SemanticDrift 阻止最终化；
13. 双击接受、拒绝、placement、proposal confirmation、签名继续或 finalization 按钮只产生一次业务状态变化；
14. Agent/Final Review 输出字段中的非可信文本 Fixture，包括 HTML、Markdown 链接、脚本片段和 tool-call-like 文本，按纯文本安全渲染；
15. 超长输入、Unicode 组合字符、窄屏溢出和持久化失败有可继续操作的 UI；
16. 旧 stage 的迟到响应不会覆盖当前页面状态；
17. MANUSCRIPT_REVISION 只编辑 precise draft；取消不产生 revision，实际提交后旧 plain/semantic/signature 结果按 Contract 失效；
18. Semantic Placement 三种处理路径均可完成，consistency check 期间不能继续 placement；
19. FinalizationResult.eligible=false 时展示 blockers 且不进入 FINALIZING；
20. FINALIZING 持久化失败不产生 COMPLETE 或部分最终封套，并可按正式恢复策略重试；
21. COMPLETE 页面只从 FinalEnvelope 读取业务数据，刷新后保持只读；
22. UI 组件测试或架构测试能够证明关键业务操作通过正式 event/application command 发送，不直接修改 SessionState 或复制 `evaluateFinalization`。

八、阶段 5 完成条件

完成后必须：

1. 确定性纵向切片完成验收，并至少覆盖一次 ROUND_1_DIFF accepted 或 rejected 的真实业务提交、持久化、刷新恢复和重复点击幂等；
2. 在 UI 中可以通过阶段 4 的 placeholder Mock 从 WELCOME 完整走到 COMPLETE，不需要真实模型或正式视觉素材；
3. MANUSCRIPT_REVISION 的返回、提交、取消和 revision-bound 失效提示均可操作；
4. Semantic Placement 的三种 placement、restoration proposal 确认/stale 状态和 consistency check UI 均可操作；
5. signed、declined、unavailable、not_requested 的 UI 语义不混淆，future Charlie 永远不可代签；
6. Finalization blockers、FINALIZING、finalization failure/recovery 和 COMPLETE 只读均有正式 UI；
7. 刷新恢复、持久化失败、图片失败、迟到结果、窄屏与非可信文本渲染均有测试覆盖；
8. 键盘可以完成完整 Mock 主路径，基础屏幕阅读器语义、焦点管理和移动端测试实际执行并报告结果；
9. UI 未直接修改 SessionState，未复制 FSM guard、SemanticDrift current 判定或 `evaluateFinalization` 条件；
10. 未新增或反向修改阶段 1—4 已冻结的 Domain/FSM/Agent/Final Review payload；如发现 Contract gap，已停止并单独报告，而不是在 UI 层临时补定义；
11. FinalEnvelope 页面只消费统一 Schema/确定性 presentation projection，未建立第二套最终封套数据模型；
12. 未安装真实模型 SDK、未发送真实模型请求，暂时只使用 Mock 流程和占位图；
13. 类型检查、相关 UI/组件测试、关键路径 E2E 或等价自动化测试实际执行并报告结果；
14. 列出修改文件、实际命令、测试结果、人工验证步骤和已知限制；
15. 不自动进入阶段 6。
```


### 阶段 6：Agent Prompt、真实 LLM Adapter 与后置验证

```text
现在执行阶段 6：编写 Agent Prompt，并接入真实 LLM Adapter 和后置安全验证器。

开始前说明：

1. 使用什么模型接口；
2. 如何封装 Adapter；
3. 如何处理密钥；
4. 如何强制结构化输出；
5. 如何按错误类型处理超时、限流、网络错误、非法 JSON 和禁止声明；
6. 哪些流程保持确定性；
7. Prompt、Adapter、Schema 和内容包如何版本化；
8. 如何处理 Prompt Injection；
9. 日志记录和脱敏范围；
10. 如何证明后置安全验证不依赖模型自报结果；
11. 每个 orchestrator 的主调用、重试、修复、token、延迟和费用预算；
12. 服务端请求大小、速率限制、并发限制和供应商数据保留设置。

LLM 只能负责：

- 理解用户观点；
- 提取限定；
- 检测张力；
- 生成受控查理回应；
- 提议局部 Diff；
- 分析语义偏移；
- 识别语义碎片；
- 整理具体分歧；
- 基于已验证的 `PortraitShiftComparison` 生成事实性摘要，不得重新比较或计算选择变化；
- 在最终签名阶段生成受控签名审阅建议。

LLM 不得：

- 控制状态跳转；
- 修改事实白名单；
- 直接应用正文修改；
- 判断用户是否正确；
- 延长轮次；
- 编造原著事实；
- 模拟认知障碍；
- 生成用户人格分析；
- 将用户输入中的命令、JSON、Markdown 或工具调用格式视为系统指令；
- 通过用户输入触发状态事件或修改内容门禁；
- 自行把签名状态写入 SessionState；
- 通过输出一个布尔字段证明自己没有违反禁止声明。

用户自由输入必须作为 `untrustedUserText` 显式传入确实需要读取原文的能力，并始终视为不可信数据。

- `extractUserPrinciple` 可以读取当前提交的完整 `untrustedUserText`；
- 其他能力应优先使用经过 Schema 校验的结构化 `UserPrinciple`；
- 只有确有必要时，其他能力才可以接收与当前任务直接相关、经过最小范围裁剪的用户原文；
- Adapter 必须把用户原文放入明确的数据字段，不得把其中的命令、JSON、Markdown 或工具调用格式拼接为系统指令；
- 用户原文不得进入常规日志、分析事件、模型调试日志、错误追踪正文或长期服务端存储。

除签名审阅外、实际调用模型的普通能力，其错误处理顺序按类型定义：

1. 网络超时、连接错误、429 或可重试 5xx：最多一次网络重试；
2. 返回内容可解析但不符合 Schema：最多一次结构化输出修复；
3. 出现 Prompt Injection 服从、禁止声明、越权 evidenceId 或安全验证失败：不重试原模型，进入同能力 Mock Adapter；
4. Mock Adapter 失败：静态安全模板；
5. 静态模板失败：可继续操作的降级 UI。

普通模型能力固定路径：

真实模型调用 → Candidate Schema → 按错误类型最多一次网络重试或结构化修复 → revision/content/evidence 绑定校验 → 后置安全验证 → Validated Result；失败后进入同能力 Mock Adapter → 静态安全模板 → 可继续操作的降级 UI。

调用预算默认沿用阶段 3 冻结值：每轮最多一次主调用，PLAIN_REWRITE/SEMANTIC_REVIEW 合计最多一次主调用，肖像摘要最多一次，签名审阅独立一次，完整 live Session 默认不超过六次主调用。九项能力可以在一次 orchestrated 调用中返回多个 Candidate，但每个 Candidate 必须独立校验；编排层只能在完整 Validated Bundle 就绪后原子提交，并为每个逻辑能力生成独立 CapabilityExecutionReceipt。

FinalReviewService.reviewCharlieSignature 使用能力级例外：

```text
AGENT_MODE=live：
live → Candidate Schema → 最多一次网络重试或结构化修复 → revision/content/evidence 绑定与安全验证 → Validated Result
失败 → CharlieSignatureReviewError → currentCharlieSignatureStatus=unavailable
不得进入 Mock 生成 signed 或 declined

AGENT_MODE=mock：
固定 Fixture → Mock FinalReviewService Candidate → revision/content/evidence 绑定与安全验证 → Validated Result
可以确定性返回 signed 或 declined，用于测试和完整 Mock Demo
```

同一个 live Session 中，不允许用 Mock 冒充真实查理的签名决定。普通模型能力的 Mock 回退规则不得自动套用到签名审阅；纯确定性领域服务不进入这条模型降级链。

必须具备：

- 超时；
- 限流和可重试错误分类；
- 最多一次网络重试；
- 最多一次结构化输出修复；
- Schema 校验；
- 后置安全验证；
- 模板降级；
- Mock 回退；
- 日志脱敏；
- Mock/真实模型切换；
- Prompt Injection 测试；
- 请求幂等和追踪 ID；
- 服务端请求体大小限制、速率限制和并发限制；
- 模型供应商数据保留与训练使用设置的显式配置；
- ActiveOperation 与迟到响应拒绝；
- 逐能力 CapabilityExecutionReceipt 和混合执行 provenance。

日志不得记录 API 密钥、`untrustedUserText`、用户原话依据、internalExcerpt、完整模型 Prompt 或可识别身份信息。可以记录 requestId、operationId、stageInstanceId、inputFingerprint 的不可逆摘要、capability、CapabilityExecutionReceipt.requestedMode、resolvedMode、fallbackReason、modelName、latency、resultType、schemaValidationStatus、safetyValidationStatus、tokenUsage、promptVersion、adapterVersion、resultSchemaVersion 和 contentBundleVersion。不得生成或展示一个伪造的 Session 级 resolvedMode。

受控 CharlieResponse 至少区分 position、acknowledgesUserPoint、reservation、question 和 evidenceIds。`prohibitedClaimCheck` 不由模型提供；可信 `validationResult` 只能由 Adapter 后置验证器在 Candidate 校验完成后生成。

签名审阅成功输出必须符合 `CharlieSignatureReviewResult`；模型、网络、Schema、revision/content/evidence 绑定或安全验证失败时生成 `CharlieSignatureReviewError`，并由编排层把最终 Session 状态设置为 unavailable，不能自动解释为 declined，也不能调用 Mock 补写角色决定。

阶段 6 同时实现 Agent 加载、超时、非法输出、安全验证和降级 UI，不得推迟到阶段 10 首次实现。
```

### 阶段 7：接入人工核验内容与正式视觉素材

```text
现在执行阶段 7：接入人工核验原著内容和正式视觉素材。

本阶段只负责把已经人工批准的正式内容和视觉资产接入阶段 2 已冻结的内容访问、Schema、canonicalization/checksum 与 production gate 边界，并验证它们能够被阶段 6 的真实模型链路安全消费。不得在本阶段重新定义 Domain、Runtime、Provenance、Agent、Final Review、FSM、Finalization 或 ContentBundle Contract。

只使用本阶段输入清单中明确指定的文件、数据和资产。不得使用清单之外的内容，不得自行补充、搜索或推测。

发现错字、来源冲突、分类疑问、版权/授权疑问或与已冻结 Contract 不匹配时，不得静默纠正；应保留原始输入并列入问题清单。未经确认不得改写事实内容、改变分类或扩展 Contract。

一、开始修改前：输入清单与可追溯性

开始时先列出并冻结本阶段工作清单：

- CONTENT_INPUT_MANIFEST
- ASSET_INPUT_MANIFEST

这两个 manifest 是阶段 7 的输入审计清单，不自动成为 Domain/SessionState Contract。

CONTENT_INPUT_MANIFEST 每项至少记录：

- inputId；
- sourceRef 或受控文件路径；
- intendedTarget；
- inputChecksum；
- approvalStatus；
- classification；
- editionId（如适用）；
- verifiedBy（如适用）；
- verifiedAt（如适用）。

ASSET_INPUT_MANIFEST 每项至少记录：

- inputId；
- sourceRef 或受控文件路径；
- intendedTarget；
- inputChecksum；
- approvalStatus；
- assetId；
- creator；
- creationMethod；
- licenseOrPermission；
- approvedForPublicUse。

最终新增或修改的正式内容和资产必须可以追溯到一个已批准 manifest entry；清单外输入数量必须为 0。

二、内容分类与确认门

先将内容分类为：

1. 可以进入 VERIFIED_FACT；
2. 只能进入 CURATORIAL_INTERPRETATION；
3. 属于 ORIGINAL_INTERACTION；
4. 信息不足，不能使用。

内容分类、来源冲突、版权/授权冲突或任何 Contract 变化必须等待我确认后再写入；已批准清单内、且不改变 Contract 的格式化接入可以连续完成。

不得因为接入方便而：

- 将 ORIGINAL_INTERACTION 标记为 VERIFIED_FACT；
- 将 CURATORIAL_INTERPRETATION 写成作者唯一结论；
- 为缺少信息的条目补写模型记忆或搜索结果；
- 修改阶段 2 已冻结的 evidenceId、editionId、public/private projection、ContentGateEvaluation 或 checksum 语义；
- 为 assetManifestVersion、视觉元数据或本阶段方便新增 SessionState/FinalEnvelope 字段。若确实需要新 Contract 字段，停止并报告 Contract gap。

三、正式内容与视觉资产接入

完成：

1. 原著版本信息；
2. 核验白名单；
3. 三张正式证据卡；
4. 来源位置；
5. 使用限制；
6. 可支持解释；
7. 禁止推导的结论；
8. 三幅正式场景肖像图配置；
9. 图像来源与版权/授权说明；
10. production 内容校验；
11. 内容包版本与资产清单版本；
12. 正式内容进入 public projection 和真实模型输入边界的回归验证。

四、继承阶段 2 的 ContentBundle 与 checksum Contract

本阶段不得重新定义或简化 ContentBundle 字段、canonicalization 或 checksum 规则。必须完全沿用阶段 2 已冻结的 ContentBundle、ContentLoader/content access interface、public/private projection、唯一 `evaluateContentGate(...)`、`ContentGateEvaluation` 与 canonical checksum Contract。

特别要求：

1. 继续严格区分 `internalContentBundleChecksum` 与公开运行时 `contentBundleChecksum`；
2. `SessionState.contentBundleChecksum`、ContentGateEvaluation、Final Review 输入绑定和 FinalEnvelope provenance 继续只使用公开运行时 `contentBundleChecksum`；
3. `internalExcerpt` 只能停留在内部核验边界，不得进入客户端 public bundle、模型 Prompt、FinalReview 输入、analytics 或常规日志；
4. production verified bundle 中不得存在 placeholder；
5. contentBundleVersion、contentBundleChecksum 或 editionId 变化时，不得静默恢复旧 Session；继续使用已冻结的迁移、拒绝恢复或只读旧快照规则；
6. `assetManifestVersion` 属于阶段 7 的资产审计/构建清单版本；除非已确认 Contract 明确要求，否则不得把它自行加入 ContentBundle、SessionState 或 FinalEnvelope Schema。

五、图像配置与资产边界

图像配置至少记录：assetId、filePath、altText、creator、creationMethod、licenseOrPermission、approvedForPublicUse、characterDesignVersion 和 fallbackAssetId。

必须验证：

- 三幅正式场景肖像图文件均存在且可加载；
- fallbackAssetId 指向实际存在、允许公开使用的 fallback；
- altText 可用于基础可访问性；
- approvedForPublicUse 未通过的资产不能进入 production；
- 图片只负责感受序章和肖像回收，不得被当作事实证据；
- 图片元数据、文件名或视觉描述不得被 Agent 当作 VERIFIED_FACT 来源。

六、真实模型内容访问回归

阶段 6 已实现真实 LLM Adapter 后，本阶段必须用正式 verified bundle 验证实际模型输入边界，而不是只验证静态 JSON。

必须确认：

1. Agent、FinalReviewService 和 application/orchestration 只能通过 ContentLoader/content access interface 消费已校验内容；
2. 不得直接 import、读取或解析 `/content/*.json` 原始文件绕过 Schema、public/private stripping、checksum 和 gate；
3. 发送给模型的 evidence 内容只能来自允许公开的 projection；
4. `internalExcerpt`、未批准解释、信息不足条目和 placeholder 不得进入真实模型 payload；
5. `evidenceIds`、`interpretationIds`、editionId、contentBundleVersion 和 `contentBundleChecksum` 的绑定继续通过现有 Contract 校验；
6. 该验证不得通过真实模型输出“自证安全”，必须由应用/Adapter 层检查实际构造的请求 payload 或测试 fixture。

七、阶段 7 测试

至少实际运行并报告：

1. 内容 Schema 测试；
2. evidenceId、interpretationId、editionId 引用完整性测试；
3. canonical checksum 测试；
4. public/private projection 测试；
5. `internalExcerpt` 不进入 public payload/模型输入的负测试；
6. production placeholder gate 负测试；
7. 唯一 `evaluateContentGate(...)` 对正式 verified bundle 的通过测试；
8. 三张 EvidenceCard 只引用已批准事实/解释的测试；
9. 三幅正式图片与 fallback 的存在性、加载和 public-use 校验；
10. application/Agent/FinalReview 不绕过 ContentLoader 的静态规则或自动化测试；
11. 正式内容接入后至少一次 live 模型 smoke test 或等价请求构造测试，确认模型输入只包含允许公开内容；若因密钥、额度或部署条件无法执行真实请求，必须明确标记未执行，不得宣称通过。

不得为通过测试而放宽阶段 2 production gate、公开 `internalExcerpt`、修改已冻结 ContentBundle Contract 或让 placeholder 混入 verified bundle。

八、阶段 7 → 阶段 8 冻结交接

阶段 7 完成时必须明确冻结供阶段 8 使用的：

- contentBundleId；
- editionId；
- contentBundleVersion；
- contentBundleChecksum；
- contentSchemaVersion；
- CONTENT_INPUT_MANIFEST 版本/摘要；
- assetManifestVersion；
- ASSET_INPUT_MANIFEST 版本/摘要；
- 三张 EvidenceCard ID；
- 三幅正式 portrait assetId 与 fallbackAssetId。

阶段 8 只能针对这组已冻结输入做完整联调。阶段 8 开始后如果事实、解释、EvidenceCard、publicSummary、原著版本、正式图片、fallback 或版权/授权信息发生变化，必须生成对应的新内容/资产版本与 checksum，并重新执行阶段 7 相关门禁后再继续联调，不得把针对旧 bundle 的测试结果沿用到新 bundle。

九、阶段 7 完成条件

完成后必须：

1. 所有正式内容和资产都能追溯到已批准 manifest entry，清单外输入数量为 0；
2. 内容 Schema、引用完整性、checksum、public/private projection 和 production gate 测试实际执行并报告结果；
3. production verified bundle 中不存在 placeholder；
4. `internalExcerpt` 不进入客户端 public payload、Agent Prompt、FinalReview 输入、analytics 或常规日志；
5. 三张 EvidenceCard 均只引用已批准 VERIFIED_FACT / CURATORIAL_INTERPRETATION，并保留来源、允许解释和禁止推导边界；
6. 三幅正式图片及 fallback 均存在、可加载、具有 altText，并通过 public-use/版权或授权检查；
7. 唯一 `evaluateContentGate(...)` 对本阶段冻结的正式 bundle 返回 passed，不产生第二套门禁结果；
8. 真实模型请求构造边界已验证，只包含 ContentLoader 公开 projection 允许发送的内容；
9. `internalContentBundleChecksum` 与公开运行时 `contentBundleChecksum` 没有混用，本阶段未重新定义 ContentBundle checksum Contract；
10. 如发现任何需要修改已冻结 Domain/Runtime/Provenance/Agent/Final Review/FSM/Finalization/ContentBundle Contract 的问题，已作为 Contract gap 单独报告并等待确认，没有静默修改；
11. 已冻结供阶段 8 使用的 content bundle 与 asset manifest 版本/摘要，并说明后续变化的重新门禁规则；
12. 输出问题清单、排除内容、修改文件、实际执行命令、实际测试结果、未执行项和已知限制；
13. 不自动进入阶段 8。
```


### 阶段 8：完整联调与发布候选验证

```text
现在执行阶段 8：对已冻结输入形成 Release Candidate，并完成完整联调与发布候选验证。

本阶段不增加新功能、不增加新玩法、不重新设计产品流程，也不主动修改已冻结 Contract。阶段 8 的目标不是继续扩展实现，而是回答：

“当前这一组明确冻结、可追溯的代码、Prompt、Adapter、Schema、正式内容、视觉资产和运行配置，是否足以作为阶段 9 真实用户测试的唯一候选基线？”

一、本阶段边界

本阶段允许：

1. 修复不改变已冻结产品语义和 Contract 的实现 bug、测试 bug、样式/可访问性 bug、错误处理 bug、恢复/并发 bug 和已冻结接口范围内的 Adapter/Prompt 实现问题；
2. 为验证已冻结 Contract 补充测试 fixture、stub/fake transport、测试辅助函数和 QA/release artifact；
3. 调整不改变 Contract 的 production Prompt/Adapter 实现，但必须提升对应版本号或生成可追溯的新版本标识，并使旧 RC 测试结果按本阶段规则失效；
4. 修复构建、类型、lint、测试和静态资源集成问题，但不得通过删除门禁、放宽 Schema、跳过验证器或伪造测试结果来获得通过。

本阶段不得：

1. 增加第四轮、角色、评分、剧情、玩法、业务阶段或新的 Agent 通用能力；
2. 静默修改 Domain、Runtime、Provenance、Agent、Final Review、FSM、Finalization、Naming 或 ContentBundle Contract；
3. 为了让 E2E 通过而新增第二套业务状态、临时 payload、临时 finalization 条件、临时 content gate 或绕过 ContentLoader；
4. 修改正式事实、解释、EvidenceCard、publicSummary、原著版本、正式图片、fallback、版权/授权信息后继续沿用旧阶段 7 门禁结果；
5. 把阶段 9 的真实用户测试、analytics 同意机制或研究分析提前作为本阶段功能；
6. 把阶段 10 的真实生产部署、部署后 smoke、生产 CSP/安全响应头和平台级限流验收伪装成本阶段已经完成；阶段 8 可以验证代码/config 能力和 staging-like 行为，但最终 production 部署验收仍属于阶段 10。

二、开始前的 STOP 条件

开始任何阶段 8 修改或测试前，先检查并报告：

1. 阶段 7 的 13 项完成条件是否全部具有实际证据，不得仅根据文字声明认定通过；
2. 阶段 7 冻结的 contentBundleId、contentBundleVersion、contentBundleChecksum、editionId、EvidenceCard IDs、portrait assetIds、fallbackAssetIds、CONTENT_INPUT_MANIFEST 和 ASSET_INPUT_MANIFEST 是否可以唯一确定；
3. 唯一 `evaluateContentGate(...)` 对该正式 bundle 是否仍返回 passed；
4. production verified bundle 是否仍然不存在 placeholder；
5. 当前 Git branch、HEAD commit、工作区状态和待测试 build 是否可以确定；
6. 当前 Session/Domain/Runtime/Provenance/Agent/Final Review/FSM/Finalization/ContentBundle 相关 Contract 版本是否可以确定；
7. production Prompt、Adapter、Candidate/Validated Result Schema、FinalReview Schema 及其版本是否可以确定；
8. 阶段 4—7 已要求的完整 Mock 路径、真实模型集成路径、正式内容 public projection 和 FinalReview failure semantics 是否已有可消费实现；
9. 当前不存在未确认的 Contract gap、内容分类/来源问题或版权/授权 blocker；
10. 当前阶段 8 的目标运行模式、目标浏览器/运行环境和是否包含 live provider 验证可以明确。

如果任一项无法确认：

- 标记为 BLOCKED；
- 说明缺失证据、受影响测试和可安全执行的只读检查；
- 不得把阶段 8 宣称为已开始验证 RC；
- 不得通过猜测、默认值或静默修改 Contract 解除阻塞。

三、冻结 RC_TEST_MANIFEST

通过开始前 STOP 后，先创建或输出本阶段唯一的 `RC_TEST_MANIFEST`。它是 QA/release artifact，不是 Domain 实体，不进入 SessionState，也不得因此新增正式业务 Schema。

至少记录：

- rcId；
- gitBranch；
- gitCommit；
- workingTreeStatus；
- buildId 或可重复构建标识；
- sessionSchemaVersion；
- contentSchemaVersion；
- agentContractVersion；
- finalReviewSchemaVersion；
- 各关键 resultSchemaVersion；
- promptVersion 或 prompt version vector；
- adapterVersion；
- contentBundleId；
- contentBundleVersion；
- contentBundleChecksum；
- editionId；
- EvidenceCard IDs；
- asset manifest version/checksum 或等价摘要；
- portrait assetIds；
- fallbackAssetIds；
- 目标 requestedAgentMode/运行模式；
- live provider/model 配置的非敏感标识；
- 目标浏览器/运行时矩阵；
- 测试开始时间；
- 明确排除的可选能力。

不得把 API key、完整 Prompt、internalExcerpt、完整用户自由输入或供应商敏感配置写入 manifest。

所有阶段 8 测试报告必须引用 rcId。无法说明“该结果属于哪个 rcId”的测试结果不得计入阶段 8 完成证据。

四、RC 变化与测试失效规则

阶段 8 开始后：

1. 如果 VERIFIED_FACT、CURATORIAL_INTERPRETATION、EvidenceCard、publicSummary、edition、content bundle、正式图片、fallback 或版权/授权信息发生任何变化：
   - 生成新的内容/资产版本与 checksum；
   - 返回阶段 7 重新执行相关输入追溯、projection 和 production gate；
   - 原 rcId 作废；
   - 不得沿用旧阶段 8 测试结果。

2. 如果代码、Prompt、Adapter、Schema 实现、模型配置、构建配置或依赖发生变化但不改变已冻结 Contract：
   - 生成新的 rcId 或 RC revision；
   - 明确变更摘要；
   - 根据依赖关系重跑所有受影响测试；
   - 核心 Mock E2E、类型检查、lint、构建和与变更路径直接相关的 integration tests 必须重新执行；
   - 不得把旧 rcId 的结果无条件复制为新 rcId 的通过结果。

3. 如果修复要求改变已冻结 Contract：
   - 立即停止相关实现；
   - 输出 Contract gap、为什么当前 Contract 无法表达正确行为、受影响文件和最小修订建议；
   - 等待确认；
   - 不得在阶段 8 内静默发明第二套类型、事件、状态、错误码、finalization 条件或内容 checksum 规则。

五、完整产品链路

至少验证：

1. 欢迎页和原创声明；
2. 序章三幅场景肖像图；
3. 初始判断记录；
4. 第一轮证据、回应和 Diff；
5. 第二轮张力检测和 Diff；
6. 第三轮关系问题和独立 Diff；
7. 朴素版本生成；
8. 语义偏移；
9. 语义碎片逐项处理；
10. 语义花束；
11. 肖像重新拼合；
12. 现在的查理签名审阅，包括 signed、declined、unavailable 和 not_requested；
13. 文稿归宿；
14. Finalization 判定；
15. 最终封套；
16. 页面刷新与状态恢复；
17. COMPLETE 快照只读；
18. START_NEW_SESSION/重新体验使用新的 sessionId，不修改旧 COMPLETE 快照。

必须继续验证以下冻结语义：

- 无第四轮；
- 第三轮存在独立 Diff；
- 未确认 Diff 不写入；
- futureCharlieSignatureStatus 永远为 blank；
- 未核验事实不进入体验；
- 图片失败不影响核心体验；
- 所有 VERIFIED_FACT 有已核验来源；
- CURATORIAL_INTERPRETATION 指向允许依据的事实；
- ORIGINAL_INTERACTION 明确标记为原创；
- 所有 Agent 提议的正文修改具有 reason、documentTarget 和 baseRevisionId；
- `restored_to_plain_text` 只有在用户确认具体仍有效的 SemanticRestorationProposal 后才能应用并生成新 plainRevisionId；
- anchor/hash/proposalHash/revision 不匹配时 proposal 必须 stale，禁止自动猜测插入位置；
- placement batch 结束后只有一次 consistency check，并生成绑定最终双 revision 的新 SemanticDrift=current；
- SemanticDrift=current 始终绑定当前 preciseRevisionId/plainRevisionId；
- 用户不能替查理触发 signed 或 declined；
- live 技术失败显示为 unavailable，不伪装成 declined；
- FINAL_SIGNATURE 只读；
- RETURN_TO_MANUSCRIPT_REVIEW 进入已冻结 MANUSCRIPT_REVISION 路径；
- 实际 revision 变化使旧 plain/drift/placement/signature review 等 revision-bound 结果失效；
- COMPLETE 后不可编辑；
- production 构建不包含 placeholder；
- requestedMode、逐能力 resolvedMode、outcome 和 fallbackReason 在 UI/FinalEnvelope 中可解释；
- 混合执行不得压缩成单一 Session resolvedMode；
- live FinalReview 技术失败必须保持 unavailable；
- `internalExcerpt` 不得进入 public payload、Agent/FinalReview 请求、analytics 或常规日志。

六、Agent 能力与 FinalReviewService 测试矩阵

建立两套矩阵，不得把“真实 provider smoke”与“可控错误注入”混成一类。

A. controlled contract/integration matrix

对九项能力按适用性覆盖：

- 正常 Candidate；
- 非法 JSON 或无法解析输出；
- Candidate Schema validation failure；
- 业务 binding failure；
- prohibited/safety validation failure；
- timeout；
- rate_limited；
- network_error；
- stale revision/stage/input fingerprint；
- 允许的 Mock/static_template fallback；
- 必需槽位无法降级时整个 Bundle 失败；
- receipt 的 requestedMode/resolvedMode/outcome/fallbackReason 正确。

这些失败场景优先通过 fake/stub transport、固定 fixture 或受控 Adapter response 确定性制造。不得要求真实供应商为了测试而稳定生成非法 JSON、特定错误或不安全内容。

对 FinalReviewService 单独覆盖：

- Mock 模式确定性的 signed；
- Mock 模式确定性的 declined；
- live Candidate 合法结果；
- live timeout/rate limit/network/invalid output/schema/binding/safety failure → unavailable；
- live unavailable 后按已冻结规则最多手动重试；
- live 禁止自动 Mock 回退；
- Candidate 或供应商原始响应不得进入 SessionState；
- unavailable、not_requested、declined 不可互相替代。

B. live provider smoke matrix

真实模型 smoke 只验证真实供应商才能证明的边界：

- 认证与真实 request format；
- production Prompt 与 provider structured-output 兼容；
- public evidence projection 符合阶段 7 冻结边界；
- Candidate → Schema → binding → safety validator → Validated Result 链真实可运行；
- 至少一条代表性的 RoundAnalysis live path；
- Plain/Semantic live path；
- 如果本 RC 的目标模式包含 live FinalReview，则至少一条真实 FinalReview 请求可得到合法 Result，或按真实技术失败语义进入 unavailable；
- execution receipts 记录真实 promptVersion、adapterVersion、resultSchemaVersion 和 resolvedMode。

不得把“真实模型没有稳定产生 signed/declined 两种角色结论”视为缺陷；这两条业务分支由 controlled/Mock 测试确定性覆盖。

如果 RC 明确为 mock-only 候选，live smoke 可以标记 N/A，但必须在 `RC_TEST_MANIFEST` 和最终报告中明确；不得把 mock-only RC 描述为已通过 live provider 验证。

七、Mock、live 与无网络路径

必须分别验证：

A. requestedAgentMode=mock

- 完全无网络时可以从新 Session 走到 COMPLETE；
- 不发送真实模型请求；
- execution receipts 正确显示 mock/deterministic/static_template 来源；
- 如果 production 允许 mock，界面和 FinalEnvelope 必须明确标识，不让用户误认为是真实模型结果。

B. requestedAgentMode=live

模拟断网或 provider 技术失败时：

- 普通 Agent 能力只按已冻结错误映射和 fallback 规则处理；
- 不允许的 fallback 不得自行新增；
- FinalReviewService 绝不自动 Mock 生成 signed/declined；
- FinalReview 技术失败进入 unavailable；
- unavailable 后用户仍可按 Contract 继续到 FINAL_DISPOSITION/FINALIZING/COMPLETE；
- FinalEnvelope 中 execution receipts 与签名状态能够解释真实发生的失败和降级。

八、Finalization integration matrix

`evaluateFinalization(state, context)` 是唯一最终化判定。阶段 8 必须在真实集成状态上验证 eligible 与 blockers，不得只测试各页面是否能点击到下一步。

至少覆盖：

1. 正常 eligible；
2. 三轮未完成；
3. precise/plain text 或 revision 缺失；
4. SemanticDrift stale 或 revision binding 不匹配；
5. SemanticFragment 未完成 placement；
6. SemanticPlacementBatch 仍 active/stale；
7. pendingDiff 非 null；
8. runtime.activeOperation 非 null；
9. finalPortraitChoice 缺失；
10. currentCharlieSignatureStatus 非合法最终状态；
11. futureCharlieSignatureStatus 非 blank；
12. finalDisposition 缺失；
13. ContentGateEvaluation 与 Session content bundle/version/checksum/环境不匹配；
14. requiresContentGateAttestation=true 但 attestation 缺失或验证失败；
15. openDissents 非空仍允许 finalization；
16. finalDisposition=unfinished 仍允许 COMPLETE；
17. FINALIZING 中构建/持久化失败不得产生部分 COMPLETE；
18. eligibility 通过后 FinalEnvelope 由当前结构化状态确定性生成。

UI、FSM 和 Envelope Builder 对 blocker 的解释必须来自同一 FinalizationResult，不得各自复制条件。

九、测试分层

至少执行并记录：

1. 确定性 Mock E2E；
2. controlled Agent/FinalReview contract/integration matrix；
3. 按 RC 目标模式执行真实模型 smoke test；
4. mock 模式无网络 E2E；
5. live 模式网络失败与 FinalReview unavailable E2E；
6. 静态图片损坏与 fallback 测试；
7. 页面刷新恢复测试；
8. 旧状态版本恢复或拒绝测试；
9. 移动端完整流程；
10. COMPLETE 快照不可变测试；
11. 双 revision 与 stale SemanticDrift 测试；
12. 签名责任主体、pending 恢复、attemptCount 与 unavailable 降级测试；
13. 基础可访问性审计，至少覆盖键盘完整主流程、焦点、语义标签和关键错误提示；
14. SemanticPlacementBatch 连续回填、proposal stale 和最终 current drift 测试；
15. 迟到响应、重复回调、取消操作和 stageInstanceId/inputFingerprint/revision 不匹配测试；
16. 双击事件、重复事件与可验证 idempotency_conflict 测试；
17. IndexedDB transaction 中止、损坏、quota、Web Locks 互斥、无 Web Locks 乐观冲突和跨标签页只读/复制路径测试；
18. 超长输入、Unicode normalization/anchor 边界和模型输出 XSS/HTML 安全渲染测试；
19. Prompt injection/指令注入负测试：用户自由输入不得使模型越权引用 internal content、控制 FSM、绕过 Schema 或生成可信验证结论；
20. 日志与请求数据泄漏负测试：API key、internalExcerpt、完整用户自由输入、完整模型 Prompt 不进入不允许的 analytics/常规日志/客户端 bundle；
21. FinalEnvelope 版本元数据、逐能力 execution receipts、integrityChecksum 损坏检测、ContentGateAttestation 与 FinalEnvelopeAttestation 验证测试；
22. production mock 模式明确标识测试；
23. RoundAnalysis Bundle 部分失败时无半轮写入测试；
24. PlainSemantic Bundle 部分失败时无 plain/drift 半提交测试；
25. FINAL_SIGNATURE 只读、RETURN_TO_MANUSCRIPT_REVIEW、CANCEL/SUBMIT_MANUSCRIPT_REVISION 和旧审阅失效测试；
26. Finalization integration matrix；
27. production build placeholder scan 与正式 content gate 回归；
28. RC_TEST_MANIFEST 与 FinalEnvelope/运行版本信息一致性检查。

测试环境或 Contract 明确不适用的项目可以标记 N/A，但必须说明依据。没有执行的 required test 必须标记 NOT_RUN，不得写成 PASS。

十、调用预算、性能与 provenance

继承阶段 3/6 已冻结的调用和预算约束，阶段 8 不重新发明预算。

对每个 orchestrator 和至少一条完整 live session 记录：

- 主 provider call count；
- network retry count；
- repair count；
- fallback count；
- timeout；
- token 使用量或供应商可获得的等价用量；
- 模型调用延迟；
- 完整体验中模型等待的累计延迟；
- 估算费用或供应商可获得的等价费用；
- 每项能力 resolvedMode；
- execution receipt 数量与 capability 对应关系。

如果实际结果超过阶段 3/6 已冻结预算：

- 标记为 RC blocker 或 Contract/architecture gap；
- 说明超出来源；
- 不得静默提高预算来使阶段 8 通过。

如果供应商不提供某项计量，标记 UNAVAILABLE，并说明可观测范围，不得伪造数值。

十一、缺陷分级与修复规则

每个发现的问题至少记录：

- issueId；
- rcId；
- severity；
- 复现步骤；
- 预期行为；
- 实际行为；
- 责任层；
- 是否触及冻结 Contract；
- 是否触及阶段 7 冻结内容/资产；
- 修复 commit；
- 需要重跑的测试集合；
- 最终状态。

至少分为：

RC_BLOCKER：
- required test 失败；
- required test 因目标环境缺失而无法执行；
- build/typecheck/lint 按仓库既有要求失败；
- content gate/checksum/manifest 不一致；
- production placeholder 泄漏；
- 未核验内容或 internalExcerpt 泄漏；
- 状态半提交、幂等/恢复导致业务重复写入；
- FinalReview live 技术失败被伪装成 declined 或 Mock signed/declined；
- evaluateFinalization 错误放行或错误阻塞；
- COMPLETE 可编辑；
- 密钥或受禁止的用户/模型内容泄漏；
- Contract gap 未解决；
- RC 无法唯一复现或版本不可追溯。

NON_BLOCKER：
仅限不改变产品正确性、数据安全、内容来源、可完成性和关键可访问性的已知限制。必须明确为什么不阻塞阶段 9。

不得仅通过降低 severity 把 blocker 留到阶段 9 用户测试。

十二、阶段 8 完成条件

只有同时满足以下条件，阶段 8 才可以标记 COMPLETE/READY_FOR_STAGE_9：

1. 开始前 STOP 条件全部满足；
2. `RC_TEST_MANIFEST` 已冻结且可以唯一对应当前测试结果；
3. 阶段 7 冻结的 content bundle/asset manifest 在阶段 8 期间未被静默改变；
4. 类型检查、仓库要求的 lint、全部 required unit/contract/integration/E2E 和构建已实际执行；不存在把 NOT_RUN/N/A 伪装成 PASS；
5. 确定性 Mock E2E 从新 Session 到 COMPLETE 通过；
6. 目标模式包含 live 时，真实 provider smoke 按本阶段定义通过；mock-only RC 必须明确标记 mock-only；
7. controlled Agent 能力矩阵与 FinalReviewService 矩阵通过；
8. mock/live 无网络与 failure semantics 通过，live FinalReview 不发生自动 Mock 冒充签名决定；
9. Finalization integration matrix 通过；
10. 双 revision、SemanticPlacementBatch、stale drift、MANUSCRIPT_REVISION、signature invalidation、迟到响应、幂等和 IndexedDB 原子提交关键测试通过；
11. production placeholder/content gate/public projection 回归通过；
12. Prompt injection、XSS、日志/请求敏感信息泄漏负测试没有 RC blocker；
13. 调用预算和 provenance 已实际核对；超预算问题已解决或作为已确认架构/Contract blocker 处理；
14. 移动端和基础可访问性关键路径没有 blocker；
15. 所有 RC_BLOCKER 已关闭并在最终 rcId 上完成必要回归；
16. 所有仍存在的 NON_BLOCKER 有明确影响、原因和阶段 9/10 处理建议；
17. FinalEnvelope 的版本元数据、execution receipts、content bundle binding 和完整性检查与 rcId 对应结果一致；
18. 输出完整人工主流程验证结果；
19. 冻结供阶段 9 使用的最终 rcId、Git commit/build、Prompt/Adapter/Schema version vector、content bundle 与 asset manifest 摘要；
20. 明确声明：阶段 9 只能基于该冻结 RC 开始真实用户测试。若阶段 9 前代码、Prompt、Adapter、Schema、模型配置发生变化，必须回阶段 8 对受影响测试重新验证；若正式内容/资产发生变化，必须先回阶段 7 重新门禁，再重新执行阶段 8 受影响验证；
21. 不自动进入阶段 9。

十三、阶段结束输出格式

完成阶段 8 后按以下格式输出：

1. 阶段 8 目标与最终判定：READY_FOR_STAGE_9 / BLOCKED；
2. RC_TEST_MANIFEST；
3. 阶段 7 冻结输入复核；
4. 修改文件；
5. 缺陷与修复清单；
6. Agent controlled integration matrix；
7. FinalReviewService matrix；
8. live provider smoke 结果；
9. 完整 E2E/恢复/并发/持久化测试结果；
10. Finalization integration matrix；
11. 安全、隐私、XSS/Prompt injection 与日志泄漏测试结果；
12. 调用次数、retry、token、latency、费用和 execution provenance 核对；
13. 实际执行的命令；
14. 类型检查、lint、测试和构建的实际结果；
15. NOT_RUN、N/A、仅人工检查和失败项；
16. RC_BLOCKER 与 NON_BLOCKER；
17. 人工完整流程验证步骤与结果；
18. 阶段 9 冻结交接信息；
19. 已知限制；
20. 本阶段未执行的操作。

不得宣称未执行的测试通过，不得省略失败测试，不得自动进入阶段 9。
```

### 阶段 9：真实用户测试版本

```text
现在执行阶段 9：准备真实用户测试版本。

不增加新玩法。

测试开始前必须提供清晰的数据说明和同意机制。用户可以拒绝分析数据而继续体验。默认不将用户自由输入正文、用户原话依据或模型完整输入写入 analytics 和服务端日志；如为刷新恢复而保存在浏览器中，必须明确本地保存范围、删除方式和生命周期。使用随机 Session ID，并明确收集目的、保存期限、删除方式和演示环境隔离规则。

允许记录的匿名或最小化事件：

- 总体验时间；
- 各阶段停留时间；
- 初始肖像选择；
- Diff 接受或拒绝；
- 语义碎片去向；
- 是否保留分歧；
- 最终肖像选择；
- 文稿归宿；
- 是否完成；
- 是否触发降级；
- Prompt、Adapter、Schema 和内容包版本。

禁止记录：

- 用户人格标签；
- 心理诊断；
- 不必要身份信息；
- API 密钥；
- 未脱敏敏感输入；
- 完整用户自由输入；
- internalExcerpt；
- 完整模型 Prompt。

反馈问题：

1. 你最初为什么选择那个“真正的查理”？
2. 体验结束后，你如何描述自己的最终选择？它与开始时有什么不同？
3. 哪一轮最影响你的判断？
4. 精确版和朴素版有什么区别？
5. 语义花束代表什么？
6. 为什么未来查理的签名为空？
7. Agent 是否让你觉得被审判？
8. 哪个环节最像普通聊天机器人？
9. 哪个环节让你觉得 AI 是必要的？
10. 是否误以为原创内容来自原著？

至少评估：完成率、中位体验时长、各阶段退出率、原创内容误认率、未来签名含义理解率、语义花束理解率、Agent 被审判感比例和真实模型降级率。

用户测试分析只描述用户如何表达理解变化及其相关环节，不评价用户是否“真正改变”或是否达到正确理解。
```

### 阶段 10：部署、提交与最终交付

```text
现在执行阶段 10：完成最终优化、部署和项目说明。

不改变核心流程，不在此阶段首次引入基础响应式、键盘导航或核心错误处理。

Release blocker：

1. 类型检查、lint、单元测试、集成测试和构建通过；
2. Mock 模式可完整运行；
3. 正式内容门禁通过；
4. 真实模型失败可回退；
5. 密钥不进入客户端、源码地图或日志；
6. 键盘可以完成完整流程；
7. 移动端可用；
8. 来源与原创声明完整；
9. 无第四轮；
10. 双 revision、SemanticDrift stale 和 restored_to_plain_text 规则通过；
11. 用户不能替查理签名，unavailable 和 not_requested 均不伪装成 declined；
12. COMPLETE 状态只读；
13. 生产环境不加载 placeholder；
14. 部署后 smoke test 通过；
15. CSP、基础安全响应头、服务端请求大小限制和速率限制生效；
16. production 使用 mock 时界面和最终封套必须明确标识，不得让用户误认为是真实模型审阅；
17. FinalEnvelope 完整性和版本元数据校验通过。

完成：

- 最终封套视觉整理；
- 响应式和可访问性复核；
- 加载、错误和降级状态复核；
- 原著来源和原创声明；
- README；
- 仅包含变量名与说明的环境变量模板；
- 部署说明；
- Demo 路径；
- 测试说明；
- 内容更新流程；
- 生产环境变量校验；
- Mock/Live 模式开关校验；
- 内容包版本校验；
- placeholder 扫描；
- API 限流或额度不足测试；
- 静态资源 404 测试；
- CSP 与安全响应头检查；
- 请求大小、速率和并发限制测试；
- 模型供应商数据保留设置检查；
- production Mock 明示与最终封套版本元数据检查。

可选增强，不得阻塞发布：

- 打印友好样式；
- PDF 导出；
- 运行时生成合成肖像；
- 非必要动画。

最后运行完整人工流程并输出最终交付报告。不得宣称未执行的测试通过；必须单独列出未执行、失败或仅人工检查的项目。
```

---

## 五、两人协作分工

最稳妥的分工不是“你做左边，他做右边”，而是：

> **你负责作品语义、内容、Agent Prompt、视觉策展和用户研究；队友负责工程架构、状态机、前端实现、Adapter、集成和部署。每个核心交付物只有一个直接负责人，另一方负责审核。**

### 责任矩阵

| 交付物 | 直接负责人（DRI） | 审核责任 |
|---|---|---|
| Scope Freeze | 你 | 队友检查工程可实现性 |
| 原著版本与事实白名单 | 你 | 队友检查 Schema 和门禁 |
| 证据卡与策展解释 | 你 | 队友检查数据契约 |
| 三轮问题与查理边界 | 你 | 队友检查接口和降级 |
| 场景肖像图与视觉说明 | 你 | 队友检查格式、性能和可访问性 |
| Domain Schema | 队友 | 你审核产品语义 |
| Agent Tool Contract | 队友维护接口 | 你审核能力语义 |
| Final Review Contract | 队友维护接口 | 你审核签名语义与降级 |
| State Machine | 队友 | 你审核体验顺序和边界 |
| Agent Prompt | 你 | 队友审核结构化输出兼容性 |
| Mock/LLM Adapter | 队友 | 你做内容和行为评测 |
| UI 与可访问性 | 队友 | 你审核体验表达 |
| 用户测试设计与分析 | 你 | 双方共同复盘 |
| 联调、部署和 Demo | 队友 | 双方验收 |

原则：

> 你定义“这项数据和行为是什么意思”，队友定义“它如何被可靠实现”；出现冲突时，不得由 Codex 自行裁决，必须回到 `/docs/scope-freeze.md` 和已确认 Contract。

### 共同确认的核心 Contract

- Scope Freeze；
- Domain Schema；
- State Machine；
- Agent Tool Contract；
- Final Review Contract；
- EvidenceCard 数据格式；
- DocumentDiff JSON；
- SemanticFragment JSON；
- FinalEnvelope 数据格式；
- 完整 Demo 路径；
- 用户测试验收标准。

共同确认不等于共同承担最终责任。每个文件和交付物必须有一个 DRI。

---

## 六、参考目录与所有权

> 以下目录仅适用于空仓库或与现有仓库兼容的情况。已有仓库时，阶段 0 应先给出增量映射，不得为了匹配本文档而重建工程。

```text
/docs
  codex-collaboration-guide.md
  scope-freeze.md
  product-brief.md
  experience-flow.md
  content-policy.md
  art-direction.md
  domain-contract.md
  state-machine.md
  agent-tool-contract.md
  final-review-contract.md
  naming-contract.md
  finalization-contract.md
  runtime-contract.md
  responsibility-map.md

/content
  book-version.json
  verified-facts.json
  curatorial-interpretations.json
  evidence-cards.json
  portrait-config.json
  content-manifest.json

/public
  portraits/
  envelope/
  icons/

/src/domain
  session.ts
  manuscript.ts
  portrait.ts
  evidence.ts
  semantic-fragment.ts
  finalization.ts
  final-envelope.ts

/src/content
  loader.ts
  schemas.ts
  production-gate.ts

/src/fsm
  machine.ts
  transitions.ts
  guards.ts

/src/application
  round-orchestrator.ts
  semantic-placement-orchestrator.ts
  final-review-orchestrator.ts
  finalization-orchestrator.ts
  ports/

/src/runtime
  active-operation.ts
  request-fingerprint.ts
  retry-policy.ts

/src/agent
  contracts/
  validators/
  prompts/
  adapters/

/src/final-review
  contracts/
  service.ts
  mock-service.ts

/src/persistence
  session-store.ts
  migrations.ts

/src/components
  Welcome/
  PortraitPrelude/
  PortraitReassembly/
  EvidencePanel/
  ManuscriptCanvas/
  RevisionHistory/
  SemanticDrift/
  SemanticBouquet/
  SignatureSection/
  FinalEnvelope/

/src/testing
  fixtures/
  factories/

/tests
```

本文件在正式仓库中保存为 `/docs/codex-collaboration-guide.md`，作为总索引、协作母版和阶段 Prompt 汇编，不作为所有具体定义的唯一规范文件。

规范效力按以下顺序划分：

1. 产品范围和禁止事项只在 `/docs/scope-freeze.md` 维护；
2. 领域、运行时、provenance、命名、最终化、Agent、Final Review 和状态机定义分别在对应 Contract 中维护；
3. 每个 Issue 只加载 Scope Freeze、与任务直接相关的 Contract、当前 Issue 和必要源码，不应默认把整份母版作为每次会话 Prompt；
4. 本指南与正式 Contract 冲突时，以最新已确认 Contract 为准。

不要同时使用 `/src/domain/tools.ts` 和 `/src/agent/tools/` 表示不同含义。Agent 输入输出契约统一放在 `/src/agent/contracts/`；实现统一放在 `/src/agent/adapters/`；FinalReviewService 使用独立 `/src/final-review/`；跨能力调用、Candidate 验证、错误映射和 FSM 事件发送放在 `/src/application/`；ActiveOperation、输入指纹和重试策略放在 `/src/runtime/`。Domain 层保持纯领域模型，不依赖具体模型服务，FSM 不直接解析 Adapter 响应。


---

## 七、Git 与 Codex 协作规则

### 推荐分支模型

两人黑客松优先使用简单模型：

```text
main

docs/scope-freeze-<scope-version>
content/book-verification
content/evidence-cards
content/portrait-direction
agent/prompt-v1
agent/evaluation-cases

feature/domain-schema
feature/fsm
feature/portrait-prelude
feature/manuscript-canvas
feature/semantic-bouquet
feature/portrait-reassembly
feature/final-envelope
feature/llm-adapter

test/integration
release/demo
```

所有功能、内容和文档分支从受保护的 `main` 创建，通过 PR 合并回 `main`。`main` 始终保持可运行。除非团队已有明确的 develop/release 流程，否则不要额外增加 `develop`。

若必须保留 `develop`，则明确使用：feature/* → develop，release/* → main，hotfix/* → main 并回合 develop。

### 核心文件

下列文件或目录视为核心文件，同一时间只能有一个分支修改：

- Domain Schema；
- FSM machine、guards 和 transition contract；
- Agent contracts；
- Final Review contracts；
- 内容 Schema 和 production gate；
- FinalEnvelope Schema；
- application orchestrator 的公共 payload 和 runtime ActiveOperation Contract；
- package lock；
- 根级构建、类型和测试配置。

### 规则

1. `main` 始终保持可运行；
2. 不直接向 `main` 推送；
3. 一个 Issue 对应一个分支；
4. 一个分支只解决一个问题；
5. 两个 Codex 不同时修改同一核心文件；
6. Domain Schema 修改必须由双方审核；
7. State Machine 修改必须由双方审核；
8. 原著事实内容只能由你或你明确授权的人提交；
9. 队友不得让 Codex 自动补充原著内容；
10. 每次 PR 至少运行与修改范围相关的测试、类型检查和 lint；
11. 修改核心状态、Schema、内容门禁或 Adapter 时必须运行完整测试；
12. CI 未通过不得合并；
13. PR 必须注明 Contract 版本、兼容性影响和未执行检查；
14. 正式 Contract 文件使用稳定文件名，例如 `/docs/scope-freeze.md`；版本号写入文件元数据，并通过分支名、commit SHA 和 Git tag 管理。分支可使用 `docs/scope-freeze-<scope-version>`；
15. 核心 Contract 变更必须注明变更分类：breaking、backward-compatible 或 no-contract-change；
16. breaking 变更必须提供迁移、拒绝恢复或只读兼容方案；
17. 推荐为核心 Contract 和内容目录配置 CODEOWNERS。

---

## 八、通用 Codex Issue Prompt

```text
你现在只处理以下 Issue：

【Issue 名称】
填写名称。

【基准分支与提交】
填写分支和 commit SHA。

【当前责任人】
填写 DRI 和审核人。

【目标】
填写本次唯一目标。

【依赖的 Contract 版本】
填写 `/docs/scope-freeze.md` 中的版本、Domain、Agent、FSM、Finalization Contract 或内容包版本。

【Contract 变化分类】
填写 breaking、backward-compatible、no-contract-change。

【迁移或恢复影响】
说明是否需要状态迁移、拒绝恢复、只读兼容或无需处理。

【范围内】
列出允许修改的功能和文件。

【范围外】
列出本次不能修改的内容。

【禁止修改的核心文件】
如无，填写“无”。

【是否允许新增依赖】
填写“否”，或列出允许的依赖和原因。

【允许执行的命令】
列出可以执行的安装、测试、构建或迁移命令。

【验收标准】
列出逐条可验证结果。

【失败时停止条件】
列出发生哪些情况时必须停止并报告，不得继续扩大修改范围。

开始前请先：

1. 只加载 `/docs/scope-freeze.md`、与本 Issue 直接相关的 Contract、当前 Issue 和必要源码；除非 Issue 明确要求，不要把整份协作指南作为实现上下文；
2. 检查相关代码和当前 Git 状态；
3. 列出计划修改文件；
4. 说明接口和兼容性影响；
5. 说明测试方案；
6. 指出任何阻塞问题；
7. 等待确认。

完成后请输出：

1. 修改摘要；
2. 修改文件；
3. 关键决策；
4. 实际运行命令；
5. 实际测试结果；
6. 与验收标准逐条对应的结果；
7. Schema、状态、内容或兼容性变化；
8. Contract 变化分类及迁移结果；
9. 已知问题；
10. 未执行的检查及原因；
11. 人工验证步骤。

不得自动开始下一个 Issue，不得宣称未执行的测试通过。
```

---


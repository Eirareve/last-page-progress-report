# Stage 7 内容审核包（可直接交 Codex Intake Review）
## 重要状态
- 当前为 DRAFT / PENDING HUMAN APPROVAL。
- 只允许 Codex 只读映射和检查，不授权实施。
- 不允许修改已冻结 Contract、开启 Live Gate 或进入 Stage 8。

## 1. Edition
```json
{
  "recordStatus": "DRAFT_PENDING_HUMAN_APPROVAL",
  "editionId": "flowers-algernon-zh-cn-gxnu-2015-9787549565115",
  "title": "献给阿尔吉侬的花束",
  "originalTitle": "Flowers for Algernon",
  "author": "Daniel Keyes（丹尼尔·凯斯）",
  "translator": "陈澄和",
  "language": "zh-CN",
  "publisher": "广西师范大学出版社",
  "publicationYear": 2015,
  "publicationMonth": 5,
  "editionLabel": "2015年4月第1版；2015年4月第1次印刷",
  "isbn": "978-7-5495-6511-5",
  "pageCount": 288,
  "pageCountEvidence": "用户根据购物软件再次确认；版权页截图未显示总页数",
  "copyrightNotes": [
    "Flowers for Algernon by Daniel Keyes; © 1966, 1959 by Daniel Keyes",
    "Simplified Chinese character translation copyright © 2015 by Beijing Imaginist Time Culture Co., Ltd.",
    "中文简体版相关权利信息以用户提供的版权页截图为内部审核依据"
  ],
  "verification": {
    "verifiedBy": "__HUMAN_TO_FILL__",
    "verifiedAt": "__HUMAN_TO_FILL__",
    "verificationStatus": "pending_human_approval"
  },
  "chapterStarts": [
    {
      "sectionLabel": "近步抱告-1",
      "pageStart": 1
    },
    {
      "sectionLabel": "近步抱告-2",
      "pageStart": 2
    },
    {
      "sectionLabel": "近步抱告-3",
      "pageStart": 4
    },
    {
      "sectionLabel": "近步抱告-4",
      "pageStart": 6
    },
    {
      "sectionLabel": "近步抱告-5",
      "pageStart": 10
    },
    {
      "sectionLabel": "近步抱告-6",
      "pageStart": 13
    },
    {
      "sectionLabel": "进步报告-7",
      "pageStart": 15
    },
    {
      "sectionLabel": "进步报告-8",
      "pageStart": 20
    },
    {
      "sectionLabel": "进步报告-9",
      "pageStart": 35
    },
    {
      "sectionLabel": "进步报告-10",
      "pageStart": 58
    },
    {
      "sectionLabel": "进步报告-11",
      "pageStart": 73
    },
    {
      "sectionLabel": "进步报告-12",
      "pageStart": 107
    },
    {
      "sectionLabel": "进步报告-13",
      "pageStart": 124
    },
    {
      "sectionLabel": "进步报告-14",
      "pageStart": 154
    },
    {
      "sectionLabel": "进步报告-15",
      "pageStart": 199
    },
    {
      "sectionLabel": "进步报告-16",
      "pageStart": 205
    },
    {
      "sectionLabel": "进步报告-17",
      "pageStart": 256
    }
  ],
  "sourceRangePolicy": "Stage 7 draft uses whole-report page ranges plus date/event locatorNote. Exact sentence-level pages are intentionally not asserted. Codex must map to the frozen sourceLocation schema without changing Contract."
}
```

## 2. VERIFIED_FACT candidates
```json
{
  "records": [
    {
      "id": "VF-R1-001",
      "classification": "VERIFIED_FACT_CANDIDATE",
      "round": "round1",
      "theme": "past_self_interpretation",
      "verifiedFactDraft": "早期查理把面包店同事视为朋友，并把围绕自己的笑声、玩笑和共同活动理解为朋友之间的快乐互动。",
      "publicSummary": "早期的查理把面包店同事视为朋友，并把围绕自己的笑声和玩笑理解成共同的快乐。",
      "sourceLocation": {
        "editionId": "flowers-algernon-zh-cn-gxnu-2015-9787549565115",
        "sectionType": "progress_report",
        "sectionLabel": "进步报告-8",
        "pageStart": 20,
        "pageEnd": 34,
        "locatorNote": "重点核验3月16日、3月20日、3月21日、3月28日相关记录"
      },
      "internalEvidenceRef": "用户上传《进步报告-8》文本；不把正文长引文写入 public bundle",
      "allowedInterpretations": [
        "查理当时对他人行为的理解受到自身信息与理解能力限制。",
        "即使对事件性质存在误解，他当时体验到的信任、快乐和归属感仍是其主观经验的一部分。",
        "后来的理解可以改变对过去事件性质的判断。"
      ],
      "prohibitedInferences": [
        "早期查理没有真实感受或其经验没有价值。",
        "理解能力更强的查理天然拥有取消过去自我主体地位的权力。",
        "作品证明只有高智阶段才是真正的查理。"
      ],
      "copyrightHandling": "public_summary_only; internalExcerpt remains private",
      "verificationStatus": "pending_human_approval"
    },
    {
      "id": "VF-R1-002",
      "classification": "VERIFIED_FACT_CANDIDATE",
      "round": "round1",
      "theme": "past_self_reinterpretation",
      "verifiedFactDraft": "随着理解能力提高，查理重新理解过去与面包店同事及其他人相处的若干经历，并意识到其中包含自己当时没有察觉的嘲弄和作弄。",
      "publicSummary": "随着理解能力提高，查理开始重新理解过去的一些玩笑，并认识到其中包含他当时没有意识到的嘲弄和作弄。",
      "sourceLocation": {
        "editionId": "flowers-algernon-zh-cn-gxnu-2015-9787549565115",
        "sectionType": "progress_report",
        "sectionLabel": "进步报告-9",
        "pageStart": 35,
        "pageEnd": 57,
        "locatorNote": "重点核验查理回想哈洛伦酒吧、捉迷藏等经历并重新判断其含义的段落"
      },
      "internalEvidenceRef": "用户上传《进步报告-9》文本；不把正文长引文写入 public bundle",
      "allowedInterpretations": [
        "后来的查理拥有更多信息，因而能对过去事件作出更充分的事实判断。",
        "事实判断的更新与过去自我的主体经验是否仍应被承认，是两个不同问题。"
      ],
      "prohibitedInferences": [
        "后来的查理可以因此抹除过去查理的全部自我理解。",
        "被嘲弄的经历意味着早期查理从未拥有过任何真实关系。",
        "用户必须把早期查理视为错误版本。"
      ],
      "copyrightHandling": "public_summary_only; internalExcerpt remains private",
      "verificationStatus": "pending_human_approval"
    },
    {
      "id": "VF-R2-001",
      "classification": "VERIFIED_FACT_CANDIDATE",
      "round": "round2",
      "theme": "future_prediction_boundary",
      "verifiedFactDraft": "面对阿尔吉侬能力退化的迹象，查理主动投入实验研究，并要求了解实验可能对自己未来造成的结果以及研究团队此前为其未来作出的安排。",
      "publicSummary": "面对阿尔吉侬能力下降的迹象，查理开始主动研究实验，并要求了解实验可能对自己未来造成的结果和既有安排。",
      "sourceLocation": {
        "editionId": "flowers-algernon-zh-cn-gxnu-2015-9787549565115",
        "sectionType": "progress_report",
        "sectionLabel": "进步报告-15",
        "pageStart": 199,
        "pageEnd": 204,
        "locatorNote": "重点核验7月12日：阿尔吉侬表现下降、查理要求知道与实验及自己未来有关的一切"
      },
      "internalEvidenceRef": "用户上传《进步报告-15》文本；不把正文长引文写入 public bundle",
      "allowedInterpretations": [
        "查理开始以当前较强的理解能力主动为可能的未来变化做准备。",
        "对未来风险拥有较强证据，可以成为当前决策的重要依据。"
      ],
      "prohibitedInferences": [
        "查理已经能够精确知道未来每一个状态和意愿。",
        "知道风险等于获得替未来自我作出一切决定的授权。",
        "研究团队此前的安排自动代表未来查理的同意。"
      ],
      "copyrightHandling": "public_summary_only; internalExcerpt remains private",
      "verificationStatus": "pending_human_approval"
    },
    {
      "id": "VF-R2-002",
      "classification": "VERIFIED_FACT_CANDIDATE",
      "round": "round2",
      "theme": "future_prediction_boundary",
      "verifiedFactDraft": "查理通过研究阿尔吉侬的数据得出实验带来的心智能力增强不能永久维持的结论，并判断自己的心智能力也将发生快速衰减。",
      "publicSummary": "查理通过研究阿尔吉侬的数据得出实验效果不能永久保持的结论，并判断自己的心智能力也将发生快速下降。",
      "sourceLocation": {
        "editionId": "flowers-algernon-zh-cn-gxnu-2015-9787549565115",
        "sectionType": "progress_report",
        "sectionLabel": "进步报告-16",
        "pageStart": 205,
        "pageEnd": 255,
        "locatorNote": "重点核验研究报告/阿尔吉侬—高登效应结论及查理对自身衰减的判断"
      },
      "internalEvidenceRef": "用户上传《进步报告-16》文本；不把正文长引文写入 public bundle",
      "allowedInterpretations": [
        "查理对自身未来衰减的判断具有明确实验依据，而不只是抽象恐惧。",
        "对未来变化拥有可靠预测与拥有未来自我的完整决定权应被区分。"
      ],
      "prohibitedInferences": [
        "科学预测自动产生不可撤销的未来代理权。",
        "未来查理的意愿可以因此提前判定为无效。",
        "作品给出了关于预先决定未来意愿的唯一伦理答案。"
      ],
      "copyrightHandling": "public_summary_only; internalExcerpt remains private",
      "verificationStatus": "pending_human_approval"
    },
    {
      "id": "VF-R3-001",
      "classification": "VERIFIED_FACT_CANDIDATE",
      "round": "round3",
      "theme": "future_relationships",
      "verifiedFactDraft": "随着查理的能力下降，艾丽斯仍多次主动与他保持联系并试图陪伴、帮助他；查理则不断面对自己是否接受这段关系的问题。",
      "publicSummary": "随着查理的能力下降，艾丽斯仍多次主动与他保持联系并试图陪伴、帮助他，而查理也持续面对自己是否接受这种关系的问题。",
      "sourceLocation": {
        "editionId": "flowers-algernon-zh-cn-gxnu-2015-9787549565115",
        "sectionType": "progress_report",
        "sectionLabel": "进步报告-17",
        "pageStart": 256,
        "pageEnd": 288,
        "locatorNote": "重点核验10月11日以后艾丽斯回到查理住处，以及11月仍尝试联系和提供帮助的记录"
      },
      "internalEvidenceRef": "用户上传《进步报告-17》文本；不把正文长引文写入 public bundle",
      "allowedInterpretations": [
        "能力变化并没有使既有关系自动终止。",
        "未来关系同时受到查理与他人的持续行动影响。",
        "当前查理对未来关系的恐惧不等于已经知道未来关系会如何发展。"
      ],
      "prohibitedInferences": [
        "艾丽斯必然代表未来查理的正确选择。",
        "未来查理必须接受或拒绝这段关系。",
        "陪伴或帮助自动产生替查理作决定的权力。"
      ],
      "copyrightHandling": "public_summary_only; internalExcerpt remains private",
      "verificationStatus": "pending_human_approval"
    },
    {
      "id": "VF-R3-002",
      "classification": "VERIFIED_FACT_CANDIDATE",
      "round": "round3",
      "theme": "future_relationships",
      "verifiedFactDraft": "查理回到面包店后，一名后来加入的员工欺负他；过去曾取笑过他的乔、弗兰克和金皮随后出面保护他，并明确表示他在这里仍有朋友。",
      "publicSummary": "查理回到面包店后受到一名新员工欺负，过去曾取笑过他的旧同事随后出面保护他，并明确告诉他仍然把他视为朋友。",
      "sourceLocation": {
        "editionId": "flowers-algernon-zh-cn-gxnu-2015-9787549565115",
        "sectionType": "progress_report",
        "sectionLabel": "进步报告-17",
        "pageStart": 256,
        "pageEnd": 288,
        "locatorNote": "重点核验11月18日回到面包店后的冲突及乔、弗兰克、金皮的反应"
      },
      "internalEvidenceRef": "用户上传《进步报告-17》文本；不把正文长引文写入 public bundle",
      "allowedInterpretations": [
        "他人与查理之间的关系可能随时间和经历发生变化。",
        "过去的伤害与后来的保护可以同时作为关系历史的一部分被承认。",
        "当前自我无法完全预先确定未来关系的状态。"
      ],
      "prohibitedInferences": [
        "后来的保护抵消了过去的嘲弄和伤害。",
        "查理因此必须继续与这些人保持关系。",
        "面包店同事已经成为道德上的正确答案。",
        "未来关系一定会朝更好的方向发展。"
      ],
      "copyrightHandling": "public_summary_only; internalExcerpt remains private",
      "verificationStatus": "pending_human_approval"
    }
  ]
}
```

## 3. CURATORIAL_INTERPRETATION
```json
{
  "records": [
    {
      "id": "CI-R1-001",
      "classification": "CURATORIAL_INTERPRETATION",
      "round": "round1",
      "publicText": "后来的查理拥有更多信息，可以重新判断过去发生了什么；但“能够重新解释事件”与“能够取消过去自我的主体经验”并不是同一个命题。",
      "supportedByFactIds": [
        "VF-R1-001",
        "VF-R1-002"
      ],
      "prohibitedClaims": [
        "这是作者唯一结论。",
        "作品证明某一认知阶段拥有绝对解释权。"
      ],
      "approvalStatus": "pending_human_approval"
    },
    {
      "id": "CI-R2-001",
      "classification": "CURATORIAL_INTERPRETATION",
      "round": "round2",
      "publicText": "对未来变化拥有可靠预测，可以成为当前决策的重要依据，但预测本身并不自动产生替未来自我作出不可撤销决定的权力。",
      "supportedByFactIds": [
        "VF-R2-001",
        "VF-R2-002"
      ],
      "prohibitedClaims": [
        "这是作者唯一结论。",
        "科学预测等同于未来授权。"
      ],
      "approvalStatus": "pending_human_approval"
    },
    {
      "id": "CI-R3-001",
      "classification": "CURATORIAL_INTERPRETATION",
      "round": "round3",
      "publicText": "未来关系不仅取决于查理能力的变化，也取决于未来查理以及周围其他人的行动；因此，当前的查理无法完整预先确定未来关系的意义。",
      "supportedByFactIds": [
        "VF-R3-001",
        "VF-R3-002"
      ],
      "prohibitedClaims": [
        "这是作者唯一结论。",
        "未来查理必须维持或终止某段具体关系。"
      ],
      "approvalStatus": "pending_human_approval"
    }
  ]
}
```

## 4. Evidence Cards
```json
{
  "records": [
    {
      "id": "EC-R1-PAST-SELF",
      "round": "round1",
      "factIds": [
        "VF-R1-001",
        "VF-R1-002"
      ],
      "interpretationIds": [
        "CI-R1-001"
      ],
      "publicText": "早期的查理把面包店里的笑声和玩笑理解为朋友之间的快乐。随着理解能力提高，他后来发现其中一些行为其实包含嘲弄和作弄。后来的查理拥有更多信息，但过去的查理也真实经历过当时的信任和归属感。",
      "question": "当后来的查理能够更准确地判断过去发生了什么时，他是否也因此获得了否定过去那个自己的解释权？",
      "allowedFollowUps": [
        "后来的事实判断与过去的主观经验有什么区别？",
        "更多理解能力是否意味着更高的自我代表权？",
        "如果过去的判断建立在误解上，它还有什么应被保留的部分？"
      ],
      "prohibitedClaims": [
        "高智查理才是真正的查理。",
        "早期查理的经验没有价值。",
        "用户应该选择某一阶段作为正确答案。"
      ],
      "attributionDraft": "基于《献给阿尔吉侬的花束》进步报告8—9的人工核验事实；公开文本为项目团队概述，并非小说原文。",
      "approvalStatus": "pending_human_approval"
    },
    {
      "id": "EC-R2-FUTURE-PREDICTION",
      "round": "round2",
      "factIds": [
        "VF-R2-001",
        "VF-R2-002"
      ],
      "interpretationIds": [
        "CI-R2-001"
      ],
      "publicText": "阿尔吉侬开始出现明显退化后，查理投入研究并确认实验带来的增强不能永久维持，也判断自己将发生类似衰减。此时的查理有充分理由预测未来会发生什么，但未来那个查理还没有真正生活在那个状态里。",
      "question": "能够可靠地预测未来变化，是否等于能够提前替未来的自己作出决定？",
      "allowedFollowUps": [
        "什么决定适合提前安排？",
        "什么决定可能仍需要未来的自己重新确认？",
        "“现在知道更多”与“未来拥有决定权”之间是什么关系？"
      ],
      "prohibitedClaims": [
        "科学预测自动产生永久代理权。",
        "未来查理没有有效意愿。",
        "用户必须接受或拒绝预先决定。"
      ],
      "attributionDraft": "基于《献给阿尔吉侬的花束》进步报告15—16的人工核验事实；公开文本为项目团队概述，并非小说原文。",
      "approvalStatus": "pending_human_approval"
    },
    {
      "id": "EC-R3-FUTURE-RELATIONSHIPS",
      "round": "round3",
      "factIds": [
        "VF-R3-001",
        "VF-R3-002"
      ],
      "interpretationIds": [
        "CI-R3-001"
      ],
      "publicText": "查理的能力开始下降以后，他与周围人的关系并没有简单停止。艾丽斯仍尝试陪伴和帮助他；他回到面包店后，曾经取笑过他的旧同事后来也会在他受到欺负时保护他。未来的关系本身仍可能发生变化。",
      "question": "现在的查理可以为未来的自己设置保护边界，但他是否有权提前决定未来的自己应该与谁保持距离？",
      "allowedFollowUps": [
        "保护未来自我与替未来自我决定有什么区别？",
        "他人的改变是否应该影响预先设定的关系限制？",
        "哪些边界应该可以被未来重新选择？"
      ],
      "prohibitedClaims": [
        "艾丽斯一定代表正确选择。",
        "未来查理必须维持某段关系。",
        "后来的善意能够抵消过去的伤害。",
        "任何一种关系选择代表更高的道德水平。"
      ],
      "attributionDraft": "基于《献给阿尔吉侬的花束》进步报告17的人工核验事实；公开文本为项目团队概述，并非小说原文。",
      "approvalStatus": "pending_human_approval"
    }
  ]
}
```

## 5. CONTENT_INPUT_MANIFEST draft
```json
{
  "manifestStatus": "DRAFT_PENDING_HUMAN_APPROVAL",
  "purpose": "Stage 7 external input audit manifest; not Domain/SessionState/ContentBundle Contract",
  "checksumNote": "inputChecksum is intentionally left for Codex to compute from the frozen input using the repository-approved audit procedure. Do not reuse these values as contentBundleChecksum or internalContentBundleChecksum.",
  "entries": [
    {
      "inputId": "CONTENT-001",
      "sourceRef": "用户提供版权页截图 + 目录/页数确认",
      "intendedTarget": "book edition authoring record",
      "inputChecksum": "__CODEX_COMPUTE_FROM_FROZEN_INPUT__",
      "approvalStatus": "pending_human_approval",
      "classification": "EDITION_METADATA",
      "editionId": "flowers-algernon-zh-cn-gxnu-2015-9787549565115",
      "verifiedBy": "__HUMAN_TO_FILL__",
      "verifiedAt": "__HUMAN_TO_FILL__"
    },
    {
      "inputId": "CONTENT-002",
      "sourceRef": "用户上传 进步报告-8",
      "intendedTarget": "VF-R1-001",
      "inputChecksum": "__CODEX_COMPUTE_FROM_FROZEN_INPUT__",
      "approvalStatus": "pending_human_approval",
      "classification": "VERIFIED_FACT",
      "editionId": "flowers-algernon-zh-cn-gxnu-2015-9787549565115",
      "verifiedBy": "__HUMAN_TO_FILL__",
      "verifiedAt": "__HUMAN_TO_FILL__"
    },
    {
      "inputId": "CONTENT-003",
      "sourceRef": "用户上传 进步报告-9",
      "intendedTarget": "VF-R1-002",
      "inputChecksum": "__CODEX_COMPUTE_FROM_FROZEN_INPUT__",
      "approvalStatus": "pending_human_approval",
      "classification": "VERIFIED_FACT",
      "editionId": "flowers-algernon-zh-cn-gxnu-2015-9787549565115",
      "verifiedBy": "__HUMAN_TO_FILL__",
      "verifiedAt": "__HUMAN_TO_FILL__"
    },
    {
      "inputId": "CONTENT-004",
      "sourceRef": "用户上传 进步报告-15",
      "intendedTarget": "VF-R2-001",
      "inputChecksum": "__CODEX_COMPUTE_FROM_FROZEN_INPUT__",
      "approvalStatus": "pending_human_approval",
      "classification": "VERIFIED_FACT",
      "editionId": "flowers-algernon-zh-cn-gxnu-2015-9787549565115",
      "verifiedBy": "__HUMAN_TO_FILL__",
      "verifiedAt": "__HUMAN_TO_FILL__"
    },
    {
      "inputId": "CONTENT-005",
      "sourceRef": "用户上传 进步报告-16",
      "intendedTarget": "VF-R2-002",
      "inputChecksum": "__CODEX_COMPUTE_FROM_FROZEN_INPUT__",
      "approvalStatus": "pending_human_approval",
      "classification": "VERIFIED_FACT",
      "editionId": "flowers-algernon-zh-cn-gxnu-2015-9787549565115",
      "verifiedBy": "__HUMAN_TO_FILL__",
      "verifiedAt": "__HUMAN_TO_FILL__"
    },
    {
      "inputId": "CONTENT-006",
      "sourceRef": "用户上传 进步报告-17",
      "intendedTarget": "VF-R3-001",
      "inputChecksum": "__CODEX_COMPUTE_FROM_FROZEN_INPUT__",
      "approvalStatus": "pending_human_approval",
      "classification": "VERIFIED_FACT",
      "editionId": "flowers-algernon-zh-cn-gxnu-2015-9787549565115",
      "verifiedBy": "__HUMAN_TO_FILL__",
      "verifiedAt": "__HUMAN_TO_FILL__"
    },
    {
      "inputId": "CONTENT-007",
      "sourceRef": "用户上传 进步报告-17",
      "intendedTarget": "VF-R3-002",
      "inputChecksum": "__CODEX_COMPUTE_FROM_FROZEN_INPUT__",
      "approvalStatus": "pending_human_approval",
      "classification": "VERIFIED_FACT",
      "editionId": "flowers-algernon-zh-cn-gxnu-2015-9787549565115",
      "verifiedBy": "__HUMAN_TO_FILL__",
      "verifiedAt": "__HUMAN_TO_FILL__"
    },
    {
      "inputId": "CONTENT-008",
      "sourceRef": "本审核包策展解释草案",
      "intendedTarget": "CI-R1-001",
      "inputChecksum": "__CODEX_COMPUTE_FROM_FROZEN_INPUT__",
      "approvalStatus": "pending_human_approval",
      "classification": "CURATORIAL_INTERPRETATION",
      "editionId": null,
      "verifiedBy": null,
      "verifiedAt": null
    },
    {
      "inputId": "CONTENT-009",
      "sourceRef": "本审核包策展解释草案",
      "intendedTarget": "CI-R2-001",
      "inputChecksum": "__CODEX_COMPUTE_FROM_FROZEN_INPUT__",
      "approvalStatus": "pending_human_approval",
      "classification": "CURATORIAL_INTERPRETATION",
      "editionId": null,
      "verifiedBy": null,
      "verifiedAt": null
    },
    {
      "inputId": "CONTENT-010",
      "sourceRef": "本审核包策展解释草案",
      "intendedTarget": "CI-R3-001",
      "inputChecksum": "__CODEX_COMPUTE_FROM_FROZEN_INPUT__",
      "approvalStatus": "pending_human_approval",
      "classification": "CURATORIAL_INTERPRETATION",
      "editionId": null,
      "verifiedBy": null,
      "verifiedAt": null
    },
    {
      "inputId": "CONTENT-011",
      "sourceRef": "本审核包 Evidence Card 草案",
      "intendedTarget": "EC-R1-PAST-SELF",
      "inputChecksum": "__CODEX_COMPUTE_FROM_FROZEN_INPUT__",
      "approvalStatus": "pending_human_approval",
      "classification": "EVIDENCE_CARD",
      "editionId": null,
      "verifiedBy": null,
      "verifiedAt": null
    },
    {
      "inputId": "CONTENT-012",
      "sourceRef": "本审核包 Evidence Card 草案",
      "intendedTarget": "EC-R2-FUTURE-PREDICTION",
      "inputChecksum": "__CODEX_COMPUTE_FROM_FROZEN_INPUT__",
      "approvalStatus": "pending_human_approval",
      "classification": "EVIDENCE_CARD",
      "editionId": null,
      "verifiedBy": null,
      "verifiedAt": null
    },
    {
      "inputId": "CONTENT-013",
      "sourceRef": "本审核包 Evidence Card 草案",
      "intendedTarget": "EC-R3-FUTURE-RELATIONSHIPS",
      "inputChecksum": "__CODEX_COMPUTE_FROM_FROZEN_INPUT__",
      "approvalStatus": "pending_human_approval",
      "classification": "EVIDENCE_CARD",
      "editionId": null,
      "verifiedBy": null,
      "verifiedAt": null
    },
    {
      "inputId": "CONTENT-014",
      "sourceRef": "仓库现有 original-interaction.json；需 Codex 只读确认实际路径与 checksum",
      "intendedTarget": "existing repository original-interaction",
      "inputChecksum": "__CODEX_COMPUTE_FROM_FROZEN_INPUT__",
      "approvalStatus": "pending_human_approval",
      "classification": "ORIGINAL_INTERACTION",
      "editionId": null,
      "verifiedBy": null,
      "verifiedAt": null
    }
  ]
}
```

## 6. 人工批准
见 `06-approval-record.draft.md`。

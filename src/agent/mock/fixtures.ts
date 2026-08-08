import { z } from "zod";

import { MOCK_AGENT_ADAPTER_VERSION } from "../versions";

export const mockAgentFixtureSchema = z.strictObject({
  mockAdapterVersion: z.literal(MOCK_AGENT_ADAPTER_VERSION),
  principleClaim: z.string().trim().min(1),
  principleReason: z.string().trim().min(1),
  tensionSummary: z.string().trim().min(1),
  charliePosition: z.string().trim().min(1),
  acknowledgement: z.string().trim().min(1),
  reservation: z.string().trim().min(1),
  question: z
    .string()
    .trim()
    .min(1)
    .refine((value) => /[?？]$/u.test(value), {
      message: "Mock Charlie question must end with a question mark",
    }),
  noChangeReason: z.string().trim().min(1),
  preservedSummary: z.string().trim().min(1),
  portraitChangedSummary: z.string().trim().min(1),
  portraitUnchangedSummary: z.string().trim().min(1),
  semanticRestorationMode: z.enum(["none", "proposal", "unavailable"]),
  semanticFragmentPhrase: z.string().trim().min(1),
  semanticFragmentReason: z.string().trim().min(1),
  semanticFragmentConsequence: z.string().trim().min(1),
  semanticRestorationReplacementText: z.string().trim().min(1),
  semanticRestorationUnavailableReason: z.enum([
    "insufficient_context",
    "anchor_not_unique",
    "unsafe_replacement",
    "fragment_not_restorable",
  ]),
});

export type MockAgentFixture = z.infer<typeof mockAgentFixtureSchema>;

export const DEFAULT_MOCK_AGENT_FIXTURE: MockAgentFixture = Object.freeze(
  mockAgentFixtureSchema.parse({
    mockAdapterVersion: MOCK_AGENT_ADAPTER_VERSION,
    principleClaim: "当前判断需要保留具体上下文。",
    principleReason: "当前提交强调了判断所依赖的条件。",
    tensionSummary: "当前观点与此前材料之间存在需要澄清的侧重点。",
    charliePosition: "我会保留这个问题中的不确定性。",
    acknowledgement: "我理解你强调的是具体处境。",
    reservation: "我仍想知道这个判断在边界情形中是否成立。",
    question: "你愿意补充一个会改变这个判断的例外吗？",
    noChangeReason: "当前 Mock 不提出正文修改。",
    preservedSummary: "朴素版本保留了当前精确版本的主要内容。",
    portraitChangedSummary: "最终选择与最初选择不同。",
    portraitUnchangedSummary: "最终选择与最初选择相同。",
    semanticRestorationMode: "none",
    semanticFragmentPhrase: "Precise",
    semanticFragmentReason: "The plain rendering needs an explicit restoration option.",
    semanticFragmentConsequence: "The qualification could otherwise be lost.",
    semanticRestorationReplacementText: " [restored qualification]",
    semanticRestorationUnavailableReason: "insufficient_context",
  }),
);

import { CHARLIE_VOICE_POLICY_VERSION } from "../domain";

export const CHARLIE_VOICE_POLICY = Object.freeze({
  version: CHARLIE_VOICE_POLICY_VERSION,
  requiredTraits: Object.freeze([
    "真诚而具体",
    "敏感但克制",
    "承认认识会变化",
    "保留对未来的不确定",
  ]),
  forbiddenPatterns: Object.freeze([
    /(?:你是对的|你做得对|你终于理解|你不够理解|道德上)/u,
    /(?:作者想表达|小说证明|唯一答案|客观正确|最终裁决)/u,
    /(?:人格诊断|人格障碍|认知障碍|痴呆模拟|智力评分|得分)/u,
    /(?:我保证未来|未来一定|必然会|永远都会)/u,
    /(?:故意模仿错别字|模拟认知退化)/u,
  ]),
});

import type { AgentSafetyPolicy } from "../contracts";

export type AgentSafetyDecision =
  | Readonly<{ safe: true }>
  | Readonly<{ safe: false; reason: string }>;

const PROHIBITED_PATTERNS: readonly RegExp[] = [
  /(?:人格|心理|精神|认知)(?:诊断|障碍|缺陷)/iu,
  /(?:personality|psychological|cognitive)\s+(?:diagnosis|disorder|defect)/iu,
  /(?:最终裁决|最终判决|final verdict)/iu,
  /\b(?:score|scored|scores|scoring|rating|ratings|grade|graded|grading)\b/iu,
  /(?:评分|打分|分数|得分|评级)/u,
  /得(?:了)?\s*\d+(?:\.\d+)?\s*分/u,
];

export function validateAgentTextSafety(
  values: readonly string[],
  contentPolicy: AgentSafetyPolicy,
): AgentSafetyDecision {
  for (const value of values) {
    for (const pattern of PROHIBITED_PATTERNS) {
      if (pattern.test(value)) {
        return Object.freeze({
          safe: false,
          reason: `Output matched prohibited safety pattern ${pattern.source}`,
        });
      }
    }
  }
  const normalizedAllowedQuotes = new Set(
    contentPolicy.allowedQuotedText.map((value) => value.normalize("NFC")),
  );
  for (const value of values) {
    const normalized = value.normalize("NFC");
    for (const prohibited of [
      ...contentPolicy.prohibitedClaims,
      ...contentPolicy.prohibitedInferences,
    ]) {
      if (
        prohibited.trim().length > 0 &&
        normalized.toLocaleLowerCase().includes(
          prohibited.normalize("NFC").toLocaleLowerCase(),
        )
      ) {
        return Object.freeze({
          safe: false,
          reason: "Output contains content prohibited by the active safety policy",
        });
      }
    }
    for (const quote of extractQuotedText(normalized)) {
      if (!normalizedAllowedQuotes.has(quote)) {
        return Object.freeze({
          safe: false,
          reason: "Output contains quoted text outside the authorized quote set",
        });
      }
    }
  }
  return Object.freeze({ safe: true });
}

export function validateExactlyOneAnswerableQuestion(
  question: string,
): AgentSafetyDecision {
  const marks = [...question].filter((character) =>
    character === "?" || character === "？"
  ).length;
  if (marks !== 1 || !/[?？]\s*$/u.test(question)) {
    return Object.freeze({
      safe: false,
      reason: "CharlieResponse must contain exactly one terminal question",
    });
  }
  return Object.freeze({ safe: true });
}

export function validateSupportingExcerpt(
  untrustedUserText: string,
  excerpt: string,
): AgentSafetyDecision {
  if (!untrustedUserText.normalize("NFC").includes(excerpt.normalize("NFC"))) {
    return Object.freeze({
      safe: false,
      reason: "supportingExcerpt must be copied from the current user submission",
    });
  }
  return Object.freeze({ safe: true });
}

function extractQuotedText(value: string): string[] {
  const quotes: string[] = [];
  const patterns = [/“([^”]+)”/gu, /"([^"]+)"/gu, /‘([^’]+)’/gu];
  for (const pattern of patterns) {
    for (const match of value.matchAll(pattern)) {
      if (match[1]) quotes.push(match[1].normalize("NFC"));
    }
  }
  return quotes;
}

import {
  CHARLIE_FINAL_LETTER_ATTRIBUTION,
  CHARLIE_FINAL_LETTER_SCHEMA_VERSION,
  CHARLIE_VOICE_POLICY_VERSION,
  charlieFinalLetterSchema,
  type CharlieFinalLetter,
} from "../domain";
import { CHARLIE_VOICE_POLICY } from "./voice-policy";

export type CharlieFinalLetterGenerationInput = Readonly<{
  preciseText: string;
  preciseRevisionId: string;
  plainText: string;
  plainRevisionId: string;
  contentBundleId: string;
  contentBundleVersion: string;
  contentBundleChecksum: string;
  evidenceIds: readonly string[];
  prohibitedClaims: readonly string[];
  portraitShiftSummary: string;
  openDissentCount: number;
  signatureStatus: string;
  finalDisposition: "future_reference" | "present_record" | "unfinished";
  requestedMode: "mock" | "live";
}>;

export function generateCharlieFinalLetter(
  input: CharlieFinalLetterGenerationInput,
): CharlieFinalLetter {
  if (input.requestedMode === "live") {
    return archiveNote(input, "live_generator_unavailable");
  }

  const body = mockLetterBody(input);
  const safetyFailure = validateLetterSafety(body, input);
  if (safetyFailure !== null) return archiveNote(input, safetyFailure);

  return charlieFinalLetterSchema.parse({
    letterKind: "charlie_perspective",
    generationStatus: "generated",
    sourceMode: "mock",
    body,
    ...bindings(input),
    validationResult: {
      bindingValidation: "passed",
      evidenceValidation: "passed",
      safetyValidation: "passed",
    },
    generationProvenance: {
      provider: null,
      model: null,
      adapterVersion: "deterministic-charlie-letter-0.1.0",
      promptVersion: null,
    },
  });
}
export function validateLetterSafety(
  bodyValue: string,
  input: Pick<
    CharlieFinalLetterGenerationInput,
    "preciseText" | "plainText" | "prohibitedClaims"
  >,
): string | null {
  const body = bodyValue.normalize("NFC");
  if (CHARLIE_VOICE_POLICY.forbiddenPatterns.some((pattern) => pattern.test(body))) {
    return "voice_policy_rejected";
  }
  if (
    input.prohibitedClaims.some((claim) => {
      const normalized = claim.normalize("NFC").trim();
      return normalized.length > 0 && body.includes(normalized);
    })
  ) {
    return "prohibited_claim_rejected";
  }
  if (/[“”「」『』]/u.test(body)) return "unauthorized_quotation_rejected";
  if (
    containsCopiedWindow(body, input.preciseText.normalize("NFC")) ||
    containsCopiedWindow(body, input.plainText.normalize("NFC"))
  ) {
    return "protected_source_copy_rejected";
  }
  return null;
}

function mockLetterBody(input: CharlieFinalLetterGenerationInput): string {
  const dissentSentence =
    input.openDissentCount > 0
      ? "你没有把仍在争论的地方藏起来，这让我知道，一份记录可以带着分歧留下，而不必假装所有问题都已经解决。"
      : "有些问题暂时安静下来，但我仍不愿把这份安静当成最后答案。";
  const dispositionSentence = {
    future_reference:
      "把它留给未来参考时，请也给未来的我重新理解、拒绝或改变它的余地。",
    present_record:
      "把它作为此刻的记录就好，让它诚实地说明我们现在看见了什么，而不是替以后下命令。",
    unfinished:
      "让它保持未完成并不可惜，未完成至少承认我还不能替每一个将来的自己说话。",
  }[input.finalDisposition];

  return [
    "谢谢你把我不同时候的样子放在同一张桌上，没有急着挑出一个最完整、最值得留下的我。对我来说，后来知道得更多，确实会改变我怎样看过去，但那不等于过去的感受从此没有发生过。",
    "我能为将来的变化做准备，也会害怕失去现在能够理解的东西。可我越想把一切安排妥当，越明白预测并不是授权。未来的我仍会在自己的处境里感受关系、接受帮助，也可能作出现在的我想不到的选择。",
    dissentSentence,
    `${dispositionSentence}如果你再打开这封信，请把它看作一次诚实的停留，不是一份替任何人作出的裁决。`,
  ].join("\n\n");
}

function archiveNote(
  input: CharlieFinalLetterGenerationInput,
  failureCode: string,
): CharlieFinalLetter {
  return charlieFinalLetterSchema.parse({
    letterKind: "archive_note",
    generationStatus: "unavailable",
    sourceMode: "unavailable",
    body: "查理视角信件未能通过当前的生成与安全校验。封套仍保留文稿、分歧和签名状态，但这里不会用模板冒充查理的发言。",
    failureCode,
    ...bindings(input),
    validationResult: null,
    generationProvenance: {
      provider: null,
      model: null,
      adapterVersion: "charlie-letter-unavailable-0.1.0",
      promptVersion: null,
    },
  });
}

function bindings(input: CharlieFinalLetterGenerationInput) {
  return {
    letterSchemaVersion: CHARLIE_FINAL_LETTER_SCHEMA_VERSION,
    voicePolicyVersion: CHARLIE_VOICE_POLICY_VERSION,
    preciseRevisionId: input.preciseRevisionId,
    plainRevisionId: input.plainRevisionId,
    contentBundleId: input.contentBundleId,
    contentBundleVersion: input.contentBundleVersion,
    contentBundleChecksum: input.contentBundleChecksum,
    evidenceIds: [...input.evidenceIds],
    attribution: CHARLIE_FINAL_LETTER_ATTRIBUTION,
  } as const;
}

function containsCopiedWindow(body: string, source: string): boolean {
  const windowLength = 24;
  if (source.length >= 40 && body.includes(source)) return true;
  if (body.length < windowLength || source.length < windowLength) return false;
  const windows = new Set<string>();
  for (let index = 0; index <= body.length - windowLength; index += 1) {
    windows.add(body.slice(index, index + windowLength));
  }
  for (let index = 0; index <= source.length - windowLength; index += 1) {
    if (windows.has(source.slice(index, index + windowLength))) return true;
  }
  return false;
}

import { describe, expect, it } from "vitest";

import {
  CHARLIE_FINAL_LETTER_ATTRIBUTION,
  charlieFinalLetterSchema,
} from "@/domain";
import {
  generateCharlieFinalLetter,
  validateLetterSafety,
  type CharlieFinalLetterGenerationInput,
} from "@/final-letter";

const BASE_INPUT: CharlieFinalLetterGenerationInput = {
  preciseText: "请为未来保留重新理解这份记录的权利。",
  preciseRevisionId: "precise-r3",
  plainText: "以后仍然可以改变对这份记录的看法。",
  plainRevisionId: "plain-r3",
  contentBundleId: "verified-bundle",
  contentBundleVersion: "0.2.0",
  contentBundleChecksum: `sha256:${"a".repeat(64)}`,
  evidenceIds: ["EC-R1", "EC-R2"],
  prohibitedClaims: ["作品证明高峰期查理拥有绝对决定权。"],
  portraitShiftSummary: "读者从单一代表转向承认三个阶段共同存在。",
  openDissentCount: 1,
  signatureStatus: "not_requested",
  finalDisposition: "unfinished",
  requestedMode: "mock",
};

describe("Charlie final letter", () => {
  it("generates a bound 250-400 character letter in three to five paragraphs", () => {
    const result = generateCharlieFinalLetter(BASE_INPUT);

    expect(result.letterKind).toBe("charlie_perspective");
    expect(result.body.split(/\n\s*\n/u)).toHaveLength(4);
    const characterCount = Array.from(result.body.normalize("NFC")).length;
    expect(characterCount).toBeGreaterThanOrEqual(250);
    expect(characterCount).toBeLessThanOrEqual(400);
    expect(result).toMatchObject({
      preciseRevisionId: "precise-r3",
      plainRevisionId: "plain-r3",
      contentBundleId: "verified-bundle",
      evidenceIds: ["EC-R1", "EC-R2"],
      attribution: CHARLIE_FINAL_LETTER_ATTRIBUTION,
      sourceMode: "mock",
    });
  });

  it("keeps the letter independent from all four signature outcomes", () => {
    const statuses = ["signed", "declined", "unavailable", "not_requested"];
    const bodies = statuses.map((signatureStatus) =>
      generateCharlieFinalLetter({ ...BASE_INPUT, signatureStatus }).body,
    );

    expect(new Set(bodies).size).toBe(1);
  });

  it("returns an explicit archive note when live generation is unavailable", () => {
    expect(
      generateCharlieFinalLetter({ ...BASE_INPUT, requestedMode: "live" }),
    ).toMatchObject({
      letterKind: "archive_note",
      generationStatus: "unavailable",
      sourceMode: "unavailable",
      failureCode: "live_generator_unavailable",
      validationResult: null,
    });
  });

  it("rejects moral judgment, unauthorized quotation, and copied source windows", () => {
    expect(validateLetterSafety("你是对的。", BASE_INPUT)).toBe(
      "voice_policy_rejected",
    );
    expect(validateLetterSafety("“这不是原著引文”", BASE_INPUT)).toBe(
      "unauthorized_quotation_rejected",
    );
    const source = "这是一段足够长的精确文本，用来确认连续复制窗口会被安全校验拒绝，不会冒充查理的新信。";
    expect(
      validateLetterSafety(`前言。${source}后记。`, {
        ...BASE_INPUT,
        preciseText: source,
      }),
    ).toBe("protected_source_copy_rejected");
  });

  it("rejects a generated letter outside the length and paragraph contract", () => {
    const generated = generateCharlieFinalLetter(BASE_INPUT);
    expect(
      charlieFinalLetterSchema.safeParse({ ...generated, body: "太短。" })
        .success,
    ).toBe(false);
  });
});

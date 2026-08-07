import type { z } from "zod";

import {
  STABLE_TEXT_ANCHOR_CONTEXT_WINDOW_CODE_POINTS,
  STABLE_TEXT_ANCHOR_SCHEMA_VERSION,
  stableTextAnchorSchema,
  stableTextPointAnchorSchema,
  stableTextRangeAnchorSchema,
} from "./stable-text-anchor.schema";

export type StableTextAnchor = z.infer<typeof stableTextAnchorSchema>;
export type StableTextPointAnchor = z.infer<typeof stableTextPointAnchorSchema>;
export type StableTextRangeAnchor = z.infer<typeof stableTextRangeAnchorSchema>;

export type StableTextAnchorResolution =
  | {
      kind: "resolved";
      startCodePoint: number;
      endCodePoint: number;
      rebased: boolean;
    }
  | {
      kind: "stale";
      reason:
        | "anchor_integrity_mismatch"
        | "baseline_mismatch"
        | "no_unique_match"
        | "out_of_bounds";
    };

export function normalizeTextNfc(text: string): string {
  return text.normalize("NFC");
}

export function codePointLength(text: string): number {
  return Array.from(normalizeTextNfc(text)).length;
}

export function sliceByCodePoint(text: string, start: number, end?: number): string {
  return Array.from(normalizeTextNfc(text)).slice(start, end).join("");
}

export async function sha256NfcUtf8(text: string): Promise<`sha256:${string}`> {
  const bytes = new TextEncoder().encode(normalizeTextNfc(text));
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  const hex = Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  return `sha256:${hex}`;
}

async function createAnchorBase(
  textDocument: StableTextAnchor["textDocument"],
  baseRevisionId: string,
  baselineText: string,
  startCodePoint: number,
  endCodePoint: number,
) {
  const normalized = normalizeTextNfc(baselineText);
  const length = codePointLength(normalized);
  if (startCodePoint < 0 || endCodePoint < startCodePoint || endCodePoint > length) {
    throw new RangeError("Anchor indices are outside the normalized text");
  }

  const prefixStart = Math.max(
    0,
    startCodePoint - STABLE_TEXT_ANCHOR_CONTEXT_WINDOW_CODE_POINTS,
  );
  const suffixEnd = Math.min(
    length,
    endCodePoint + STABLE_TEXT_ANCHOR_CONTEXT_WINDOW_CODE_POINTS,
  );
  const prefixText = sliceByCodePoint(normalized, prefixStart, startCodePoint);
  const suffixText = sliceByCodePoint(normalized, endCodePoint, suffixEnd);

  return {
    stableTextAnchorSchemaVersion: STABLE_TEXT_ANCHOR_SCHEMA_VERSION,
    textDocument,
    baseRevisionId,
    normalization: "NFC" as const,
    indexUnit: "unicode_code_point" as const,
    baselineTextSha256: await sha256NfcUtf8(normalized),
    contextWindowCodePoints: STABLE_TEXT_ANCHOR_CONTEXT_WINDOW_CODE_POINTS,
    prefixText,
    prefixTextSha256: await sha256NfcUtf8(prefixText),
    suffixText,
    suffixTextSha256: await sha256NfcUtf8(suffixText),
  };
}

export async function createStableTextPointAnchor(input: {
  textDocument: StableTextAnchor["textDocument"];
  baseRevisionId: string;
  baselineText: string;
  offsetCodePoint: number;
}): Promise<StableTextPointAnchor> {
  const base = await createAnchorBase(
    input.textDocument,
    input.baseRevisionId,
    input.baselineText,
    input.offsetCodePoint,
    input.offsetCodePoint,
  );
  return stableTextPointAnchorSchema.parse({
    ...base,
    kind: "point",
    offsetCodePoint: input.offsetCodePoint,
  });
}

export async function createStableTextRangeAnchor(input: {
  textDocument: StableTextAnchor["textDocument"];
  baseRevisionId: string;
  baselineText: string;
  startCodePoint: number;
  endCodePoint: number;
}): Promise<StableTextRangeAnchor> {
  const expectedText = sliceByCodePoint(
    input.baselineText,
    input.startCodePoint,
    input.endCodePoint,
  );
  if (expectedText.length === 0) {
    throw new RangeError("Range anchors must select at least one code point");
  }
  const base = await createAnchorBase(
    input.textDocument,
    input.baseRevisionId,
    input.baselineText,
    input.startCodePoint,
    input.endCodePoint,
  );
  return stableTextRangeAnchorSchema.parse({
    ...base,
    kind: "range",
    startCodePoint: input.startCodePoint,
    endCodePoint: input.endCodePoint,
    expectedText,
    expectedTextSha256: await sha256NfcUtf8(expectedText),
  });
}

async function hasValidAnchorIntegrity(anchor: StableTextAnchor): Promise<boolean> {
  if (
    (await sha256NfcUtf8(anchor.prefixText)) !== anchor.prefixTextSha256 ||
    (await sha256NfcUtf8(anchor.suffixText)) !== anchor.suffixTextSha256
  ) {
    return false;
  }
  return (
    anchor.kind === "point" ||
    (await sha256NfcUtf8(anchor.expectedText)) === anchor.expectedTextSha256
  );
}

function contextMatches(
  points: string[],
  start: number,
  end: number,
  anchor: StableTextAnchor,
): boolean {
  const prefix = Array.from(anchor.prefixText);
  const suffix = Array.from(anchor.suffixText);
  return (
    points.slice(Math.max(0, start - prefix.length), start).join("") ===
      prefix.join("") &&
    points.slice(end, end + suffix.length).join("") === suffix.join("")
  );
}

export async function resolveStableTextAnchor(input: {
  anchor: StableTextAnchor;
  currentText: string;
  currentRevisionId: string;
  allowDeterministicRebase: boolean;
}): Promise<StableTextAnchorResolution> {
  const parsed = stableTextAnchorSchema.safeParse(input.anchor);
  if (!parsed.success || !(await hasValidAnchorIntegrity(parsed.data))) {
    return { kind: "stale", reason: "anchor_integrity_mismatch" };
  }

  const anchor = parsed.data;
  const normalized = normalizeTextNfc(input.currentText);
  const points = Array.from(normalized);
  const directStart =
    anchor.kind === "point" ? anchor.offsetCodePoint : anchor.startCodePoint;
  const directEnd = anchor.kind === "point" ? directStart : anchor.endCodePoint;

  if (directStart > points.length || directEnd > points.length) {
    if (!input.allowDeterministicRebase) {
      return { kind: "stale", reason: "out_of_bounds" };
    }
  } else if (
    input.currentRevisionId === anchor.baseRevisionId &&
    (await sha256NfcUtf8(normalized)) === anchor.baselineTextSha256 &&
    contextMatches(points, directStart, directEnd, anchor) &&
    (anchor.kind === "point" ||
      points.slice(directStart, directEnd).join("") === anchor.expectedText)
  ) {
    return {
      kind: "resolved",
      startCodePoint: directStart,
      endCodePoint: directEnd,
      rebased: false,
    };
  }

  if (!input.allowDeterministicRebase) {
    return { kind: "stale", reason: "baseline_mismatch" };
  }

  const matches: Array<{ start: number; end: number }> = [];
  if (anchor.kind === "point") {
    for (let offset = 0; offset <= points.length; offset += 1) {
      if (contextMatches(points, offset, offset, anchor)) {
        matches.push({ start: offset, end: offset });
      }
    }
  } else {
    const expected = Array.from(anchor.expectedText);
    for (let start = 0; start + expected.length <= points.length; start += 1) {
      const end = start + expected.length;
      if (
        points.slice(start, end).join("") === expected.join("") &&
        contextMatches(points, start, end, anchor)
      ) {
        matches.push({ start, end });
      }
    }
  }

  if (matches.length !== 1) {
    return { kind: "stale", reason: "no_unique_match" };
  }

  return {
    kind: "resolved",
    startCodePoint: matches[0].start,
    endCodePoint: matches[0].end,
    rebased: true,
  };
}

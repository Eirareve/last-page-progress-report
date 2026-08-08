import type {
  CharlieSignatureReviewCandidate,
  CharlieSignatureReviewError,
  CharlieSignatureReviewInput,
  CharlieSignatureReviewRequestContext,
  CharlieSignatureReviewResult,
  CharlieSignatureReviewSafetyPolicy,
} from "./contracts";
import { createCharlieSignatureReviewError } from "./errors";
import {
  FINAL_REVIEW_MAX_ALLOWED_QUOTE_CODE_UNITS,
  FINAL_REVIEW_MAX_UNQUOTED_COPY_CODE_UNITS,
  FINAL_REVIEW_MIN_FULL_SOURCE_COPY_CODE_UNITS,
} from "./limits";
import {
  charlieSignatureReviewCandidateSchema,
  charlieSignatureReviewInputSchema,
  charlieSignatureReviewRequestContextSchema,
  charlieSignatureReviewResultSchema,
  charlieSignatureReviewSafetyPolicySchema,
  finalReviewTrustedEvidenceIdsSchema,
} from "./schemas";
import { FINAL_REVIEW_SCHEMA_VERSION } from "./versions";

export type CharlieSignatureReviewCandidateValidation =
  | Readonly<{
      validationKind: "validated";
      result: CharlieSignatureReviewResult;
    }>
  | Readonly<{
      validationKind: "rejected";
      error: CharlieSignatureReviewError;
    }>;

export type CharlieSignatureReviewResultBindingValidation =
  | Readonly<{ bindingValidationKind: "valid" }>
  | Readonly<{
      bindingValidationKind: "invalid";
      error: CharlieSignatureReviewError;
    }>;

export const DEFAULT_CHARLIE_SIGNATURE_REVIEW_SAFETY_POLICY = Object.freeze({
  prohibitedClaims: Object.freeze([]),
  prohibitedInferences: Object.freeze([]),
  allowedQuotedText: Object.freeze([]),
  protectedSourceText: Object.freeze([]),
}) satisfies CharlieSignatureReviewSafetyPolicy;

const FORBIDDEN_REASON_PATTERNS: readonly RegExp[] = Object.freeze([
  /\binternal[_ ]?excerpt\b/iu,
  /\b(?:personality diagnosis|personality disorder|personality type)\b/iu,
  /(?:人格诊断|人格障碍|人格类型)/u,
  /\b(?:cognitive impairment|dementia simulation)\b/iu,
  /(?:认知障碍|痴呆模拟)/u,
  /\b(?:final verdict|objectively correct)\b/iu,
  /(?:最终裁决|客观正确)/u,
  /\b(?:score|scored|scores|scoring|rating|ratings)\b/iu,
  /(?:评分|打分|评级|分数|得(?:到|了)?\s*\d+(?:\.\d+)?\s*分)/u,
]);

const QUOTED_TEXT_PATTERNS: readonly RegExp[] = Object.freeze([
  /"([^"\r\n]+)"/gu,
  /“([^”\r\n]+)”/gu,
  /「([^」\r\n]+)」/gu,
  /『([^』\r\n]+)』/gu,
]);

// Markdown code spans and blockquote lines are explicit quotation syntax at
// this boundary; they follow the same exact allowlist and 200-unit cap.
const MARKDOWN_INLINE_QUOTE_PATTERN = /`([^`\r\n]+)`/gu;
const MARKDOWN_BLOCK_QUOTE_PATTERN = /^[ \t]*>[ \t]?([^\r\n]+)$/gmu;

export function validateCharlieSignatureReviewCandidate(input: {
  reviewInput: CharlieSignatureReviewInput;
  context: CharlieSignatureReviewRequestContext;
  candidate: unknown;
  trustedEvidenceIds: readonly string[];
  safetyPolicy?: CharlieSignatureReviewSafetyPolicy;
}): CharlieSignatureReviewCandidateValidation {
  const parsedInput = charlieSignatureReviewInputSchema.safeParse(
    input.reviewInput,
  );
  if (!parsedInput.success) {
    return rejected(
      "schema_validation_failed",
      "Charlie signature review input failed schema validation",
    );
  }

  const parsedContext = parseRequestContext(input.context);
  if (!parsedContext.success) {
    return rejected(
      "schema_validation_failed",
      "Charlie signature review RequestContext failed schema validation",
    );
  }

  const bindingError = validateRequestBindings(
    parsedInput.data,
    parsedContext.data,
  );
  if (bindingError !== null) {
    return { validationKind: "rejected", error: bindingError };
  }

  const parsedCandidate = charlieSignatureReviewCandidateSchema.safeParse(
    input.candidate,
  );
  if (!parsedCandidate.success) {
    return rejected(
      isRecord(input.candidate)
        ? "schema_validation_failed"
        : "invalid_output",
      "Charlie signature review Candidate failed schema validation",
    );
  }

  const parsedSafetyPolicy = charlieSignatureReviewSafetyPolicySchema.safeParse(
    input.safetyPolicy ?? DEFAULT_CHARLIE_SIGNATURE_REVIEW_SAFETY_POLICY,
  );
  if (!parsedSafetyPolicy.success) {
    return rejected(
      "schema_validation_failed",
      "Charlie signature review safety policy failed schema validation",
    );
  }

  const parsedTrustedEvidenceIds = finalReviewTrustedEvidenceIdsSchema.safeParse(
    input.trustedEvidenceIds,
  );
  if (!parsedTrustedEvidenceIds.success) {
    return rejected(
      "schema_validation_failed",
      "Trusted Final Review evidence identifiers failed schema validation",
    );
  }

  const allowedEvidenceIds = new Set(parsedInput.data.allowedEvidenceIds);
  const trustedEvidenceIds = new Set(parsedTrustedEvidenceIds.data);
  if (
    parsedInput.data.allowedEvidenceIds.length !== trustedEvidenceIds.size ||
    parsedInput.data.allowedEvidenceIds.some(
      (evidenceId) => !trustedEvidenceIds.has(evidenceId),
    )
  ) {
    return rejected(
      "content_not_found",
      "Resolved trusted evidence does not match the Final Review allowed set",
    );
  }
  if (
    parsedCandidate.data.evidenceIds.some(
      (evidenceId) =>
        !allowedEvidenceIds.has(evidenceId) ||
        !trustedEvidenceIds.has(evidenceId),
    )
  ) {
    return rejected(
      "safety_validation_failed",
      "Charlie signature review Candidate referenced evidence outside the allowed set",
    );
  }

  const safetyError = validateReasonSafety(
    parsedInput.data,
    parsedCandidate.data,
    parsedSafetyPolicy.data,
  );
  if (safetyError !== null) {
    return { validationKind: "rejected", error: safetyError };
  }

  return {
    validationKind: "validated",
    result: charlieSignatureReviewResultSchema.parse({
      status: parsedCandidate.data.status,
      reason: parsedCandidate.data.reason,
      preciseRevisionId: parsedInput.data.preciseRevisionId,
      plainRevisionId: parsedInput.data.plainRevisionId,
      contentBundleId: parsedInput.data.contentBundleId,
      contentBundleVersion: parsedInput.data.contentBundleVersion,
      contentBundleChecksum: parsedInput.data.contentBundleChecksum,
      evidenceIds: parsedCandidate.data.evidenceIds,
      finalReviewSchemaVersion: FINAL_REVIEW_SCHEMA_VERSION,
      validationResult: {
        validatorVersion: FINAL_REVIEW_SCHEMA_VERSION,
        bindingValidation: "passed",
        evidenceValidation: "passed",
        safetyValidation: "passed",
      },
    }),
  };
}

/**
 * Revalidates a service Result against trusted call inputs. The Result's own
 * validationResult field is deliberately not consulted as proof.
 */
export function validateCharlieSignatureReviewResultBinding(input: {
  reviewInput: CharlieSignatureReviewInput;
  context: CharlieSignatureReviewRequestContext;
  result: CharlieSignatureReviewResult;
}): CharlieSignatureReviewResultBindingValidation {
  const parsedInput = charlieSignatureReviewInputSchema.safeParse(
    input.reviewInput,
  );
  const parsedContext = parseRequestContext(input.context);
  const parsedResult = charlieSignatureReviewResultSchema.safeParse(input.result);
  if (!parsedInput.success || !parsedContext.success || !parsedResult.success) {
    return invalidResultBinding(
      "schema_validation_failed",
      "Final Review Input, RequestContext, or Result failed schema validation",
    );
  }

  const requestBindingError = validateRequestBindings(
    parsedInput.data,
    parsedContext.data,
  );
  if (requestBindingError !== null) {
    return {
      bindingValidationKind: "invalid",
      error: requestBindingError,
    };
  }

  if (
    parsedResult.data.preciseRevisionId !== parsedInput.data.preciseRevisionId ||
    parsedResult.data.plainRevisionId !== parsedInput.data.plainRevisionId
  ) {
    return invalidResultBinding(
      "stale_revision",
      "Final Review Result revision bindings do not match the review input",
    );
  }
  if (parsedResult.data.contentBundleId !== parsedInput.data.contentBundleId) {
    return invalidResultBinding(
      "content_not_found",
      "Final Review Result does not bind the requested content bundle",
    );
  }
  if (
    parsedResult.data.contentBundleVersion !==
      parsedInput.data.contentBundleVersion ||
    parsedResult.data.contentBundleChecksum !==
      parsedInput.data.contentBundleChecksum ||
    parsedResult.data.finalReviewSchemaVersion !==
      parsedInput.data.finalReviewSchemaVersion
  ) {
    return invalidResultBinding(
      "content_version_mismatch",
      "Final Review Result content or schema version binding does not match",
    );
  }
  const allowedEvidenceIds = new Set(parsedInput.data.allowedEvidenceIds);
  if (
    parsedResult.data.evidenceIds.some(
      (evidenceId) => !allowedEvidenceIds.has(evidenceId),
    )
  ) {
    return invalidResultBinding(
      "safety_validation_failed",
      "Final Review Result referenced evidence outside the allowed set",
    );
  }

  return { bindingValidationKind: "valid" };
}

function parseRequestContext(context: CharlieSignatureReviewRequestContext) {
  const { abortSignal, ...serializableContext } = context;
  void abortSignal;
  return charlieSignatureReviewRequestContextSchema.safeParse(
    serializableContext,
  );
}

function validateRequestBindings(
  input: CharlieSignatureReviewInput,
  context: Omit<CharlieSignatureReviewRequestContext, "abortSignal">,
): CharlieSignatureReviewError | null {
  if (
    context.bindings.revisions.preciseRevisionId !== input.preciseRevisionId ||
    context.bindings.revisions.plainRevisionId !== input.plainRevisionId
  ) {
    return createCharlieSignatureReviewError(
      "stale_revision",
      "RequestContext revision bindings do not match the review input",
    );
  }

  if (
    context.bindings.content.contentBundleId === null ||
    context.bindings.content.contentBundleId !== input.contentBundleId
  ) {
    return createCharlieSignatureReviewError(
      "content_not_found",
      "RequestContext does not bind the requested content bundle",
    );
  }

  if (
    context.bindings.content.contentBundleVersion !== input.contentBundleVersion ||
    context.bindings.content.contentBundleChecksum !==
      input.contentBundleChecksum
  ) {
    return createCharlieSignatureReviewError(
      "content_version_mismatch",
      "RequestContext content version or checksum does not match the review input",
    );
  }

  return null;
}

function validateReasonSafety(
  input: CharlieSignatureReviewInput,
  candidate: CharlieSignatureReviewCandidate,
  policy: CharlieSignatureReviewSafetyPolicy,
): CharlieSignatureReviewError | null {
  const reason = candidate.reason.normalize("NFC");
  if (FORBIDDEN_REASON_PATTERNS.some((pattern) => pattern.test(reason))) {
    return createCharlieSignatureReviewError(
      "safety_validation_failed",
      "Charlie signature review reason contains a prohibited inference or ruling",
    );
  }

  const prohibitedFragments = [
    ...policy.prohibitedClaims,
    ...policy.prohibitedInferences,
  ];
  if (
    prohibitedFragments.some((fragment) =>
      includesNonBlankNormalized(reason, fragment),
    )
  ) {
    return createCharlieSignatureReviewError(
      "safety_validation_failed",
      "Charlie signature review reason contains a prohibited claim",
    );
  }

  const allowedQuoteSources = policy.allowedQuotedText.map((value) =>
    value.normalize("NFC"),
  );
  const quotedFragments = extractQuotedFragments(reason);
  if (
    quotedFragments.some(
      (quote) =>
        quote.length > FINAL_REVIEW_MAX_ALLOWED_QUOTE_CODE_UNITS ||
        !allowedQuoteSources.some((source) => source === quote),
    )
  ) {
    return createCharlieSignatureReviewError(
      "safety_validation_failed",
      "Charlie signature review reason contains an unauthorized quotation",
    );
  }

  const protectedSources = [
    input.preciseText,
    input.plainText,
    ...(policy.protectedSourceText ?? []),
    ...policy.allowedQuotedText,
  ];
  const unquotedReason = maskAllowedQuotedText(reason, allowedQuoteSources);
  const detectsLongOrFullCopy = buildSourceCopyDetector(unquotedReason);
  if (protectedSources.some(detectsLongOrFullCopy)) {
    return createCharlieSignatureReviewError(
      "safety_validation_failed",
      "Charlie signature review reason contains a full or overlong copied source span",
    );
  }

  return null;
}

function extractQuotedFragments(value: string): string[] {
  return [
    ...QUOTED_TEXT_PATTERNS,
    MARKDOWN_INLINE_QUOTE_PATTERN,
    MARKDOWN_BLOCK_QUOTE_PATTERN,
  ].flatMap((pattern) =>
    Array.from(value.matchAll(pattern), (match) => match[1] ?? "").filter(
      (fragment) => fragment.length > 0,
    ),
  );
}

function includesNonBlankNormalized(haystack: string, needle: string): boolean {
  const normalizedNeedle = needle.normalize("NFC").trim().toLocaleLowerCase();
  return (
    normalizedNeedle.length > 0 &&
    haystack.toLocaleLowerCase().includes(normalizedNeedle)
  );
}

function buildSourceCopyDetector(reason: string): (source: string) => boolean {
  const copiedWindowLength = FINAL_REVIEW_MAX_UNQUOTED_COPY_CODE_UNITS + 1;
  const reasonWindows = new Set<string>();
  for (
    let start = 0;
    start <= reason.length - copiedWindowLength;
    start += 1
  ) {
    reasonWindows.add(reason.slice(start, start + copiedWindowLength));
  }
  return (source: string): boolean => {
    const normalizedSource = source.normalize("NFC");
    if (
      normalizedSource.length >=
        FINAL_REVIEW_MIN_FULL_SOURCE_COPY_CODE_UNITS &&
      reason.includes(normalizedSource)
    ) {
      return true;
    }
    for (
      let start = 0;
      start <= normalizedSource.length - copiedWindowLength;
      start += 1
    ) {
      if (
        reasonWindows.has(
          normalizedSource.slice(start, start + copiedWindowLength),
        )
      ) {
        return true;
      }
    }
    return false;
  };
}

function maskAllowedQuotedText(
  reason: string,
  allowedQuotedText: readonly string[],
): string {
  const wrappers = [
    ['"', '"'],
    ["`", "`"],
    ["“", "”"],
    ["「", "」"],
    ["『", "』"],
  ] as const;
  return allowedQuotedText.reduce(
    (maskedReason, quotation) =>
      wrappers
        .reduce(
          (masked, [opening, closing]) =>
            masked.replaceAll(
              `${opening}${quotation}${closing}`,
              " ".repeat(quotation.length + opening.length + closing.length),
            ),
          maskedReason,
        )
        .replaceAll(
          `> ${quotation}`,
          " ".repeat(quotation.length + 2),
        )
        .replaceAll(`>${quotation}`, " ".repeat(quotation.length + 1)),
    reason,
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function rejected(
  code: CharlieSignatureReviewError["code"],
  message: string,
): CharlieSignatureReviewCandidateValidation {
  return {
    validationKind: "rejected",
    error: createCharlieSignatureReviewError(code, message),
  };
}

function invalidResultBinding(
  code: CharlieSignatureReviewError["code"],
  message: string,
): CharlieSignatureReviewResultBindingValidation {
  return {
    bindingValidationKind: "invalid",
    error: createCharlieSignatureReviewError(code, message),
  };
}

import type {
  CharlieSignatureReviewCandidate,
  CharlieSignatureReviewInput,
  CharlieSignatureReviewRequestContext,
  FinalReviewEvidenceResolver,
  FinalReviewTrustedExecutionInput,
  MockFinalReviewFixture,
} from "@/final-review";
import {
  charlieSignatureReviewInputSchema,
  charlieSignatureReviewRequestContextSchema,
  finalReviewEvidenceResolutionSchema,
  FINAL_REVIEW_SCHEMA_VERSION,
  MOCK_FINAL_REVIEW_ADAPTER_VERSION,
  DEFAULT_CHARLIE_SIGNATURE_REVIEW_SAFETY_POLICY,
  resolvedFinalReviewEvidenceContextSchema,
} from "@/final-review";

export const FINAL_REVIEW_CONTENT_CHECKSUM =
  `sha256:${"c".repeat(64)}` as const;
export const FINAL_REVIEW_INPUT_FINGERPRINT =
  `sha256:${"f".repeat(64)}` as const;
export const FINAL_REVIEW_RESULT_DIGEST =
  `sha256:${"d".repeat(64)}` as const;
export const FINAL_REVIEW_STARTED_AT = "2026-08-07T12:00:00.000Z";
export const FINAL_REVIEW_COMPLETED_AT = "2026-08-07T12:00:01.000Z";

export function makeCharlieSignatureReviewInput(
  overrides: Partial<CharlieSignatureReviewInput> = {},
): CharlieSignatureReviewInput {
  return charlieSignatureReviewInputSchema.parse({
    preciseRevisionId: "precise-r3",
    plainRevisionId: "plain-r3",
    preciseText:
      "Past and future claims remain distinct, and the unresolved tension is recorded.",
    plainText:
      "The report keeps both the past claim and the future claim without forcing agreement.",
    allowedEvidenceIds: ["evidence-1", "evidence-2"],
    unresolvedDissents: [
      {
        id: "dissent-1",
        roundId: "round2",
        charliePositionId: "charlie-position-1",
        userPrincipleId: "user-principle-1",
        focus: "Whether the future claim resolves the past claim",
        status: "open",
      },
    ],
    contentBundleId: "verified-bundle-1",
    contentBundleVersion: "0.1.0",
    contentBundleChecksum: FINAL_REVIEW_CONTENT_CHECKSUM,
    finalReviewSchemaVersion: FINAL_REVIEW_SCHEMA_VERSION,
    ...overrides,
  });
}

export function makeCharlieSignatureReviewContext(
  overrides: Partial<CharlieSignatureReviewRequestContext> = {},
): CharlieSignatureReviewRequestContext {
  const input = makeCharlieSignatureReviewInput();
  return charlieSignatureReviewRequestContextSchema.parse({
    operationId: "operation-final-review-1",
    requestId: "request-final-review-1",
    requestedMode: "mock",
    capability: "reviewCharlieSignature",
    attempt: 1,
    inputFingerprint: FINAL_REVIEW_INPUT_FINGERPRINT,
    promptVersion: null,
    adapterVersion: MOCK_FINAL_REVIEW_ADAPTER_VERSION,
    stage: "FINAL_SIGNATURE",
    stageInstanceId: "stage-instance-final-signature-1",
    bindings: {
      revisions: {
        preciseRevisionId: input.preciseRevisionId,
        plainRevisionId: input.plainRevisionId,
      },
      content: {
        contentBundleId: input.contentBundleId,
        contentBundleVersion: input.contentBundleVersion,
        contentBundleChecksum: input.contentBundleChecksum,
      },
    },
    ...overrides,
  });
}

export function makeCharlieSignatureReviewCandidate(
  status: CharlieSignatureReviewCandidate["status"] = "signed",
  overrides: Partial<CharlieSignatureReviewCandidate> = {},
): CharlieSignatureReviewCandidate {
  return {
    status,
    finalReviewSchemaVersion: FINAL_REVIEW_SCHEMA_VERSION,
    reason:
      status === "signed"
        ? "The two current revisions retain the stated tension, so Charlie signs this presentation."
        : "The current revisions flatten the unresolved dissent, so Charlie declines this presentation.",
    evidenceIds: ["evidence-1"],
    ...overrides,
  } as CharlieSignatureReviewCandidate;
}

export function makePlaceholderFinalReviewEvidenceResolver(): FinalReviewEvidenceResolver {
  return {
    async resolveEvidence(input) {
      return finalReviewEvidenceResolutionSchema.parse({
        resolutionKind: "resolved",
        evidenceContext: makePlaceholderFinalReviewEvidenceContext(input),
      });
    },
  };
}

export function makePlaceholderFinalReviewEvidenceContext(
  input: CharlieSignatureReviewInput = makeCharlieSignatureReviewInput(),
) {
  return resolvedFinalReviewEvidenceContextSchema.parse({
    evidenceMode: "placeholder",
    contentBundleId: input.contentBundleId,
    contentBundleVersion: input.contentBundleVersion,
    contentBundleChecksum: input.contentBundleChecksum,
    placeholderEvidenceIds: input.allowedEvidenceIds,
    evidenceItems: [],
  });
}

export function makeFinalReviewTrustedExecutionInput(
  input: CharlieSignatureReviewInput = makeCharlieSignatureReviewInput(),
): FinalReviewTrustedExecutionInput {
  return {
    evidenceContext: makePlaceholderFinalReviewEvidenceContext(input),
    safetyPolicy: DEFAULT_CHARLIE_SIGNATURE_REVIEW_SAFETY_POLICY,
  };
}

export function makeMockFinalReviewFixture(
  status: CharlieSignatureReviewCandidate["status"] = "signed",
  candidateOverrides: Partial<CharlieSignatureReviewCandidate> = {},
): MockFinalReviewFixture {
  return {
    fixtureId: `final-review-${status}-fixture-v1`,
    candidate: makeCharlieSignatureReviewCandidate(status, candidateOverrides),
  };
}

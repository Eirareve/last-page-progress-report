import type { z } from "zod";
import { describe, expect, it } from "vitest";

import {
  AGENT_CANDIDATE_SCHEMA_VERSIONS,
  AGENT_ARRAY_MAX_ITEMS,
  AGENT_CAPABILITY_CATALOG,
  AGENT_CAPABILITY_NAMES,
  AGENT_CONTRACT_VERSION,
  AGENT_OUTPUT_TEXT_MAX_LENGTH,
  AGENT_QUESTION_MAX_LENGTH,
  AGENT_SUMMARY_MAX_LENGTH,
  AGENT_UNTRUSTED_USER_TEXT_MAX_LENGTH,
  AGENT_RESULT_SCHEMA_VERSIONS,
  AGENT_RETRYABLE_ERROR_CODES,
  PLAIN_SEMANTIC_CANDIDATE_BUNDLE_SCHEMA_VERSION,
  PLAIN_SEMANTIC_BUNDLE_SCHEMA_VERSION,
  PLAIN_TEXT_CANDIDATE_SCHEMA_VERSION,
  ROUND_ANALYSIS_CANDIDATE_BUNDLE_SCHEMA_VERSION,
  SEMANTIC_RESTORATION_PROPOSAL_CANDIDATE_SCHEMA_VERSION,
  agentCapabilityErrorSchema,
  agentCapabilityError,
  agentCapabilityErrorCodeSchema,
  agentFallbackDecisionSchema,
  buildDissentRecordCandidateSchema,
  buildInitialPortraitRecordCandidateSchema,
  compareSemanticDriftCandidateSchema,
  detectTensionCandidateSchema,
  extractUserPrincipleCandidateSchema,
  extractUserPrincipleInputSchema,
  generateCharlieResponseCandidateSchema,
  plainSemanticReviewCandidateBundleSchema,
  proposeDocumentDiffCandidateSchema,
  retrieveVerifiedEvidenceCandidateSchema,
  roundAnalysisCandidateBundleSchema,
  summarizePortraitShiftCandidateSchema,
} from "@/agent";
import {
  AGENT_TEST_CONTENT_BINDING,
  AGENT_TEST_FACT,
} from "../fixtures/agent";

const evidenceCard = {
  id: "card-1",
  roundId: "round1",
  title: "Synthetic card",
  publicSummary: "Synthetic summary",
  verifiedFactIds: [AGENT_TEST_FACT.id],
  interpretationIds: [],
};

const candidates = {
  retrieveVerifiedEvidence: {
    ...header("retrieveVerifiedEvidence"),
    contentBinding: AGENT_TEST_CONTENT_BINDING,
    evidenceCard,
    evidenceIds: [AGENT_TEST_FACT.id],
    facts: [AGENT_TEST_FACT],
  },
  buildInitialPortraitRecord: {
    ...header("buildInitialPortraitRecord"),
    initialRecord: {
      descriptors: { early: [], peak: [], futureFacing: [] },
      initialChoice: "early",
      initialReason: "A test reason.",
    },
  },
  extractUserPrinciple: {
    ...header("extractUserPrinciple"),
    claim: "Context matters.",
    reasons: ["The current input says so."],
    qualifiers: [],
    exceptions: [],
    supportingExcerpt: "Context matters",
    evidenceIds: [],
  },
  detectTension: {
    ...header("detectTension"),
    roundId: "round1",
    tensions: [],
  },
  generateCharlieResponse: {
    ...header("generateCharlieResponse"),
    roundId: "round1",
    position: "Uncertainty remains.",
    acknowledgesUserPoint: "I understand the point.",
    reservation: "A qualification remains.",
    question: "What exception would change this?",
    evidenceIds: [],
  },
  proposeDocumentDiff: {
    ...header("proposeDocumentDiff"),
    kind: "no_change",
    reason: "No local change is needed.",
  },
  compareSemanticDrift: {
    ...header("compareSemanticDrift"),
    preciseRevisionId: "precise-r1",
    plainRevisionId: "plain-r1",
    preserved: [],
    lost: [],
    ambiguities: [],
    consequences: [],
    semanticFragments: [],
  },
  buildDissentRecord: {
    ...header("buildDissentRecord"),
    roundId: "round1",
    charliePositionId: "position-1",
    userPrincipleId: "principle-1",
    focus: "A test disagreement.",
    status: "open",
  },
  summarizePortraitShift: {
    ...header("summarizePortraitShift"),
    summary: "The final selection differs from the initial selection.",
    evidenceIds: [],
    revisionIds: [],
  },
} as const;

const candidateSchemas: Record<
  keyof typeof candidates,
  z.ZodType
> = {
  retrieveVerifiedEvidence: retrieveVerifiedEvidenceCandidateSchema,
  buildInitialPortraitRecord: buildInitialPortraitRecordCandidateSchema,
  extractUserPrinciple: extractUserPrincipleCandidateSchema,
  detectTension: detectTensionCandidateSchema,
  generateCharlieResponse: generateCharlieResponseCandidateSchema,
  proposeDocumentDiff: proposeDocumentDiffCandidateSchema,
  compareSemanticDrift: compareSemanticDriftCandidateSchema,
  buildDissentRecord: buildDissentRecordCandidateSchema,
  summarizePortraitShift: summarizePortraitShiftCandidateSchema,
};

describe("stage 3 Agent capability contracts", () => {
  it("versions the approved restoration repair on separate owned axes", () => {
    expect(AGENT_CONTRACT_VERSION).toBe("0.2.0");
    expect(AGENT_CANDIDATE_SCHEMA_VERSIONS.compareSemanticDrift).toBe("0.2.0");
    expect(AGENT_RESULT_SCHEMA_VERSIONS.compareSemanticDrift).toBe("0.2.0");
    expect(PLAIN_SEMANTIC_CANDIDATE_BUNDLE_SCHEMA_VERSION).toBe("0.2.0");
    expect(PLAIN_SEMANTIC_BUNDLE_SCHEMA_VERSION).toBe("0.2.0");
    expect(SEMANTIC_RESTORATION_PROPOSAL_CANDIDATE_SCHEMA_VERSION).toBe(
      "0.2.0",
    );
    expect(PLAIN_TEXT_CANDIDATE_SCHEMA_VERSION).toBe("0.1.0");
  });

  it("freezes exactly nine independently versioned capabilities", () => {
    expect(Object.keys(AGENT_CAPABILITY_CATALOG)).toEqual(
      AGENT_CAPABILITY_NAMES,
    );
    expect(AGENT_CAPABILITY_NAMES).toHaveLength(9);
    expect(
      Object.values(AGENT_CAPABILITY_CATALOG).filter(
        (entry) => entry.capabilityKind === "deterministic_domain_service",
      ).map((entry) => entry.capability),
    ).toEqual([
      "retrieveVerifiedEvidence",
      "buildInitialPortraitRecord",
      "buildDissentRecord",
    ]);
    for (const capability of AGENT_CAPABILITY_NAMES) {
      expect(AGENT_CAPABILITY_CATALOG[capability].resultSchemaVersion).toBe(
        AGENT_RESULT_SCHEMA_VERSIONS[capability],
      );
    }
  });

  it.each(AGENT_CAPABILITY_NAMES)(
    "%s Candidate requires its owned versions and rejects generic schemaVersion",
    (capability) => {
      const schema = candidateSchemas[capability];
      const candidate = candidates[capability];
      expect(schema.parse(candidate)).toEqual(candidate);

      const withoutContract = { ...candidate } as Record<string, unknown>;
      delete withoutContract.agentContractVersion;
      expect(schema.safeParse(withoutContract).success).toBe(false);

      const withoutCandidateVersion = {
        ...candidate,
      } as Record<string, unknown>;
      delete withoutCandidateVersion.candidateSchemaVersion;
      expect(schema.safeParse(withoutCandidateVersion).success).toBe(false);

      expect(
        schema.safeParse({ ...candidate, schemaVersion: "0.1.0" }).success,
      ).toBe(false);
    },
  );

  it("keeps plainTextCandidate bundle-owned rather than adding a tenth capability", () => {
    expect(AGENT_CAPABILITY_NAMES).not.toContain("plainTextCandidate");
    const semanticCandidate = candidates.compareSemanticDrift;
    const bundle = {
      agentContractVersion: AGENT_CONTRACT_VERSION,
      plainSemanticCandidateBundleSchemaVersion:
        PLAIN_SEMANTIC_CANDIDATE_BUNDLE_SCHEMA_VERSION,
      contentBinding: AGENT_TEST_CONTENT_BINDING,
      plainTextCandidate: {
        agentContractVersion: AGENT_CONTRACT_VERSION,
        plainTextCandidateSchemaVersion: PLAIN_TEXT_CANDIDATE_SCHEMA_VERSION,
        sourcePreciseRevisionId: "precise-r1",
        targetPlainRevisionId: "plain-r1",
        plainText: "Plain text.",
      },
      semanticReview: semanticCandidate,
      restorationOutcomes: [],
    };
    expect(plainSemanticReviewCandidateBundleSchema.parse(bundle)).toEqual(
      bundle,
    );
  });

  it("requires an owned version on the RoundAnalysis Candidate bundle", () => {
    const bundle = {
      agentContractVersion: AGENT_CONTRACT_VERSION,
      roundAnalysisCandidateBundleSchemaVersion:
        ROUND_ANALYSIS_CANDIDATE_BUNDLE_SCHEMA_VERSION,
      roundId: "round1",
      contentBinding: AGENT_TEST_CONTENT_BINDING,
      revisions: { preciseRevisionId: "precise-r1", plainRevisionId: null },
      principle: candidates.extractUserPrinciple,
      tension: candidates.detectTension,
      charlieResponse: candidates.generateCharlieResponse,
      documentDiff: candidates.proposeDocumentDiff,
    };
    expect(roundAnalysisCandidateBundleSchema.parse(bundle)).toEqual(bundle);
    expect(
      roundAnalysisCandidateBundleSchema.safeParse({
        ...bundle,
        roundAnalysisCandidateBundleSchemaVersion: undefined,
      }).success,
    ).toBe(false);
  });

  it("distinguishes ordinary development from tension without a contradiction label", () => {
    const candidate = {
      ...candidates.detectTension,
      tensions: [
        {
          kind: "user_prior_view",
          assessment: "development",
          summary: "The later statement narrows the earlier one.",
          relatedPrincipleIds: [],
          evidenceIds: [],
        },
      ],
    };
    expect(detectTensionCandidateSchema.parse(candidate)).toEqual(candidate);
    expect(
      detectTensionCandidateSchema.safeParse({
        ...candidate,
        tensions: [{ ...candidate.tensions[0], assessment: "contradiction" }],
      }).success,
    ).toBe(false);
  });

  it("freezes strict error and fallback records", () => {
    expect(
      agentCapabilityErrorSchema.parse({
        kind: "agent_capability_error",
        capability: "detectTension",
        code: "safety_validation_failed",
        summary: "Synthetic failure",
        retryable: false,
      }),
    ).toBeDefined();
    expect(
      agentFallbackDecisionSchema.parse({
        kind: "agent_fallback",
        capability: "detectTension",
        resolvedMode: "mock",
        reason: "Synthetic fallback",
      }),
    ).toBeDefined();
    expect(
      agentFallbackDecisionSchema.safeParse({
        kind: "agent_fallback",
        capability: "detectTension",
        resolvedMode: "mock",
        reason: "Synthetic fallback",
        schemaVersion: "0.1.0",
      }).success,
    ).toBe(false);
  });

  it("derives retryability from the frozen error-code mapping", () => {
    for (const code of agentCapabilityErrorCodeSchema.options) {
      const expected = AGENT_RETRYABLE_ERROR_CODES.includes(
        code as (typeof AGENT_RETRYABLE_ERROR_CODES)[number],
      );
      const error = agentCapabilityError(
        "detectTension",
        code,
        `Synthetic ${code}`,
        !expected,
      );
      expect(error.retryable).toBe(expected);
      expect(
        agentCapabilityErrorSchema.safeParse({
          ...error,
          retryable: !expected,
        }).success,
      ).toBe(false);
    }
  });

  it("rejects output and untrusted-input length or collection overflow", () => {
    expect(
      extractUserPrincipleCandidateSchema.safeParse({
        ...candidates.extractUserPrinciple,
        claim: "x".repeat(AGENT_OUTPUT_TEXT_MAX_LENGTH + 1),
      }).success,
    ).toBe(false);
    expect(
      generateCharlieResponseCandidateSchema.safeParse({
        ...candidates.generateCharlieResponse,
        question: `${"q".repeat(AGENT_QUESTION_MAX_LENGTH)}?`,
      }).success,
    ).toBe(false);
    expect(
      summarizePortraitShiftCandidateSchema.safeParse({
        ...candidates.summarizePortraitShift,
        summary: "s".repeat(AGENT_SUMMARY_MAX_LENGTH + 1),
      }).success,
    ).toBe(false);
    expect(
      compareSemanticDriftCandidateSchema.safeParse({
        ...candidates.compareSemanticDrift,
        preserved: Array.from(
          { length: AGENT_ARRAY_MAX_ITEMS + 1 },
          (_, index) => `item-${index}`,
        ),
      }).success,
    ).toBe(false);
    expect(
      extractUserPrincipleInputSchema.safeParse({
        roundId: "round1",
        untrustedUserText: "u".repeat(
          AGENT_UNTRUSTED_USER_TEXT_MAX_LENGTH + 1,
        ),
        allowedEvidenceIds: [],
      }).success,
    ).toBe(false);
    expect(
      plainSemanticReviewCandidateBundleSchema.safeParse({
        agentContractVersion: AGENT_CONTRACT_VERSION,
        plainSemanticCandidateBundleSchemaVersion:
          PLAIN_SEMANTIC_CANDIDATE_BUNDLE_SCHEMA_VERSION,
        contentBinding: AGENT_TEST_CONTENT_BINDING,
        plainTextCandidate: {
          agentContractVersion: AGENT_CONTRACT_VERSION,
          plainTextCandidateSchemaVersion: PLAIN_TEXT_CANDIDATE_SCHEMA_VERSION,
          sourcePreciseRevisionId: "precise-r1",
          targetPlainRevisionId: "plain-r1",
          plainText: "   ",
        },
        semanticReview: candidates.compareSemanticDrift,
      }).success,
    ).toBe(false);
  });
});

function header(capability: keyof typeof AGENT_CANDIDATE_SCHEMA_VERSIONS) {
  return {
    agentContractVersion: AGENT_CONTRACT_VERSION,
    candidateSchemaVersion: AGENT_CANDIDATE_SCHEMA_VERSIONS[capability],
  } as const;
}

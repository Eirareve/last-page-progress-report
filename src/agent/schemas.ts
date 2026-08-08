import { z } from "zod";

import {
  charliePositionSchema,
  charlieResponseSchema,
  charlieStageSchema,
  diffProposalResultSchema,
  dissentRecordSchema,
  documentTargetSchema,
  evidenceCardSchema,
  initialPortraitRecordSchema,
  portraitShiftComparisonSchema,
  roundIdSchema,
  semanticDriftSchema,
  semanticFragmentSchema,
  sha256DigestSchema,
  stableTextAnchorSchema,
  userPrincipleSchema,
  verifiedFactSchema,
} from "../domain";
import {
  agentCapabilityNameSchema,
  agentFallbackModeSchema,
  type AgentCapabilityName,
} from "./capability-catalog";
import {
  AGENT_CANDIDATE_SCHEMA_VERSIONS,
  AGENT_CONTRACT_VERSION,
  AGENT_RESULT_SCHEMA_VERSIONS,
  PLAIN_SEMANTIC_CANDIDATE_BUNDLE_SCHEMA_VERSION,
  PLAIN_SEMANTIC_BUNDLE_SCHEMA_VERSION,
  PLAIN_TEXT_CANDIDATE_SCHEMA_VERSION,
  ROUND_ANALYSIS_CANDIDATE_BUNDLE_SCHEMA_VERSION,
  ROUND_ANALYSIS_BUNDLE_SCHEMA_VERSION,
} from "./versions";
import {
  AGENT_ARRAY_MAX_ITEMS,
  AGENT_DIFF_NEW_TEXT_MAX_LENGTH,
  AGENT_OUTPUT_TEXT_MAX_LENGTH,
  AGENT_PLAIN_TEXT_CANDIDATE_MAX_LENGTH,
  AGENT_QUESTION_MAX_LENGTH,
  AGENT_SUMMARY_MAX_LENGTH,
  AGENT_UNTRUSTED_USER_TEXT_MAX_LENGTH,
} from "./limits";

const identifierSchema = z.string().trim().min(1);
const versionSchema = z
  .string()
  .trim()
  .min(1)
  .refine((value) => value.toLowerCase() !== "unknown", {
    message: 'Version cannot use the sentinel "unknown"',
  });
const nonEmptyTextSchema = z
  .string()
  .trim()
  .min(1)
  .max(AGENT_OUTPUT_TEXT_MAX_LENGTH);
const candidateTextArraySchema = z
  .array(nonEmptyTextSchema)
  .max(AGENT_ARRAY_MAX_ITEMS);

export const agentExecutionObservationSchema = z.strictObject({
  networkRetries: z.number().int().nonnegative(),
  structuredRepairs: z.number().int().nonnegative(),
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  latencyMs: z.number().int().nonnegative(),
  estimatedCostUsdMicros: z.number().int().nonnegative(),
  provider: z.string().trim().min(1).optional(),
  modelName: z.string().trim().min(1).optional(),
});

function uniqueIdentifierArray(minimum = 0) {
  return z
    .array(identifierSchema)
    .min(minimum)
    .max(AGENT_ARRAY_MAX_ITEMS)
    .refine((values) => new Set(values).size === values.length, {
      message: "Identifiers must be unique",
    });
}

export const agentContentBindingSchema = z.strictObject({
  contentBundleId: identifierSchema,
  contentBundleVersion: versionSchema,
  contentBundleChecksum: sha256DigestSchema,
});

export const agentRevisionBindingSchema = z
  .strictObject({
    preciseRevisionId: identifierSchema,
    plainRevisionId: identifierSchema.nullable(),
  });

export const agentValidationResultSchema = z.strictObject({
  schemaValidated: z.literal(true),
  bindingValidated: z.literal(true),
  safetyValidated: z.literal(true),
});

export const agentSafetyPolicySchema = z.strictObject({
  prohibitedClaims: candidateTextArraySchema,
  prohibitedInferences: candidateTextArraySchema,
  allowedQuotedText: candidateTextArraySchema,
});

export const agentCapabilityErrorCodeSchema = z.enum([
  "timeout",
  "rate_limited",
  "network_error",
  "invalid_output",
  "schema_validation_failed",
  "safety_validation_failed",
  "stale_revision",
  "content_gate_not_passed",
  "content_not_found",
  "content_mode_not_verified",
  "content_version_mismatch",
  "evidence_not_allowed",
  "idempotency_conflict",
  "budget_exhausted",
  "fallback_unavailable",
]);

export const AGENT_RETRYABLE_ERROR_CODES = Object.freeze([
  "timeout",
  "rate_limited",
  "network_error",
  "invalid_output",
  "schema_validation_failed",
] as const);

export const agentCapabilityErrorSchema = z
  .strictObject({
    kind: z.literal("agent_capability_error"),
    capability: agentCapabilityNameSchema,
    code: agentCapabilityErrorCodeSchema,
    summary: nonEmptyTextSchema,
    retryable: z.boolean(),
  })
  .superRefine((error, context) => {
    const expected = AGENT_RETRYABLE_ERROR_CODES.includes(
      error.code as (typeof AGENT_RETRYABLE_ERROR_CODES)[number],
    );
    if (error.retryable !== expected) {
      context.addIssue({
        code: "custom",
        message: `retryable must be ${expected} for ${error.code}`,
        path: ["retryable"],
      });
    }
  });

export const agentFallbackDecisionSchema = z.strictObject({
  kind: z.literal("agent_fallback"),
  capability: agentCapabilityNameSchema,
  resolvedMode: agentFallbackModeSchema,
  reason: nonEmptyTextSchema,
});

export const retrieveVerifiedEvidenceInputSchema = z.strictObject({
  contentBinding: agentContentBindingSchema,
  evidenceCardId: identifierSchema,
  evidenceIds: uniqueIdentifierArray(1),
});

export const retrieveVerifiedEvidenceCandidateSchema = z.strictObject({
  ...candidateHeader("retrieveVerifiedEvidence"),
  contentBinding: agentContentBindingSchema,
  evidenceCard: evidenceCardSchema,
  evidenceIds: uniqueIdentifierArray(1),
  facts: z.array(verifiedFactSchema).min(1).max(AGENT_ARRAY_MAX_ITEMS),
});

export const retrieveVerifiedEvidenceValidatedResultSchema = z.strictObject({
  ...validatedHeader("retrieveVerifiedEvidence"),
  contentBinding: agentContentBindingSchema,
  evidenceCard: evidenceCardSchema,
  evidenceIds: uniqueIdentifierArray(1),
  facts: z.array(verifiedFactSchema).min(1).max(AGENT_ARRAY_MAX_ITEMS),
});

export const buildInitialPortraitRecordInputSchema = z.strictObject({
  descriptors: z.strictObject({
    early: candidateTextArraySchema,
    peak: candidateTextArraySchema,
    futureFacing: candidateTextArraySchema,
  }),
  initialChoice: charlieStageSchema,
  initialReason: nonEmptyTextSchema,
});

export const buildInitialPortraitRecordCandidateSchema = z.strictObject({
  ...candidateHeader("buildInitialPortraitRecord"),
  initialRecord: initialPortraitRecordSchema,
});

export const buildInitialPortraitRecordValidatedResultSchema = z.strictObject({
  ...validatedHeader("buildInitialPortraitRecord"),
  initialRecord: initialPortraitRecordSchema,
});

export const extractUserPrincipleInputSchema = z.strictObject({
  roundId: roundIdSchema,
  untrustedUserText: z
    .string()
    .trim()
    .min(1)
    .max(AGENT_UNTRUSTED_USER_TEXT_MAX_LENGTH),
  allowedEvidenceIds: uniqueIdentifierArray(),
});

export const extractUserPrincipleCandidateSchema = z.strictObject({
  ...candidateHeader("extractUserPrinciple"),
  claim: nonEmptyTextSchema,
  reasons: candidateTextArraySchema,
  qualifiers: candidateTextArraySchema,
  exceptions: candidateTextArraySchema,
  supportingExcerpt: nonEmptyTextSchema,
  evidenceIds: uniqueIdentifierArray(),
});

export const extractUserPrincipleValidatedResultSchema = z.strictObject({
  ...validatedHeader("extractUserPrinciple"),
  principle: userPrincipleSchema,
});

export const tensionKindSchema = z.enum([
  "user_prior_view",
  "charlie_internal",
  "portrait_current_view",
  "precise_plain_text",
]);

export const tensionSchema = z.strictObject({
  kind: tensionKindSchema,
  /** Ordinary development is explicitly distinct from an actual tension. */
  assessment: z.enum(["development", "tension"]),
  summary: nonEmptyTextSchema,
  relatedPrincipleIds: uniqueIdentifierArray(),
  evidenceIds: uniqueIdentifierArray(),
});

export const detectTensionInputSchema = z
  .strictObject({
    roundId: roundIdSchema,
    currentPrinciple: userPrincipleSchema,
    priorPrinciples: z.array(userPrincipleSchema).max(AGENT_ARRAY_MAX_ITEMS),
    initialPortraitChoice: charlieStageSchema,
    charliePositions: z.array(charliePositionSchema).max(AGENT_ARRAY_MAX_ITEMS),
    preciseRevisionId: identifierSchema,
    preciseText: z.string(),
    plainRevisionId: identifierSchema.nullable(),
    plainText: z.string().nullable(),
    allowedEvidenceIds: uniqueIdentifierArray(),
  })
  .refine(
    (input) => (input.plainRevisionId === null) === (input.plainText === null),
    {
      message: "plainRevisionId and plainText must be present together",
      path: ["plainRevisionId"],
    },
  );

export const detectTensionCandidateSchema = z.strictObject({
  ...candidateHeader("detectTension"),
  roundId: roundIdSchema,
  tensions: z.array(tensionSchema).max(AGENT_ARRAY_MAX_ITEMS),
});

export const detectTensionValidatedResultSchema = z.strictObject({
  ...validatedHeader("detectTension"),
  roundId: roundIdSchema,
  tensions: z.array(tensionSchema).max(AGENT_ARRAY_MAX_ITEMS),
});

export const verifiedAgentEvidenceContextSchema = z.strictObject({
  contentMode: z.literal("verified"),
  verifiedFacts: z.array(verifiedFactSchema).max(AGENT_ARRAY_MAX_ITEMS),
  allowedEvidenceIds: uniqueIdentifierArray(),
});

export const placeholderAgentEvidenceContextSchema = z.strictObject({
  contentMode: z.literal("placeholder"),
  evidenceCards: z.array(
    z.strictObject({
      id: identifierSchema,
      publicSummary: nonEmptyTextSchema,
    }),
  ).max(AGENT_ARRAY_MAX_ITEMS),
  allowedEvidenceIds: uniqueIdentifierArray(),
});

export const agentEvidenceContextSchema = z.discriminatedUnion("contentMode", [
  verifiedAgentEvidenceContextSchema,
  placeholderAgentEvidenceContextSchema,
]);

export const generateCharlieResponseInputSchema = z.strictObject({
  roundId: roundIdSchema,
  principle: userPrincipleSchema,
  tensions: z.array(tensionSchema).max(AGENT_ARRAY_MAX_ITEMS),
  preciseRevisionId: identifierSchema,
  preciseText: z.string(),
  evidenceContext: agentEvidenceContextSchema,
});

export const generateCharlieResponseCandidateSchema = z.strictObject({
  ...candidateHeader("generateCharlieResponse"),
  roundId: roundIdSchema,
  position: nonEmptyTextSchema,
  acknowledgesUserPoint: nonEmptyTextSchema,
  reservation: nonEmptyTextSchema,
  question: z.string().trim().min(1).max(AGENT_QUESTION_MAX_LENGTH),
  evidenceIds: uniqueIdentifierArray(),
});

export const generateCharlieResponseValidatedResultSchema = z.strictObject({
  ...validatedHeader("generateCharlieResponse"),
  charliePosition: charliePositionSchema,
  charlieResponse: charlieResponseSchema,
});

const diffCandidateBaseShape = {
  ...candidateHeader("proposeDocumentDiff"),
  baseRevisionId: identifierSchema,
  documentTarget: documentTargetSchema,
  targetAnchor: stableTextAnchorSchema,
  reason: nonEmptyTextSchema,
  evidenceIds: uniqueIdentifierArray(),
  principleIds: uniqueIdentifierArray(),
} as const;

const insertDiffCandidateSchema = z.strictObject({
  ...diffCandidateBaseShape,
  operation: z.literal("insert"),
  documentTarget: z.enum(["precise_text", "plain_text"]),
  newText: z.string().trim().min(1).max(AGENT_DIFF_NEW_TEXT_MAX_LENGTH),
});
const replaceDiffCandidateSchema = z.strictObject({
  ...diffCandidateBaseShape,
  operation: z.literal("replace"),
  documentTarget: z.enum(["precise_text", "plain_text"]),
  oldText: nonEmptyTextSchema,
  oldTextHash: sha256DigestSchema,
  newText: z.string().trim().min(1).max(AGENT_DIFF_NEW_TEXT_MAX_LENGTH),
});
const deleteDiffCandidateSchema = z.strictObject({
  ...diffCandidateBaseShape,
  operation: z.literal("delete"),
  documentTarget: z.enum(["precise_text", "plain_text"]),
  oldText: nonEmptyTextSchema,
  oldTextHash: sha256DigestSchema,
});
const annotateDiffCandidateSchema = z.strictObject({
  ...diffCandidateBaseShape,
  operation: z.literal("annotate"),
  annotationText: nonEmptyTextSchema,
});

export const proposedDocumentOperationCandidateSchema = z.discriminatedUnion(
  "operation",
  [
    insertDiffCandidateSchema,
    replaceDiffCandidateSchema,
    deleteDiffCandidateSchema,
    annotateDiffCandidateSchema,
  ],
);

export const proposeDocumentDiffInputSchema = z.strictObject({
  documentTarget: documentTargetSchema,
  baseRevisionId: identifierSchema,
  currentText: z.string(),
  principle: userPrincipleSchema,
  charlieResponse: charlieResponseSchema,
  allowedEvidenceIds: uniqueIdentifierArray(),
});

export const proposeDocumentDiffCandidateSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    ...candidateHeader("proposeDocumentDiff"),
    kind: z.literal("diff"),
    diff: proposedDocumentOperationCandidateSchema,
  }),
  z.strictObject({
    ...candidateHeader("proposeDocumentDiff"),
    kind: z.literal("no_change"),
    reason: nonEmptyTextSchema,
  }),
]);

export const proposeDocumentDiffValidatedResultSchema = z.strictObject({
  ...validatedHeader("proposeDocumentDiff"),
  proposal: diffProposalResultSchema,
});

export const semanticFragmentCandidateSchema = z.strictObject({
  ...candidateHeader("compareSemanticDrift"),
  phrase: nonEmptyTextSchema,
  reason: nonEmptyTextSchema,
  consequence: nonEmptyTextSchema,
});

export const compareSemanticDriftInputSchema = z.strictObject({
  preciseRevisionId: identifierSchema,
  preciseText: z.string(),
  plainRevisionId: identifierSchema,
  plainText: z.string(),
});

export const compareSemanticDriftCandidateSchema = z.strictObject({
  ...candidateHeader("compareSemanticDrift"),
  preciseRevisionId: identifierSchema,
  plainRevisionId: identifierSchema,
  preserved: candidateTextArraySchema,
  lost: candidateTextArraySchema,
  ambiguities: candidateTextArraySchema,
  consequences: candidateTextArraySchema,
  semanticFragments: z
    .array(semanticFragmentCandidateSchema)
    .max(AGENT_ARRAY_MAX_ITEMS),
});

export const compareSemanticDriftValidatedResultSchema = z.strictObject({
  ...validatedHeader("compareSemanticDrift"),
  drift: semanticDriftSchema,
  semanticFragments: z.array(semanticFragmentSchema).max(AGENT_ARRAY_MAX_ITEMS),
});

export const buildDissentRecordInputSchema = z.strictObject({
  roundId: roundIdSchema,
  charliePosition: charliePositionSchema,
  userPrinciple: userPrincipleSchema,
  focus: nonEmptyTextSchema,
  status: z.enum(["open", "resolved"]),
});

export const buildDissentRecordProjectionSchema = z.strictObject({
  dissentRecordId: identifierSchema,
  safetyPolicy: agentSafetyPolicySchema,
});

export const buildDissentRecordCandidateSchema = z.strictObject({
  ...candidateHeader("buildDissentRecord"),
  roundId: roundIdSchema,
  charliePositionId: identifierSchema,
  userPrincipleId: identifierSchema,
  focus: nonEmptyTextSchema,
  status: z.enum(["open", "resolved"]),
});

export const buildDissentRecordValidatedResultSchema = z.strictObject({
  ...validatedHeader("buildDissentRecord"),
  dissentRecord: dissentRecordSchema,
});

export const summarizePortraitShiftInputSchema = z.strictObject({
  comparison: portraitShiftComparisonSchema,
  allowedEvidenceIds: uniqueIdentifierArray(),
  allowedRevisionIds: uniqueIdentifierArray(),
});

export const summarizePortraitShiftCandidateSchema = z.strictObject({
  ...candidateHeader("summarizePortraitShift"),
  summary: z.string().trim().min(1).max(AGENT_SUMMARY_MAX_LENGTH),
  evidenceIds: uniqueIdentifierArray(),
  revisionIds: uniqueIdentifierArray(),
});

export const summarizePortraitShiftValidatedResultSchema = z.strictObject({
  ...validatedHeader("summarizePortraitShift"),
  summary: z.string().trim().min(1).max(AGENT_SUMMARY_MAX_LENGTH),
  evidenceIds: uniqueIdentifierArray(),
  revisionIds: uniqueIdentifierArray(),
});

export const roundAnalysisCandidateBundleSchema = z.strictObject({
  agentContractVersion: z.literal(AGENT_CONTRACT_VERSION),
  roundAnalysisCandidateBundleSchemaVersion: z.literal(
    ROUND_ANALYSIS_CANDIDATE_BUNDLE_SCHEMA_VERSION,
  ),
  roundId: roundIdSchema,
  contentBinding: agentContentBindingSchema,
  revisions: agentRevisionBindingSchema,
  principle: extractUserPrincipleCandidateSchema,
  tension: detectTensionCandidateSchema,
  charlieResponse: generateCharlieResponseCandidateSchema,
  documentDiff: proposeDocumentDiffCandidateSchema,
});

export const validatedRoundAnalysisBundleSchema = z.strictObject({
  agentContractVersion: z.literal(AGENT_CONTRACT_VERSION),
  roundAnalysisBundleSchemaVersion: z.literal(
    ROUND_ANALYSIS_BUNDLE_SCHEMA_VERSION,
  ),
  roundId: roundIdSchema,
  contentBinding: agentContentBindingSchema,
  revisions: agentRevisionBindingSchema,
  principle: extractUserPrincipleValidatedResultSchema,
  tension: detectTensionValidatedResultSchema,
  charlieResponse: generateCharlieResponseValidatedResultSchema,
  documentDiff: proposeDocumentDiffValidatedResultSchema,
});

/** Bundle-owned transport slot; it is not a tenth logical Agent capability. */
export const plainTextCandidateSchema = z.strictObject({
  agentContractVersion: z.literal(AGENT_CONTRACT_VERSION),
  plainTextCandidateSchemaVersion: z.literal(
    PLAIN_TEXT_CANDIDATE_SCHEMA_VERSION,
  ),
  sourcePreciseRevisionId: identifierSchema,
  targetPlainRevisionId: identifierSchema,
  plainText: z
    .string()
    .refine((value) => value.trim().length > 0, {
      message: "Plain-text Candidate cannot be blank",
    })
    .max(AGENT_PLAIN_TEXT_CANDIDATE_MAX_LENGTH),
});

export const plainSemanticReviewCandidateBundleSchema = z.strictObject({
  agentContractVersion: z.literal(AGENT_CONTRACT_VERSION),
  plainSemanticCandidateBundleSchemaVersion: z.literal(
    PLAIN_SEMANTIC_CANDIDATE_BUNDLE_SCHEMA_VERSION,
  ),
  contentBinding: agentContentBindingSchema,
  plainTextCandidate: plainTextCandidateSchema,
  semanticReview: compareSemanticDriftCandidateSchema,
});

export const validatedPlainSemanticBundleSchema = z.strictObject({
  agentContractVersion: z.literal(AGENT_CONTRACT_VERSION),
  plainSemanticBundleSchemaVersion: z.literal(
    PLAIN_SEMANTIC_BUNDLE_SCHEMA_VERSION,
  ),
  contentBinding: agentContentBindingSchema,
  plainRevision: z.strictObject({
    sourcePreciseRevisionId: identifierSchema,
    plainRevisionId: identifierSchema,
    plainText: z.string().max(AGENT_PLAIN_TEXT_CANDIDATE_MAX_LENGTH),
  }),
  semanticReview: compareSemanticDriftValidatedResultSchema,
});

function validatedHeader(capability: AgentCapabilityName) {
  return {
    capability: z.literal(capability),
    agentContractVersion: z.literal(AGENT_CONTRACT_VERSION),
    resultSchemaVersion: z.literal(
      AGENT_RESULT_SCHEMA_VERSIONS[capability],
    ),
    validationResult: agentValidationResultSchema,
  } as const;
}

function candidateHeader(capability: AgentCapabilityName) {
  return {
    agentContractVersion: z.literal(AGENT_CONTRACT_VERSION),
    candidateSchemaVersion: z.literal(
      AGENT_CANDIDATE_SCHEMA_VERSIONS[capability],
    ),
  } as const;
}

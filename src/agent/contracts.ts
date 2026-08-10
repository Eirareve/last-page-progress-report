import type { z } from "zod";

import type {
  agentExecutionObservationSchema,
  agentCapabilityErrorCodeSchema,
  agentCapabilityErrorSchema,
  agentContentBindingSchema,
  agentFallbackDecisionSchema,
  agentRevisionBindingSchema,
  agentSafetyPolicySchema,
  agentValidationResultSchema,
  buildDissentRecordCandidateSchema,
  buildDissentRecordInputSchema,
  buildDissentRecordProjectionSchema,
  buildDissentRecordValidatedResultSchema,
  buildInitialPortraitRecordCandidateSchema,
  buildInitialPortraitRecordInputSchema,
  buildInitialPortraitRecordValidatedResultSchema,
  compareSemanticDriftCandidateSchema,
  compareSemanticDriftInputSchema,
  compareSemanticDriftValidatedResultSchema,
  detectTensionCandidateSchema,
  detectTensionInputSchema,
  detectTensionValidatedResultSchema,
  extractUserPrincipleCandidateSchema,
  extractUserPrincipleInputSchema,
  extractUserPrincipleValidatedResultSchema,
  generateCharlieResponseCandidateSchema,
  generateCharlieResponseInputSchema,
  generateCharlieResponseValidatedResultSchema,
  agentEvidenceContextSchema,
  plainSemanticReviewCandidateBundleSchema,
  plainTextCandidateSchema,
  proposedDocumentOperationCandidateSchema,
  proposeDocumentDiffCandidateSchema,
  proposeDocumentDiffInputSchema,
  proposeDocumentDiffValidatedResultSchema,
  retrieveVerifiedEvidenceCandidateSchema,
  retrieveVerifiedEvidenceInputSchema,
  retrieveVerifiedEvidenceValidatedResultSchema,
  roundAnalysisCandidateBundleSchema,
  semanticFragmentCandidateSchema,
  semanticRestorationCandidateOutcomeSchema,
  semanticRestorationProposalCandidateSchema,
  semanticRestorationUnavailableReasonSchema,
  semanticRestorationValidatedOutcomeSchema,
  summarizePortraitShiftCandidateSchema,
  summarizePortraitShiftInputSchema,
  summarizePortraitShiftValidatedResultSchema,
  tensionKindSchema,
  tensionSchema,
  validatedPlainSemanticBundleSchema,
  validatedRoundAnalysisBundleSchema,
} from "./schemas";

export type AgentExecutionObservation = z.infer<
  typeof agentExecutionObservationSchema
>;

export type AgentContentBinding = z.infer<typeof agentContentBindingSchema>;
export type AgentRevisionBinding = z.infer<typeof agentRevisionBindingSchema>;
export type AgentValidationResult = z.infer<typeof agentValidationResultSchema>;
export type AgentSafetyPolicy = z.infer<typeof agentSafetyPolicySchema>;
export type AgentEvidenceContext = z.infer<typeof agentEvidenceContextSchema>;
export type AgentCapabilityErrorCode = z.infer<
  typeof agentCapabilityErrorCodeSchema
>;
export type AgentCapabilityError = z.infer<typeof agentCapabilityErrorSchema>;
export type AgentFallbackDecision = z.infer<typeof agentFallbackDecisionSchema>;

export type RetrieveVerifiedEvidenceInput = z.infer<
  typeof retrieveVerifiedEvidenceInputSchema
>;
export type RetrieveVerifiedEvidenceCandidate = z.infer<
  typeof retrieveVerifiedEvidenceCandidateSchema
>;
export type RetrieveVerifiedEvidenceValidatedResult = z.infer<
  typeof retrieveVerifiedEvidenceValidatedResultSchema
>;

export type BuildInitialPortraitRecordInput = z.infer<
  typeof buildInitialPortraitRecordInputSchema
>;
export type BuildInitialPortraitRecordCandidate = z.infer<
  typeof buildInitialPortraitRecordCandidateSchema
>;
export type BuildInitialPortraitRecordValidatedResult = z.infer<
  typeof buildInitialPortraitRecordValidatedResultSchema
>;

export type ExtractUserPrincipleInput = z.infer<
  typeof extractUserPrincipleInputSchema
>;
export type ExtractUserPrincipleCandidate = z.infer<
  typeof extractUserPrincipleCandidateSchema
>;
export type ExtractUserPrincipleValidatedResult = z.infer<
  typeof extractUserPrincipleValidatedResultSchema
>;

export type TensionKind = z.infer<typeof tensionKindSchema>;
export type Tension = z.infer<typeof tensionSchema>;
export type DetectTensionInput = z.infer<typeof detectTensionInputSchema>;
export type DetectTensionCandidate = z.infer<typeof detectTensionCandidateSchema>;
export type DetectTensionValidatedResult = z.infer<
  typeof detectTensionValidatedResultSchema
>;

export type GenerateCharlieResponseInput = z.infer<
  typeof generateCharlieResponseInputSchema
>;
export type GenerateCharlieResponseCandidate = z.infer<
  typeof generateCharlieResponseCandidateSchema
>;
export type GenerateCharlieResponseValidatedResult = z.infer<
  typeof generateCharlieResponseValidatedResultSchema
>;

export type ProposeDocumentDiffInput = z.infer<
  typeof proposeDocumentDiffInputSchema
>;
export type ProposedDocumentOperationCandidate = z.infer<
  typeof proposedDocumentOperationCandidateSchema
>;
export type ProposeDocumentDiffCandidate = z.infer<
  typeof proposeDocumentDiffCandidateSchema
>;
export type ProposeDocumentDiffValidatedResult = z.infer<
  typeof proposeDocumentDiffValidatedResultSchema
>;

export type SemanticFragmentCandidate = z.infer<
  typeof semanticFragmentCandidateSchema
>;
export type SemanticRestorationProposalCandidate = z.infer<
  typeof semanticRestorationProposalCandidateSchema
>;
export type SemanticRestorationCandidateOutcome = z.infer<
  typeof semanticRestorationCandidateOutcomeSchema
>;
export type SemanticRestorationValidatedOutcome = z.infer<
  typeof semanticRestorationValidatedOutcomeSchema
>;
export type SemanticRestorationUnavailableReason = z.infer<
  typeof semanticRestorationUnavailableReasonSchema
>;
export type CompareSemanticDriftInput = z.infer<
  typeof compareSemanticDriftInputSchema
>;
export type CompareSemanticDriftCandidate = z.infer<
  typeof compareSemanticDriftCandidateSchema
>;
export type CompareSemanticDriftValidatedResult = z.infer<
  typeof compareSemanticDriftValidatedResultSchema
>;

export type BuildDissentRecordInput = z.infer<
  typeof buildDissentRecordInputSchema
>;
export type BuildDissentRecordProjection = z.infer<
  typeof buildDissentRecordProjectionSchema
>;
export type BuildDissentRecordCandidate = z.infer<
  typeof buildDissentRecordCandidateSchema
>;
export type BuildDissentRecordValidatedResult = z.infer<
  typeof buildDissentRecordValidatedResultSchema
>;

export type SummarizePortraitShiftInput = z.infer<
  typeof summarizePortraitShiftInputSchema
>;
export type SummarizePortraitShiftCandidate = z.infer<
  typeof summarizePortraitShiftCandidateSchema
>;
export type SummarizePortraitShiftValidatedResult = z.infer<
  typeof summarizePortraitShiftValidatedResultSchema
>;

export type RoundAnalysisCandidateBundle = z.infer<
  typeof roundAnalysisCandidateBundleSchema
>;
export type ValidatedRoundAnalysisBundle = z.infer<
  typeof validatedRoundAnalysisBundleSchema
>;
export type PlainTextCandidate = z.infer<typeof plainTextCandidateSchema>;
export type PlainSemanticReviewCandidateBundle = z.infer<
  typeof plainSemanticReviewCandidateBundleSchema
>;
export type ValidatedPlainSemanticBundle = z.infer<
  typeof validatedPlainSemanticBundleSchema
>;

export type AgentOperationResult<T> =
  | Readonly<{ ok: true; value: T }>
  | Readonly<{ ok: false; error: AgentCapabilityError }>;

/** IDs and timestamps supplied by trusted application code, never by a model. */
export type AgentProjectionContext = Readonly<{
  principleId?: string;
  charliePositionId?: string;
  charlieResponseId?: string;
  documentDiffId?: string;
  documentDiffCreatedAt?: string;
  plainRevisionId?: string;
  semanticFragmentIds?: readonly string[];
  semanticRestorationProposalIds?: readonly string[];
  semanticRestorationProposalCreatedAt?: string;
}>;

export type AgentCandidateValidationContext = AgentProjectionContext &
  Readonly<{
    safetyPolicy: AgentSafetyPolicy;
  }>;

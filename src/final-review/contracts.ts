import type { z } from "zod";

import type { RequestContext } from "../runtime/contracts";
import type {
  charlieSignatureReviewCandidateSchema,
  charlieSignatureReviewCandidatePortOutcomeSchema,
  charlieSignatureReviewErrorSchema,
  charlieSignatureReviewInputSchema,
  charlieSignatureReviewRequestContextSchema,
  charlieSignatureReviewResultSchema,
  charlieSignatureReviewServiceOutcomeSchema,
  charlieSignatureReviewValidationResultSchema,
  finalReviewEvidenceResolutionSchema,
  finalReviewExecutionObservationSchema,
  resolvedFinalReviewEvidenceContextSchema,
  verifiedFinalReviewEvidenceItemSchema,
} from "./schemas";

export type CharlieSignatureReviewInput = z.infer<
  typeof charlieSignatureReviewInputSchema
>;
export type CharlieSignatureReviewCandidate = z.infer<
  typeof charlieSignatureReviewCandidateSchema
>;
export type CharlieSignatureReviewValidationResult = z.infer<
  typeof charlieSignatureReviewValidationResultSchema
>;
export type CharlieSignatureReviewResult = z.infer<
  typeof charlieSignatureReviewResultSchema
>;
export type CharlieSignatureReviewError = z.infer<
  typeof charlieSignatureReviewErrorSchema
>;
export type CharlieSignatureReviewServiceOutcome = z.infer<
  typeof charlieSignatureReviewServiceOutcomeSchema
>;
export type VerifiedFinalReviewEvidenceItem = z.infer<
  typeof verifiedFinalReviewEvidenceItemSchema
>;
export type ResolvedFinalReviewEvidenceContext = z.infer<
  typeof resolvedFinalReviewEvidenceContextSchema
>;
export type FinalReviewEvidenceResolution = z.infer<
  typeof finalReviewEvidenceResolutionSchema
>;
export type FinalReviewExecutionObservation = z.infer<
  typeof finalReviewExecutionObservationSchema
>;
export type CharlieSignatureReviewCandidatePortOutcome = z.infer<
  typeof charlieSignatureReviewCandidatePortOutcomeSchema
>;

export type CharlieSignatureReviewRequestContext = z.infer<
  typeof charlieSignatureReviewRequestContextSchema
> &
  Pick<RequestContext, "abortSignal">;

export type CharlieSignatureReviewSafetyPolicy = Readonly<{
  prohibitedClaims: readonly string[];
  prohibitedInferences: readonly string[];
  allowedQuotedText: readonly string[];
  protectedSourceText?: readonly string[];
}>;

export type FinalReviewTrustedExecutionInput = Readonly<{
  evidenceContext: ResolvedFinalReviewEvidenceContext;
  safetyPolicy: CharlieSignatureReviewSafetyPolicy;
}>;

export type MockFinalReviewFixture = Readonly<{
  fixtureId: string;
  candidate: CharlieSignatureReviewCandidate;
}>;

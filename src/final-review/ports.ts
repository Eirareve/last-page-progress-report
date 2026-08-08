import type {
  CharlieSignatureReviewCandidatePortOutcome,
  CharlieSignatureReviewInput,
  CharlieSignatureReviewRequestContext,
  CharlieSignatureReviewServiceOutcome,
  FinalReviewEvidenceResolution,
  FinalReviewTrustedExecutionInput,
  ResolvedFinalReviewEvidenceContext,
} from "./contracts";

/** Provider-neutral service boundary. Business input and request metadata stay separate. */
export interface FinalReviewService {
  readonly executionMode: "mock" | "live";
  readonly adapterVersion: string;

  reviewCharlieSignature(
    input: CharlieSignatureReviewInput,
    context: CharlieSignatureReviewRequestContext,
    trustedExecution: FinalReviewTrustedExecutionInput,
  ): Promise<CharlieSignatureReviewServiceOutcome>;
}

/**
 * Candidate-producing adapter port reserved for a future live provider.
 * Provider-native responses must remain behind an implementation of this port.
 */
export interface CharlieSignatureReviewCandidatePort {
  readonly adapterVersion: string;

  requestCandidate(
    input: CharlieSignatureReviewInput,
    context: CharlieSignatureReviewRequestContext,
    evidenceContext: ResolvedFinalReviewEvidenceContext,
  ): Promise<CharlieSignatureReviewCandidatePortOutcome>;
}

/** Resolves trusted public evidence by ID; callers never supply evidence prose. */
export interface FinalReviewEvidenceResolver {
  resolveEvidence(
    input: CharlieSignatureReviewInput,
  ): Promise<FinalReviewEvidenceResolution>;
}

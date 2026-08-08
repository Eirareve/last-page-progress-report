import type { RequestContext } from "../runtime";
import type {
  AgentCapabilityError,
  AgentExecutionObservation,
  PlainSemanticReviewCandidateBundle,
  RoundAnalysisCandidateBundle,
  SummarizePortraitShiftCandidate,
  SummarizePortraitShiftInput,
} from "./contracts";

export type AgentExecutionEnvelope =
  | Readonly<{
      outcomeKind: "candidate";
      candidate: unknown;
      observation: AgentExecutionObservation;
    }>
  | Readonly<{
      outcomeKind: "error";
      error: AgentCapabilityError;
      observation: AgentExecutionObservation;
    }>;
import type {
  DetectTensionInput,
  ExtractUserPrincipleInput,
  GenerateCharlieResponseInput,
  ProposeDocumentDiffInput,
} from "./contracts";

export type RoundAnalysisPortInput = Readonly<{
  extractUserPrinciple: ExtractUserPrincipleInput;
  detectTension: Omit<DetectTensionInput, "currentPrinciple">;
  generateCharlieResponse: Omit<
    GenerateCharlieResponseInput,
    "principle" | "tensions"
  >;
  proposeDocumentDiff: Omit<
    ProposeDocumentDiffInput,
    "principle" | "charlieResponse"
  >;
  contentBinding: RoundAnalysisCandidateBundle["contentBinding"];
  revisions: RoundAnalysisCandidateBundle["revisions"];
}>;

export type PlainSemanticReviewPortInput = Readonly<{
  contentBinding: PlainSemanticReviewCandidateBundle["contentBinding"];
  sourcePreciseRevisionId: string;
  targetPlainRevisionId: string;
  preciseText: string;
}>;

/**
 * Provider-neutral boundary. Implementations return untrusted Candidates only;
 * application/validation code decides whether a Candidate becomes trusted.
 */
export interface ProviderNeutralAgentPort {
  /** Trusted adapter identity; Candidate payloads cannot select this mode. */
  readonly executionMode: "mock" | "live";
  readonly adapterVersion: string;

  executeRoundAnalysis(
    input: RoundAnalysisPortInput,
    context: RequestContext,
  ): Promise<AgentExecutionEnvelope>;

  executePlainSemanticReview(
    input: PlainSemanticReviewPortInput,
    context: RequestContext,
  ): Promise<AgentExecutionEnvelope>;

  summarizePortraitShift(
    input: SummarizePortraitShiftInput,
    context: RequestContext,
  ): Promise<AgentExecutionEnvelope>;
}

export type ProviderNeutralAgentCandidate =
  | RoundAnalysisCandidateBundle
  | PlainSemanticReviewCandidateBundle
  | SummarizePortraitShiftCandidate;

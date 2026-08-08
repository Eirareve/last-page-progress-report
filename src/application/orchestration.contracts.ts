import type { z } from "zod";

import type {
  AgentCapabilityError,
  AgentExecutionObservation,
} from "../agent";
import type {
  ActiveOperation,
  AgentMode,
  OperationBindings,
  RequestContext,
  ResolvedExecutionMode,
  RuntimeSha256Digest,
} from "../runtime";
import type {
  LogicalCallBudgetUsage,
  Stage3BudgetUsage,
} from "./contracts";
import type {
  applicationOrchestrationEventSchema,
  applicationOrchestrationPreflightReasonSchema,
  charlieSignatureReviewFailedEventSchema,
  charlieSignatureReviewResolvedEventSchema,
  finalReviewFailedTerminalArtifactSchema,
  finalReviewResolvedTerminalArtifactSchema,
  plainSemanticBundleFailedEventSchema,
  plainSemanticBundleResolvedEventSchema,
  plainSemanticFailedTerminalArtifactSchema,
  plainSemanticResolvedTerminalArtifactSchema,
  portraitShiftSummaryFailedEventSchema,
  portraitShiftSummaryResolvedEventSchema,
  portraitSummaryFailedTerminalArtifactSchema,
  portraitSummaryResolvedTerminalArtifactSchema,
  roundAnalysisBundleFailedEventSchema,
  roundAnalysisBundleResolvedEventSchema,
  roundAnalysisFailedTerminalArtifactSchema,
  roundAnalysisResolvedTerminalArtifactSchema,
  stage3TerminalArtifactSchema,
} from "./orchestration.schemas";

export type ApplicationOrchestrationPreflightReason = z.infer<
  typeof applicationOrchestrationPreflightReasonSchema
>;
export type RoundAnalysisBundleResolvedEvent = z.infer<
  typeof roundAnalysisBundleResolvedEventSchema
>;
export type RoundAnalysisBundleFailedEvent = z.infer<
  typeof roundAnalysisBundleFailedEventSchema
>;
export type PlainSemanticBundleResolvedEvent = z.infer<
  typeof plainSemanticBundleResolvedEventSchema
>;
export type PlainSemanticBundleFailedEvent = z.infer<
  typeof plainSemanticBundleFailedEventSchema
>;
export type PortraitShiftSummaryResolvedEvent = z.infer<
  typeof portraitShiftSummaryResolvedEventSchema
>;
export type PortraitShiftSummaryFailedEvent = z.infer<
  typeof portraitShiftSummaryFailedEventSchema
>;
export type CharlieSignatureReviewResolvedEvent = z.infer<
  typeof charlieSignatureReviewResolvedEventSchema
>;
export type CharlieSignatureReviewFailedEvent = z.infer<
  typeof charlieSignatureReviewFailedEventSchema
>;
export type ApplicationOrchestrationEvent = z.infer<
  typeof applicationOrchestrationEventSchema
>;
export type Stage3TerminalArtifact = z.infer<
  typeof stage3TerminalArtifactSchema
>;

export interface ApplicationClock {
  now(): string;
}

export type ExecutionAvailability = Readonly<{
  live: boolean;
  mock: boolean;
}>;

export type AgentExecutionRoute = Readonly<{
  resolvedMode: Extract<ResolvedExecutionMode, "live" | "mock" | "unavailable">;
  fallbackReason: string | null;
}>;

export type ExplicitCandidateFallback =
  | Readonly<{
      kind: "candidate";
      candidate: unknown;
      binding: FallbackExecutionBinding;
      observation: AgentExecutionObservation;
      executionIdentity: FallbackExecutionIdentity;
      resolvedMode: Extract<ResolvedExecutionMode, "mock" | "static_template">;
      fallbackReason: string;
    }>
  | Readonly<{
      kind: "unavailable";
      fallbackReason: string;
    }>;

export type FallbackExecutionBinding = Readonly<{
  inputFingerprint: RuntimeSha256Digest;
  bindings: OperationBindings;
}>;

export type FallbackExecutionIdentity = Readonly<{
  adapterVersion: string | null;
  promptVersion: string | null;
}>;

export type ExplicitRoundCandidateFallback =
  | Readonly<{
      kind: "candidate";
      candidate: unknown;
      binding: FallbackExecutionBinding & Readonly<{ roundId: string }>;
      observation: AgentExecutionObservation;
      executionIdentity: FallbackExecutionIdentity;
      resolvedMode: Extract<ResolvedExecutionMode, "mock" | "static_template">;
      fallbackReason: string;
    }>
  | Extract<ExplicitCandidateFallback, { kind: "unavailable" }>;

export type OrchestrationBudgetPreflight = Readonly<{
  priorUsage: Stage3BudgetUsage;
  plannedCall: LogicalCallBudgetUsage;
}>;

export type OrchestrationOperationBoundary = Readonly<{
  activeOperation: ActiveOperation;
  currentStage: ActiveOperation["stage"];
  operationContext: RequestContext;
  budget: OrchestrationBudgetPreflight;
  availability: ExecutionAvailability;
  clock?: ApplicationClock;
}>;

export type ApplicationPreflightRejection = Readonly<{
  outcomeKind: "preflight_rejected";
  reason: ApplicationOrchestrationPreflightReason;
  detail: string;
}>;

export type RoundAnalysisOrchestrationOutcome =
  | z.infer<typeof roundAnalysisResolvedTerminalArtifactSchema>
  | z.infer<typeof roundAnalysisFailedTerminalArtifactSchema>
  | ApplicationPreflightRejection;

export type PlainSemanticOrchestrationOutcome =
  | z.infer<typeof plainSemanticResolvedTerminalArtifactSchema>
  | z.infer<typeof plainSemanticFailedTerminalArtifactSchema>
  | ApplicationPreflightRejection;

export type PortraitShiftSummaryOrchestrationOutcome =
  | z.infer<typeof portraitSummaryResolvedTerminalArtifactSchema>
  | z.infer<typeof portraitSummaryFailedTerminalArtifactSchema>
  | ApplicationPreflightRejection;

export type CharlieSignatureReviewOrchestrationOutcome =
  | z.infer<typeof finalReviewResolvedTerminalArtifactSchema>
  | z.infer<typeof finalReviewFailedTerminalArtifactSchema>
  | ApplicationPreflightRejection;

export type RoundAnalysisCapability =
  | "extractUserPrinciple"
  | "detectTension"
  | "generateCharlieResponse"
  | "proposeDocumentDiff";

export type RoundAnalysisFallbackPlan = Readonly<
  Record<RoundAnalysisCapability, ExplicitRoundCandidateFallback>
>;

export type CapabilityResolution<T> =
  | Readonly<{
      ok: true;
      value: T;
      resolvedMode: Exclude<ResolvedExecutionMode, "deterministic" | "unavailable">;
      fallbackReason: string | null;
      executionIdentity: FallbackExecutionIdentity;
      resolutionSource: "primary" | "fallback";
      observation?: AgentExecutionObservation;
    }>
  | Readonly<{
      ok: false;
      error: AgentCapabilityError;
      fallbackReason: string;
      executionIdentity: FallbackExecutionIdentity;
      resolutionSource: "fallback" | "unavailable";
      observation?: AgentExecutionObservation;
    }>;

export type RequestedExecutionMode = AgentMode;

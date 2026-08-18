export type Stage5PersistenceStatus =
  | "idle"
  | "saving"
  | "saved"
  | "conflict"
  | "failed";

export type Stage5PortraitStage = "early" | "peak" | "futureFacing";

export type Stage5PortraitView = Readonly<{
  id: string;
  stage: Stage5PortraitStage;
  title: string;
  assetPath: string;
  altText: string;
  descriptorOptions: readonly Readonly<{ id: string; label: string }>[];
  selectedDescriptors: readonly string[];
}>;

export type Stage5RoundView = Readonly<{
  roundId: "round1" | "round2" | "round3";
  title: string;
  evidenceTitle: string;
  evidenceText: string;
  question: string;
  responseSubmitted: boolean;
  completed: boolean;
  privateResponse: string | null;
  privateClarification: string | null;
  charlieResponse: string | null;
  principle: string | null;
  dissent: string | null;
}>;

export type Stage5DiffView = Readonly<{
  id: string;
  operation: string;
  newText: string | null;
  reason: string;
}>;

export type Stage5FragmentView = Readonly<{
  id: string;
  phrase: string;
  reason: string;
  consequence: string;
  placement: "restored_to_plain_text" | "margin_note" | "bouquet" | null;
  proposal: null | Readonly<{
    proposalId: string;
    status: string;
    replacementText: string;
  }>;
}>;

export type Stage5EnvelopeView = Readonly<{
  finalEnvelopeId: string;
  generatedAt: string;
  preciseText: string;
  plainText: string;
  finalPortraitChoice: string;
  portraitShiftSummary: string;
  signatureStatus: string;
  letter: Stage5LetterView;
  finalDisposition: FinalDisposition;
  openDissents: readonly string[];
  originalDeclaration: string;
  attribution: string;
  contentBundleVersion: string;
  contentSchemaVersion: string;
  requestedAgentMode: string;
  receiptCount: number;
  integrityChecksum: string;
}>;

export type Stage5LetterView =
  | Readonly<{
      kind: "charlie_perspective";
      body: string;
      attribution: string;
      sourceMode: "mock" | "live";
      evidenceIds: readonly string[];
      voicePolicyVersion: string;
    }>
  | Readonly<{
      kind: "archive_note";
      body: string;
      attribution: string;
      sourceMode: "unavailable" | "legacy";
      evidenceIds: readonly string[];
      voicePolicyVersion: string | null;
    }>;

export type Stage5ExecutionStatus = Readonly<{
  capability: string;
  requestedMode: "mock" | "live";
  resolvedMode:
    | "mock"
    | "live"
    | "deterministic"
    | "static_template"
    | "unavailable";
  outcome: "succeeded" | "failed" | "skipped";
}>;

export type Stage5PresentationView = Readonly<{
  sessionId: string;
  stage: string;
  stageTitle: string;
  stateRevision: number;
  contentMode: "placeholder" | "verified";
  contentBundleVersion: string;
  contentSchemaVersion: string;
  originalDeclaration: string;
  originalAttribution: string;
  portraits: readonly Stage5PortraitView[];
  initialChoice: Stage5PortraitStage | null;
  initialReason: string | null;
  finalChoice: string | null;
  finalReason: string | null;
  portraitShiftSummary: string | null;
  currentRound: Stage5RoundView | null;
  rounds: readonly Stage5RoundView[];
  preciseText: string;
  preciseRevisionId: string;
  plainText: string | null;
  plainRevisionId: string | null;
  pendingDiff: Stage5DiffView | null;
  revisionCount: number;
  semanticStatus: string | null;
  semanticFragments: readonly Stage5FragmentView[];
  placementChecking: boolean;
  signatureStatus: string;
  signatureSummary: string | null;
  signatureRetryAvailable: boolean;
  finalDisposition: FinalDisposition | null;
  blockers: readonly string[];
  envelope: Stage5EnvelopeView | null;
  executionStatus: Stage5ExecutionStatus | null;
  busy: boolean;
}>;

export type Stage5RecoveryView =
  | Readonly<{ kind: "new"; message: string }>
  | Readonly<{
      kind: "restored";
      message: string;
      action: string;
      invalidatedOperationId: string | null;
    }>
  | Readonly<{
      kind: "rejected";
      message: string;
      code: string;
      details: readonly string[];
    }>;

export type Stage5Snapshot = Readonly<{
  status: "booting" | "ready" | "blocked";
  persistence: Stage5PersistenceStatus;
  announcement: string;
  error: string | null;
  recovery: Stage5RecoveryView | null;
  view: Stage5PresentationView | null;
}>;

export type Stage5Disposition =
  | "future_reference"
  | "present_record"
  | "unfinished";

export interface Stage5Commands {
  start(): Promise<void>;
  submitPortraitDescriptors(descriptorIds: readonly string[]): Promise<void>;
  submitInitialPortrait(input: {
    choice: Stage5PortraitStage;
    reason: string;
  }): Promise<void>;
  submitRound(input: {
    response: string;
    clarification?: string;
  }): Promise<void>;
  decideDiff(decision: "accept" | "reject"): Promise<void>;
  chooseFragmentPlacement(input: {
    fragmentId: string;
    placement: "restored_to_plain_text" | "margin_note" | "bouquet";
  }): Promise<void>;
  confirmRestoration(proposalId: string): Promise<void>;
  rejectRestoration(proposalId: string): Promise<void>;
  submitFinalPortrait(input: { choice: string; reason?: string }): Promise<void>;
  requestSignature(): Promise<void>;
  skipSignature(): Promise<void>;
  returnToManuscript(): Promise<void>;
  cancelManuscriptRevision(): Promise<void>;
  submitManuscriptRevision(input: {
    draftPreciseText: string;
    reason: string;
  }): Promise<void>;
  chooseDisposition(disposition: Stage5Disposition): Promise<void>;
  deleteCurrentSession(): Promise<void>;
  startNewSession(): Promise<void>;
  retryInitialization(): Promise<void>;
}
import type { FinalDisposition } from "../domain/contracts/signature";

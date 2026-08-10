import {
  signatureReviewSnapshotSchema,
  type SessionContentBinding,
} from "../domain";
import type { Stage4PersistenceSidecars, Stage4SessionState } from "../fsm";
import { stage4SessionStateSchema } from "../fsm";
import type { ContractVersionVector } from "../provenance";
import {
  recoverSessionState,
  refreshRuntimeState,
  type CompleteReadOnlyCompatibilityRegistry,
  type IdGenerator,
  type SessionMigrationRegistry,
} from "../runtime";

export type Stage4RecoveryAction =
  | "none"
  | "resume_deterministic_operation"
  | "show_interrupted_operation"
  | "retry_finalization";

export type Stage4RecoveryResult =
  | Readonly<{
      kind: "restored";
      access: "editable";
      state: Stage4SessionState;
      sidecars: Stage4PersistenceSidecars;
      action: Stage4RecoveryAction;
      invalidatedOperationId: string | null;
    }>
  | Readonly<{
      kind: "restored";
      access: "read_only";
      state: unknown;
      sidecars: Stage4PersistenceSidecars | null;
      action: "none";
      invalidatedOperationId: null;
    }>
  | Readonly<{
      kind: "rejected";
      code: string;
      details: readonly string[];
    }>;

export function recoverStage4Session(input: {
  persistedState: unknown;
  sidecars: Stage4PersistenceSidecars | null;
  integrityValid: boolean;
  expectedContentBinding: SessionContentBinding;
  expectedContractVersionVector: ContractVersionVector;
  now: string;
  idGenerator: IdGenerator;
  migrations?: SessionMigrationRegistry;
  completeReadOnlyCompatibility?: CompleteReadOnlyCompatibilityRegistry;
}): Stage4RecoveryResult {
  if (!input.integrityValid) {
    return {
      kind: "rejected",
      code: "integrity_checksum_mismatch",
      details: ["Snapshot integrity validation failed"],
    };
  }
  const recovered = recoverSessionState({
    persistedState: input.persistedState,
    currentSessionSchemaVersion: "0.1.0",
    currentSchema: stage4SessionStateSchema,
    validateCurrentContracts: (state) => {
      const mismatches = contentBindingMismatches(
        state.contentBinding,
        input.expectedContentBinding,
      );
      mismatches.push(
        ...contractVersionMismatches(
          state.provenance.contractVersionVector,
          input.expectedContractVersionVector,
        ),
      );
      return mismatches.length === 0
        ? { compatible: true as const }
        : { compatible: false as const, mismatches };
    },
    migrations: input.migrations,
    completeReadOnlyCompatibility: input.completeReadOnlyCompatibility,
  });
  if (recovered.kind === "rejected") {
    return {
      kind: "rejected",
      code: recovered.reason.code,
      details: recovered.reason.details,
    };
  }
  if (recovered.access === "read_only") {
    return {
      kind: "restored",
      access: "read_only",
      state: recovered.state,
      sidecars: input.sidecars,
      action: "none",
      invalidatedOperationId: null,
    };
  }
  if (input.sidecars === null) {
    return {
      kind: "rejected",
      code: "private_sidecars_missing",
      details: ["Editable Session recovery requires its local private sidecars"],
    };
  }
  if (Date.parse(recovered.state.expiresAt) <= Date.parse(input.now)) {
    return {
      kind: "rejected",
      code: "session_expired",
      details: ["The unfinished Session exceeded its 24-hour retention window"],
    };
  }

  const priorOperation = recovered.state.runtime.activeOperation;
  let refreshedStageInstanceId = input.idGenerator.next("stage_instance");
  if (refreshedStageInstanceId === recovered.state.stageInstanceId) {
    refreshedStageInstanceId = input.idGenerator.next("stage_instance");
  }
  const refreshed = refreshRuntimeState(
    recovered.state.runtime,
    refreshedStageInstanceId,
  );
  let state = {
    ...recovered.state,
    stageInstanceId: refreshed.state.stageInstanceId,
    runtime: refreshed.state,
  };
  let action: Stage4RecoveryAction = "none";

  if (state.stage === "FINALIZING") {
    state = {
      ...state,
      stage: "FINAL_DISPOSITION",
      lifecycleStatus: "in_progress",
      finalEnvelope: null,
    };
    action = "retry_finalization";
  } else if (state.currentCharlieSignatureStatus === "pending") {
    const attempt = state.signatureReviewAttemptState;
    if (attempt === null || state.manuscript.plainRevisionId === null) {
      return {
        kind: "rejected",
        code: "corrupt_pending_signature",
        details: ["Pending signature state has no persisted attempt binding"],
      };
    }
    state = {
      ...state,
      currentCharlieSignatureStatus: "unavailable",
      currentCharlieSignatureReview: signatureReviewSnapshotSchema.parse({
        snapshotKind: "unavailable",
        status: "unavailable",
        preciseRevisionId: state.manuscript.preciseRevisionId,
        plainRevisionId: state.manuscript.plainRevisionId,
        contentBundleId: state.contentBinding.contentBundleId,
        contentBundleVersion: state.contentBinding.contentBundleVersion,
        contentBundleChecksum: state.contentBinding.contentBundleChecksum,
        finalReviewSchemaVersion:
          state.provenance.contractVersionVector.finalReviewSchemaVersion,
        evidenceIds: [],
        inputFingerprint: attempt.inputFingerprint,
        requestId: attempt.lastRequestId,
        failureCode: "interrupted_by_refresh",
        summary: "The previous review request was interrupted by a refresh.",
        retryable: true,
        unavailableAt: input.now,
      }),
      signatureReviewAttemptState: {
        ...attempt,
        lastFailureCode: "interrupted_by_refresh",
      },
    };
    action = "show_interrupted_operation";
  } else if (priorOperation !== null) {
    action =
      state.configuration.requestedAgentMode === "mock" &&
      ["PLAIN_REWRITE", "SEMANTIC_REVIEW"].includes(state.stage)
        ? "resume_deterministic_operation"
        : "show_interrupted_operation";
  }

  state = stage4SessionStateSchema.parse({
    ...state,
    stateRevision: state.stateRevision + 1,
    updatedAt: input.now,
    expiresAt: new Date(Date.parse(input.now) + 24 * 60 * 60 * 1000).toISOString(),
  });
  return {
    kind: "restored",
    access: "editable",
    state,
    sidecars: input.sidecars,
    action,
    invalidatedOperationId: priorOperation?.operationId ?? null,
  };
}

function contractVersionMismatches(
  actual: ContractVersionVector,
  expected: ContractVersionVector,
): string[] {
  return Object.keys(expected)
    .filter(
      (field) =>
        actual[field as keyof ContractVersionVector] !==
        expected[field as keyof ContractVersionVector],
    )
    .map((field) => `provenance.contractVersionVector.${field}`);
}

function contentBindingMismatches(
  actual: SessionContentBinding,
  expected: SessionContentBinding,
): string[] {
  return (
    [
      "contentBundleId",
      "contentBundleVersion",
      "contentBundleChecksum",
      "contentSchemaVersion",
      "targetEnvironment",
    ] as const
  )
    .filter((field) => actual[field] !== expected[field])
    .map((field) => `contentBinding.${field}`);
}

import { describe, expect, it } from "vitest";

import { activeOperationSchema } from "@/runtime";
import { recoverStage4Session } from "@/persistence";
import { buildStage4FinalEnvelope, stage4SessionStateSchema } from "@/fsm";
import { createBundledContentLoader } from "@/content";
import { projectStage5View } from "@/stage5/projection";
import { makeFinalizableState } from "../fixtures/finalization";
import {
  STAGE4_DIGEST_A,
  STAGE4_LATER,
  makeNewStage4Session,
  makeStage4FinalEnvelopeContentSnapshot,
  makeStage4Ports,
  withStage4State,
} from "../fixtures/stage4";

describe("Stage 4 recovery", () => {
  it("invalidates an old ActiveOperation and rotates stageInstanceId", () => {
    const { state, sidecars } = makeNewStage4Session();
    const activeOperation = activeOperationSchema.parse({
      operationId: "operation-old",
      requestId: "request-old",
      capability: "executeRoundAnalysis",
      stage: "ROUND_1_PAST_SELF",
      stageInstanceId: state.stageInstanceId,
      inputFingerprint: STAGE4_DIGEST_A,
      bindings: bindings(state),
      attempt: 1,
      status: "running",
      startedAt: state.createdAt,
    });
    const persisted = withStage4State(state, {
      stage: "ROUND_1_PAST_SELF",
      runtime: { ...state.runtime, activeOperation },
    });
    const result = recoverStage4Session({
      persistedState: persisted,
      sidecars,
      integrityValid: true,
      expectedContentBinding: state.contentBinding,
      expectedContractVersionVector: state.provenance.contractVersionVector,
      now: STAGE4_LATER,
      idGenerator: makeStage4Ports().idGenerator,
    });

    expect(result.kind).toBe("restored");
    if (result.kind !== "restored" || result.access !== "editable") return;
    expect(result.state.runtime.activeOperation).toBeNull();
    expect(result.state.stageInstanceId).not.toBe(state.stageInstanceId);
    expect(result.invalidatedOperationId).toBe("operation-old");
    expect(result.action).toBe("show_interrupted_operation");
  });

  it("turns a refresh-interrupted pending signature into unavailable without resetting attempts", () => {
    const { state, sidecars } = makeNewStage4Session();
    const plainState = withStage4State(state, {
      stage: "FINAL_SIGNATURE",
      manuscript: {
        ...state.manuscript,
        plainText: "Past and future matter.",
        plainRevisionId: "plain-r1",
      },
      currentCharlieSignatureStatus: "pending",
      signatureReviewAttemptState: {
        requestedMode: "live",
        inputFingerprint: STAGE4_DIGEST_A,
        attemptCount: 1,
        maxAttempts: 2,
        lastRequestId: "request-signature-1",
        lastFailureCode: null,
      },
    });
    const result = recoverStage4Session({
      persistedState: plainState,
      sidecars,
      integrityValid: true,
      expectedContentBinding: state.contentBinding,
      expectedContractVersionVector: state.provenance.contractVersionVector,
      now: STAGE4_LATER,
      idGenerator: makeStage4Ports().idGenerator,
    });

    expect(result.kind).toBe("restored");
    if (result.kind !== "restored" || result.access !== "editable") return;
    expect(result.state.currentCharlieSignatureStatus).toBe("unavailable");
    expect(result.state.currentCharlieSignatureReview).toMatchObject({
      snapshotKind: "unavailable",
      failureCode: "interrupted_by_refresh",
    });
    expect(result.state.signatureReviewAttemptState?.attemptCount).toBe(1);
  });

  it("rolls an uncommitted FINALIZING state back to a safe retry point", () => {
    const { state, sidecars } = makeNewStage4Session();
    const finalizing = withStage4State(state, {
      stage: "FINALIZING",
      lifecycleStatus: "finalizing",
    });
    const result = recoverStage4Session({
      persistedState: finalizing,
      sidecars,
      integrityValid: true,
      expectedContentBinding: state.contentBinding,
      expectedContractVersionVector: state.provenance.contractVersionVector,
      now: STAGE4_LATER,
      idGenerator: makeStage4Ports().idGenerator,
    });
    expect(result.kind).toBe("restored");
    if (result.kind !== "restored" || result.access !== "editable") return;
    expect(result.state.stage).toBe("FINAL_DISPOSITION");
    expect(result.state.lifecycleStatus).toBe("in_progress");
    expect(result.state.finalEnvelope).toBeNull();
    expect(result.action).toBe("retry_finalization");
  });

  it("rejects corrupt, expired, incompatible and future snapshots explicitly", () => {
    const { state, sidecars } = makeNewStage4Session();
    const common = {
      persistedState: state,
      sidecars,
      expectedContentBinding: state.contentBinding,
      expectedContractVersionVector: state.provenance.contractVersionVector,
      now: STAGE4_LATER,
      idGenerator: makeStage4Ports().idGenerator,
    };
    expect(
      recoverStage4Session({ ...common, integrityValid: false }),
    ).toMatchObject({ kind: "rejected", code: "integrity_checksum_mismatch" });
    expect(
      recoverStage4Session({
        ...common,
        integrityValid: true,
        now: "2026-08-10T12:00:00.000Z",
      }),
    ).toMatchObject({ kind: "rejected", code: "session_expired" });
    expect(
      recoverStage4Session({
        ...common,
        integrityValid: true,
        expectedContentBinding: {
          ...state.contentBinding,
          contentBundleVersion: "different",
        },
      }),
    ).toMatchObject({ kind: "rejected", code: "contract_mismatch" });
    expect(
      recoverStage4Session({
        ...common,
        integrityValid: true,
        persistedState: { ...state, sessionSchemaVersion: "1.0.0" },
      }),
    ).toMatchObject({ kind: "rejected", code: "unknown_future_version" });
  });

  it("restores a current COMPLETE snapshot as read-only", async () => {
    const base = stage4SessionStateSchema.parse({
      ...makeFinalizableState(),
      stage: "FINALIZING",
      lifecycleStatus: "finalizing",
      finalEnvelope: null,
    });
    const envelope = await buildStage4FinalEnvelope({
      state: base,
      contentSnapshot: makeStage4FinalEnvelopeContentSnapshot(base),
      ...makeStage4Ports(STAGE4_LATER),
    });
    const complete = stage4SessionStateSchema.parse({
      ...base,
      stage: "COMPLETE",
      lifecycleStatus: "complete",
      completedAt: STAGE4_LATER,
      finalEnvelope: envelope,
    });
    const result = recoverStage4Session({
      persistedState: complete,
      sidecars: makeNewStage4Session().sidecars,
      integrityValid: true,
      expectedContentBinding: complete.contentBinding,
      expectedContractVersionVector:
        complete.provenance.contractVersionVector,
      now: STAGE4_LATER,
      idGenerator: makeStage4Ports().idGenerator,
    });
    expect(result).toMatchObject({
      kind: "restored",
      access: "read_only",
      action: "none",
    });
  });

  it("restores a 0.2.0 COMPLETE snapshot read-only without fabricating a letter", async () => {
    const base = stage4SessionStateSchema.parse({
      ...makeFinalizableState(),
      stage: "FINALIZING",
      lifecycleStatus: "finalizing",
      finalEnvelope: null,
    });
    const envelope = await buildStage4FinalEnvelope({
      state: base,
      contentSnapshot: makeStage4FinalEnvelopeContentSnapshot(base),
      ...makeStage4Ports(STAGE4_LATER),
    });
    const { letter: _letter, ...legacyEnvelopePayload } = envelope;
    expect(_letter).toBeDefined();
    const currentVector = base.provenance.contractVersionVector;
    const legacyVector = {
      ...currentVector,
      finalEnvelopeSchemaVersion: "0.2.0",
    };
    const legacyComplete = stage4SessionStateSchema.parse({
      ...base,
      stage: "COMPLETE",
      lifecycleStatus: "complete",
      completedAt: STAGE4_LATER,
      provenance: {
        ...base.provenance,
        contractVersionVector: legacyVector,
      },
      finalEnvelope: {
        ...legacyEnvelopePayload,
        finalEnvelopeSchemaVersion: "0.2.0",
        executionProvenance: {
          ...legacyEnvelopePayload.executionProvenance,
          contractVersionVector: legacyVector,
        },
      },
    });
    const sidecars = makeNewStage4Session().sidecars;
    const result = recoverStage4Session({
      persistedState: legacyComplete,
      sidecars,
      integrityValid: true,
      expectedContentBinding: legacyComplete.contentBinding,
      expectedContractVersionVector: currentVector,
      now: STAGE4_LATER,
      idGenerator: makeStage4Ports().idGenerator,
    });

    expect(result).toMatchObject({
      kind: "restored",
      access: "read_only",
      action: "none",
      state: {
        finalEnvelope: { finalEnvelopeSchemaVersion: "0.2.0" },
      },
    });

    const { access } = await createBundledContentLoader().load("placeholder");
    const view = projectStage5View({
      state: legacyComplete,
      sidecars,
      content: access,
    });
    expect(view.envelope?.letter).toMatchObject({
      kind: "archive_note",
      sourceMode: "legacy",
      attribution: "旧版只读封套",
    });
    expect(view.envelope?.letter.body).toContain("来信功能上线前");
  });
});

function bindings(state: ReturnType<typeof makeNewStage4Session>["state"]) {
  return {
    revisions: {
      preciseRevisionId: state.manuscript.preciseRevisionId,
      plainRevisionId: state.manuscript.plainRevisionId,
    },
    content: {
      contentBundleId: state.contentBinding.contentBundleId,
      contentBundleVersion: state.contentBinding.contentBundleVersion,
      contentBundleChecksum: state.contentBinding.contentBundleChecksum,
    },
  };
}

import { describe, expect, it } from "vitest";

import {
  createSemanticPlacementBatch,
} from "@/domain";
import {
  beginPostPlacementConsistencyOperation,
  reduceStage4Event,
  stage4SessionStateSchema,
  type Stage4PersistenceSidecars,
  type Stage4SessionState,
} from "@/fsm";
import { deriveStage3EntityId } from "@/application";
import { activeOperationSchema, type ActiveOperation } from "@/runtime";
import {
  makeManuscript,
  makeProposedInsertDiff,
  makeRestorationProposal,
  makeSemanticDrift,
  makeSemanticFragment,
} from "../fixtures/domain";
import { makeFinalizableState } from "../fixtures/finalization";
import {
  STAGE4_DIGEST_A,
  STAGE4_DIGEST_B,
  STAGE4_LATER,
  makeNewStage4Session,
  makeStage4Ports,
} from "../fixtures/stage4";

describe("Stage 4 transition cases", () => {
  it("accepts a current Diff, rejects a stale Diff, and records rejection as open dissent", async () => {
    const text = "Past and future both matter.";
    const diff = await makeProposedInsertDiff({
      text,
      revisionId: "precise-r1",
      offsetCodePoint: Array.from(text).length,
    });
    const acceptedBase = diffState(text, diff);
    const accepted = await reduceStage4Event({
      ...acceptedBase,
      event: {
        eventType: "ACCEPT_DIFF",
        diffId: diff.id,
        transitionId: "accept-transition",
        nextRevisionId: "precise-r2",
      },
      ports: makeStage4Ports(STAGE4_LATER),
    });
    expect(accepted.state.manuscript.preciseRevisionId).toBe("precise-r2");
    expect(accepted.state.manuscript.preciseText).toContain("carefully");
    expect(accepted.state.stage).toBe("ROUND_2_FORECAST");

    const staleBase = diffState("Text changed without moving the revision.", diff);
    await expect(
      reduceStage4Event({
        ...staleBase,
        event: {
          eventType: "ACCEPT_DIFF",
          diffId: diff.id,
          transitionId: "stale-transition",
          nextRevisionId: "precise-r2",
        },
        ports: makeStage4Ports(STAGE4_LATER),
      }),
    ).rejects.toMatchObject({ code: "stale_anchor" });

    const rejected = await reduceStage4Event({
      ...acceptedBase,
      event: {
        eventType: "REJECT_DIFF",
        diffId: diff.id,
        transitionId: "dissent-from-reject",
      },
      ports: makeStage4Ports(STAGE4_LATER),
    });
    expect(rejected.state.manuscript.preciseText).toBe(text);
    expect(rejected.state.openDissents).toMatchObject([
      { id: "dissent-from-reject", status: "open", roundId: "round1" },
    ]);
  });

  it("directly confirms margin-note and bouquet placements", async () => {
    const margin = placementState("fragment-margin");
    const marginResult = await reduceStage4Event({
      ...margin,
      event: {
        eventType: "CHOOSE_FRAGMENT_PLACEMENT",
        fragmentId: "fragment-margin",
        placement: "saved_as_margin_note",
      },
      ports: makeStage4Ports(STAGE4_LATER),
    });
    expect(marginResult.state.semanticFragments[0]?.placement).toBe(
      "saved_as_margin_note",
    );
    expect(marginResult.state.semanticPlacementBatch?.decisions[0]?.status).toBe(
      "confirmed",
    );

    const bouquet = placementState("fragment-bouquet");
    const bouquetResult = await reduceStage4Event({
      ...bouquet,
      event: {
        eventType: "CHOOSE_FRAGMENT_PLACEMENT",
        fragmentId: "fragment-bouquet",
        placement: "placed_in_bouquet",
        bouquetEntryId: "bouquet-entry-1",
      },
      ports: makeStage4Ports(STAGE4_LATER),
    });
    expect(bouquetResult.state.semanticFragments[0]?.placement).toBe(
      "placed_in_bouquet",
    );
    expect(bouquetResult.state.bouquet).toHaveLength(1);
  });

  it("requires a concrete current proposal and explains unavailable/stale restoration", async () => {
    const unavailable = placementState("fragment-unavailable", {
      kind: "unavailable",
      fragmentId: "fragment-unavailable",
      reason: "insufficient_context",
    });
    const unavailableResult = await reduceStage4Event({
      ...unavailable,
      event: {
        eventType: "CHOOSE_FRAGMENT_PLACEMENT",
        fragmentId: "fragment-unavailable",
        placement: "restored_to_plain_text",
      },
      ports: makeStage4Ports(STAGE4_LATER),
    });
    expect(unavailableResult.notice).toContain("restoration_unavailable");
    expect(unavailableResult.state.semanticFragments[0]?.placement).toBeNull();

    const fragment = makeSemanticFragment({ id: "fragment-stale" });
    const proposal = await makeRestorationProposal({
      fragment,
      targetPlainRevisionId: "plain-r1",
      currentPlainText: "Past and future matter.",
      offsetCodePoint: 0,
      replacementText: "Restored qualification. ",
    });
    const stale = placementState("fragment-stale", {
      kind: "proposal",
      fragmentId: "fragment-stale",
      proposal: { ...proposal, proposalHash: STAGE4_DIGEST_B },
    });
    const staleResult = await reduceStage4Event({
      ...stale,
      event: {
        eventType: "CHOOSE_FRAGMENT_PLACEMENT",
        fragmentId: "fragment-stale",
        placement: "restored_to_plain_text",
      },
      ports: makeStage4Ports(STAGE4_LATER),
    });
    expect(staleResult.notice).toBe("proposal_hash_mismatch");
    expect(staleResult.state.semanticRestorationProposals[0]?.status).toBe(
      "stale",
    );
  });

  it("blocks placement while checking consistency and safely recovers a failed check", async () => {
    const setup = placementState("fragment-check");
    const placed = await reduceStage4Event({
      ...setup,
      event: {
        eventType: "CHOOSE_FRAGMENT_PLACEMENT",
        fragmentId: "fragment-check",
        placement: "saved_as_margin_note",
      },
      ports: makeStage4Ports(STAGE4_LATER),
    });
    const operation = operationFor(
      placed.state,
      "checkPostPlacementConsistency",
    );
    const checking = beginPostPlacementConsistencyOperation({
      state: placed.state,
      operation,
    });
    await expect(
      reduceStage4Event({
        state: checking,
        sidecars: placed.sidecars,
        event: {
          eventType: "CHOOSE_FRAGMENT_PLACEMENT",
          fragmentId: "fragment-check",
          placement: "saved_as_margin_note",
        },
        ports: makeStage4Ports(STAGE4_LATER),
      }),
    ).rejects.toMatchObject({ code: "placement_batch_not_in_progress" });
    const failed = await reduceStage4Event({
      state: checking,
      sidecars: placed.sidecars,
      event: {
        ...resultHeader(operation),
        eventType: "POST_PLACEMENT_CHECK_FAILED",
        capability: "checkPostPlacementConsistency",
        outcome: "failed",
        error: { code: "check_failed", summary: "Try again", retryable: true },
      },
      ports: makeStage4Ports(STAGE4_LATER),
    });
    expect(failed.state.semanticPlacementBatch?.status).toBe("in_progress");
    expect(failed.state.runtime.activeOperation).toBeNull();
  });

  it("handles manuscript return, cancel, no-op submit and actual invalidation", async () => {
    const base = stage4SessionStateSchema.parse({
      ...makeFinalizableState(),
      stage: "FINAL_SIGNATURE",
      stageInstanceId: "signature-stage",
      runtime: { stageInstanceId: "signature-stage", activeOperation: null },
      finalEnvelope: null,
    });
    const sidecars = emptySidecars(base.sessionId);
    const returned = await reduceStage4Event({
      state: base,
      sidecars,
      event: { eventType: "RETURN_TO_MANUSCRIPT_REVIEW" },
      ports: makeStage4Ports(STAGE4_LATER),
    });
    expect(returned.state.stage).toBe("MANUSCRIPT_REVISION");
    expect(returned.state.currentCharlieSignatureStatus).toBe("hidden");

    const cancelled = await reduceStage4Event({
      state: returned.state,
      sidecars,
      event: { eventType: "CANCEL_MANUSCRIPT_REVISION" },
      ports: makeStage4Ports(STAGE4_LATER),
    });
    expect(cancelled.state.stage).toBe("FINAL_SIGNATURE");
    expect(cancelled.state.manuscript.revisionHistory).toHaveLength(
      base.manuscript.revisionHistory.length,
    );
    expect(cancelled.state.currentCharlieSignatureStatus).toBe("not_requested");

    const noOp = await reduceStage4Event({
      state: returned.state,
      sidecars,
      event: {
        eventType: "SUBMIT_MANUSCRIPT_REVISION",
        draftPreciseText: base.manuscript.preciseText,
        nextRevisionId: "unused-revision",
        reason: "No actual change",
      },
      ports: makeStage4Ports(STAGE4_LATER),
    });
    expect(noOp.state.stage).toBe("FINAL_SIGNATURE");
    expect(noOp.state.manuscript.revisionHistory).toHaveLength(
      base.manuscript.revisionHistory.length,
    );

    const actual = await reduceStage4Event({
      state: returned.state,
      sidecars,
      event: {
        eventType: "SUBMIT_MANUSCRIPT_REVISION",
        draftPreciseText: `${base.manuscript.preciseText} New conclusion.`,
        nextRevisionId: "precise-r2",
        reason: "Add a conclusion",
      },
      ports: makeStage4Ports(STAGE4_LATER),
    });
    expect(actual.state.stage).toBe("PLAIN_REWRITE");
    expect(actual.state.manuscript.preciseRevisionId).toBe("precise-r2");
    expect(actual.state.manuscript.plainText).toBeNull();
    expect(actual.state.semanticPlacementBatch?.status ?? "cleared").toBe(
      "cleared",
    );
    expect(actual.state.currentCharlieSignatureStatus).toBe("hidden");
  });

  it("keeps technical signature failure distinct from declined and permits continuation", async () => {
    const base = stage4SessionStateSchema.parse({
      ...makeFinalizableState(),
      stage: "FINAL_SIGNATURE",
      stageInstanceId: "signature-stage",
      runtime: { stageInstanceId: "signature-stage", activeOperation: null },
      currentCharlieSignatureStatus: "hidden",
      currentCharlieSignatureReview: null,
      signatureReviewAttemptState: null,
      finalEnvelope: null,
    });
    const sidecars = emptySidecars(base.sessionId);
    const operation = operationFor(base, "executeCharlieSignatureReview");
    const requested = await reduceStage4Event({
      state: base,
      sidecars,
      event: {
        eventType: "REQUEST_CHARLIE_SIGNATURE_REVIEW",
        fingerprintMaterial: {
          capability: "reviewCharlieSignature",
          requestedMode: "live",
          bindings: {
            revisions: {
              preciseRevisionId: base.manuscript.preciseRevisionId,
              plainRevisionId: base.manuscript.plainRevisionId!,
            },
            content: operation.bindings.content as {
              contentBundleId: string;
              contentBundleVersion: string;
              contentBundleChecksum: `sha256:${string}`;
            },
          },
          finalReviewSchemaVersion: "0.1.0",
          semanticInputDigest: STAGE4_DIGEST_A,
        },
        operation,
      },
      ports: makeStage4Ports(STAGE4_LATER),
    });
    expect(requested.state.currentCharlieSignatureStatus).toBe("pending");
    const failed = await reduceStage4Event({
      state: requested.state,
      sidecars,
      event: {
        ...resultHeader(operation),
        applicationOrchestrationContractVersion: "0.2.0",
        eventId: deriveStage3EntityId({
          operationId: operation.operationId,
          entityKind: "application_event",
          ordinal: 0,
        }),
        eventType: "CHARLIE_SIGNATURE_REVIEW_FAILED",
        capability: "executeCharlieSignatureReview",
        outcome: "failed",
        error: { code: "network_error", message: "Network failed", retryable: true },
        receipts: [signatureReceipt(operation, "failed")],
      },
      ports: makeStage4Ports(STAGE4_LATER),
    });
    expect(failed.state.currentCharlieSignatureStatus).toBe("unavailable");
    expect(failed.state.currentCharlieSignatureStatus).not.toBe("declined");
    expect(failed.state.signatureReviewAttemptState?.attemptCount).toBe(1);
    const continued = await reduceStage4Event({
      state: failed.state,
      sidecars,
      event: { eventType: "CONTINUE_WITHOUT_SIGNATURE_REVIEW" },
      ports: makeStage4Ports(STAGE4_LATER),
    });
    expect(continued.state.stage).toBe("FINAL_DISPOSITION");
    expect(continued.state.currentCharlieSignatureStatus).toBe("unavailable");
  });
});

function diffState(preciseText: string, pendingDiff: Awaited<ReturnType<typeof makeProposedInsertDiff>>) {
  const { state, sidecars } = makeNewStage4Session();
  return {
    state: stage4SessionStateSchema.parse({
      ...state,
      stage: "ROUND_1_DIFF",
      manuscript: makeManuscript({
        preciseText,
        preciseRevisionId: "precise-r1",
        plainText: null,
        plainRevisionId: null,
        pendingDiff,
      }),
      rounds: {
        ...state.rounds,
        round1: { responseSubmitted: true, clarificationCount: 0, completed: false },
      },
      userPrinciples: [
        { id: "principle-1", roundId: "round1", claim: "Context matters", qualifiers: [], exceptions: [], evidenceIds: [] },
      ],
      charliePositions: [
        { id: "position-1", roundId: "round1", claim: "A qualification remains", evidenceIds: [] },
      ],
    }),
    sidecars,
  };
}

function placementState(
  fragmentId: string,
  restorationOutcome?: Stage4PersistenceSidecars["restorationOutcomes"][number],
): { state: Stage4SessionState; sidecars: Stage4PersistenceSidecars } {
  const { state, sidecars } = makeNewStage4Session();
  const fragment = makeSemanticFragment({ id: fragmentId });
  const drift = makeSemanticDrift({ fragmentIds: [fragmentId] });
  const started = createSemanticPlacementBatch({
    batchId: `batch-${fragmentId}`,
    drift,
    fragments: [fragment],
    createdAt: STAGE4_LATER,
  });
  return {
    state: stage4SessionStateSchema.parse({
      ...state,
      stage: "SEMANTIC_PLACEMENT",
      manuscript: makeManuscript(),
      semanticDrift: started.drift,
      semanticPlacementBatch: started.batch,
      semanticFragments: [fragment],
    }),
    sidecars: {
      ...sidecars,
      restorationOutcomes:
        restorationOutcome === undefined ? [] : [restorationOutcome],
    },
  };
}

function operationFor(state: Stage4SessionState, capability: string): ActiveOperation {
  return activeOperationSchema.parse({
    operationId: `operation-${capability}`,
    requestId: `request-${capability}`,
    capability,
    stage: state.stage,
    stageInstanceId: state.stageInstanceId,
    inputFingerprint: STAGE4_DIGEST_A,
    bindings: {
      revisions: {
        preciseRevisionId: state.manuscript.preciseRevisionId,
        plainRevisionId: state.manuscript.plainRevisionId,
      },
      content: {
        contentBundleId: state.contentBinding.contentBundleId,
        contentBundleVersion: state.contentBinding.contentBundleVersion,
        contentBundleChecksum: state.contentBinding.contentBundleChecksum,
      },
    },
    attempt: 1,
    status: "running",
    startedAt: state.updatedAt,
  });
}

function resultHeader(operation: ActiveOperation) {
  return {
    operationId: operation.operationId,
    requestId: operation.requestId,
    stage: operation.stage,
    stageInstanceId: operation.stageInstanceId,
    inputFingerprint: operation.inputFingerprint,
    bindings: operation.bindings,
    completedAt: STAGE4_LATER,
  };
}

function signatureReceipt(operation: ActiveOperation, outcome: "failed") {
  return {
    capability: "reviewCharlieSignature" as const,
    operationId: operation.operationId,
    requestId: operation.requestId,
    requestedMode: "live" as const,
    resolvedMode: "unavailable" as const,
    outcome,
    fallbackReason: "network_error",
    promptVersion: null,
    adapterVersion: null,
    resultSchemaVersion: "0.1.0",
    inputFingerprintDigest: operation.inputFingerprint,
    startedAt: operation.startedAt,
    completedAt: STAGE4_LATER,
  };
}

function emptySidecars(sessionId: string): Stage4PersistenceSidecars {
  return {
    budgetUsage: { budgetVersion: "0.1.0", logicalCalls: [] },
    privateInputs: { sessionId, rounds: [] },
    pendingInitialChoice: null,
    restorationOutcomes: [],
    runtimeFailures: [],
  };
}

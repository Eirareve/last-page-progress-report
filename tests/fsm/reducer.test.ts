import { describe, expect, it } from "vitest";

import {
  buildStage4FinalEnvelope,
  reduceStage4Event,
  stage4SessionStateSchema,
  Stage4TransitionError,
  verifyStage4FinalEnvelopeIntegrity,
  type Stage4PersistenceSidecars,
  type Stage4SessionState,
} from "@/fsm";
import { activeOperationSchema, type ActiveOperation } from "@/runtime";
import {
  makeFinalizableState,
  makeFinalizationContext,
} from "../fixtures/finalization";
import {
  STAGE4_DIGEST_A,
  STAGE4_LATER,
  makeNewStage4Session,
  makeStage4Ports,
} from "../fixtures/stage4";

describe("Stage 4 reducer", () => {
  it("requires an initial portrait choice and reason before round 1", async () => {
    let { state, sidecars } = makeNewStage4Session();
    const ports = makeStage4Ports(...Array(8).fill(STAGE4_LATER));
    ({ state, sidecars } = await applied(state, sidecars, { eventType: "START" }, ports));
    ({ state, sidecars } = await applied(
      state,
      sidecars,
      { eventType: "SET_PORTRAIT_DESCRIPTORS", descriptors: state.portraitDescriptors },
      ports,
    ));
    await expect(
      reduceStage4Event({
        state,
        sidecars,
        event: { eventType: "SUBMIT_INITIAL_REASON", reason: "Because." },
        ports,
      }),
    ).rejects.toMatchObject({ code: "initial_portrait_choice_missing" });

    ({ state, sidecars } = await applied(
      state,
      sidecars,
      { eventType: "CHOOSE_INITIAL_PORTRAIT", choice: "peak" },
      ports,
    ));
    expect(sidecars.pendingInitialChoice).toBe("peak");
    ({ state, sidecars } = await applied(
      state,
      sidecars,
      { eventType: "SUBMIT_INITIAL_REASON", reason: "It fits now." },
      ports,
    ));
    expect(state.stage).toBe("ROUND_1_PAST_SELF");
    expect(state.portraits.initialRecord?.initialChoice).toBe("peak");
    expect(sidecars.pendingInitialChoice).toBeNull();
  });

  it("enforces round order, one response, one clarification and explicit skip", async () => {
    let { state, sidecars } = await reachRoundOne();
    const ports = makeStage4Ports(...Array(8).fill(STAGE4_LATER));
    await expect(
      reduceStage4Event({
        state,
        sidecars,
        event: { eventType: "SUBMIT_RESPONSE", roundId: "round2", response: "early" },
        ports,
      }),
    ).rejects.toBeInstanceOf(Stage4TransitionError);
    ({ state, sidecars } = await applied(
      state,
      sidecars,
      { eventType: "SUBMIT_RESPONSE", roundId: "round1", response: "answer" },
      ports,
    ));
    await expect(
      reduceStage4Event({
        state,
        sidecars,
        event: { eventType: "SUBMIT_RESPONSE", roundId: "round1", response: "again" },
        ports,
      }),
    ).rejects.toMatchObject({ code: "round_response_already_submitted" });

    const operation = operationFor(state, "executeRoundAnalysis");
    ({ state, sidecars } = await applied(
      state,
      sidecars,
      {
        eventType: "SUBMIT_CLARIFICATION",
        roundId: "round1",
        clarification: "one detail",
        operation,
      },
      ports,
    ));
    expect(state.rounds.round1.clarificationCount).toBe(1);
    const cleared = stage4SessionStateSchema.parse({
      ...state,
      runtime: { ...state.runtime, activeOperation: null },
    });
    await expect(
      reduceStage4Event({
        state: cleared,
        sidecars,
        event: {
          eventType: "SUBMIT_CLARIFICATION",
          roundId: "round1",
          clarification: "second detail",
          operation: operationFor(cleared, "executeRoundAnalysis"),
        },
        ports,
      }),
    ).rejects.toMatchObject({ code: "clarification_limit_reached" });

    const fresh = await reachRoundOne();
    const response = await applied(
      fresh.state,
      fresh.sidecars,
      { eventType: "SUBMIT_RESPONSE", roundId: "round1", response: "answer" },
      ports,
    );
    const skipped = await applied(
      response.state,
      response.sidecars,
      {
        eventType: "CONTINUE_WITHOUT_CLARIFICATION",
        roundId: "round1",
        operation: operationFor(response.state, "executeRoundAnalysis"),
      },
      ports,
    );
    expect(skipped.state.runtime.activeOperation?.capability).toBe(
      "executeRoundAnalysis",
    );
  });

  it("drops a stale result without changing business state", async () => {
    const { state, sidecars } = makeNewStage4Session();
    const finalizing = stage4SessionStateSchema.parse({
      ...state,
      stage: "FINALIZING",
      lifecycleStatus: "finalizing",
      runtime: {
        ...state.runtime,
        activeOperation: operationFor(
          { ...state, stage: "FINALIZING" } as Stage4SessionState,
          "persistFinalEnvelope",
        ),
      },
    });
    const active = finalizing.runtime.activeOperation!;
    const result = await reduceStage4Event({
      state: finalizing,
      sidecars,
      event: {
        ...resultHeader(active),
        eventType: "FINAL_ENVELOPE_PERSIST_FAILED",
        operationId: "late-operation",
        capability: "persistFinalEnvelope",
        outcome: "failed",
        error: { code: "storage", summary: "late", retryable: true },
      },
      ports: makeStage4Ports(STAGE4_LATER),
    });
    expect(result.disposition).toBe("ignored_stale_result");
    expect(result.state).toEqual(finalizing);
  });

  it("calls finalization from CHOOSE_DISPOSITION only with no active operation", async () => {
    const finalizable = stage4SessionStateSchema.parse({
      ...makeFinalizableState(),
      finalEnvelope: null,
    });
    const ports = makeStage4Ports(STAGE4_LATER);
    const finalizationOperation = operationFor(
      {
        ...finalizable,
        stage: "FINALIZING",
        stageInstanceId: "stage_instance-1",
        runtime: { stageInstanceId: "stage_instance-1", activeOperation: null },
      } as Stage4SessionState,
      "persistFinalEnvelope",
    );
    const sidecars = makeSidecars(finalizable.sessionId);
    const existingOperation = operationFor(finalizable, "unrelatedCapability");
    const busy = stage4SessionStateSchema.parse({
      ...finalizable,
      runtime: { ...finalizable.runtime, activeOperation: existingOperation },
    });
    await expect(
      reduceStage4Event({
        state: busy,
        sidecars,
        event: {
          eventType: "CHOOSE_DISPOSITION",
          disposition: "unfinished",
          finalizationContext: makeFinalizationContext(),
          operation: finalizationOperation,
        },
        ports,
      }),
    ).rejects.toMatchObject({ code: "active_operation_present" });

    const reduced = await reduceStage4Event({
      state: finalizable,
      sidecars,
      event: {
        eventType: "CHOOSE_DISPOSITION",
        disposition: "unfinished",
        finalizationContext: makeFinalizationContext(),
        operation: finalizationOperation,
      },
      ports,
    });
    expect(reduced.state.stage).toBe("FINALIZING");
    expect(reduced.state.lifecycleStatus).toBe("finalizing");
  });

  it("builds an integrity-bound envelope and makes COMPLETE immutable", async () => {
    const finalizable = stage4SessionStateSchema.parse({
      ...makeFinalizableState(),
      finalEnvelope: null,
    });
    const ports = makeStage4Ports(STAGE4_LATER, STAGE4_LATER);
    const operation = operationFor(
      {
        ...finalizable,
        stage: "FINALIZING",
        stageInstanceId: "stage_instance-1",
        runtime: { stageInstanceId: "stage_instance-1", activeOperation: null },
      } as Stage4SessionState,
      "persistFinalEnvelope",
    );
    const sidecars = makeSidecars(finalizable.sessionId);
    const finalizing = await reduceStage4Event({
      state: finalizable,
      sidecars,
      event: {
        eventType: "CHOOSE_DISPOSITION",
        disposition: "unfinished",
        finalizationContext: makeFinalizationContext(),
        operation,
      },
      ports,
    });
    const envelope = await buildStage4FinalEnvelope({
      state: finalizing.state,
      ...makeStage4Ports(STAGE4_LATER),
    });
    expect(await verifyStage4FinalEnvelopeIntegrity(envelope)).toBe(true);
    await expect(
      reduceStage4Event({
        state: finalizing.state,
        sidecars: finalizing.sidecars,
        event: {
          ...resultHeader(finalizing.state.runtime.activeOperation!),
          eventType: "FINAL_ENVELOPE_PERSISTED",
          capability: "persistFinalEnvelope",
          outcome: "succeeded",
          envelope: { ...envelope, finalDisposition: "present_record" },
        },
        ports,
      }),
    ).rejects.toMatchObject({ code: "final_envelope_integrity_mismatch" });
    const completed = await reduceStage4Event({
      state: finalizing.state,
      sidecars: finalizing.sidecars,
      event: {
        ...resultHeader(finalizing.state.runtime.activeOperation!),
        eventType: "FINAL_ENVELOPE_PERSISTED",
        capability: "persistFinalEnvelope",
        outcome: "succeeded",
        envelope,
      },
      ports,
    });
    expect(completed.state.stage).toBe("COMPLETE");
    expect(completed.state.lifecycleStatus).toBe("complete");
    await expect(
      reduceStage4Event({
        state: completed.state,
        sidecars: completed.sidecars,
        event: { eventType: "START" },
        ports,
      }),
    ).rejects.toMatchObject({ code: "complete_session_immutable" });
  });
});

async function reachRoundOne() {
  let { state, sidecars } = makeNewStage4Session();
  const ports = makeStage4Ports(...Array(6).fill(STAGE4_LATER));
  ({ state, sidecars } = await applied(state, sidecars, { eventType: "START" }, ports));
  ({ state, sidecars } = await applied(
    state,
    sidecars,
    { eventType: "SET_PORTRAIT_DESCRIPTORS", descriptors: state.portraitDescriptors },
    ports,
  ));
  ({ state, sidecars } = await applied(
    state,
    sidecars,
    { eventType: "CHOOSE_INITIAL_PORTRAIT", choice: "early" },
    ports,
  ));
  return applied(
    state,
    sidecars,
    { eventType: "SUBMIT_INITIAL_REASON", reason: "It is closest." },
    ports,
  );
}

async function applied(
  state: Stage4SessionState,
  sidecars: Stage4PersistenceSidecars,
  event: Parameters<typeof reduceStage4Event>[0]["event"],
  ports: Parameters<typeof reduceStage4Event>[0]["ports"],
) {
  const result = await reduceStage4Event({ state, sidecars, event, ports });
  expect(result.disposition).toBe("applied");
  return result;
}

function operationFor(
  state: Stage4SessionState,
  capability: string,
): ActiveOperation {
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

function makeSidecars(sessionId: string): Stage4PersistenceSidecars {
  return {
    budgetUsage: { budgetVersion: "0.1.0", logicalCalls: [] },
    privateInputs: { sessionId, rounds: [] },
    pendingInitialChoice: null,
    restorationOutcomes: [],
    runtimeFailures: [],
  };
}

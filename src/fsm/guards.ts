import { STAGE_DESCRIPTORS, type ExperienceStage } from "../domain";
import { guardOperationResult } from "../runtime";
import type { Stage4Event, Stage4SessionState } from "./contracts";

export class Stage4TransitionError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = "Stage4TransitionError";
  }
}
export function requireEventAllowed(
  state: Stage4SessionState,
  event: Stage4Event,
): void {
  if (state.stage === "COMPLETE" || state.lifecycleStatus === "complete") {
    throw new Stage4TransitionError(
      "complete_session_immutable",
      "A COMPLETE Session cannot accept another event",
    );
  }
  if (!STAGE_DESCRIPTORS[state.stage].allowedEvents.includes(event.eventType)) {
    throw new Stage4TransitionError(
      "event_not_allowed",
      `${event.eventType} is not allowed in ${state.stage}`,
    );
  }
}

export function operationResultAccepted(
  state: Stage4SessionState,
  event: Extract<Stage4Event, { operationId: string }>,
): boolean {
  return guardOperationResult({
    activeOperation: state.runtime.activeOperation,
    currentStage: state.stage,
    result: event,
  }).accepted;
}

export function rotateStage(
  state: Stage4SessionState,
  nextStage: ExperienceStage,
  nextStageInstanceId: string,
): Stage4SessionState {
  return {
    ...state,
    stage: nextStage,
    stageInstanceId: nextStageInstanceId,
    runtime: {
      stageInstanceId: nextStageInstanceId,
      activeOperation: null,
    },
  };
}

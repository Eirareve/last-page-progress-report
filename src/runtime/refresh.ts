import type { ActiveOperation, RuntimeState } from "./contracts";
import { runtimeIdentifierSchema, runtimeStateSchema } from "./schemas";

export type RefreshInvalidatedOperation = Pick<
  ActiveOperation,
  "operationId" | "requestId" | "capability" | "stageInstanceId"
>;

export type RuntimeRefreshResult = {
  state: RuntimeState;
  invalidatedOperation: RefreshInvalidatedOperation | null;
};

/**
 * Clears any pre-refresh operation and rotates the stage instance. The caller
 * obtains nextStageInstanceId from the injected IdGenerator before calling.
 */
export function refreshRuntimeState(
  currentState: RuntimeState,
  nextStageInstanceId: string,
): RuntimeRefreshResult {
  const nextId = runtimeIdentifierSchema.parse(nextStageInstanceId);
  if (nextId === currentState.stageInstanceId) {
    throw new Error("Refresh must rotate stageInstanceId");
  }

  const invalidatedOperation = currentState.activeOperation
    ? {
        operationId: currentState.activeOperation.operationId,
        requestId: currentState.activeOperation.requestId,
        capability: currentState.activeOperation.capability,
        stageInstanceId: currentState.activeOperation.stageInstanceId,
      }
    : null;

  return {
    state: runtimeStateSchema.parse({
      stageInstanceId: nextId,
      activeOperation: null,
    }),
    invalidatedOperation,
  };
}

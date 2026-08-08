import {
  reduceStage4Event,
  type Stage4Event,
  type Stage4PersistenceSidecars,
  type Stage4ReducerPorts,
  type Stage4SessionState,
} from "../fsm";
import type { RuntimeSha256Digest } from "../runtime";
import { stage3BudgetUsageSchema, type Stage3BudgetUsage } from "../application";
import { withStage4SessionLock, notifyStage4SessionChanged } from "./concurrency";
import {
  Stage4PersistenceConflictError,
  type Stage4AtomicCommitResult,
  type Stage4AtomicStore,
} from "./contracts";

export class Stage4SessionEngine {
  constructor(
    private readonly dependencies: Readonly<{
      store: Stage4AtomicStore;
      reducerPorts: Stage4ReducerPorts;
      ownerToken: string;
      locks?: Pick<LockManager, "request">;
      channel?: Pick<BroadcastChannel, "postMessage">;
    }>,
  ) {}

  async initialize(input: {
    state: Stage4SessionState;
    sidecars: Stage4PersistenceSidecars;
    transitionKey: string;
    inputFingerprint: RuntimeSha256Digest;
  }): Promise<Stage4AtomicCommitResult> {
    return withStage4SessionLock({
      sessionId: input.state.sessionId,
      locks: this.dependencies.locks,
      run: async () => {
        const result = await this.dependencies.store.commit({
          sessionId: input.state.sessionId,
          expectedRevision: null,
          expectedOwnerToken: null,
          ownerToken: this.dependencies.ownerToken,
          transitionKey: input.transitionKey,
          inputFingerprint: input.inputFingerprint,
          committedAt: this.dependencies.reducerPorts.clock.now(),
          state: input.state,
          sidecars: input.sidecars,
        });
        this.notify(result.snapshot.state);
        return result;
      },
    });
  }

  async dispatch(input: {
    sessionId: string;
    transitionKey: string;
    inputFingerprint: RuntimeSha256Digest;
    event: Stage4Event;
    budgetUsage?: Stage3BudgetUsage;
  }): Promise<
    | Stage4AtomicCommitResult
    | Readonly<{
        kind: "ignored_stale_result";
        state: Stage4SessionState;
        sidecars: Stage4PersistenceSidecars;
      }>
  > {
    return withStage4SessionLock({
      sessionId: input.sessionId,
      locks: this.dependencies.locks,
      run: async () => {
        const current = await this.dependencies.store.load(input.sessionId);
        if (current === null) throw new Error("Stage 4 Session was not found");
        const duplicate = current.idempotencyRecords.find(
          ({ transitionKey }) => transitionKey === input.transitionKey,
        );
        if (duplicate !== undefined) {
          if (duplicate.inputFingerprint !== input.inputFingerprint) {
            throw new Stage4PersistenceConflictError(
              "Transition key was already used with a different fingerprint",
            );
          }
          return { kind: "duplicate" as const, snapshot: current };
        }

        const reduction = await reduceStage4Event({
          state: current.state,
          sidecars: current.sidecars,
          event: input.event,
          ports: this.dependencies.reducerPorts,
        });
        if (reduction.disposition === "ignored_stale_result") {
          return {
            kind: "ignored_stale_result" as const,
            state: reduction.state,
            sidecars: reduction.sidecars,
          };
        }
        const committedSidecars =
          input.budgetUsage === undefined
            ? reduction.sidecars
            : {
                ...reduction.sidecars,
                budgetUsage: stage3BudgetUsageSchema.parse(input.budgetUsage),
              };
        const result = await this.dependencies.store.commit({
          sessionId: input.sessionId,
          expectedRevision: current.state.stateRevision,
          expectedOwnerToken: current.ownerToken,
          ownerToken: this.dependencies.ownerToken,
          transitionKey: input.transitionKey,
          inputFingerprint: input.inputFingerprint,
          committedAt: this.dependencies.reducerPorts.clock.now(),
          state: reduction.state,
          sidecars: committedSidecars,
        });
        this.notify(result.snapshot.state);
        return result;
      },
    });
  }

  private notify(state: Stage4SessionState): void {
    notifyStage4SessionChanged({
      channel: this.dependencies.channel,
      sessionId: state.sessionId,
      stateRevision: state.stateRevision,
    });
  }
}

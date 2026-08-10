import { IDBFactory, IDBKeyRange } from "fake-indexeddb";
import { beforeAll, describe, expect, it } from "vitest";

import {
  IndexedDbStage4Store,
  Stage4PersistenceConflictError,
  Stage4SessionEngine,
  withStage4SessionLock,
} from "@/persistence";
import {
  STAGE4_DIGEST_A,
  STAGE4_DIGEST_B,
  STAGE4_LATER,
  makeNewStage4Session,
  makeStage4Ports,
} from "../fixtures/stage4";

beforeAll(() => {
  Object.defineProperty(globalThis, "IDBKeyRange", {
    value: IDBKeyRange,
    configurable: true,
  });
});
describe("Stage4SessionEngine concurrency", () => {
  it("commits a reducer transition and makes repeated delivery idempotent", async () => {
    const store = await IndexedDbStage4Store.create({
      factory: new IDBFactory(),
      databaseName: "engine-idempotency",
    });
    const engine = new Stage4SessionEngine({
      store,
      reducerPorts: makeStage4Ports(...Array(6).fill(STAGE4_LATER)),
      ownerToken: "owner-engine",
    });
    const { state, sidecars } = makeNewStage4Session();
    await engine.initialize({
      state,
      sidecars,
      transitionKey: "create",
      inputFingerprint: STAGE4_DIGEST_A,
    });
    const input = {
      sessionId: state.sessionId,
      transitionKey: "start",
      inputFingerprint: STAGE4_DIGEST_B,
      event: { eventType: "START" as const },
    };
    const first = await engine.dispatch(input);
    const duplicate = await engine.dispatch(input);
    expect(first.kind).toBe("applied");
    expect(duplicate.kind).toBe("duplicate");
    expect((await store.load(state.sessionId))?.state).toMatchObject({
      stage: "PORTRAIT_PRELUDE",
      stateRevision: 1,
    });
    store.close();
  });

  it("does not allow the same transition key to represent another input", async () => {
    const store = await IndexedDbStage4Store.create({
      factory: new IDBFactory(),
      databaseName: "engine-conflict",
    });
    const engine = new Stage4SessionEngine({
      store,
      reducerPorts: makeStage4Ports(...Array(4).fill(STAGE4_LATER)),
      ownerToken: "owner-engine",
    });
    const { state, sidecars } = makeNewStage4Session();
    await engine.initialize({
      state,
      sidecars,
      transitionKey: "create",
      inputFingerprint: STAGE4_DIGEST_A,
    });
    await expect(
      engine.dispatch({
        sessionId: state.sessionId,
        transitionKey: "create",
        inputFingerprint: STAGE4_DIGEST_B,
        event: { eventType: "START" },
      }),
    ).rejects.toBeInstanceOf(Stage4PersistenceConflictError);
    store.close();
  });

  it("serializes same-session work through Web Locks when available", async () => {
    let tail = Promise.resolve();
    const starts: number[] = [];
    const finishes: number[] = [];
    const locks = {
      request<T>(_name: string, callback: () => T | PromiseLike<T>): Promise<T> {
        const run = tail.then(callback);
        tail = run.then(() => undefined, () => undefined);
        return run;
      },
    } as Pick<LockManager, "request">;
    await Promise.all(
      [1, 2].map((value) =>
        withStage4SessionLock({
          sessionId: "session-lock",
          locks,
          run: async () => {
            starts.push(value);
            await Promise.resolve();
            finishes.push(value);
          },
        }),
      ),
    );
    expect(starts).toEqual([1, 2]);
    expect(finishes).toEqual([1, 2]);
  });
});

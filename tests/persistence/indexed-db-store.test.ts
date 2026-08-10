import { IDBFactory, IDBKeyRange } from "fake-indexeddb";
import { beforeAll, describe, expect, it } from "vitest";

import {
  IndexedDbStage4Store,
  Stage4PersistenceConflictError,
  Stage4PersistenceCorruptError,
} from "@/persistence";
import {
  STAGE4_DIGEST_A,
  STAGE4_DIGEST_B,
  STAGE4_LATER,
  makeNewStage4Session,
  withStage4State,
} from "../fixtures/stage4";

beforeAll(() => {
  Object.defineProperty(globalThis, "IDBKeyRange", {
    value: IDBKeyRange,
    configurable: true,
  });
});

describe("IndexedDbStage4Store", () => {
  it("atomically stores SessionState, sidecars, provenance receipts and idempotency", async () => {
    const factory = new IDBFactory();
    const store = await IndexedDbStage4Store.create({
      factory,
      databaseName: "atomic-success",
    });
    const { state, sidecars } = makeNewStage4Session();
    const result = await store.commit({
      sessionId: state.sessionId,
      expectedRevision: null,
      expectedOwnerToken: null,
      ownerToken: "owner-a",
      transitionKey: "create-session",
      inputFingerprint: STAGE4_DIGEST_A,
      committedAt: STAGE4_LATER,
      state,
      sidecars,
    });

    expect(result.kind).toBe("applied");
    const loaded = await store.load(state.sessionId);
    expect(loaded?.state).toEqual(state);
    expect(loaded?.sidecars).toEqual(sidecars);
    expect(loaded?.idempotencyRecords).toHaveLength(1);
    expect(loaded?.idempotencyRecords[0]?.appliedRevision).toBe(0);
    store.close();
  });

  it("returns the committed snapshot for a duplicate transition", async () => {
    const factory = new IDBFactory();
    const store = await IndexedDbStage4Store.create({
      factory,
      databaseName: "idempotent",
    });
    const { state, sidecars } = makeNewStage4Session();
    const input = {
      sessionId: state.sessionId,
      expectedRevision: null,
      expectedOwnerToken: null,
      ownerToken: "owner-a",
      transitionKey: "create-session",
      inputFingerprint: STAGE4_DIGEST_A,
      committedAt: STAGE4_LATER,
      state,
      sidecars,
    } as const;
    await store.commit(input);
    const duplicate = await store.commit(input);
    expect(duplicate.kind).toBe("duplicate");
    expect(duplicate.snapshot.state.stateRevision).toBe(0);
    store.close();
  });

  it("rejects idempotency-key reuse with a different fingerprint", async () => {
    const factory = new IDBFactory();
    const store = await IndexedDbStage4Store.create({
      factory,
      databaseName: "idempotency-conflict",
    });
    const { state, sidecars } = makeNewStage4Session();
    const base = {
      sessionId: state.sessionId,
      expectedRevision: null,
      expectedOwnerToken: null,
      ownerToken: "owner-a",
      transitionKey: "create-session",
      committedAt: STAGE4_LATER,
      state,
      sidecars,
    } as const;
    await store.commit({ ...base, inputFingerprint: STAGE4_DIGEST_A });
    await expect(
      store.commit({ ...base, inputFingerprint: STAGE4_DIGEST_B }),
    ).rejects.toBeInstanceOf(Stage4PersistenceConflictError);
    store.close();
  });

  it("uses ownerToken and expectedRevision to reject a stale tab", async () => {
    const factory = new IDBFactory();
    const store = await IndexedDbStage4Store.create({
      factory,
      databaseName: "optimistic-conflict",
    });
    const { state, sidecars } = makeNewStage4Session();
    await store.commit({
      sessionId: state.sessionId,
      expectedRevision: null,
      expectedOwnerToken: null,
      ownerToken: "owner-a",
      transitionKey: "create-session",
      inputFingerprint: STAGE4_DIGEST_A,
      committedAt: STAGE4_LATER,
      state,
      sidecars,
    });
    const next = withStage4State(state, {
      stateRevision: 1,
      updatedAt: STAGE4_LATER,
    });
    await store.commit({
      sessionId: state.sessionId,
      expectedRevision: 0,
      expectedOwnerToken: "owner-a",
      ownerToken: "owner-b",
      transitionKey: "tab-b",
      inputFingerprint: STAGE4_DIGEST_B,
      committedAt: STAGE4_LATER,
      state: next,
      sidecars,
    });
    await expect(
      store.commit({
        sessionId: state.sessionId,
        expectedRevision: 0,
        expectedOwnerToken: "owner-a",
        ownerToken: "owner-c",
        transitionKey: "tab-c",
        inputFingerprint: `sha256:${"c".repeat(64)}`,
        committedAt: STAGE4_LATER,
        state: next,
        sidecars,
      }),
    ).rejects.toBeInstanceOf(Stage4PersistenceConflictError);
    expect((await store.load(state.sessionId))?.ownerToken).toBe("owner-b");
    store.close();
  });

  it("rolls back the first object-store write when the transaction aborts", async () => {
    const factory = new IDBFactory();
    const store = await IndexedDbStage4Store.create({
      factory,
      databaseName: "atomic-abort",
      faultHook: () => {
        throw new DOMException("quota", "QuotaExceededError");
      },
    });
    const { state, sidecars } = makeNewStage4Session();
    await expect(
      store.commit({
        sessionId: state.sessionId,
        expectedRevision: null,
        expectedOwnerToken: null,
        ownerToken: "owner-a",
        transitionKey: "create-session",
        inputFingerprint: STAGE4_DIGEST_A,
        committedAt: STAGE4_LATER,
        state,
        sidecars,
      }),
    ).rejects.toMatchObject({ name: "QuotaExceededError" });
    expect(await store.load(state.sessionId)).toBeNull();
    store.close();
  });

  it("rejects a snapshot whose state no longer matches its checksum", async () => {
    const factory = new IDBFactory();
    const databaseName = "corrupt-checksum";
    const store = await IndexedDbStage4Store.create({ factory, databaseName });
    const { state, sidecars } = makeNewStage4Session();
    await store.commit({
      sessionId: state.sessionId,
      expectedRevision: null,
      expectedOwnerToken: null,
      ownerToken: "owner-a",
      transitionKey: "create-session",
      inputFingerprint: STAGE4_DIGEST_A,
      committedAt: STAGE4_LATER,
      state,
      sidecars,
    });
    store.close();

    const database = await open(factory, databaseName);
    const tx = database.transaction("sessions", "readwrite");
    tx.objectStore("sessions").put({
      sessionId: state.sessionId,
      ownerToken: "owner-a",
      integrityChecksum: STAGE4_DIGEST_A,
      state: { ...state, updatedAt: STAGE4_LATER },
    });
    await transactionDone(tx);
    database.close();

    const reopened = await IndexedDbStage4Store.create({ factory, databaseName });
    await expect(reopened.load(state.sessionId)).rejects.toBeInstanceOf(
      Stage4PersistenceCorruptError,
    );
    reopened.close();
  });

  it("clears the Session, private inputs and idempotency records together", async () => {
    const factory = new IDBFactory();
    const store = await IndexedDbStage4Store.create({
      factory,
      databaseName: "clear-session",
    });
    const { state, sidecars } = makeNewStage4Session();
    await store.commit({
      sessionId: state.sessionId,
      expectedRevision: null,
      expectedOwnerToken: null,
      ownerToken: "owner-a",
      transitionKey: "create-session",
      inputFingerprint: STAGE4_DIGEST_A,
      committedAt: STAGE4_LATER,
      state,
      sidecars,
    });
    expect(await store.delete(state.sessionId)).toBe(true);
    expect(await store.load(state.sessionId)).toBeNull();
    expect(await store.delete(state.sessionId)).toBe(false);
    store.close();
  });
});

function open(factory: IDBFactory, name: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = factory.open(name, 1);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

import {
  stateTransitionIdempotencyRecordSchema,
  type StateTransitionIdempotencyRecord,
} from "../runtime";
import {
  stage4AtomicSnapshotSchema,
  stage4StoredSessionSchema,
  stage4StoredSidecarsSchema,
} from "./schemas";
import {
  Stage4PersistenceConflictError,
  Stage4PersistenceCorruptError,
  type Stage4AtomicCommitInput,
  type Stage4AtomicCommitResult,
  type Stage4AtomicSnapshot,
  type Stage4AtomicStore,
} from "./contracts";
import { computeStage4SnapshotChecksum } from "./integrity";

const DATABASE_VERSION = 1;
const SESSION_STORE = "sessions";
const SIDECAR_STORE = "sidecars";
const IDEMPOTENCY_STORE = "idempotency";

type FaultHook = (point: "after_session_put") => void;

export type IndexedDbStage4StoreOptions = Readonly<{
  factory: IDBFactory;
  databaseName?: string;
  faultHook?: FaultHook;
}>;

export class IndexedDbStage4Store implements Stage4AtomicStore {
  private constructor(
    private readonly database: IDBDatabase,
    private readonly faultHook?: FaultHook,
  ) {}

  static async create(
    options: IndexedDbStage4StoreOptions,
  ): Promise<IndexedDbStage4Store> {
    const database = await openDatabase(
      options.factory,
      options.databaseName ?? "last-page-progress-report",
    );
    return new IndexedDbStage4Store(database, options.faultHook);
  }

  async load(sessionId: string): Promise<Stage4AtomicSnapshot | null> {
    const transaction = this.database.transaction(
      [SESSION_STORE, SIDECAR_STORE, IDEMPOTENCY_STORE],
      "readonly",
    );
    const completion = transactionCompletion(transaction);
    const sessionValue = await requestValue(
      transaction.objectStore(SESSION_STORE).get(sessionId),
    );
    const sidecarValue = await requestValue(
      transaction.objectStore(SIDECAR_STORE).get(sessionId),
    );
    const idempotencyValues = await requestValue(
      transaction.objectStore(IDEMPOTENCY_STORE).getAll(
        IDBKeyRange.bound([sessionId, ""], [sessionId, "\uffff"]),
      ),
    );
    await completion;
    if (sessionValue === undefined && sidecarValue === undefined) return null;
    if (sessionValue === undefined || sidecarValue === undefined) {
      throw new Stage4PersistenceCorruptError(
        "Session and private sidecars must coexist",
      );
    }

    const storedSession = stage4StoredSessionSchema.parse(sessionValue);
    const storedSidecars = stage4StoredSidecarsSchema.parse(sidecarValue);
    const idempotencyRecords = idempotencyValues.map((value) =>
      stateTransitionIdempotencyRecordSchema.parse(value),
    );
    const checksum = await computeStage4SnapshotChecksum({
      state: storedSession.state,
      sidecars: storedSidecars.sidecars,
    });
    if (checksum !== storedSession.integrityChecksum) {
      throw new Stage4PersistenceCorruptError(
        "Persisted Stage 4 snapshot checksum does not match",
      );
    }
    return stage4AtomicSnapshotSchema.parse({
      ownerToken: storedSession.ownerToken,
      integrityChecksum: checksum,
      state: storedSession.state,
      sidecars: storedSidecars.sidecars,
      idempotencyRecords,
    });
  }

  async commit(
    input: Stage4AtomicCommitInput,
  ): Promise<Stage4AtomicCommitResult> {
    validateCommitShape(input);
    const checksum = await computeStage4SnapshotChecksum(input);
    const transaction = this.database.transaction(
      [SESSION_STORE, SIDECAR_STORE, IDEMPOTENCY_STORE],
      "readwrite",
    );
    const completion = transactionCompletion(transaction);
    try {
      const sessionStore = transaction.objectStore(SESSION_STORE);
      const sidecarStore = transaction.objectStore(SIDECAR_STORE);
      const idempotencyStore = transaction.objectStore(IDEMPOTENCY_STORE);
      const existingSessionValue = await requestValue(
        sessionStore.get(input.sessionId),
      );
      const existingTransitionValue = await requestValue(
        idempotencyStore.get([input.sessionId, input.transitionKey]),
      );

      if (existingTransitionValue !== undefined) {
        const existingTransition = stateTransitionIdempotencyRecordSchema.parse(
          existingTransitionValue,
        );
        if (existingTransition.inputFingerprint !== input.inputFingerprint) {
          throw new Stage4PersistenceConflictError(
            "Transition key was already used with a different fingerprint",
          );
        }
        const existing = await this.snapshotFromTransaction(
          transaction,
          existingSessionValue,
        );
        await completion;
        return { kind: "duplicate", snapshot: existing };
      }

      assertExpectedVersion(input, existingSessionValue);
      const record = buildIdempotencyRecord(input);
      sessionStore.put({
        sessionId: input.sessionId,
        ownerToken: input.ownerToken,
        integrityChecksum: checksum,
        state: input.state,
      });
      this.faultHook?.("after_session_put");
      sidecarStore.put({ sessionId: input.sessionId, sidecars: input.sidecars });
      idempotencyStore.put(record);
      await completion;
      return {
        kind: "applied",
        snapshot: stage4AtomicSnapshotSchema.parse({
          ownerToken: input.ownerToken,
          integrityChecksum: checksum,
          state: input.state,
          sidecars: input.sidecars,
          idempotencyRecords: [record],
        }),
      };
    } catch (error) {
      try {
        transaction.abort();
      } catch {
        // The transaction may already have failed or completed.
      }
      await completion.catch(() => undefined);
      throw error;
    }
  }

  async deleteExpired(now: string): Promise<readonly string[]> {
    const nowMs = Date.parse(now);
    if (!Number.isFinite(nowMs)) throw new TypeError("now must be ISO-8601");
    const transaction = this.database.transaction(
      [SESSION_STORE, SIDECAR_STORE, IDEMPOTENCY_STORE],
      "readwrite",
    );
    const completion = transactionCompletion(transaction);
    const sessions = await requestValue(
      transaction.objectStore(SESSION_STORE).getAll(),
    );
    const deleted: string[] = [];
    for (const value of sessions) {
      const record = stage4StoredSessionSchema.parse(value);
      if (
        record.state.lifecycleStatus !== "complete" &&
        Date.parse(record.state.expiresAt) <= nowMs
      ) {
        deleted.push(record.sessionId);
        transaction.objectStore(SESSION_STORE).delete(record.sessionId);
        transaction.objectStore(SIDECAR_STORE).delete(record.sessionId);
        const keys = await requestValue(
          transaction.objectStore(IDEMPOTENCY_STORE).getAllKeys(
            IDBKeyRange.bound(
              [record.sessionId, ""],
              [record.sessionId, "\uffff"],
            ),
          ),
        );
        for (const key of keys) {
          transaction.objectStore(IDEMPOTENCY_STORE).delete(key);
        }
      }
    }
    await completion;
    return deleted;
  }

  async delete(sessionId: string): Promise<boolean> {
    const transaction = this.database.transaction(
      [SESSION_STORE, SIDECAR_STORE, IDEMPOTENCY_STORE],
      "readwrite",
    );
    const completion = transactionCompletion(transaction);
    const existing = await requestValue(
      transaction.objectStore(SESSION_STORE).getKey(sessionId),
    );
    if (existing === undefined) {
      await completion;
      return false;
    }
    transaction.objectStore(SESSION_STORE).delete(sessionId);
    transaction.objectStore(SIDECAR_STORE).delete(sessionId);
    const keys = await requestValue(
      transaction.objectStore(IDEMPOTENCY_STORE).getAllKeys(
        IDBKeyRange.bound([sessionId, ""], [sessionId, "\uffff"]),
      ),
    );
    for (const key of keys) {
      transaction.objectStore(IDEMPOTENCY_STORE).delete(key);
    }
    await completion;
    return true;
  }

  close(): void {
    this.database.close();
  }

  private async snapshotFromTransaction(
    transaction: IDBTransaction,
    sessionValue: unknown,
  ): Promise<Stage4AtomicSnapshot> {
    const storedSession = stage4StoredSessionSchema.parse(sessionValue);
    const storedSidecars = stage4StoredSidecarsSchema.parse(
      await requestValue(
        transaction.objectStore(SIDECAR_STORE).get(storedSession.sessionId),
      ),
    );
    const idempotencyRecords = (
      await requestValue(
        transaction.objectStore(IDEMPOTENCY_STORE).getAll(
          IDBKeyRange.bound(
            [storedSession.sessionId, ""],
            [storedSession.sessionId, "\uffff"],
          ),
        ),
      )
    ).map((value) => stateTransitionIdempotencyRecordSchema.parse(value));
    return stage4AtomicSnapshotSchema.parse({
      ownerToken: storedSession.ownerToken,
      integrityChecksum: storedSession.integrityChecksum,
      state: storedSession.state,
      sidecars: storedSidecars.sidecars,
      idempotencyRecords,
    });
  }
}

function validateCommitShape(input: Stage4AtomicCommitInput): void {
  if (input.state.sessionId !== input.sessionId) {
    throw new TypeError("Commit sessionId does not match SessionState");
  }
  if (input.sidecars.privateInputs.sessionId !== input.sessionId) {
    throw new TypeError("Private inputs do not match SessionState");
  }
  stage4AtomicSnapshotSchema.shape.state.parse(input.state);
  stage4AtomicSnapshotSchema.shape.sidecars.parse(input.sidecars);
}

function assertExpectedVersion(
  input: Stage4AtomicCommitInput,
  existingValue: unknown,
): void {
  if (existingValue === undefined) {
    if (input.expectedRevision !== null || input.expectedOwnerToken !== null) {
      throw new Stage4PersistenceConflictError(
        "Expected an existing Session but none was found",
      );
    }
    if (input.state.stateRevision !== 0) {
      throw new Stage4PersistenceConflictError(
        "A new Session must start at revision zero",
      );
    }
    return;
  }
  const existing = stage4StoredSessionSchema.parse(existingValue);
  if (
    existing.state.stateRevision !== input.expectedRevision ||
    existing.ownerToken !== input.expectedOwnerToken ||
    input.state.stateRevision !== existing.state.stateRevision + 1
  ) {
    throw new Stage4PersistenceConflictError(
      "ownerToken or expectedRevision no longer matches",
    );
  }
}

function buildIdempotencyRecord(
  input: Stage4AtomicCommitInput,
): StateTransitionIdempotencyRecord {
  return stateTransitionIdempotencyRecordSchema.parse({
    sessionId: input.sessionId,
    transitionKey: input.transitionKey,
    inputFingerprint: input.inputFingerprint,
    status: "applied",
    appliedRevision: input.state.stateRevision,
    createdAt: input.committedAt,
    updatedAt: input.committedAt,
    expiresAt:
      input.state.lifecycleStatus === "complete" ? null : input.state.expiresAt,
    cleanupDisposition:
      input.state.lifecycleStatus === "complete"
        ? "with_complete_snapshot"
        : "with_recoverable_session",
    compactedIntoDigest: null,
  });
}

function openDatabase(factory: IDBFactory, name: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = factory.open(name, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(SESSION_STORE)) {
        database.createObjectStore(SESSION_STORE, { keyPath: "sessionId" });
      }
      if (!database.objectStoreNames.contains(SIDECAR_STORE)) {
        database.createObjectStore(SIDECAR_STORE, { keyPath: "sessionId" });
      }
      if (!database.objectStoreNames.contains(IDEMPOTENCY_STORE)) {
        database.createObjectStore(IDEMPOTENCY_STORE, {
          keyPath: ["sessionId", "transitionKey"],
        });
      }
    };
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}

function requestValue<T = unknown>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function transactionCompletion(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error ?? new Error("IndexedDB transaction aborted"));
    transaction.onerror = () => reject(transaction.error ?? new Error("IndexedDB transaction failed"));
  });
}

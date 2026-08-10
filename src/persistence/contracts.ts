import type { z } from "zod";

import type {
  Stage4PersistenceSidecars,
  Stage4SessionState,
} from "../fsm";
import type { RuntimeSha256Digest } from "../runtime";
import type { stage4AtomicSnapshotSchema } from "./schemas";

export type Stage4AtomicSnapshot = z.infer<typeof stage4AtomicSnapshotSchema>;

export type Stage4AtomicCommitInput = Readonly<{
  sessionId: string;
  expectedRevision: number | null;
  expectedOwnerToken: string | null;
  ownerToken: string;
  transitionKey: string;
  inputFingerprint: RuntimeSha256Digest;
  committedAt: string;
  state: Stage4SessionState;
  sidecars: Stage4PersistenceSidecars;
}>;

export type Stage4AtomicCommitResult =
  | Readonly<{ kind: "applied"; snapshot: Stage4AtomicSnapshot }>
  | Readonly<{ kind: "duplicate"; snapshot: Stage4AtomicSnapshot }>;

export interface Stage4AtomicStore {
  load(sessionId: string): Promise<Stage4AtomicSnapshot | null>;
  commit(input: Stage4AtomicCommitInput): Promise<Stage4AtomicCommitResult>;
  delete(sessionId: string): Promise<boolean>;
  deleteExpired(now: string): Promise<readonly string[]>;
  close(): void;
}

export class Stage4PersistenceConflictError extends Error {
  readonly code = "stage4_persistence_conflict";

  constructor(message: string) {
    super(message);
    this.name = "Stage4PersistenceConflictError";
  }
}

export class Stage4PersistenceCorruptError extends Error {
  readonly code = "stage4_persistence_corrupt";

  constructor(message: string) {
    super(message);
    this.name = "Stage4PersistenceCorruptError";
  }
}

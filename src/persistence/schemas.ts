import { z } from "zod";

import { stateTransitionIdempotencyRecordSchema } from "../runtime";
import {
  stage4PersistenceSidecarsSchema,
  stage4SessionStateSchema,
} from "../fsm";

export const stage4StoredSessionSchema = z.strictObject({
  sessionId: z.string().min(1),
  ownerToken: z.string().min(1),
  integrityChecksum: z.string().regex(/^sha256:[0-9a-f]{64}$/),
  state: stage4SessionStateSchema,
});
export const stage4StoredSidecarsSchema = z.strictObject({
  sessionId: z.string().min(1),
  sidecars: stage4PersistenceSidecarsSchema,
});

export const stage4AtomicSnapshotSchema = z.strictObject({
  ownerToken: z.string().min(1),
  integrityChecksum: z.string().regex(/^sha256:[0-9a-f]{64}$/),
  state: stage4SessionStateSchema,
  sidecars: stage4PersistenceSidecarsSchema,
  idempotencyRecords: z.array(stateTransitionIdempotencyRecordSchema),
});

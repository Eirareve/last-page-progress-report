import type { Stage3EntityKind } from "./contracts";
import {
  STAGE3_ENTITY_ID_FORMAT_VERSION,
  stage3EntityKindSchema,
} from "./schemas";
import { runtimeIdentifierSchema } from "../runtime/schemas";

/**
 * Derives persisted Stage 3 entity IDs without widening Runtime PersistentIdKind.
 */
export function deriveStage3EntityId(input: {
  operationId: string;
  entityKind: Stage3EntityKind;
  ordinal: number;
}): string {
  const operationId = runtimeIdentifierSchema.parse(input.operationId);
  const entityKind = stage3EntityKindSchema.parse(input.entityKind);
  const ordinal = Number.isSafeInteger(input.ordinal) && input.ordinal >= 0
    ? input.ordinal
    : null;
  if (ordinal === null) {
    throw new RangeError("Stage 3 entity ordinal must be a zero-based safe integer");
  }
  return [
    "stage3",
    STAGE3_ENTITY_ID_FORMAT_VERSION,
    entityKind,
    ordinal,
    encodeURIComponent(operationId),
  ].join(":");
}

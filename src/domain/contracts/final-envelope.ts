import type { z } from "zod";

import { finalEnvelopeSchema } from "../schemas/final-envelope.schema";
import type { finalEnvelopeContentSnapshotSchema } from "../schemas/final-envelope.schema";

type FinalEnvelopeValue = z.infer<typeof finalEnvelopeSchema>;
export type FinalEnvelopeContentSnapshot = z.infer<
  typeof finalEnvelopeContentSnapshotSchema
>;

export type FinalEnvelope<TExecutionProvenance = unknown> = DeepReadonly<
  Omit<FinalEnvelopeValue, "executionProvenance"> & {
    executionProvenance: TExecutionProvenance;
  }
>;

export type DeepReadonly<T> = T extends (...args: never[]) => unknown
  ? T
  : T extends readonly (infer Item)[]
    ? readonly DeepReadonly<Item>[]
    : T extends object
      ? { readonly [Key in keyof T]: DeepReadonly<T[Key]> }
      : T;

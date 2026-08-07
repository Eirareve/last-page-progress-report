export type PersistentIdKind =
  | "session"
  | "stage_instance"
  | "operation"
  | "request"
  | "transition"
  | "revision"
  | "receipt"
  | "final_envelope";

/** Supplies externally controlled ISO-8601 timestamps to deterministic services. */
export interface Clock {
  now(): string;
}

/** Supplies externally controlled persistent identifiers to deterministic services. */
export interface IdGenerator {
  next(kind: PersistentIdKind): string;
}

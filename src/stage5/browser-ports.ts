import type { Clock, IdGenerator, PersistentIdKind } from "../runtime";

export const browserClock: Clock = Object.freeze({
  now: () => new Date().toISOString(),
});

export interface BrowserIdGenerator extends IdGenerator {
  peek(kind: PersistentIdKind): string;
}

export function createBrowserIdGenerator(): BrowserIdGenerator {
  const counters = new Map<PersistentIdKind, number>();
  const prefix = crypto.randomUUID();
  const valueFor = (kind: PersistentIdKind) =>
    `${kind}-${prefix}-${(counters.get(kind) ?? 0) + 1}`;
  return {
    next(kind) {
      const value = valueFor(kind);
      counters.set(kind, (counters.get(kind) ?? 0) + 1);
      return value;
    },
    peek: valueFor,
  };
}

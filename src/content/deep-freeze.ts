/** Recursively freezes validated JSON-like values while preserving functions. */
export function deepFreeze<T>(value: T, seen = new WeakSet<object>()): T {
  if ((typeof value !== "object" && typeof value !== "function") || value === null) {
    return value;
  }
  if (seen.has(value)) {
    return value;
  }
  seen.add(value);

  for (const property of Reflect.ownKeys(value)) {
    deepFreeze(Reflect.get(value, property), seen);
  }
  return Object.freeze(value);
}

export const STAGE6_DEFAULT_HTTP_LIMITS = Object.freeze({
  requestBodyBytes: 128 * 1024,
  providerResponseBytes: 256 * 1024,
  sessionRequestsPerMinute: 10,
  sourceRequestsPerMinute: 30,
  globalConcurrency: 4,
  sessionConcurrency: 1,
} as const);

export type JsonBodyReadResult =
  | Readonly<{ ok: true; value: unknown }>
  | Readonly<{
      ok: false;
      code: "invalid_content_type" | "payload_too_large" | "invalid_request";
    }>;

export async function readJsonBodyWithLimit(
  request: Request,
  maximumBytes: number,
): Promise<JsonBodyReadResult> {
  const contentType = request.headers
    .get("content-type")
    ?.split(";", 1)[0]
    ?.trim()
    .toLowerCase();
  if (contentType !== "application/json") {
    return { ok: false, code: "invalid_content_type" };
  }
  const declaredLength = request.headers.get("content-length");
  if (
    declaredLength !== null &&
    Number.isFinite(Number(declaredLength)) &&
    Number(declaredLength) > maximumBytes
  ) {
    return { ok: false, code: "payload_too_large" };
  }
  if (request.body === null) return { ok: false, code: "invalid_request" };

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const next = await reader.read();
    if (next.done) break;
    total += next.value.byteLength;
    if (total > maximumBytes) {
      await reader.cancel();
      return { ok: false, code: "payload_too_large" };
    }
    chunks.push(next.value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return { ok: true, value: JSON.parse(text) as unknown };
  } catch {
    return { ok: false, code: "invalid_request" };
  }
}

export class FixedWindowRateLimiter {
  readonly #entries = new Map<string, { startedAt: number; count: number }>();

  constructor(
    readonly limit: number,
    readonly windowMs: number,
    readonly now: () => number = Date.now,
    readonly maximumKeys = 10_000,
  ) {
    if (
      !Number.isInteger(limit) ||
      limit <= 0 ||
      windowMs <= 0 ||
      !Number.isInteger(maximumKeys) ||
      maximumKeys <= 0
    ) {
      throw new TypeError("Rate-limit values must be positive");
    }
  }

  check(key: string): Readonly<{ allowed: boolean; retryAfterMs: number }> {
    const currentTime = this.now();
    const current = this.#entries.get(key);
    if (current === undefined || currentTime - current.startedAt >= this.windowMs) {
      this.#pruneExpired(currentTime);
      if (!this.#entries.has(key) && this.#entries.size >= this.maximumKeys) {
        return { allowed: false, retryAfterMs: this.windowMs };
      }
      this.#entries.set(key, { startedAt: currentTime, count: 1 });
      return { allowed: true, retryAfterMs: 0 };
    }
    if (current.count >= this.limit) {
      return {
        allowed: false,
        retryAfterMs: Math.max(1, this.windowMs - (currentTime - current.startedAt)),
      };
    }
    current.count += 1;
    return { allowed: true, retryAfterMs: 0 };
  }

  #pruneExpired(currentTime: number): void {
    for (const [key, entry] of this.#entries) {
      if (currentTime - entry.startedAt >= this.windowMs) {
        this.#entries.delete(key);
      }
    }
  }
}

export function resolveForwardedSourceKey(request: Request): string {
  const candidate = request.headers
    .get("x-forwarded-for")
    ?.split(",", 1)[0]
    ?.trim();
  return candidate !== undefined && /^[0-9A-Fa-f:.]{1,128}$/u.test(candidate)
    ? candidate
    : "unidentified-source";
}

export class KeyedConcurrencyLimiter {
  #globalActive = 0;
  readonly #keyActive = new Map<string, number>();

  constructor(
    readonly globalLimit: number,
    readonly perKeyLimit: number,
  ) {
    if (
      !Number.isInteger(globalLimit) ||
      !Number.isInteger(perKeyLimit) ||
      globalLimit <= 0 ||
      perKeyLimit <= 0
    ) {
      throw new TypeError("Concurrency limits must be positive integers");
    }
  }

  tryAcquire(key: string): (() => void) | null {
    const keyCount = this.#keyActive.get(key) ?? 0;
    if (this.#globalActive >= this.globalLimit || keyCount >= this.perKeyLimit) {
      return null;
    }
    this.#globalActive += 1;
    this.#keyActive.set(key, keyCount + 1);
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.#globalActive -= 1;
      const next = (this.#keyActive.get(key) ?? 1) - 1;
      if (next === 0) this.#keyActive.delete(key);
      else this.#keyActive.set(key, next);
    };
  }
}

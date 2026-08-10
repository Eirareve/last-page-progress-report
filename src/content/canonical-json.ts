export type JsonPrimitive = null | boolean | number | string;
export type JsonValue =
  | JsonPrimitive
  | readonly JsonValue[]
  | { readonly [key: string]: JsonValue };

const CHECKSUM_SELF_FIELDS = new Set([
  "checksum",
  "internalContentBundleChecksum",
  "contentBundleChecksum",
]);

type CanonicalizationContext = {
  readonly ancestors: WeakSet<object>;
  readonly excludeRootChecksumFields: boolean;
};

/**
 * Serializes JSON data using the RFC 8785/JCS ordering and number rules after
 * NFC-normalizing every string value and object key.
 */
export function canonicalizeJson(value: unknown): string {
  return serializeCanonicalJson(value, {
    ancestors: new WeakSet<object>(),
    excludeRootChecksumFields: false,
  }, true);
}

/**
 * Produces checksum material while excluding only the root representation's
 * self-referential checksum fields. Nested fields with the same names remain
 * part of the material because they may be business data.
 */
export function canonicalizeJsonForChecksum(value: unknown): string {
  return serializeCanonicalJson(value, {
    ancestors: new WeakSet<object>(),
    excludeRootChecksumFields: true,
  }, true);
}

function serializeCanonicalJson(
  value: unknown,
  context: CanonicalizationContext,
  isRoot: boolean,
): string {
  if (value === null || typeof value === "boolean") {
    return JSON.stringify(value);
  }
  if (typeof value === "string") {
    return JSON.stringify(normalizeUnicode(value));
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new TypeError("Canonical JSON does not permit non-finite numbers");
    }
    return JSON.stringify(value);
  }
  if (
    typeof value === "undefined" ||
    typeof value === "function" ||
    typeof value === "symbol" ||
    typeof value === "bigint"
  ) {
    throw new TypeError(`Canonical JSON does not permit ${typeof value} values`);
  }

  if (context.ancestors.has(value)) {
    throw new TypeError("Canonical JSON does not permit circular references");
  }
  context.ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      if (Object.getOwnPropertySymbols(value).length > 0) {
        throw new TypeError("Canonical JSON does not permit symbol-keyed properties");
      }
      const entries: string[] = [];
      for (let index = 0; index < value.length; index += 1) {
        if (!Object.hasOwn(value, index)) {
          throw new TypeError("Canonical JSON does not permit sparse arrays");
        }
        entries.push(serializeCanonicalJson(value[index], context, false));
      }
      return `[${entries.join(",")}]`;
    }

    requirePlainJsonObject(value);
    const record = value as Record<string, unknown>;
    const normalizedEntries = new Map<string, unknown>();
    for (const originalKey of Object.keys(record)) {
      const normalizedKey = normalizeUnicode(originalKey);
      if (
        isRoot &&
        context.excludeRootChecksumFields &&
        CHECKSUM_SELF_FIELDS.has(normalizedKey)
      ) {
        continue;
      }
      if (normalizedEntries.has(normalizedKey)) {
        throw new TypeError(
          `Canonical JSON object keys collide after NFC normalization: ${JSON.stringify(normalizedKey)}`,
        );
      }
      normalizedEntries.set(normalizedKey, record[originalKey]);
    }

    const keys = Array.from(normalizedEntries.keys()).sort(compareUtf16CodeUnits);
    return `{${keys
      .map(
        (key) =>
          `${JSON.stringify(key)}:${serializeCanonicalJson(normalizedEntries.get(key), context, false)}`,
      )
      .join(",")}}`;
  } finally {
    context.ancestors.delete(value);
  }
}

function requirePlainJsonObject(value: object): void {
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new TypeError("Canonical JSON only accepts plain objects and arrays");
  }
  if (Object.getOwnPropertySymbols(value).length > 0) {
    throw new TypeError("Canonical JSON does not permit symbol-keyed properties");
  }
}

function normalizeUnicode(value: string): string {
  assertNoLoneSurrogates(value);
  return value.normalize("NFC");
}

function assertNoLoneSurrogates(value: string): void {
  for (let index = 0; index < value.length; index += 1) {
    const codeUnit = value.charCodeAt(index);
    if (codeUnit >= 0xd800 && codeUnit <= 0xdbff) {
      const nextCodeUnit = value.charCodeAt(index + 1);
      if (nextCodeUnit < 0xdc00 || nextCodeUnit > 0xdfff) {
        throw new TypeError("Canonical JSON does not permit lone Unicode surrogates");
      }
      index += 1;
      continue;
    }
    if (codeUnit >= 0xdc00 && codeUnit <= 0xdfff) {
      throw new TypeError("Canonical JSON does not permit lone Unicode surrogates");
    }
  }
}

function compareUtf16CodeUnits(left: string, right: string): number {
  if (left < right) {
    return -1;
  }
  if (left > right) {
    return 1;
  }
  return 0;
}

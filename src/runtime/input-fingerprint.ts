import type { InputFingerprintMaterial, RuntimeSha256Digest } from "./contracts";
import { inputFingerprintMaterialSchema } from "./schemas";

/**
 * Computes a retry-stable semantic input fingerprint. Request, operation,
 * stage-instance, and attempt IDs are intentionally excluded.
 */
export async function computeInputFingerprint(
  material: InputFingerprintMaterial,
): Promise<RuntimeSha256Digest> {
  const parsed = inputFingerprintMaterialSchema.parse(material);
  const canonical = canonicalizeJson(parsed);
  const bytes = new TextEncoder().encode(canonical);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  const hexadecimal = Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  return `sha256:${hexadecimal}`;
}

function canonicalizeJson(value: unknown): string {
  if (value === null || typeof value === "boolean") {
    return JSON.stringify(value);
  }
  if (typeof value === "string") {
    return JSON.stringify(value.normalize("NFC"));
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new TypeError("Input fingerprint material must be finite JSON");
    }
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalizeJson).join(",")}]`;
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalizeJson(record[key])}`)
      .join(",")}}`;
  }
  throw new TypeError("Input fingerprint material must be JSON-serializable");
}

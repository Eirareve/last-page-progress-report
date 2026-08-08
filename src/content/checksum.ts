import { canonicalizeJsonForChecksum } from "./canonical-json";

export const CONTENT_CHECKSUM_ALGORITHM = "rfc8785-sha256-nfc-v1" as const;

export type Sha256Checksum = `sha256:${string}`;
export type InternalContentBundleChecksum = Sha256Checksum;
export type ContentBundleChecksum = Sha256Checksum;

export async function computeCanonicalJsonChecksum(
  value: unknown,
): Promise<Sha256Checksum> {
  const canonicalMaterial = canonicalizeJsonForChecksum(value);
  const bytes = new TextEncoder().encode(canonicalMaterial);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  const hexadecimal = Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  return `sha256:${hexadecimal}`;
}

export async function computeInternalContentBundleChecksum(
  internalContentBundle: unknown,
): Promise<InternalContentBundleChecksum> {
  return computeCanonicalJsonChecksum(internalContentBundle);
}

export async function computePublicContentBundleChecksum(
  publicContentBundle: unknown,
): Promise<ContentBundleChecksum> {
  return computeCanonicalJsonChecksum(publicContentBundle);
}

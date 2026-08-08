import type { SessionContentBinding } from "../domain/contracts/session";
import type { ContentAccessBinding } from "./content-access";
import type { TargetEnvironment } from "./contracts";

export class ContentBindingMismatchError extends Error {
  readonly code = "content_binding_mismatch";
  readonly mismatchedFields: readonly string[];

  constructor(mismatchedFields: readonly string[]) {
    super(`Content binding mismatch: ${mismatchedFields.join(", ")}`);
    this.name = "ContentBindingMismatchError";
    this.mismatchedFields = Object.freeze([...mismatchedFields]);
  }
}

export type ContentBindingCompatibilityResult =
  | Readonly<{ compatible: true }>
  | Readonly<{ compatible: false; mismatches: readonly string[] }>;

export function evaluateSessionContentBindingCompatibility(
  persisted: SessionContentBinding,
  current: ContentAccessBinding,
  targetEnvironment: TargetEnvironment,
): ContentBindingCompatibilityResult {
  const mismatches = findSessionContentBindingMismatches(
    persisted,
    current,
    targetEnvironment,
  );
  return mismatches.length === 0
    ? { compatible: true }
    : { compatible: false, mismatches };
}

export function assertSessionContentBindingMatches(
  persisted: SessionContentBinding,
  current: ContentAccessBinding,
  targetEnvironment: TargetEnvironment,
): void {
  const mismatchedFields = findSessionContentBindingMismatches(
    persisted,
    current,
    targetEnvironment,
  );
  if (mismatchedFields.length > 0) {
    throw new ContentBindingMismatchError(mismatchedFields);
  }
}

function findSessionContentBindingMismatches(
  persisted: SessionContentBinding,
  current: ContentAccessBinding,
  targetEnvironment: TargetEnvironment,
): readonly string[] {
  const mismatchedFields: string[] = [];
  if (persisted.contentBundleId !== current.contentBundleId) {
    mismatchedFields.push("contentBundleId");
  }
  if (persisted.contentBundleVersion !== current.contentBundleVersion) {
    mismatchedFields.push("contentBundleVersion");
  }
  if (persisted.contentBundleChecksum !== current.contentBundleChecksum) {
    mismatchedFields.push("contentBundleChecksum");
  }
  if (persisted.contentSchemaVersion !== current.contentSchemaVersion) {
    mismatchedFields.push("contentSchemaVersion");
  }
  if (persisted.targetEnvironment !== targetEnvironment) {
    mismatchedFields.push("targetEnvironment");
  }
  return Object.freeze(mismatchedFields);
}

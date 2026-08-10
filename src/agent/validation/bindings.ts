import type {
  AgentContentBinding,
  AgentRevisionBinding,
} from "../contracts";

export function contentBindingsEqual(
  left: AgentContentBinding,
  right: AgentContentBinding,
): boolean {
  return (
    left.contentBundleId === right.contentBundleId &&
    left.contentBundleVersion === right.contentBundleVersion &&
    left.contentBundleChecksum === right.contentBundleChecksum
  );
}
export function revisionBindingsEqual(
  left: AgentRevisionBinding,
  right: AgentRevisionBinding,
): boolean {
  return (
    left.preciseRevisionId === right.preciseRevisionId &&
    left.plainRevisionId === right.plainRevisionId
  );
}

export function unexpectedIdentifiers(
  usedIds: readonly string[],
  allowedIds: readonly string[],
): readonly string[] {
  const allowed = new Set(allowedIds);
  return Object.freeze(
    [...new Set(usedIds.filter((identifier) => !allowed.has(identifier)))].sort(),
  );
}

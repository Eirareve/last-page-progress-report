import type { ContractVersionVector } from "./contracts";
import { contractVersionVectorSchema } from "./schemas";

export const CONTRACT_VERSION_FIELDS = [
  "scopeContractVersion",
  "domainContractVersion",
  "runtimeContractVersion",
  "provenanceContractVersion",
  "namingContractVersion",
  "finalizationContractVersion",
  "stateMachineContractVersion",
  "sessionSchemaVersion",
  "stableTextAnchorSchemaVersion",
  "contentSchemaVersion",
  "agentContractVersion",
  "finalReviewSchemaVersion",
  "finalEnvelopeSchemaVersion",
] as const satisfies readonly (keyof ContractVersionVector)[];

export type ContractVersionField = (typeof CONTRACT_VERSION_FIELDS)[number];

export function getMissingContractVersionFields(
  vector: ContractVersionVector,
): ContractVersionField[] {
  const parsed = contractVersionVectorSchema.parse(vector);
  return CONTRACT_VERSION_FIELDS.filter((field) => parsed[field] === null);
}

export function hasCompleteContractVersionVector(
  vector: ContractVersionVector,
): boolean {
  return getMissingContractVersionFields(vector).length === 0;
}

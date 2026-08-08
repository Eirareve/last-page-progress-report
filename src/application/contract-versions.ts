import { AGENT_CONTRACT_VERSION } from "../agent";
import { FINAL_REVIEW_SCHEMA_VERSION } from "../final-review";
import {
  contractVersionVectorSchema,
  type ContractVersionVector,
} from "../provenance";

/** Fills only the two Stage 3-owned axes in the frozen version vector. */
export function projectStage3ContractVersions(
  existing: ContractVersionVector,
): ContractVersionVector {
  const parsed = contractVersionVectorSchema.parse(existing);
  if (
    (parsed.agentContractVersion !== null &&
      parsed.agentContractVersion !== AGENT_CONTRACT_VERSION) ||
    (parsed.finalReviewSchemaVersion !== null &&
      parsed.finalReviewSchemaVersion !== FINAL_REVIEW_SCHEMA_VERSION)
  ) {
    throw new TypeError(
      "Stage 3 Contract versions cannot overwrite a conflicting non-null version axis",
    );
  }
  return Object.freeze(
    contractVersionVectorSchema.parse({
      ...parsed,
      agentContractVersion: AGENT_CONTRACT_VERSION,
      finalReviewSchemaVersion: FINAL_REVIEW_SCHEMA_VERSION,
    }),
  );
}

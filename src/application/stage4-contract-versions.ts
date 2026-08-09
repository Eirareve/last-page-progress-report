import { AGENT_CONTRACT_VERSION } from "../agent";
import { CONTENT_SCHEMA_VERSION } from "../content/bundle.schemas";
import {
  DOMAIN_CONTRACT_VERSION,
  FINAL_ENVELOPE_SCHEMA_VERSION,
  SESSION_SCHEMA_VERSION,
  STABLE_TEXT_ANCHOR_SCHEMA_VERSION,
} from "../domain";
import { FINAL_REVIEW_SCHEMA_VERSION } from "../final-review";
import { FINALIZATION_CONTRACT_VERSION } from "../finalization";
import { STATE_MACHINE_CONTRACT_VERSION } from "../fsm/versions";
import {
  PROVENANCE_CONTRACT_VERSION,
  contractVersionVectorSchema,
  type ContractVersionVector,
} from "../provenance";
import { RUNTIME_CONTRACT_VERSION } from "../runtime";
import {
  NAMING_CONTRACT_VERSION,
  SCOPE_CONTRACT_VERSION,
} from "../contract-versions";

export function buildStage4ContractVersionVector(): ContractVersionVector {
  return Object.freeze(
    contractVersionVectorSchema.parse({
      scopeContractVersion: SCOPE_CONTRACT_VERSION,
      domainContractVersion: DOMAIN_CONTRACT_VERSION,
      runtimeContractVersion: RUNTIME_CONTRACT_VERSION,
      provenanceContractVersion: PROVENANCE_CONTRACT_VERSION,
      namingContractVersion: NAMING_CONTRACT_VERSION,
      finalizationContractVersion: FINALIZATION_CONTRACT_VERSION,
      stateMachineContractVersion: STATE_MACHINE_CONTRACT_VERSION,
      sessionSchemaVersion: SESSION_SCHEMA_VERSION,
      stableTextAnchorSchemaVersion: STABLE_TEXT_ANCHOR_SCHEMA_VERSION,
      contentSchemaVersion: CONTENT_SCHEMA_VERSION,
      agentContractVersion: AGENT_CONTRACT_VERSION,
      finalReviewSchemaVersion: FINAL_REVIEW_SCHEMA_VERSION,
      finalEnvelopeSchemaVersion: FINAL_ENVELOPE_SCHEMA_VERSION,
    }),
  );
}

export function getStage4ContractVersionMismatches(
  actual: ContractVersionVector,
): string[] {
  const expected = buildStage4ContractVersionVector();
  const parsed = contractVersionVectorSchema.parse(actual);
  return Object.keys(expected)
    .filter(
      (field) =>
        parsed[field as keyof ContractVersionVector] !==
        expected[field as keyof ContractVersionVector],
    )
    .map((field) => `provenance.contractVersionVector.${field}`);
}

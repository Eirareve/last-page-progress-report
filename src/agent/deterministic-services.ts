import type { GatedContentAccess } from "../content/server";
import {
  initialPortraitRecordSchema,
  dissentRecordSchema,
} from "../domain";
import type {
  AgentOperationResult,
  BuildDissentRecordInput,
  BuildDissentRecordProjection,
  BuildDissentRecordValidatedResult,
  BuildInitialPortraitRecordInput,
  BuildInitialPortraitRecordValidatedResult,
  RetrieveVerifiedEvidenceInput,
  RetrieveVerifiedEvidenceValidatedResult,
} from "./contracts";
import { agentCapabilityError, agentFailure, agentSuccess } from "./errors";
import {
  buildDissentRecordInputSchema,
  buildDissentRecordProjectionSchema,
  buildDissentRecordValidatedResultSchema,
  buildInitialPortraitRecordInputSchema,
  buildInitialPortraitRecordValidatedResultSchema,
  retrieveVerifiedEvidenceInputSchema,
  retrieveVerifiedEvidenceValidatedResultSchema,
} from "./schemas";
import { contentBindingsEqual, unexpectedIdentifiers } from "./validation/bindings";
import { validateAgentTextSafety } from "./validation/safety";
import {
  AGENT_CONTRACT_VERSION,
  AGENT_RESULT_SCHEMA_VERSIONS,
} from "./versions";

const VALIDATED = Object.freeze({
  schemaValidated: true,
  bindingValidated: true,
  safetyValidated: true,
} as const);

export function retrieveVerifiedEvidence(
  rawInput: RetrieveVerifiedEvidenceInput,
  gatedContent: GatedContentAccess,
): AgentOperationResult<RetrieveVerifiedEvidenceValidatedResult> {
  const parsed = retrieveVerifiedEvidenceInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return agentFailure(
      agentCapabilityError(
        "retrieveVerifiedEvidence",
        "schema_validation_failed",
        "retrieveVerifiedEvidence input failed Schema validation",
      ),
    );
  }
  const input = parsed.data;
  const { access, evaluation } = gatedContent;
  if (evaluation.status !== "passed") {
    return agentFailure(
      agentCapabilityError(
        "retrieveVerifiedEvidence",
        "content_gate_not_passed",
        "Verified evidence requires a passed Stage 2 ContentGateEvaluation",
      ),
    );
  }
  if (access.contentMode !== "verified") {
    return agentFailure(
      agentCapabilityError(
        "retrieveVerifiedEvidence",
        "content_mode_not_verified",
        "Verified evidence is unavailable in placeholder content mode",
      ),
    );
  }
  if (
    !contentBindingsEqual(input.contentBinding, access.binding) ||
    evaluation.contentBundleId !== access.binding.contentBundleId ||
    evaluation.contentBundleVersion !== access.binding.contentBundleVersion ||
    evaluation.checksum !== access.binding.contentBundleChecksum ||
    evaluation.contentSchemaVersion !== access.binding.contentSchemaVersion
  ) {
    return agentFailure(
      agentCapabilityError(
        "retrieveVerifiedEvidence",
        "content_version_mismatch",
        "The requested content binding does not match the validated content access",
      ),
    );
  }

  try {
    const evidenceCard = access.getDomainEvidenceCard(input.evidenceCardId);
    const outsideCard = unexpectedIdentifiers(
      input.evidenceIds,
      evidenceCard.verifiedFactIds,
    );
    if (outsideCard.length > 0) {
      return agentFailure(
        agentCapabilityError(
          "retrieveVerifiedEvidence",
          "evidence_not_allowed",
          "Requested facts are not whitelisted by the selected evidence card",
        ),
      );
    }
    const facts = access.getVerifiedFactsByIds(input.evidenceIds);
    if (
      facts.length !== input.evidenceIds.length ||
      facts.some((fact) => fact.verifiedByHuman !== true)
    ) {
      return agentFailure(
        agentCapabilityError(
          "retrieveVerifiedEvidence",
          "content_not_found",
          "The verified fact set could not be resolved exactly",
        ),
      );
    }
    return agentSuccess(
      retrieveVerifiedEvidenceValidatedResultSchema.parse({
        capability: "retrieveVerifiedEvidence",
        agentContractVersion: AGENT_CONTRACT_VERSION,
        resultSchemaVersion:
          AGENT_RESULT_SCHEMA_VERSIONS.retrieveVerifiedEvidence,
        validationResult: VALIDATED,
        contentBinding: input.contentBinding,
        evidenceCard,
        evidenceIds: input.evidenceIds,
        facts,
      }),
    );
  } catch {
    return agentFailure(
      agentCapabilityError(
        "retrieveVerifiedEvidence",
        "content_not_found",
        "The requested evidence card or verified fact was not found",
      ),
    );
  }
}

export function buildInitialPortraitRecord(
  rawInput: BuildInitialPortraitRecordInput,
): AgentOperationResult<BuildInitialPortraitRecordValidatedResult> {
  const parsed = buildInitialPortraitRecordInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return agentFailure(
      agentCapabilityError(
        "buildInitialPortraitRecord",
        "schema_validation_failed",
        "buildInitialPortraitRecord input failed Schema validation",
      ),
    );
  }
  const initialRecord = initialPortraitRecordSchema.parse(parsed.data);
  return agentSuccess(
    buildInitialPortraitRecordValidatedResultSchema.parse({
      capability: "buildInitialPortraitRecord",
      agentContractVersion: AGENT_CONTRACT_VERSION,
      resultSchemaVersion:
        AGENT_RESULT_SCHEMA_VERSIONS.buildInitialPortraitRecord,
      validationResult: VALIDATED,
      initialRecord,
    }),
  );
}

export function buildDissentRecord(
  rawInput: BuildDissentRecordInput,
  rawProjection: BuildDissentRecordProjection,
): AgentOperationResult<BuildDissentRecordValidatedResult> {
  const parsed = buildDissentRecordInputSchema.safeParse(rawInput);
  const projection = buildDissentRecordProjectionSchema.safeParse(rawProjection);
  if (!parsed.success || !projection.success) {
    return agentFailure(
      agentCapabilityError(
        "buildDissentRecord",
        "schema_validation_failed",
        "buildDissentRecord input failed Schema validation",
      ),
    );
  }
  const input = parsed.data;
  if (
    input.charliePosition.roundId !== input.roundId ||
    input.userPrinciple.roundId !== input.roundId
  ) {
    return agentFailure(
      agentCapabilityError(
        "buildDissentRecord",
        "invalid_output",
        "Dissent inputs must belong to the same round",
      ),
    );
  }
  const safety = validateAgentTextSafety(
    [input.focus],
    projection.data.safetyPolicy,
  );
  if (!safety.safe) {
    return agentFailure(
      agentCapabilityError(
        "buildDissentRecord",
        "safety_validation_failed",
        safety.reason,
      ),
    );
  }
  const dissentRecord = dissentRecordSchema.parse({
    id: projection.data.dissentRecordId,
    roundId: input.roundId,
    charliePositionId: input.charliePosition.id,
    userPrincipleId: input.userPrinciple.id,
    focus: input.focus,
    status: input.status,
  });
  return agentSuccess(
    buildDissentRecordValidatedResultSchema.parse({
      capability: "buildDissentRecord",
      agentContractVersion: AGENT_CONTRACT_VERSION,
      resultSchemaVersion: AGENT_RESULT_SCHEMA_VERSIONS.buildDissentRecord,
      validationResult: VALIDATED,
      dissentRecord,
    }),
  );
}

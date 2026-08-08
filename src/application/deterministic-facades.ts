import {
  AGENT_CONTRACT_VERSION,
  AGENT_RESULT_SCHEMA_VERSIONS,
  buildDissentRecord,
  buildInitialPortraitRecord,
  retrieveVerifiedEvidence,
  type AgentSafetyPolicy,
  type BuildDissentRecordInput,
  type BuildInitialPortraitRecordInput,
  type RetrieveVerifiedEvidenceInput,
} from "../agent";
import { computePortraitShift } from "../domain";
import type { RequestContext } from "../runtime";
import { deriveStage3EntityId } from "./entity-id";
import {
  SYSTEM_APPLICATION_CLOCK,
  parseRequestContext,
} from "./orchestration-common";
import type { ApplicationClock } from "./orchestration.contracts";
import { recordCapabilityExecutionReceipt } from "./receipts";
import { APPLICATION_ORCHESTRATION_CONTRACT_VERSION } from "./schemas";
import {
  stage3RequestFingerprintMatches,
  stage3SemanticMaterial,
} from "./semantic-input";

export async function executeRetrieveVerifiedEvidence(input: {
  context: RequestContext;
  request: RetrieveVerifiedEvidenceInput;
  gatedContent: Parameters<typeof retrieveVerifiedEvidence>[1];
  clock?: ApplicationClock;
}) {
  const trustedContext = parseRequestContext(input.context);
  requireContentBinding(
    trustedContext.bindings.content,
    input.request.contentBinding,
  );
  await requireDeterministicFingerprint({
    context: input.context,
    semanticMaterial: buildRetrieveVerifiedEvidenceSemanticMaterial(input),
    agentContractVersion: AGENT_CONTRACT_VERSION,
    resultSchemaVersion: AGENT_RESULT_SCHEMA_VERSIONS.retrieveVerifiedEvidence,
  });
  return executeAgentDeterministic({
    context: input.context,
    expectedCapability: "retrieveVerifiedEvidence",
    resultSchemaVersion:
      AGENT_RESULT_SCHEMA_VERSIONS.retrieveVerifiedEvidence,
    clock: input.clock,
    execute: () => retrieveVerifiedEvidence(input.request, input.gatedContent),
  });
}

export async function executeBuildInitialPortraitRecord(input: {
  context: RequestContext;
  request: BuildInitialPortraitRecordInput;
  clock?: ApplicationClock;
}) {
  await requireDeterministicFingerprint({
    context: input.context,
    semanticMaterial: buildInitialPortraitRecordSemanticMaterial(input.request),
    agentContractVersion: AGENT_CONTRACT_VERSION,
    resultSchemaVersion: AGENT_RESULT_SCHEMA_VERSIONS.buildInitialPortraitRecord,
  });
  return executeAgentDeterministic({
    context: input.context,
    expectedCapability: "buildInitialPortraitRecord",
    resultSchemaVersion:
      AGENT_RESULT_SCHEMA_VERSIONS.buildInitialPortraitRecord,
    clock: input.clock,
    execute: () => buildInitialPortraitRecord(input.request),
  });
}

export async function executeBuildDissentRecord(input: {
  context: RequestContext;
  request: BuildDissentRecordInput;
  safetyPolicy: AgentSafetyPolicy;
  clock?: ApplicationClock;
}) {
  const trustedContext = parseRequestContext(input.context);
  await requireDeterministicFingerprint({
    context: input.context,
    semanticMaterial: buildDissentRecordSemanticMaterial({
      request: input.request,
      safetyPolicy: input.safetyPolicy,
    }),
    agentContractVersion: AGENT_CONTRACT_VERSION,
    resultSchemaVersion: AGENT_RESULT_SCHEMA_VERSIONS.buildDissentRecord,
  });
  return executeAgentDeterministic({
    context: input.context,
    expectedCapability: "buildDissentRecord",
    resultSchemaVersion: AGENT_RESULT_SCHEMA_VERSIONS.buildDissentRecord,
    clock: input.clock,
    execute: () =>
      buildDissentRecord(input.request, {
        dissentRecordId: deriveStage3EntityId({
          operationId: trustedContext.operationId,
          entityKind: "dissent_record",
          ordinal: 0,
        }),
        safetyPolicy: input.safetyPolicy,
      }),
  });
}

export async function executeComputePortraitShift(input: {
  context: RequestContext;
  request: Parameters<typeof computePortraitShift>[0];
  clock?: ApplicationClock;
}) {
  const trustedContext = requireCapability(
    input.context,
    "computePortraitShift",
  );
  const currentRevisionIds = new Set(
    [
      trustedContext.bindings.revisions.preciseRevisionId,
      trustedContext.bindings.revisions.plainRevisionId,
    ].filter((revisionId): revisionId is string => revisionId !== null),
  );
  if (
    (input.request.relatedRevisionIds ?? []).some(
      (revisionId) => !currentRevisionIds.has(revisionId),
    )
  ) {
    throw new TypeError(
      "computePortraitShift related revisions must match its RequestContext",
    );
  }
  await requireDeterministicFingerprint({
    context: input.context,
    semanticMaterial: buildComputePortraitShiftSemanticMaterial(input.request),
    agentContractVersion: null,
    resultSchemaVersion: APPLICATION_ORCHESTRATION_CONTRACT_VERSION,
  });
  const clock = input.clock ?? SYSTEM_APPLICATION_CLOCK;
  const startedAt = clock.now();
  const result = computePortraitShift(input.request);
  const completedAt = clock.now();
  const receipt = recordCapabilityExecutionReceipt({
    context: input.context,
    resolvedMode: "deterministic",
    outcome: "succeeded",
    fallbackReason: null,
    resultSchemaVersion: APPLICATION_ORCHESTRATION_CONTRACT_VERSION,
    startedAt,
    completedAt,
  });
  return Object.freeze({ result, receipt });
}

export function buildRetrieveVerifiedEvidenceSemanticMaterial(input: {
  request: RetrieveVerifiedEvidenceInput;
  gatedContent: Parameters<typeof retrieveVerifiedEvidence>[1];
}) {
  const { access, evaluation } = input.gatedContent;
  return stage3SemanticMaterial("deterministic_retrieve_verified_evidence", {
    request: input.request,
    gatedContentBoundary: {
      contentMode: access.contentMode,
      binding: access.binding,
      evaluation: {
        status: evaluation.status,
        contentBundleId: evaluation.contentBundleId ?? null,
        contentBundleVersion: evaluation.contentBundleVersion ?? null,
        contentSchemaVersion: evaluation.contentSchemaVersion ?? null,
        checksum: evaluation.checksum ?? null,
      },
    },
  });
}

export function buildInitialPortraitRecordSemanticMaterial(
  request: BuildInitialPortraitRecordInput,
) {
  return stage3SemanticMaterial(
    "deterministic_build_initial_portrait_record",
    { request },
  );
}

export function buildDissentRecordSemanticMaterial(input: {
  request: BuildDissentRecordInput;
  safetyPolicy: AgentSafetyPolicy;
}) {
  return stage3SemanticMaterial("deterministic_build_dissent_record", input);
}

export function buildComputePortraitShiftSemanticMaterial(
  request: Parameters<typeof computePortraitShift>[0],
) {
  return stage3SemanticMaterial("deterministic_compute_portrait_shift", {
    request,
  });
}

async function requireDeterministicFingerprint(input: {
  context: RequestContext;
  semanticMaterial: unknown;
  agentContractVersion: string | null;
  resultSchemaVersion: string;
}): Promise<void> {
  if (!(await stage3RequestFingerprintMatches(input))) {
    throw new TypeError(
      "Deterministic facade RequestContext fingerprint does not match its canonical semantic input",
    );
  }
}

function requireContentBinding(
  contextBinding: ReturnType<typeof parseRequestContext>["bindings"]["content"],
  requestBinding: RetrieveVerifiedEvidenceInput["contentBinding"],
): void {
  if (
    contextBinding.contentBundleId !== requestBinding.contentBundleId ||
    contextBinding.contentBundleVersion !== requestBinding.contentBundleVersion ||
    contextBinding.contentBundleChecksum !== requestBinding.contentBundleChecksum
  ) {
    throw new TypeError(
      "retrieveVerifiedEvidence content binding must match its RequestContext",
    );
  }
}

function executeAgentDeterministic<T>(input: {
  context: RequestContext;
  expectedCapability: RequestContext["capability"];
  resultSchemaVersion: string;
  clock?: ApplicationClock;
  execute: () => Readonly<
    | { ok: true; value: T }
    | {
        ok: false;
        error: Readonly<{ code: string }>;
      }
  >;
}) {
  requireCapability(input.context, input.expectedCapability);
  const clock = input.clock ?? SYSTEM_APPLICATION_CLOCK;
  const startedAt = clock.now();
  const result = input.execute();
  const completedAt = clock.now();
  const receipt = recordCapabilityExecutionReceipt({
    context: input.context,
    resolvedMode: result.ok ? "deterministic" : "unavailable",
    outcome: result.ok ? "succeeded" : "failed",
    fallbackReason: result.ok ? null : result.error.code,
    resultSchemaVersion: input.resultSchemaVersion,
    agentContractVersion: AGENT_CONTRACT_VERSION,
    startedAt,
    completedAt,
  });
  return Object.freeze({ result, receipt });
}

function requireCapability(
  context: RequestContext,
  expectedCapability: RequestContext["capability"],
): ReturnType<typeof parseRequestContext> {
  const parsed = parseRequestContext(context);
  if (parsed.capability !== expectedCapability) {
    throw new TypeError(
      `Deterministic facade requires capability ${expectedCapability}`,
    );
  }
  return parsed;
}

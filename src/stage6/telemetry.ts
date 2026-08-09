import type { AgentExecutionObservation } from "../agent";
import type { ResolvedExecutionMode } from "../runtime";
import { STAGE6_TELEMETRY_VERSION } from "./versions";

export type Stage6TelemetryInput = Readonly<{
  requestId: string;
  operationId: string;
  stageInstanceId: string;
  inputFingerprintDigest: string;
  capability: string;
  requestedMode: "mock" | "live";
  resolvedMode: ResolvedExecutionMode;
  fallbackReason: string | null;
  resultType: string;
  schemaValidationStatus: "passed" | "failed" | "not_run";
  safetyValidationStatus: "passed" | "failed" | "not_run";
  promptVersion: string | null;
  adapterVersion: string | null;
  resultSchemaVersion: string;
  contentBundleVersion: string | null;
  observation?: AgentExecutionObservation;
}>;

export function projectStage6Telemetry(input: Stage6TelemetryInput) {
  return Object.freeze({
    telemetryVersion: STAGE6_TELEMETRY_VERSION,
    requestId: input.requestId,
    operationId: input.operationId,
    stageInstanceId: input.stageInstanceId,
    inputFingerprintDigest: input.inputFingerprintDigest,
    capability: input.capability,
    requestedMode: input.requestedMode,
    resolvedMode: input.resolvedMode,
    fallbackReason: input.fallbackReason,
    resultType: input.resultType,
    schemaValidationStatus: input.schemaValidationStatus,
    safetyValidationStatus: input.safetyValidationStatus,
    promptVersion: input.promptVersion,
    adapterVersion: input.adapterVersion,
    resultSchemaVersion: input.resultSchemaVersion,
    contentBundleVersion: input.contentBundleVersion,
    provider: input.observation?.provider ?? null,
    modelName: input.observation?.modelName ?? null,
    networkRetries: input.observation?.networkRetries ?? 0,
    structuredRepairs: input.observation?.structuredRepairs ?? 0,
    inputTokens: input.observation?.inputTokens ?? 0,
    outputTokens: input.observation?.outputTokens ?? 0,
    latencyMs: input.observation?.latencyMs ?? 0,
    estimatedCostUsdMicros: input.observation?.estimatedCostUsdMicros ?? 0,
  });
}

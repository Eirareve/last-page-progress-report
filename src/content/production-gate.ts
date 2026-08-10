import type { ContentGateEvaluation } from "./contracts";
import { createBundledContentLoader } from "./bundled-content-source";
import { computePublicContentBundleChecksum } from "./checksum";
import type { ContentAccess } from "./content-access";
import { deepFreeze } from "./deep-freeze";
import { resolveContentEnvironment } from "./environment";
import { evaluateContentGate } from "./evaluate-content-gate";

export type ContentGateEntrypoint = "build_time" | "first_request";
export type GatedContentAccess = Readonly<{
  evaluation: ContentGateEvaluation;
  access: ContentAccess;
}>;

export class ContentGateRejectedError extends Error {
  readonly code = "content_gate_rejected";
  readonly evaluation: ContentGateEvaluation;

  constructor(evaluation: ContentGateEvaluation) {
    super(`Content gate rejected: ${evaluation.failureCodes.join(", ")}`);
    this.name = "ContentGateRejectedError";
    this.evaluation = evaluation;
  }
}

export async function loadConfiguredGatedContent(
  entrypoint: ContentGateEntrypoint,
  processEnvironment: Readonly<Record<string, string | undefined>> = process.env,
  evaluatedAt = new Date().toISOString(),
): Promise<GatedContentAccess> {
  const environment = resolveContentEnvironment(processEnvironment);
  const loaded = await createBundledContentLoader().load(environment.contentMode);
  const computedContentBundleChecksum =
    await computePublicContentBundleChecksum(loaded.bundle);
  const evaluation = evaluateContentGate({
    evaluationId: [
      "content-gate",
      entrypoint,
      loaded.bundle.contentBundleId,
      loaded.bundle.contentBundleVersion,
    ].join(":"),
    evaluatedAt,
    targetEnvironment: environment.appEnvironment,
    contentMode: environment.contentMode,
    agentMode: environment.agentMode,
    contentBundleId: loaded.bundle.contentBundleId,
    contentBundleVersion: loaded.bundle.contentBundleVersion,
    contentSchemaVersion: loaded.bundle.contentSchemaVersion,
    contentBundleChecksum: loaded.bundle.contentBundleChecksum,
    computedContentBundleChecksum,
    approvalStatus: loaded.bundle.approvalStatus,
    containsPlaceholderContent: loaded.bundle.containsPlaceholderContent,
  });

  if (evaluation.status === "failed") {
    throw new ContentGateRejectedError(evaluation);
  }
  return deepFreeze({ evaluation, access: loaded.access });
}

export async function runConfiguredContentGate(
  entrypoint: ContentGateEntrypoint,
  processEnvironment: Readonly<Record<string, string | undefined>> = process.env,
  evaluatedAt = new Date().toISOString(),
): Promise<ContentGateEvaluation> {
  return (
    await loadConfiguredGatedContent(
      entrypoint,
      processEnvironment,
      evaluatedAt,
    )
  ).evaluation;
}

export async function assertBuildTimeContentGate(
  processEnvironment: Readonly<Record<string, string | undefined>> = process.env,
): Promise<ContentGateEvaluation> {
  return runConfiguredContentGate("build_time", processEnvironment);
}

let firstRequestGatedContent: Promise<GatedContentAccess> | null = null;
let firstRequestGate: Promise<ContentGateEvaluation> | null = null;

export function getFirstRequestGatedContent(): Promise<GatedContentAccess> {
  firstRequestGatedContent ??= loadConfiguredGatedContent("first_request");
  return firstRequestGatedContent;
}

export function assertFirstRequestContentGate(): Promise<ContentGateEvaluation> {
  firstRequestGate ??= getFirstRequestGatedContent().then(
    (gatedContent) => gatedContent.evaluation,
  );
  return firstRequestGate;
}

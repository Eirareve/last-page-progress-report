import { canonicalizeJson } from "../content/canonical-json";
import type {
  AgentEvidenceContext,
  AgentSafetyPolicy,
  PlainSemanticReviewPortInput,
  RoundAnalysisPortInput,
  SummarizePortraitShiftInput,
} from "../agent";
import type {
  CharlieSignatureReviewInput,
  CharlieSignatureReviewSafetyPolicy,
  ResolvedFinalReviewEvidenceContext,
} from "../final-review";
import {
  computeInputFingerprint,
  type RequestContext,
  type RuntimeSha256Digest,
} from "../runtime";

export const STAGE3_SEMANTIC_INPUT_MATERIAL_VERSION = "0.1.0" as const;

/** RFC 8785/JCS-style canonical JSON + NFC + SHA-256. */
export async function computeStage3SemanticInputDigest(
  material: unknown,
): Promise<RuntimeSha256Digest> {
  const canonical = canonicalizeJson(material);
  const digest = await globalThis.crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(canonical),
  );
  const hexadecimal = Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  return `sha256:${hexadecimal}`;
}

export async function computeStage3RequestFingerprint(input: {
  context: RequestContext;
  semanticMaterial: unknown;
  agentContractVersion: string | null;
  resultSchemaVersion: string;
}): Promise<RuntimeSha256Digest> {
  const semanticInputDigest = await computeStage3SemanticInputDigest(
    input.semanticMaterial,
  );
  return computeInputFingerprint({
    capability: input.context.capability,
    requestedMode: input.context.requestedMode,
    bindings: input.context.bindings,
    agentContractVersion: input.agentContractVersion,
    resultSchemaVersion: input.resultSchemaVersion,
    semanticInputDigest,
  });
}

export async function stage3RequestFingerprintMatches(input: {
  context: RequestContext;
  semanticMaterial: unknown;
  agentContractVersion: string | null;
  resultSchemaVersion: string;
}): Promise<boolean> {
  return (
    input.context.inputFingerprint ===
    (await computeStage3RequestFingerprint(input))
  );
}

export function stage3SemanticMaterial(
  materialKind: string,
  businessMaterial: unknown,
) {
  return {
    stage3SemanticInputMaterialVersion:
      STAGE3_SEMANTIC_INPUT_MATERIAL_VERSION,
    materialKind,
    businessMaterial,
  } as const;
}

export function buildRoundAnalysisSemanticMaterials(input: {
  portInput: RoundAnalysisPortInput;
  safetyPolicy: AgentSafetyPolicy;
}) {
  const shared = {
    contentBinding: input.portInput.contentBinding,
    revisions: input.portInput.revisions,
    safetyPolicy: input.safetyPolicy,
  } as const;
  return Object.freeze({
    operation: stage3SemanticMaterial("round_analysis_operation", {
      ...shared,
      portInput: input.portInput,
    }),
    extractUserPrinciple: stage3SemanticMaterial(
      "round_extract_user_principle",
      { ...shared, input: input.portInput.extractUserPrinciple },
    ),
    detectTension: stage3SemanticMaterial("round_detect_tension", {
      ...shared,
      input: input.portInput.detectTension,
      dependsOn: ["extractUserPrinciple"],
    }),
    generateCharlieResponse: stage3SemanticMaterial(
      "round_generate_charlie_response",
      {
        ...shared,
        input: input.portInput.generateCharlieResponse,
        dependsOn: ["extractUserPrinciple", "detectTension"],
      },
    ),
    proposeDocumentDiff: stage3SemanticMaterial("round_propose_document_diff", {
      ...shared,
      input: input.portInput.proposeDocumentDiff,
      dependsOn: ["extractUserPrinciple", "generateCharlieResponse"],
    }),
  });
}

export function buildPlainSemanticInputMaterials(input: {
  portInput: PlainSemanticReviewPortInput;
  safetyPolicy: AgentSafetyPolicy;
}) {
  const businessMaterial = {
    portInput: input.portInput,
    safetyPolicy: input.safetyPolicy,
  } as const;
  return Object.freeze({
    operation: stage3SemanticMaterial(
      "plain_semantic_operation",
      businessMaterial,
    ),
    compareSemanticDrift: stage3SemanticMaterial(
      "plain_compare_semantic_drift",
      businessMaterial,
    ),
  });
}

export function buildPortraitSummaryInputMaterials(input: {
  summaryInput: SummarizePortraitShiftInput;
  evidenceContext: AgentEvidenceContext;
  safetyPolicy: AgentSafetyPolicy;
}) {
  const businessMaterial = {
    summaryInput: input.summaryInput,
    evidenceContext: input.evidenceContext,
    safetyPolicy: input.safetyPolicy,
  } as const;
  return Object.freeze({
    operation: stage3SemanticMaterial(
      "portrait_shift_summary_operation",
      businessMaterial,
    ),
    summarizePortraitShift: stage3SemanticMaterial(
      "portrait_shift_summary_capability",
      businessMaterial,
    ),
  });
}

export function buildFinalReviewInputMaterials(input: {
  reviewInput: CharlieSignatureReviewInput;
  evidenceContext: ResolvedFinalReviewEvidenceContext;
  safetyPolicy: CharlieSignatureReviewSafetyPolicy;
}) {
  const businessMaterial = {
    reviewInput: input.reviewInput,
    evidenceContext: input.evidenceContext,
    safetyPolicy: input.safetyPolicy,
  } as const;
  return Object.freeze({
    operation: stage3SemanticMaterial(
      "charlie_signature_review_operation",
      businessMaterial,
    ),
    reviewCharlieSignature: stage3SemanticMaterial(
      "charlie_signature_review_capability",
      businessMaterial,
    ),
  });
}

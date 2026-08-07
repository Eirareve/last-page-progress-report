import {
  CONTENT_GATE_ATTESTATION_SCHEMA_VERSION,
  CONTENT_GATE_EVALUATION_SCHEMA_VERSION,
  contentGateAttestationSchema,
  contentGateEvaluationSchema,
  type ContentGateAttestation,
  type ContentGateEvaluation,
} from "@/content";
import {
  computePortraitShift,
  portraitPreludeSchema,
  semanticDriftSchema,
  sessionStateSchema,
} from "@/domain";
import {
  finalizationContextSchema,
  type FinalizationContext,
  type FinalizationSessionState,
} from "@/finalization";
import {
  capabilityExecutionReceiptSchema,
  contractVersionVectorSchema,
  type CapabilityExecutionReceipt,
  type ContractVersionVector,
} from "@/provenance";
import {
  activeOperationSchema,
  runtimeStateSchema,
  sessionConfigurationSchema,
  type ActiveOperation,
} from "@/runtime";
import { makeManuscript } from "./domain";

export const FINALIZATION_NOW = "2026-08-06T13:00:00.000Z";
export const CONTENT_GATE_EVALUATED_AT = "2026-08-06T12:58:00.000Z";
export const SHA256_A = `sha256:${"a".repeat(64)}` as const;
export const SHA256_B = `sha256:${"b".repeat(64)}` as const;
export const REQUIRED_CAPABILITY = "retrieveVerifiedEvidence" as const;

export function makeContractVersionVector(
  overrides: Partial<ContractVersionVector> = {},
): ContractVersionVector {
  return contractVersionVectorSchema.parse({
    scopeContractVersion: "0.1.0",
    domainContractVersion: "0.1.0",
    runtimeContractVersion: "0.1.0",
    provenanceContractVersion: "0.1.0",
    namingContractVersion: "0.1.0",
    finalizationContractVersion: "0.1.0",
    stateMachineContractVersion: "0.1.0",
    sessionSchemaVersion: "0.1.0",
    stableTextAnchorSchemaVersion: "0.1.0",
    contentSchemaVersion: "0.1.0",
    agentContractVersion: "0.1.0",
    finalReviewSchemaVersion: "0.1.0",
    finalEnvelopeSchemaVersion: "0.1.0",
    ...overrides,
  });
}

export function makeCapabilityReceipt(
  overrides: Partial<CapabilityExecutionReceipt> = {},
): CapabilityExecutionReceipt {
  return capabilityExecutionReceiptSchema.parse({
    capability: REQUIRED_CAPABILITY,
    operationId: "operation-evidence",
    requestId: "request-evidence",
    requestedMode: "mock",
    resolvedMode: "deterministic",
    outcome: "succeeded",
    fallbackReason: null,
    promptVersion: null,
    adapterVersion: null,
    resultSchemaVersion: "0.1.0",
    agentContractVersion: "0.1.0",
    inputFingerprintDigest: SHA256_A,
    startedAt: "2026-08-06T12:55:00.000Z",
    completedAt: "2026-08-06T12:55:01.000Z",
    durationMs: 1,
    resultDigest: SHA256_B,
    ...overrides,
  });
}

export function makeContentGateEvaluation(
  overrides: Partial<ContentGateEvaluation> = {},
): ContentGateEvaluation {
  return contentGateEvaluationSchema.parse({
    contentGateEvaluationSchemaVersion:
      CONTENT_GATE_EVALUATION_SCHEMA_VERSION,
    evaluationId: "content-evaluation-1",
    contentBundleId: "content-bundle-1",
    contentBundleVersion: "content-bundle-0.1.0",
    checksum: SHA256_A,
    contentSchemaVersion: "0.1.0",
    targetEnvironment: "production",
    status: "passed",
    failureCodes: [],
    evaluatedAt: CONTENT_GATE_EVALUATED_AT,
    ...overrides,
  });
}

export function makeContentGateAttestation(
  evaluation: ContentGateEvaluation = makeContentGateEvaluation(),
  bindingOverrides: Partial<
    ContentGateAttestation["evaluationBinding"]
  > = {},
): ContentGateAttestation {
  if (evaluation.status !== "passed") {
    throw new TypeError("Only a passed evaluation can be attested");
  }
  return contentGateAttestationSchema.parse({
    contentGateAttestationSchemaVersion:
      CONTENT_GATE_ATTESTATION_SCHEMA_VERSION,
    attestationId: "content-attestation-1",
    evaluationBinding: {
      contentGateEvaluationSchemaVersion:
        evaluation.contentGateEvaluationSchemaVersion,
      evaluationId: evaluation.evaluationId,
      contentBundleId: evaluation.contentBundleId,
      contentBundleVersion: evaluation.contentBundleVersion,
      checksum: evaluation.checksum,
      contentSchemaVersion: evaluation.contentSchemaVersion,
      targetEnvironment: evaluation.targetEnvironment,
      status: evaluation.status,
      failureCodes: [],
      evaluatedAt: evaluation.evaluatedAt,
      ...bindingOverrides,
    },
    attestationMethod: "public_key_signature",
    algorithm: "Ed25519",
    keyId: "content-key-1",
    proof: "verified-content-proof",
    issuedAt: "2026-08-06T12:59:00.000Z",
    verifiedAt: FINALIZATION_NOW,
    verificationStatus: "verified",
  });
}

export function makeFinalizationContext(
  overrides: Partial<FinalizationContext> = {},
): FinalizationContext {
  return finalizationContextSchema.parse({
    targetEnvironment: "production",
    contentGateEvaluation: makeContentGateEvaluation(),
    requiresContentGateAttestation: false,
    contentGateAttestation: null,
    requiredCapabilityReceipts: [REQUIRED_CAPABILITY],
    ...overrides,
  });
}

export function makeActiveOperation(): ActiveOperation {
  return activeOperationSchema.parse({
    operationId: "operation-active",
    requestId: "request-active",
    capability: REQUIRED_CAPABILITY,
    stage: "FINAL_DISPOSITION",
    stageInstanceId: "stage-instance-final-disposition",
    inputFingerprint: SHA256_A,
    bindings: {
      revisions: {
        preciseRevisionId: "precise-r1",
        plainRevisionId: "plain-r1",
      },
      content: {
        contentBundleId: "content-bundle-1",
        contentBundleVersion: "content-bundle-0.1.0",
        contentBundleChecksum: SHA256_A,
      },
    },
    attempt: 1,
    status: "running",
    startedAt: FINALIZATION_NOW,
  });
}

export function makeFinalizableState(): FinalizationSessionState {
  const configuration = sessionConfigurationSchema.parse({
    requestedAgentMode: "mock",
  });
  const runtime = runtimeStateSchema.parse({
    stageInstanceId: "stage-instance-final-disposition",
    activeOperation: null,
  });
  const provenance = {
    contractVersionVector: makeContractVersionVector(),
    capabilityExecutionReceipts: [makeCapabilityReceipt()],
  };
  const portraits = portraitPreludeSchema.parse({
    initialRecord: {
      descriptors: {
        early: ["trusting"],
        peak: ["isolated"],
        futureFacing: ["reflective"],
      },
      initialChoice: "peak",
      initialReason: "The middle portrait initially felt most representative.",
    },
    finalChoice: "all_three",
    finalReason: null,
    comparison: computePortraitShift({
      initialChoice: "peak",
      finalChoice: "all_three",
      relatedEvidenceIds: ["evidence-1"],
      relatedRevisionIds: ["precise-r1", "plain-r1"],
    }),
  });
  const semanticDrift = semanticDriftSchema.parse({
    preciseRevisionId: "precise-r1",
    plainRevisionId: "plain-r1",
    analysisVersion: "semantic-analysis-0.1.0",
    status: "current",
    preserved: ["past and future both matter"],
    lost: [],
    ambiguities: [],
    consequences: [],
    fragmentIds: [],
  });

  const base = sessionStateSchema.parse({
    sessionSchemaVersion: "0.1.0",
    sessionId: "session-finalizable",
    stateRevision: 12,
    lifecycleStatus: "in_progress",
    stage: "FINAL_DISPOSITION",
    stageInstanceId: "stage-instance-final-disposition",
    createdAt: "2026-08-06T12:00:00.000Z",
    updatedAt: FINALIZATION_NOW,
    expiresAt: "2026-08-07T13:00:00.000Z",
    completedAt: null,
    contentBinding: {
      contentBundleId: "content-bundle-1",
      contentBundleVersion: "content-bundle-0.1.0",
      contentBundleChecksum: SHA256_A,
      contentSchemaVersion: "0.1.0",
      targetEnvironment: "production",
    },
    configuration,
    runtime,
    provenance,
    portraitDescriptors: [
      { id: "portrait-early", stage: "early", label: "Early Charlie" },
      { id: "portrait-peak", stage: "peak", label: "Peak Charlie" },
      {
        id: "portrait-future-facing",
        stage: "futureFacing",
        label: "Future-facing Charlie",
      },
    ],
    portraits,
    manuscript: makeManuscript(),
    rounds: {
      round1: { responseSubmitted: true, clarificationCount: 0, completed: true },
      round2: { responseSubmitted: true, clarificationCount: 1, completed: true },
      round3: { responseSubmitted: true, clarificationCount: 0, completed: true },
    },
    userPrinciples: [],
    charliePositions: [],
    charlieResponses: [],
    openDissents: [],
    evidenceUsed: [],
    contentItemsUsed: [],
    semanticDrift,
    semanticPlacementBatch: null,
    semanticFragments: [],
    semanticRestorationProposals: [],
    bouquet: [],
    currentCharlieSignatureStatus: "not_requested",
    currentCharlieSignatureReview: null,
    signatureReviewAttemptState: null,
    signatureReviewCheckpoint: null,
    futureCharlieSignatureStatus: "blank",
    finalDisposition: "unfinished",
    portraitShiftSummary:
      "The final selection includes all three stages without judging the user.",
    finalEnvelope: null,
  });

  return {
    ...base,
    configuration,
    runtime,
    provenance,
    finalEnvelope: null,
  };
}

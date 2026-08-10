import { describe, expect, it, vi } from "vitest";

import {
  APPLICATION_ORCHESTRATION_CONTRACT_VERSION,
  buildComputePortraitShiftSemanticMaterial,
  buildConditionalRequiredCapabilityInventory,
  buildDissentRecordSemanticMaterial,
  buildInitialPortraitRecordSemanticMaterial,
  buildRetrieveVerifiedEvidenceSemanticMaterial,
  computeStage3RequestFingerprint,
  deriveStage3EntityId,
  executeBuildDissentRecord,
  executeBuildInitialPortraitRecord,
  executeComputePortraitShift,
  executeRetrieveVerifiedEvidence,
  projectStage3ContractVersions,
  recordApplicationDeterministicCapabilityReceipt,
  recordCapabilityExecutionReceipt,
  recordDeterministicCapabilityReceipt,
  runIdempotentApplicationTransition,
} from "@/application";
import {
  AGENT_CONTRACT_VERSION,
  AGENT_RESULT_SCHEMA_VERSIONS,
} from "@/agent";
import {
  AGENT_TEST_VALIDATION_CONTEXT,
  makeDissentInput,
  makeInitialPortraitInput,
} from "../fixtures/agent";
import {
  APPLICATION_COMPLETED_AT,
  APPLICATION_DIGEST_A,
  APPLICATION_STARTED_AT,
  makeApplicationRequestContext,
  makeSequenceClock,
} from "../fixtures/application";
import { makeContractVersionVector } from "../fixtures/runtime";

describe("Stage 3 entity identity", () => {
  it("derives the approved versioned ID without widening Runtime ID kinds", () => {
    expect(
      deriveStage3EntityId({
        operationId: "operation/one?mode=mock",
        entityKind: "user_principle",
        ordinal: 0,
      }),
    ).toBe("stage3:v1:user_principle:0:operation%2Fone%3Fmode%3Dmock");
  });

  it("rejects a negative, fractional, or unsafe ordinal", () => {
    for (const ordinal of [-1, 0.5, Number.MAX_SAFE_INTEGER + 1]) {
      expect(() =>
        deriveStage3EntityId({
          operationId: "operation-1",
          entityKind: "document_diff",
          ordinal,
        }),
      ).toThrow(/zero-based safe integer/);
    }
  });

  it("derives a dissent ID inside the application trust boundary", async () => {
    const request = makeDissentInput();
    const safetyPolicy = AGENT_TEST_VALIDATION_CONTEXT.safetyPolicy;
    const context = await makeDeterministicContext({
      capability: "buildDissentRecord",
      contextOverrides: {
        operationId: "operation/one",
      },
      semanticMaterial: buildDissentRecordSemanticMaterial({
        request,
        safetyPolicy,
      }),
      agentContractVersion: AGENT_CONTRACT_VERSION,
      resultSchemaVersion: AGENT_RESULT_SCHEMA_VERSIONS.buildDissentRecord,
    });
    const outcome = await executeBuildDissentRecord({
      context,
      request,
      safetyPolicy,
      clock: makeSequenceClock(
        APPLICATION_STARTED_AT,
        APPLICATION_COMPLETED_AT,
      ),
    });

    expect(outcome.result.ok).toBe(true);
    if (!outcome.result.ok) return;
    expect(outcome.result.value.dissentRecord.id).toBe(
      "stage3:v1:dissent_record:0:operation%2Fone",
    );
    expect(outcome.receipt).toMatchObject({
      capability: "buildDissentRecord",
      outcome: "succeeded",
      resolvedMode: "deterministic",
      agentContractVersion: AGENT_CONTRACT_VERSION,
    });
  });
});

describe("Deterministic application facades", () => {
  it("returns Agent and application-owned deterministic results with receipts", async () => {
    const portraitRequest = makeInitialPortraitInput();
    const portraitContext = await makeDeterministicContext({
      capability: "buildInitialPortraitRecord",
      semanticMaterial:
        buildInitialPortraitRecordSemanticMaterial(portraitRequest),
      agentContractVersion: AGENT_CONTRACT_VERSION,
      resultSchemaVersion:
        AGENT_RESULT_SCHEMA_VERSIONS.buildInitialPortraitRecord,
    });
    const portrait = await executeBuildInitialPortraitRecord({
      context: portraitContext,
      request: portraitRequest,
      clock: makeSequenceClock(
        APPLICATION_STARTED_AT,
        APPLICATION_COMPLETED_AT,
      ),
    });
    expect(portrait.result.ok).toBe(true);
    expect(portrait.receipt).toMatchObject({
      outcome: "succeeded",
      resolvedMode: "deterministic",
      agentContractVersion: AGENT_CONTRACT_VERSION,
    });

    const shiftRequest = {
      initialChoice: "early" as const,
      finalChoice: "all_three" as const,
    };
    const shiftContext = await makeDeterministicContext({
      capability: "computePortraitShift",
      semanticMaterial: buildComputePortraitShiftSemanticMaterial(shiftRequest),
      agentContractVersion: null,
      resultSchemaVersion: APPLICATION_ORCHESTRATION_CONTRACT_VERSION,
    });
    const shift = await executeComputePortraitShift({
      context: shiftContext,
      request: shiftRequest,
      clock: makeSequenceClock(
        APPLICATION_STARTED_AT,
        APPLICATION_COMPLETED_AT,
      ),
    });
    expect(shift.result.changed).toBe(true);
    expect(shift.receipt).not.toHaveProperty("agentContractVersion");
  });

  it("returns an unavailable receipt with a deterministic service failure", async () => {
    const contentBinding = {
      contentBundleId: "placeholder-content",
      contentBundleVersion: "0.1.0",
      contentBundleChecksum: `sha256:${"c".repeat(64)}` as const,
      contentSchemaVersion: "0.1.0",
    };
    const gatedContent = {
      access: {
        contentMode: "placeholder" as const,
        binding: contentBinding,
        evidenceCards: [],
        portraits: [],
      },
      evaluation: { status: "passed" as const },
    } as unknown as Parameters<
      typeof executeRetrieveVerifiedEvidence
    >[0]["gatedContent"];
    const request = {
        contentBinding: {
          contentBundleId: contentBinding.contentBundleId,
          contentBundleVersion: contentBinding.contentBundleVersion,
          contentBundleChecksum: contentBinding.contentBundleChecksum,
        },
        evidenceCardId: "placeholder-card",
        evidenceIds: ["placeholder-fact"],
      };
    const context = await makeDeterministicContext({
      capability: "retrieveVerifiedEvidence",
      contextOverrides: {
        bindings: {
          revisions: {
            preciseRevisionId: "precise-r1",
            plainRevisionId: null,
          },
          content: request.contentBinding,
        },
      },
      semanticMaterial: buildRetrieveVerifiedEvidenceSemanticMaterial({
        request,
        gatedContent,
      }),
      agentContractVersion: AGENT_CONTRACT_VERSION,
      resultSchemaVersion:
        AGENT_RESULT_SCHEMA_VERSIONS.retrieveVerifiedEvidence,
    });
    const outcome = await executeRetrieveVerifiedEvidence({
      context,
      request,
      gatedContent,
      clock: makeSequenceClock(
        APPLICATION_STARTED_AT,
        APPLICATION_COMPLETED_AT,
      ),
    });

    expect(outcome.result).toMatchObject({
      ok: false,
      error: { code: "content_mode_not_verified" },
    });
    expect(outcome.receipt).toMatchObject({
      outcome: "failed",
      resolvedMode: "unavailable",
      fallbackReason: "content_mode_not_verified",
      agentContractVersion: AGENT_CONTRACT_VERSION,
    });
  });

  it("rejects stale deterministic revision bindings and semantic fingerprints", async () => {
    await expect(
      executeComputePortraitShift({
        context: makeApplicationRequestContext("computePortraitShift"),
        request: {
          initialChoice: "early",
          finalChoice: "all_three",
          relatedRevisionIds: ["stale-revision"],
        },
      }),
    ).rejects.toThrow(/related revisions/);
    await expect(
      executeBuildInitialPortraitRecord({
        context: makeApplicationRequestContext("buildInitialPortraitRecord"),
        request: makeInitialPortraitInput(),
      }),
    ).rejects.toThrow(/fingerprint/);
  });
});

describe("Stage 3 ContractVersionVector projection", () => {
  it("fills only the frozen Agent and Final Review axes", () => {
    const existing = makeContractVersionVector({
      agentContractVersion: null,
      finalReviewSchemaVersion: null,
      contentSchemaVersion: "7.4.2",
    });

    const projected = projectStage3ContractVersions(existing);

    expect(projected).toEqual({
      ...existing,
      agentContractVersion: AGENT_CONTRACT_VERSION,
      finalReviewSchemaVersion: "0.1.0",
    });
    expect(projected.contentSchemaVersion).toBe("7.4.2");
    expect(Object.keys(projected)).toEqual(Object.keys(existing));
    expect(Object.isFrozen(projected)).toBe(true);
  });

  it("never overwrites a conflicting historical Stage 3 version", () => {
    expect(() =>
      projectStage3ContractVersions(
        makeContractVersionVector({ agentContractVersion: "0.1.0" }),
      ),
    ).toThrow(/cannot overwrite/);
    expect(() =>
      projectStage3ContractVersions(
        makeContractVersionVector({ agentContractVersion: "9.9.9" }),
      ),
    ).toThrow(/cannot overwrite/);
    expect(() =>
      projectStage3ContractVersions(
        makeContractVersionVector({ finalReviewSchemaVersion: "9.9.9" }),
      ),
    ).toThrow(/cannot overwrite/);
  });
});

describe("Capability receipt recorder", () => {
  it("records trusted context fields and observed duration", () => {
    const receipt = recordCapabilityExecutionReceipt({
      context: makeApplicationRequestContext("extractUserPrinciple"),
      resolvedMode: "mock",
      outcome: "succeeded",
      fallbackReason: "provider_unavailable",
      resultSchemaVersion: "0.1.0",
      agentContractVersion: "0.1.0",
      startedAt: APPLICATION_STARTED_AT,
      completedAt: APPLICATION_COMPLETED_AT,
      resultDigest: APPLICATION_DIGEST_A,
    });

    expect(receipt).toMatchObject({
      capability: "extractUserPrinciple",
      operationId: "operation-application-1",
      requestId: "request-application-1",
      requestedMode: "live",
      resolvedMode: "mock",
      durationMs: 1_250,
      agentContractVersion: "0.1.0",
    });
  });

  it("requires Agent contract version for deterministic Agent capabilities", () => {
    const receipt = recordDeterministicCapabilityReceipt({
      context: makeApplicationRequestContext("buildDissentRecord"),
      agentContractVersion: "0.1.0",
      resultSchemaVersion: "0.1.0",
      startedAt: APPLICATION_STARTED_AT,
      completedAt: APPLICATION_COMPLETED_AT,
    });
    expect(receipt).toMatchObject({
      capability: "buildDissentRecord",
      resolvedMode: "deterministic",
      agentContractVersion: "0.1.0",
    });
  });

  it("keeps application-owned deterministic computation outside Agent versioning", () => {
    const receipt = recordApplicationDeterministicCapabilityReceipt({
      context: makeApplicationRequestContext("computePortraitShift"),
      resultSchemaVersion: "0.1.0",
      startedAt: APPLICATION_STARTED_AT,
      completedAt: APPLICATION_COMPLETED_AT,
    });
    expect(receipt.capability).toBe("computePortraitShift");
    expect(receipt).not.toHaveProperty("agentContractVersion");
  });
});

describe("Path-aware required receipt inventory", () => {
  it("requires verified evidence, dissent, and review only on their paths", () => {
    const full = buildConditionalRequiredCapabilityInventory({
      contentMode: "verified",
      dissentRecordRequired: true,
      signatureReview: "requested",
    });
    expect(full).toContain("retrieveVerifiedEvidence");
    expect(full).toContain("buildDissentRecord");
    expect(full).toContain("computePortraitShift");
    expect(full).toContain("reviewCharlieSignature");
    expect(new Set(full).size).toBe(full.length);
    expect(Object.isFrozen(full)).toBe(true);
  });

  it("does not fabricate receipts for paths that were not executed", () => {
    const minimal = buildConditionalRequiredCapabilityInventory({
      contentMode: "placeholder",
      dissentRecordRequired: false,
      signatureReview: "not_requested",
    });
    expect(minimal).not.toContain("retrieveVerifiedEvidence");
    expect(minimal).not.toContain("buildDissentRecord");
    expect(minimal).not.toContain("reviewCharlieSignature");
    expect(minimal).toContain("computePortraitShift");
  });
});

async function makeDeterministicContext(input: {
  capability: NonNullable<
    Parameters<typeof makeApplicationRequestContext>[0]
  >;
  contextOverrides?: Parameters<typeof makeApplicationRequestContext>[1];
  semanticMaterial: unknown;
  agentContractVersion: string | null;
  resultSchemaVersion: string;
}) {
  const context = makeApplicationRequestContext(
    input.capability,
    input.contextOverrides,
  );
  return makeApplicationRequestContext(input.capability, {
    ...context,
    inputFingerprint: await computeStage3RequestFingerprint({
      context,
      semanticMaterial: input.semanticMaterial,
      agentContractVersion: input.agentContractVersion,
      resultSchemaVersion: input.resultSchemaVersion,
    }),
  });
}

describe("Application idempotency wrapper", () => {
  it("executes a new transition and returns pending plus applied records", async () => {
    const execute = vi.fn(() => ({
      value: "committed",
      appliedRevision: 4,
      appliedAt: APPLICATION_COMPLETED_AT,
    }));
    const result = await runIdempotentApplicationTransition({
      existingRecord: null,
      sessionId: "session-1",
      transitionKey: "accept-round-1",
      inputFingerprint: APPLICATION_DIGEST_A,
      createdAt: APPLICATION_STARTED_AT,
      expiresAt: null,
      execute,
    });

    expect(execute).toHaveBeenCalledOnce();
    expect(result).toMatchObject({
      kind: "executed",
      value: "committed",
      pendingRecord: { status: "pending", appliedRevision: null },
      appliedRecord: { status: "applied", appliedRevision: 4 },
    });
  });

  it("does not rerun an applied transition", async () => {
    const first = await runIdempotentApplicationTransition({
      existingRecord: null,
      sessionId: "session-1",
      transitionKey: "accept-round-1",
      inputFingerprint: APPLICATION_DIGEST_A,
      createdAt: APPLICATION_STARTED_AT,
      expiresAt: null,
      execute: () => ({
        value: "committed",
        appliedRevision: 4,
        appliedAt: APPLICATION_COMPLETED_AT,
      }),
    });
    if (first.kind !== "executed") {
      throw new Error("Expected first execution");
    }
    const replayExecute = vi.fn();
    const replay = await runIdempotentApplicationTransition({
      existingRecord: first.appliedRecord,
      sessionId: "session-1",
      transitionKey: "accept-round-1",
      inputFingerprint: APPLICATION_DIGEST_A,
      createdAt: APPLICATION_STARTED_AT,
      expiresAt: null,
      execute: replayExecute,
    });

    expect(replay).toMatchObject({ kind: "replay" });
    expect(replayExecute).not.toHaveBeenCalled();
  });

  it("returns conflict without calling business code for another fingerprint", async () => {
    const first = await runIdempotentApplicationTransition({
      existingRecord: null,
      sessionId: "session-1",
      transitionKey: "accept-round-1",
      inputFingerprint: APPLICATION_DIGEST_A,
      createdAt: APPLICATION_STARTED_AT,
      expiresAt: null,
      execute: () => ({
        value: "committed",
        appliedRevision: 4,
        appliedAt: APPLICATION_COMPLETED_AT,
      }),
    });
    if (first.kind !== "executed") {
      throw new Error("Expected first execution");
    }
    const execute = vi.fn();
    const conflict = await runIdempotentApplicationTransition({
      existingRecord: first.appliedRecord,
      sessionId: "session-1",
      transitionKey: "accept-round-1",
      inputFingerprint: `sha256:${"c".repeat(64)}`,
      createdAt: APPLICATION_STARTED_AT,
      expiresAt: null,
      execute,
    });

    expect(conflict).toMatchObject({ kind: "conflict" });
    expect(execute).not.toHaveBeenCalled();
  });
});

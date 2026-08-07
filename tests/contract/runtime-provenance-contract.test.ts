import { z } from "zod";
import { describe, expect, it } from "vitest";

import { sessionStateSchema } from "@/domain";
import {
  capabilityExecutionReceiptSchema,
  contractVersionVectorSchema,
  getMissingContractVersionFields,
  hasCompleteContractVersionVector,
} from "@/provenance";
import {
  defineCompleteReadOnlyCompatibilityRegistry,
  defineSessionMigrationRegistry,
  computeInputFingerprint,
  evaluateStateTransitionIdempotency,
  guardOperationResult,
  markStateTransitionApplied,
  recoverSessionState,
  refreshRuntimeState,
  startStateTransitionIdempotencyRecord,
  type OperationResultGuardDecision,
} from "@/runtime";
import {
  COMPLETED_AT,
  DIGEST_A,
  DIGEST_B,
  DIGEST_C,
  STARTED_AT,
  makeActiveOperation,
  makeCapabilityExecutionReceipt,
  makeContractVersionVector,
  makeOperationResult,
} from "../fixtures/runtime";
import { makeFinalizableState } from "../fixtures/finalization";

describe("Runtime operation result guard", () => {
  it("accepts a result only when every operation binding is exact", () => {
    const activeOperation = makeActiveOperation();

    expect(
      guardOperationResult({
        activeOperation,
        currentStage: activeOperation.stage,
        result: makeOperationResult(activeOperation),
      }),
    ).toEqual({ accepted: true });
  });

  it("rejects stale and mismatched results with a precise reason", () => {
    const active = makeActiveOperation();
    const exactResult = makeOperationResult(active);
    const cases: Array<{
      name: string;
      expected: Extract<OperationResultGuardDecision, { accepted: false }>;
      input: Parameters<typeof guardOperationResult>[0];
    }> = [
      {
        name: "no active operation",
        expected: { accepted: false, reason: "no_active_operation" },
        input: {
          activeOperation: null,
          currentStage: active.stage,
          result: exactResult,
        },
      },
      {
        name: "inactive old operation",
        expected: {
          accepted: false,
          reason: "active_operation_not_running",
        },
        input: {
          activeOperation: makeActiveOperation({ status: "cancelled" }),
          currentStage: active.stage,
          result: exactResult,
        },
      },
      {
        name: "current stage",
        expected: { accepted: false, reason: "current_stage_mismatch" },
        input: {
          activeOperation: active,
          currentStage: "ROUND_2_DIFF",
          result: exactResult,
        },
      },
      {
        name: "operation id",
        expected: { accepted: false, reason: "operation_id_mismatch" },
        input: {
          activeOperation: active,
          currentStage: active.stage,
          result: makeOperationResult(active, { operationId: "operation-old" }),
        },
      },
      {
        name: "request id",
        expected: { accepted: false, reason: "request_id_mismatch" },
        input: {
          activeOperation: active,
          currentStage: active.stage,
          result: makeOperationResult(active, { requestId: "request-old" }),
        },
      },
      {
        name: "capability",
        expected: { accepted: false, reason: "capability_mismatch" },
        input: {
          activeOperation: active,
          currentStage: active.stage,
          result: makeOperationResult(active, { capability: "rewritePlain" }),
        },
      },
      {
        name: "result stage",
        expected: { accepted: false, reason: "stage_mismatch" },
        input: {
          activeOperation: active,
          currentStage: active.stage,
          result: makeOperationResult(active, { stage: "ROUND_2_DIFF" }),
        },
      },
      {
        name: "stage instance",
        expected: { accepted: false, reason: "stage_instance_mismatch" },
        input: {
          activeOperation: active,
          currentStage: active.stage,
          result: makeOperationResult(active, {
            stageInstanceId: "stage-instance-old",
          }),
        },
      },
      {
        name: "input fingerprint",
        expected: {
          accepted: false,
          reason: "input_fingerprint_mismatch",
        },
        input: {
          activeOperation: active,
          currentStage: active.stage,
          result: makeOperationResult(active, { inputFingerprint: DIGEST_C }),
        },
      },
      {
        name: "revision binding",
        expected: {
          accepted: false,
          reason: "revision_binding_mismatch",
        },
        input: {
          activeOperation: active,
          currentStage: active.stage,
          result: makeOperationResult(active, {
            bindings: {
              ...active.bindings,
              revisions: {
                ...active.bindings.revisions,
                preciseRevisionId: "precise-r0",
              },
            },
          }),
        },
      },
      {
        name: "content binding",
        expected: {
          accepted: false,
          reason: "content_binding_mismatch",
        },
        input: {
          activeOperation: active,
          currentStage: active.stage,
          result: makeOperationResult(active, {
            bindings: {
              ...active.bindings,
              content: {
                contentBundleId: "content-old",
                contentBundleVersion: "0.0.9",
                contentBundleChecksum: DIGEST_C,
              },
            },
          }),
        },
      },
    ];

    for (const testCase of cases) {
      expect(
        guardOperationResult(testCase.input),
        testCase.name,
      ).toEqual(testCase.expected);
    }
  });
});

describe("Runtime semantic input fingerprint", () => {
  it("is retry-stable but changes with a bound revision", async () => {
    const material = {
      capability: "reviewCharlieSignature",
      requestedMode: "live",
      bindings: {
        revisions: {
          preciseRevisionId: "precise-r1",
          plainRevisionId: "plain-r1",
        },
        content: {
          contentBundleId: "content-1",
          contentBundleVersion: "0.1.0",
          contentBundleChecksum: DIGEST_A,
        },
      },
      agentContractVersion: "0.1.0",
      resultSchemaVersion: "0.1.0",
      semanticInputDigest: DIGEST_B,
    } as const;

    const initial = await computeInputFingerprint(material);
    expect(await computeInputFingerprint(structuredClone(material))).toBe(initial);
    expect(
      await computeInputFingerprint({
        ...material,
        bindings: {
          ...material.bindings,
          revisions: {
            ...material.bindings.revisions,
            preciseRevisionId: "precise-r2",
          },
        },
      }),
    ).not.toBe(initial);
  });
});

describe("Runtime refresh and transition idempotency", () => {
  it("clears the active operation and rotates stageInstanceId on refresh", () => {
    const activeOperation = makeActiveOperation();
    const refreshed = refreshRuntimeState(
      {
        stageInstanceId: activeOperation.stageInstanceId,
        activeOperation,
      },
      "stage-instance-2",
    );

    expect(refreshed.state).toEqual({
      stageInstanceId: "stage-instance-2",
      activeOperation: null,
    });
    expect(refreshed.invalidatedOperation).toEqual({
      operationId: activeOperation.operationId,
      requestId: activeOperation.requestId,
      capability: activeOperation.capability,
      stageInstanceId: activeOperation.stageInstanceId,
    });
    expect(() =>
      refreshRuntimeState(
        {
          stageInstanceId: activeOperation.stageInstanceId,
          activeOperation,
        },
        activeOperation.stageInstanceId,
      ),
    ).toThrow("Refresh must rotate stageInstanceId");
  });

  it("distinguishes new, in-flight, replay, conflict, and record scope", () => {
    const identity = {
      sessionId: "session-1",
      transitionKey: "transition-1",
      inputFingerprint: DIGEST_A,
    } as const;

    expect(
      evaluateStateTransitionIdempotency({
        existingRecord: null,
        ...identity,
      }),
    ).toEqual({ kind: "new" });

    const pending = startStateTransitionIdempotencyRecord({
      ...identity,
      createdAt: STARTED_AT,
      expiresAt: null,
    });
    expect(
      evaluateStateTransitionIdempotency({
        existingRecord: pending,
        ...identity,
      }),
    ).toEqual({ kind: "in_flight", record: pending });

    const applied = markStateTransitionApplied({
      record: pending,
      appliedRevision: 7,
      appliedAt: COMPLETED_AT,
    });
    expect(
      evaluateStateTransitionIdempotency({
        existingRecord: applied,
        ...identity,
      }),
    ).toEqual({ kind: "replay", record: applied });
    expect(
      evaluateStateTransitionIdempotency({
        existingRecord: applied,
        ...identity,
        inputFingerprint: DIGEST_B,
      }),
    ).toEqual({ kind: "conflict", record: applied });

    for (const scope of [
      { ...identity, sessionId: "session-2" },
      { ...identity, transitionKey: "transition-2" },
    ]) {
      expect(
        evaluateStateTransitionIdempotency({
          existingRecord: applied,
          ...scope,
        }),
      ).toEqual({ kind: "record_scope_mismatch", record: applied });
    }
  });
});

describe("Provenance execution receipt", () => {
  it("accepts supported mode/outcome combinations, including mixed-mode fallback", () => {
    const receipts = [
      makeCapabilityExecutionReceipt({ resolvedMode: "deterministic" }),
      makeCapabilityExecutionReceipt({ resolvedMode: "live" }),
      makeCapabilityExecutionReceipt({
        requestedMode: "mock",
        resolvedMode: "mock",
      }),
      makeCapabilityExecutionReceipt({
        requestedMode: "live",
        resolvedMode: "mock",
        fallbackReason: "Live adapter was unavailable",
      }),
      makeCapabilityExecutionReceipt({
        resolvedMode: "static_template",
        fallbackReason: "Deterministic fallback was selected",
      }),
      makeCapabilityExecutionReceipt({
        resolvedMode: "unavailable",
        outcome: "failed",
        fallbackReason: "No approved execution path was available",
      }),
      makeCapabilityExecutionReceipt({
        resolvedMode: "unavailable",
        outcome: "skipped",
        fallbackReason: "Execution was intentionally skipped",
      }),
    ];

    expect(receipts.map((receipt) => receipt.resolvedMode)).toEqual([
      "deterministic",
      "live",
      "mock",
      "mock",
      "static_template",
      "unavailable",
      "unavailable",
    ]);
    for (const receipt of receipts) {
      expect(capabilityExecutionReceiptSchema.safeParse(receipt).success).toBe(
        true,
      );
    }
  });

  it("rejects illegal mode/outcome pairs, missing fallback evidence, and reversed time", () => {
    const invalidReceipts = [
      {
        ...makeCapabilityExecutionReceipt(),
        requestedMode: "mock",
        resolvedMode: "live",
      },
      {
        ...makeCapabilityExecutionReceipt(),
        resolvedMode: "unavailable",
        outcome: "succeeded",
        fallbackReason: "Execution was unavailable",
      },
      {
        ...makeCapabilityExecutionReceipt(),
        resolvedMode: "live",
        outcome: "failed",
      },
      {
        ...makeCapabilityExecutionReceipt(),
        resolvedMode: "static_template",
        fallbackReason: null,
      },
      {
        ...makeCapabilityExecutionReceipt(),
        startedAt: COMPLETED_AT,
        completedAt: STARTED_AT,
      },
    ];

    for (const receipt of invalidReceipts) {
      expect(
        capabilityExecutionReceiptSchema.safeParse(receipt).success,
      ).toBe(false);
    }
  });
});

describe("ContractVersionVector", () => {
  it("treats a null agentContractVersion as explicitly missing", () => {
    const vector = makeContractVersionVector({ agentContractVersion: null });

    expect(getMissingContractVersionFields(vector)).toEqual([
      "agentContractVersion",
    ]);
    expect(hasCompleteContractVersionVector(vector)).toBe(false);
    expect(hasCompleteContractVersionVector(makeContractVersionVector())).toBe(
      true,
    );
  });

  it("rejects unknown, empty, omitted, and aliased version fields", () => {
    const valid = makeContractVersionVector();
    const withoutAgentVersion: Record<string, unknown> = { ...valid };
    delete withoutAgentVersion.agentContractVersion;
    const invalidVectors: unknown[] = [
      { ...valid, runtimeContractVersion: "unknown" },
      { ...valid, runtimeContractVersion: "  " },
      withoutAgentVersion,
      { ...valid, agentToolContractVersion: "0.1.0" },
      { ...valid, schemaVersion: "0.1.0" },
    ];

    for (const vector of invalidVectors) {
      expect(contractVersionVectorSchema.safeParse(vector).success).toBe(false);
    }
  });
});

describe("Session recovery contract", () => {
  const currentVersion = "1.2.0";
  const currentSchema = z.strictObject({
    sessionSchemaVersion: z.literal(currentVersion),
    lifecycleStatus: z.enum(["in_progress", "finalizing", "complete"]),
    stage: z.string().min(1),
    payload: z.string(),
    contractsCompatible: z.boolean(),
  });
  const validateCurrentContracts = (
    state: z.infer<typeof currentSchema>,
  ) =>
    state.contractsCompatible
      ? ({ compatible: true } as const)
      : ({
          compatible: false,
          mismatches: ["domainContractVersion"],
        } as const);
  const makeCurrentState = (
    overrides: Partial<z.infer<typeof currentSchema>> = {},
  ): z.infer<typeof currentSchema> =>
    currentSchema.parse({
      sessionSchemaVersion: currentVersion,
      lifecycleStatus: "in_progress",
      stage: "ROUND_1_PAST_SELF",
      payload: "current",
      contractsCompatible: true,
      ...overrides,
    });
  const recover = (persistedState: unknown) =>
    recoverSessionState({
      persistedState,
      currentSessionSchemaVersion: currentVersion,
      currentSchema,
      validateCurrentContracts,
    });

  it("restores current editable state and current COMPLETE state as read-only", () => {
    expect(recover(makeCurrentState())).toMatchObject({
      kind: "restored",
      access: "editable",
      source: "current",
      sourceVersion: currentVersion,
      currentVersion,
      appliedMigrations: [],
    });
    expect(
      recover(
        makeCurrentState({ lifecycleStatus: "complete", stage: "COMPLETE" }),
      ),
    ).toMatchObject({
      kind: "restored",
      access: "read_only",
      source: "current",
      sourceVersion: currentVersion,
      currentVersion,
      appliedMigrations: [],
    });
  });

  it("rejects unknown future state and old-major editable state", () => {
    expect(
      recover({
        sessionSchemaVersion: "1.3.0",
        lifecycleStatus: "in_progress",
        stage: "ROUND_1_PAST_SELF",
      }),
    ).toMatchObject({
      kind: "rejected",
      reason: {
        category: "unsupported_version",
        code: "unknown_future_version",
        sourceVersion: "1.3.0",
      },
    });
    expect(
      recover({
        sessionSchemaVersion: "0.9.0",
        lifecycleStatus: "in_progress",
        stage: "ROUND_1_PAST_SELF",
      }),
    ).toMatchObject({
      kind: "rejected",
      reason: {
        category: "unsupported_version",
        code: "breaking_version",
        sourceVersion: "0.9.0",
      },
    });
  });

  it("requires and applies a continuous, explicit same-major migration chain", () => {
    const original = {
      sessionSchemaVersion: "1.0.0",
      lifecycleStatus: "in_progress",
      stage: "ROUND_1_PAST_SELF",
      payload: "legacy",
      contractsCompatible: true,
    };
    const migrations = defineSessionMigrationRegistry([
      {
        fromVersion: "1.0.0",
        toVersion: "1.1.0",
        migrate: (value) => ({
          ...(value as Record<string, unknown>),
          sessionSchemaVersion: "1.1.0",
          payload: `${String((value as Record<string, unknown>).payload)}|1.1`,
        }),
      },
      {
        fromVersion: "1.1.0",
        toVersion: currentVersion,
        migrate: (value) => ({
          ...(value as Record<string, unknown>),
          sessionSchemaVersion: currentVersion,
          payload: `${String((value as Record<string, unknown>).payload)}|1.2`,
        }),
      },
    ]);

    const recovered = recoverSessionState({
      persistedState: original,
      currentSessionSchemaVersion: currentVersion,
      currentSchema,
      validateCurrentContracts,
      migrations,
    });

    expect(recovered).toMatchObject({
      kind: "restored",
      access: "editable",
      source: "migrated",
      sourceVersion: "1.0.0",
      currentVersion,
      appliedMigrations: [
        { fromVersion: "1.0.0", toVersion: "1.1.0" },
        { fromVersion: "1.1.0", toVersion: currentVersion },
      ],
      state: { payload: "legacy|1.1|1.2" },
    });
    expect(original.sessionSchemaVersion).toBe("1.0.0");

    expect(
      recoverSessionState({
        persistedState: original,
        currentSessionSchemaVersion: currentVersion,
        currentSchema,
        validateCurrentContracts,
        migrations: defineSessionMigrationRegistry([]),
      }),
    ).toMatchObject({
      kind: "rejected",
      reason: { code: "migration_unavailable", atVersion: "1.0.0" },
    });
  });

  it("opens a legacy COMPLETE snapshot only through its exact read-only decoder", () => {
    const legacyComplete = {
      sessionSchemaVersion: "0.9.0",
      lifecycleStatus: "complete" as const,
      stage: "COMPLETE" as const,
      payload: "legacy-final",
    };
    const legacySchema = z.strictObject({
      sessionSchemaVersion: z.literal("0.9.0"),
      lifecycleStatus: z.literal("complete"),
      stage: z.literal("COMPLETE"),
      payload: z.string(),
    });
    const completeReadOnlyCompatibility =
      defineCompleteReadOnlyCompatibilityRegistry([
        { sessionSchemaVersion: "0.9.0", schema: legacySchema },
      ]);

    expect(
      recoverSessionState({
        persistedState: legacyComplete,
        currentSessionSchemaVersion: currentVersion,
        currentSchema,
        validateCurrentContracts,
        completeReadOnlyCompatibility,
      }),
    ).toEqual({
      kind: "restored",
      access: "read_only",
      source: "legacy_complete",
      sourceVersion: "0.9.0",
      currentVersion,
      appliedMigrations: [],
      state: legacyComplete,
    });
    expect(recover(legacyComplete)).toMatchObject({
      kind: "rejected",
      reason: {
        category: "unsupported_version",
        code: "read_only_compatibility_unavailable",
      },
    });
  });

  it("rejects corrupt state separately from current Contract mismatch", () => {
    expect(
      recover({ sessionSchemaVersion: currentVersion, stage: "WELCOME" }),
    ).toMatchObject({
      kind: "rejected",
      reason: {
        category: "corrupt_state",
        code: "corrupt_state",
        sourceVersion: null,
      },
    });
    expect(recover(makeCurrentState({ contractsCompatible: false }))).toMatchObject(
      {
        kind: "rejected",
        reason: {
          category: "contract_mismatch",
          code: "contract_mismatch",
          sourceVersion: currentVersion,
          details: ["domainContractVersion"],
        },
      },
    );
  });
});

describe("current Session Schema recovery rejection", () => {
  it("rejects a current-version record that omits the required nullable signature checkpoint", () => {
    const persisted: Record<string, unknown> = { ...makeFinalizableState() };
    Reflect.deleteProperty(persisted, "signatureReviewCheckpoint");

    expect(
      recoverSessionState({
        persistedState: persisted,
        currentSessionSchemaVersion: "0.1.0",
        currentSchema: sessionStateSchema,
        validateCurrentContracts: () => ({ compatible: true }),
      }),
    ).toMatchObject({
      kind: "rejected",
      reason: {
        category: "corrupt_state",
        code: "corrupt_state",
        sourceVersion: "0.1.0",
      },
    });
  });
});

import { z } from "zod";
import { describe, expect, it } from "vitest";

import {
  assertSessionContentBindingMatches,
  evaluateSessionContentBindingCompatibility,
} from "../../src/content/content-binding";
import { sessionContentBindingSchema } from "../../src/domain/schemas/session.schema";
import {
  defineCompleteReadOnlyCompatibilityRegistry,
  defineSessionMigrationRegistry,
  recoverSessionState,
} from "../../src/runtime/recovery";

const SHA_A = `sha256:${"a".repeat(64)}`;
const SHA_B = `sha256:${"b".repeat(64)}`;
const CURRENT_ACCESS_BINDING = {
  contentBundleId: "content-bundle-1",
  contentBundleVersion: "0.1.0",
  contentBundleChecksum: SHA_A,
  contentSchemaVersion: "0.1.0",
} as const;
const CURRENT_SESSION_BINDING = {
  ...CURRENT_ACCESS_BINDING,
  targetEnvironment: "test",
} as const;

const currentStateSchema = z.strictObject({
  sessionSchemaVersion: z.literal("0.1.0"),
  lifecycleStatus: z.literal("in_progress"),
  stage: z.string().min(1),
  contentBinding: sessionContentBindingSchema,
});

describe("content-bound recovery compatibility", () => {
  it.each([
    ["contentBundleId", "other-bundle"],
    ["contentBundleVersion", "0.2.0"],
    ["contentBundleChecksum", SHA_B],
    ["contentSchemaVersion", "0.2.0"],
    ["targetEnvironment", "production"],
  ] as const)("rejects a %s mismatch", (field, value) => {
    const persisted = { ...CURRENT_SESSION_BINDING, [field]: value };

    expect(() =>
      assertSessionContentBindingMatches(
        persisted,
        CURRENT_ACCESS_BINDING,
        "test",
      ),
    ).toThrow(field);
    expect(
      evaluateSessionContentBindingCompatibility(
        persisted,
        CURRENT_ACCESS_BINDING,
        "test",
      ),
    ).toEqual({ compatible: false, mismatches: [field] });
  });

  it("composes with current recovery and rejects editable mismatch", () => {
    const persistedState = {
      sessionSchemaVersion: "0.1.0",
      lifecycleStatus: "in_progress",
      stage: "WELCOME",
      contentBinding: {
        ...CURRENT_SESSION_BINDING,
        contentBundleChecksum: SHA_B,
      },
    } as const;
    const result = recoverSessionState({
      persistedState,
      currentSessionSchemaVersion: "0.1.0",
      currentSchema: currentStateSchema,
      validateCurrentContracts: (state) =>
        evaluateSessionContentBindingCompatibility(
          state.contentBinding,
          CURRENT_ACCESS_BINDING,
          "test",
        ),
    });

    expect(result).toMatchObject({
      kind: "rejected",
      reason: {
        category: "contract_mismatch",
        code: "contract_mismatch",
        details: ["contentBundleChecksum"],
      },
    });
  });

  it("allows only an explicit migration to rebind editable legacy state", () => {
    const persistedState = {
      sessionSchemaVersion: "0.0.9",
      lifecycleStatus: "in_progress",
      stage: "WELCOME",
      contentBinding: {
        ...CURRENT_SESSION_BINDING,
        contentBundleVersion: "0.0.9",
      },
    };
    const migrations = defineSessionMigrationRegistry([
      {
        fromVersion: "0.0.9",
        toVersion: "0.1.0",
        migrate(value) {
          const legacy = value as typeof persistedState;
          return {
            ...legacy,
            sessionSchemaVersion: "0.1.0",
            contentBinding: CURRENT_SESSION_BINDING,
          };
        },
      },
    ]);
    const result = recoverSessionState({
      persistedState,
      currentSessionSchemaVersion: "0.1.0",
      currentSchema: currentStateSchema,
      migrations,
      validateCurrentContracts: (state) =>
        evaluateSessionContentBindingCompatibility(
          state.contentBinding,
          CURRENT_ACCESS_BINDING,
          "test",
        ),
    });

    expect(result).toMatchObject({
      kind: "restored",
      access: "editable",
      source: "migrated",
      appliedMigrations: [{ fromVersion: "0.0.9", toVersion: "0.1.0" }],
    });
  });

  it("keeps an explicitly decoded legacy COMPLETE snapshot read-only", () => {
    const legacyCompleteSchema = z.strictObject({
      sessionSchemaVersion: z.literal("0.0.9"),
      lifecycleStatus: z.literal("complete"),
      stage: z.literal("COMPLETE"),
      contentBinding: sessionContentBindingSchema,
    });
    const persistedState = {
      sessionSchemaVersion: "0.0.9",
      lifecycleStatus: "complete",
      stage: "COMPLETE",
      contentBinding: {
        ...CURRENT_SESSION_BINDING,
        contentBundleChecksum: SHA_B,
      },
    } as const;
    const result = recoverSessionState({
      persistedState,
      currentSessionSchemaVersion: "0.1.0",
      currentSchema: currentStateSchema,
      validateCurrentContracts: () => ({ compatible: true }),
      completeReadOnlyCompatibility:
        defineCompleteReadOnlyCompatibilityRegistry([
          { sessionSchemaVersion: "0.0.9", schema: legacyCompleteSchema },
        ]),
    });

    expect(result).toMatchObject({
      kind: "restored",
      access: "read_only",
      source: "legacy_complete",
      appliedMigrations: [],
    });
  });
});

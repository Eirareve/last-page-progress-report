import type { z } from "zod";

import {
  compareSessionSchemaVersions,
  getSessionSchemaMajor,
  persistedSessionRecoveryHeaderSchema,
  sessionMigrationDescriptorSchema,
  sessionRecoveryRejectionCategorySchema,
  sessionRecoveryRejectionCodeSchema,
  sessionRecoverySchemaVersionSchema,
} from "./recovery.schema";

export type SessionRecoveryRejectionCode = z.infer<
  typeof sessionRecoveryRejectionCodeSchema
>;
export type SessionRecoveryRejectionCategory = z.infer<
  typeof sessionRecoveryRejectionCategorySchema
>;

export type RecoverySchema<T> = {
  safeParse(value: unknown):
    | { success: true; data: T }
    | { success: false; error?: unknown };
};

export type ContractCompatibilityResult =
  | { compatible: true }
  | { compatible: false; mismatches: readonly string[] };

export type SessionMigrationStep = {
  fromVersion: string;
  toVersion: string;
  /** Must be deterministic and must not mutate its input. */
  migrate(value: unknown): unknown;
};

export type SessionMigrationRegistry = Readonly<
  Record<string, SessionMigrationStep>
>;

export type CompleteReadOnlyCompatibility<TSnapshot = unknown> = {
  sessionSchemaVersion: string;
  schema: RecoverySchema<TSnapshot>;
};

export type CompleteReadOnlyCompatibilityRegistry<TSnapshot = unknown> =
  Readonly<Record<string, CompleteReadOnlyCompatibility<TSnapshot>>>;

export type AppliedSessionMigration = {
  fromVersion: string;
  toVersion: string;
};

export type CurrentSchemaRecoverySuccess<TCurrent> = {
  kind: "restored";
  access: "editable" | "read_only";
  source: "current" | "migrated";
  sourceVersion: string;
  currentVersion: string;
  appliedMigrations: readonly AppliedSessionMigration[];
  state: TCurrent;
};

export type SessionRecoverySuccess<TCurrent, TLegacyComplete> =
  | CurrentSchemaRecoverySuccess<TCurrent>
  | {
      kind: "restored";
      access: "read_only";
      source: "legacy_complete";
      sourceVersion: string;
      currentVersion: string;
      appliedMigrations: readonly [];
      state: TLegacyComplete;
    };

export type SessionRecoveryRejection = {
  kind: "rejected";
  reason: {
    category: SessionRecoveryRejectionCategory;
    code: SessionRecoveryRejectionCode;
    sourceVersion: string | null;
    currentVersion: string;
    atVersion: string | null;
    details: readonly string[];
  };
};

export type SessionRecoveryResult<TCurrent, TLegacyComplete = unknown> =
  | SessionRecoverySuccess<TCurrent, TLegacyComplete>
  | SessionRecoveryRejection;

type CurrentSchemaRecoveryResult<TCurrent> =
  | CurrentSchemaRecoverySuccess<TCurrent>
  | SessionRecoveryRejection;

export function defineSessionMigrationRegistry(
  steps: readonly SessionMigrationStep[],
): SessionMigrationRegistry {
  const registry: Record<string, SessionMigrationStep> = {};
  for (const step of steps) {
    const descriptor = sessionMigrationDescriptorSchema.parse({
      fromVersion: step.fromVersion,
      toVersion: step.toVersion,
    });
    if (registry[descriptor.fromVersion]) {
      throw new Error(
        `Duplicate migration source version: ${descriptor.fromVersion}`,
      );
    }
    if (
      getSessionSchemaMajor(descriptor.fromVersion) !==
      getSessionSchemaMajor(descriptor.toVersion)
    ) {
      throw new Error("Migration registry cannot cross a breaking major version");
    }
    registry[descriptor.fromVersion] = Object.freeze({
      fromVersion: descriptor.fromVersion,
      toVersion: descriptor.toVersion,
      migrate: step.migrate,
    });
  }
  return Object.freeze(registry);
}

export function defineCompleteReadOnlyCompatibilityRegistry<TSnapshot>(
  entries: readonly CompleteReadOnlyCompatibility<TSnapshot>[],
): CompleteReadOnlyCompatibilityRegistry<TSnapshot> {
  const registry: Record<
    string,
    CompleteReadOnlyCompatibility<TSnapshot>
  > = {};
  for (const entry of entries) {
    const version = sessionRecoverySchemaVersionSchema.parse(
      entry.sessionSchemaVersion,
    );
    if (registry[version]) {
      throw new Error(`Duplicate read-only compatibility version: ${version}`);
    }
    registry[version] = Object.freeze({
      sessionSchemaVersion: version,
      schema: entry.schema,
    });
  }
  return Object.freeze(registry);
}

export function recoverSessionState<TCurrent, TLegacyComplete = unknown>(input: {
  persistedState: unknown;
  currentSessionSchemaVersion: string;
  currentSchema: RecoverySchema<TCurrent>;
  validateCurrentContracts: (state: TCurrent) => ContractCompatibilityResult;
  migrations?: SessionMigrationRegistry;
  completeReadOnlyCompatibility?: CompleteReadOnlyCompatibilityRegistry<TLegacyComplete>;
}): SessionRecoveryResult<TCurrent, TLegacyComplete> {
  const currentVersionResult = sessionRecoverySchemaVersionSchema.safeParse(
    input.currentSessionSchemaVersion,
  );
  if (!currentVersionResult.success) {
    throw new Error("Current Session Schema version is not a valid numeric semver");
  }
  const currentVersion = currentVersionResult.data;
  const headerResult = persistedSessionRecoveryHeaderSchema.safeParse(
    input.persistedState,
  );
  if (!headerResult.success) {
    return reject("corrupt_state", null, currentVersion, null, [
      "Persisted Session header failed validation",
    ]);
  }

  const header = headerResult.data;
  const sourceVersion = header.sessionSchemaVersion;
  const versionComparison = compareSessionSchemaVersions(
    sourceVersion,
    currentVersion,
  );

  if (versionComparison > 0) {
    return reject(
      "unknown_future_version",
      sourceVersion,
      currentVersion,
      sourceVersion,
      ["Persisted Session was created by a newer, unsupported Schema"],
    );
  }

  if (versionComparison === 0) {
    return restoreCurrent({
      persistedState: input.persistedState,
      currentVersion,
      currentSchema: input.currentSchema,
      validateCurrentContracts: input.validateCurrentContracts,
      readOnly: header.lifecycleStatus === "complete",
    });
  }

  if (header.lifecycleStatus === "complete") {
    const compatibility = input.completeReadOnlyCompatibility?.[sourceVersion];
    if (
      !compatibility ||
      compatibility.sessionSchemaVersion !== sourceVersion
    ) {
      return reject(
        "read_only_compatibility_unavailable",
        sourceVersion,
        currentVersion,
        sourceVersion,
        ["No explicit read-only decoder is registered for this COMPLETE snapshot"],
      );
    }
    const legacyResult = compatibility.schema.safeParse(input.persistedState);
    if (!legacyResult.success) {
      return reject(
        "corrupt_state",
        sourceVersion,
        currentVersion,
        sourceVersion,
        ["Legacy COMPLETE snapshot failed its registered read-only Schema"],
      );
    }
    return {
      kind: "restored",
      access: "read_only",
      source: "legacy_complete",
      sourceVersion,
      currentVersion,
      appliedMigrations: [],
      state: legacyResult.data,
    };
  }

  if (getSessionSchemaMajor(sourceVersion) !== getSessionSchemaMajor(currentVersion)) {
    return reject(
      "breaking_version",
      sourceVersion,
      currentVersion,
      sourceVersion,
      ["Editable recovery cannot cross a Session Schema major version"],
    );
  }

  return migrateAndRestore({
    persistedState: input.persistedState,
    sourceVersion,
    currentVersion,
    currentSchema: input.currentSchema,
    validateCurrentContracts: input.validateCurrentContracts,
    migrations: input.migrations ?? {},
  });
}

function restoreCurrent<TCurrent>(input: {
  persistedState: unknown;
  currentVersion: string;
  currentSchema: RecoverySchema<TCurrent>;
  validateCurrentContracts: (state: TCurrent) => ContractCompatibilityResult;
  readOnly: boolean;
}): CurrentSchemaRecoveryResult<TCurrent> {
  const parsed = input.currentSchema.safeParse(input.persistedState);
  if (!parsed.success) {
    return reject(
      "corrupt_state",
      input.currentVersion,
      input.currentVersion,
      input.currentVersion,
      ["Current-version Session failed its complete Schema"],
    );
  }
  let compatibility: ContractCompatibilityResult;
  try {
    compatibility = input.validateCurrentContracts(parsed.data);
  } catch {
    return reject(
      "contract_mismatch",
      input.currentVersion,
      input.currentVersion,
      input.currentVersion,
      ["Current Contract compatibility validation threw an exception"],
    );
  }
  if (!compatibility.compatible) {
    return reject(
      "contract_mismatch",
      input.currentVersion,
      input.currentVersion,
      input.currentVersion,
      compatibility.mismatches,
    );
  }
  return {
    kind: "restored",
    access: input.readOnly ? "read_only" : "editable",
    source: "current",
    sourceVersion: input.currentVersion,
    currentVersion: input.currentVersion,
    appliedMigrations: [],
    state: parsed.data,
  };
}

function migrateAndRestore<TCurrent>(input: {
  persistedState: unknown;
  sourceVersion: string;
  currentVersion: string;
  currentSchema: RecoverySchema<TCurrent>;
  validateCurrentContracts: (state: TCurrent) => ContractCompatibilityResult;
  migrations: SessionMigrationRegistry;
}): CurrentSchemaRecoveryResult<TCurrent> {
  let value = input.persistedState;
  let version = input.sourceVersion;
  const appliedMigrations: AppliedSessionMigration[] = [];
  const visited = new Set<string>();

  while (version !== input.currentVersion) {
    if (visited.has(version)) {
      return reject(
        "migration_failed",
        input.sourceVersion,
        input.currentVersion,
        version,
        ["Migration registry contains a cycle"],
      );
    }
    visited.add(version);

    const step = input.migrations[version];
    if (!step || step.fromVersion !== version) {
      return reject(
        "migration_unavailable",
        input.sourceVersion,
        input.currentVersion,
        version,
        ["No explicit migration step is registered for this version"],
      );
    }
    const descriptor = sessionMigrationDescriptorSchema.safeParse({
      fromVersion: step.fromVersion,
      toVersion: step.toVersion,
    });
    if (
      !descriptor.success ||
      getSessionSchemaMajor(descriptor.data.toVersion) !==
        getSessionSchemaMajor(input.currentVersion) ||
      compareSessionSchemaVersions(descriptor.data.toVersion, version) <= 0 ||
      compareSessionSchemaVersions(
        descriptor.data.toVersion,
        input.currentVersion,
      ) > 0
    ) {
      return reject(
        "migration_failed",
        input.sourceVersion,
        input.currentVersion,
        version,
        ["Migration step has an invalid target version"],
      );
    }

    try {
      value = step.migrate(value);
    } catch {
      return reject(
        "migration_failed",
        input.sourceVersion,
        input.currentVersion,
        version,
        ["Migration step threw an exception"],
      );
    }

    const migratedHeader = persistedSessionRecoveryHeaderSchema.safeParse(value);
    if (
      !migratedHeader.success ||
      migratedHeader.data.sessionSchemaVersion !== descriptor.data.toVersion ||
      migratedHeader.data.lifecycleStatus === "complete"
    ) {
      return reject(
        "migration_failed",
        input.sourceVersion,
        input.currentVersion,
        version,
        [
          "Migration output has an invalid header, wrong version, or became COMPLETE",
        ],
      );
    }

    appliedMigrations.push({
      fromVersion: version,
      toVersion: descriptor.data.toVersion,
    });
    version = descriptor.data.toVersion;
  }

  const parsed = input.currentSchema.safeParse(value);
  if (!parsed.success) {
    return reject(
      "migration_failed",
      input.sourceVersion,
      input.currentVersion,
      version,
      ["Migrated Session failed the complete current Schema"],
    );
  }
  let compatibility: ContractCompatibilityResult;
  try {
    compatibility = input.validateCurrentContracts(parsed.data);
  } catch {
    return reject(
      "contract_mismatch",
      input.sourceVersion,
      input.currentVersion,
      version,
      ["Current Contract compatibility validation threw an exception"],
    );
  }
  if (!compatibility.compatible) {
    return reject(
      "contract_mismatch",
      input.sourceVersion,
      input.currentVersion,
      version,
      compatibility.mismatches,
    );
  }
  return {
    kind: "restored",
    access: "editable",
    source: "migrated",
    sourceVersion: input.sourceVersion,
    currentVersion: input.currentVersion,
    appliedMigrations,
    state: parsed.data,
  };
}

function reject(
  code: SessionRecoveryRejectionCode,
  sourceVersion: string | null,
  currentVersion: string,
  atVersion: string | null,
  details: readonly string[],
): SessionRecoveryRejection {
  return {
    kind: "rejected",
    reason: {
      category: rejectionCategory(code),
      code,
      sourceVersion,
      currentVersion,
      atVersion,
      details,
    },
  };
}

function rejectionCategory(
  code: SessionRecoveryRejectionCode,
): SessionRecoveryRejectionCategory {
  if (code === "corrupt_state") {
    return "corrupt_state";
  }
  if (code === "contract_mismatch") {
    return "contract_mismatch";
  }
  if (code === "migration_failed") {
    return "migration_failed";
  }
  return "unsupported_version";
}

import { z } from "zod";

export const sessionRecoverySchemaVersionSchema = z
  .string()
  .regex(
    /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/,
    "Session Schema versions must use numeric major.minor.patch form",
  );

export const persistedSessionRecoveryHeaderSchema = z
  .object({
    sessionSchemaVersion: sessionRecoverySchemaVersionSchema,
    lifecycleStatus: z.enum(["in_progress", "finalizing", "complete"]),
    stage: z.string().trim().min(1),
  })
  .superRefine((header, context) => {
    const isCompleteHeader =
      header.lifecycleStatus === "complete" && header.stage === "COMPLETE";
    if (
      (header.lifecycleStatus === "complete" || header.stage === "COMPLETE") &&
      !isCompleteHeader
    ) {
      context.addIssue({
        code: "custom",
        message:
          "A persisted COMPLETE header requires both complete lifecycle and COMPLETE stage",
      });
    }
  });

export const sessionMigrationDescriptorSchema = z
  .strictObject({
    fromVersion: sessionRecoverySchemaVersionSchema,
    toVersion: sessionRecoverySchemaVersionSchema,
  })
  .refine(
    (descriptor) =>
      compareSessionSchemaVersions(
        descriptor.fromVersion,
        descriptor.toVersion,
      ) < 0,
    {
      message: "A migration step must advance to a newer Schema version",
      path: ["toVersion"],
    },
  );

export const sessionRecoveryRejectionCodeSchema = z.enum([
  "corrupt_state",
  "contract_mismatch",
  "unknown_future_version",
  "breaking_version",
  "migration_unavailable",
  "migration_failed",
  "read_only_compatibility_unavailable",
]);

export const sessionRecoveryRejectionCategorySchema = z.enum([
  "corrupt_state",
  "contract_mismatch",
  "unsupported_version",
  "migration_failed",
]);

export const sessionRecoveryAccessSchema = z.enum(["editable", "read_only"]);

export const sessionRecoverySourceSchema = z.enum([
  "current",
  "migrated",
  "legacy_complete",
]);

export function compareSessionSchemaVersions(left: string, right: string): number {
  const leftParts = parseSessionSchemaVersion(left);
  const rightParts = parseSessionSchemaVersion(right);
  for (let index = 0; index < leftParts.length; index += 1) {
    const difference = leftParts[index] - rightParts[index];
    if (difference !== 0) {
      return Math.sign(difference);
    }
  }
  return 0;
}

export function getSessionSchemaMajor(version: string): number {
  return parseSessionSchemaVersion(version)[0];
}

function parseSessionSchemaVersion(version: string): [number, number, number] {
  const parsed = sessionRecoverySchemaVersionSchema.parse(version);
  const parts = parsed.split(".").map(Number);
  return [parts[0], parts[1], parts[2]];
}

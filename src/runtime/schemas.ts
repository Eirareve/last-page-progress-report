import { z } from "zod";

import { experienceStageSchema } from "../domain/schemas/experience.schema";

export const RUNTIME_CONTRACT_VERSION = "0.1.0" as const;

export const runtimeIdentifierSchema = z.string().trim().min(1);

export const runtimeVersionIdentifierSchema = z
  .string()
  .trim()
  .min(1)
  .refine((value) => value.toLowerCase() !== "unknown", {
    message: 'Version identifiers cannot use the sentinel "unknown"',
  });

export const runtimeSha256DigestSchema = z
  .string()
  .regex(/^sha256:[0-9a-f]{64}$/, "Expected a lowercase sha256 digest");

export const agentModeSchema = z.enum(["mock", "live"]);

export const resolvedExecutionModeSchema = z.enum([
  "deterministic",
  "live",
  "mock",
  "static_template",
  "unavailable",
]);

export const executionOutcomeSchema = z.enum([
  "succeeded",
  "failed",
  "skipped",
]);

export const capabilityIdentifierSchema = runtimeIdentifierSchema.regex(
  /^[a-z][A-Za-z0-9]*$/,
  "Capability identifiers must be camelCase",
);

export const operationStatusSchema = z.enum([
  "pending",
  "running",
  "cancelling",
  "cancelled",
]);

export const revisionBindingSchema = z.strictObject({
  preciseRevisionId: runtimeIdentifierSchema.nullable(),
  plainRevisionId: runtimeIdentifierSchema.nullable(),
});

export const contentBindingSchema = z
  .strictObject({
    contentBundleId: runtimeIdentifierSchema.nullable(),
    contentBundleVersion: runtimeVersionIdentifierSchema.nullable(),
    contentBundleChecksum: runtimeSha256DigestSchema.nullable(),
  })
  .superRefine((binding, context) => {
    const values = [
      binding.contentBundleId,
      binding.contentBundleVersion,
      binding.contentBundleChecksum,
    ];
    const presentCount = values.filter((value) => value !== null).length;
    if (presentCount !== 0 && presentCount !== values.length) {
      context.addIssue({
        code: "custom",
        message: "Content identity must be fully bound or fully absent",
      });
    }
  });

export const operationBindingsSchema = z.strictObject({
  revisions: revisionBindingSchema,
  content: contentBindingSchema,
});

export const inputFingerprintMaterialSchema = z.strictObject({
  capability: capabilityIdentifierSchema,
  requestedMode: agentModeSchema,
  bindings: operationBindingsSchema,
  agentContractVersion: runtimeVersionIdentifierSchema.nullable(),
  resultSchemaVersion: runtimeVersionIdentifierSchema,
  semanticInputDigest: runtimeSha256DigestSchema,
});

export const sessionConfigurationSchema = z.strictObject({
  requestedAgentMode: agentModeSchema,
});

export const retryPolicySchema = z
  .strictObject({
    maxAttempts: z.number().int().positive(),
    automaticRetryLimit: z.number().int().nonnegative(),
    manualRetryLimit: z.number().int().nonnegative(),
  })
  .refine(
    (policy) =>
      policy.automaticRetryLimit + policy.manualRetryLimit < policy.maxAttempts,
    {
      message:
        "Retry limits must leave room for the initial attempt within maxAttempts",
    },
  );

export const activeOperationSchema = z.strictObject({
  operationId: runtimeIdentifierSchema,
  requestId: runtimeIdentifierSchema,
  capability: capabilityIdentifierSchema,
  stage: experienceStageSchema,
  stageInstanceId: runtimeIdentifierSchema,
  inputFingerprint: runtimeSha256DigestSchema,
  bindings: operationBindingsSchema,
  attempt: z.number().int().positive(),
  status: operationStatusSchema,
  startedAt: z.iso.datetime(),
});

export const operationResultGuardInputSchema = z.strictObject({
  operationId: runtimeIdentifierSchema,
  requestId: runtimeIdentifierSchema,
  capability: capabilityIdentifierSchema,
  stage: experienceStageSchema,
  stageInstanceId: runtimeIdentifierSchema,
  inputFingerprint: runtimeSha256DigestSchema,
  bindings: operationBindingsSchema,
  outcome: executionOutcomeSchema,
  completedAt: z.iso.datetime(),
});

export const serializableRequestContextSchema = z.strictObject({
  operationId: runtimeIdentifierSchema,
  requestId: runtimeIdentifierSchema,
  requestedMode: agentModeSchema,
  capability: capabilityIdentifierSchema,
  attempt: z.number().int().positive(),
  inputFingerprint: runtimeSha256DigestSchema,
  promptVersion: runtimeVersionIdentifierSchema.nullable(),
  adapterVersion: runtimeVersionIdentifierSchema.nullable(),
  stage: experienceStageSchema,
  stageInstanceId: runtimeIdentifierSchema,
  bindings: operationBindingsSchema,
});

export const runtimeStateSchema = z
  .strictObject({
    stageInstanceId: runtimeIdentifierSchema,
    activeOperation: activeOperationSchema.nullable(),
  })
  .superRefine((state, context) => {
    if (
      state.activeOperation !== null &&
      state.activeOperation.stageInstanceId !== state.stageInstanceId
    ) {
      context.addIssue({
        code: "custom",
        message: "Active operation must belong to the current stage instance",
        path: ["activeOperation", "stageInstanceId"],
      });
    }
  });

export const idempotencyRecordStatusSchema = z.enum(["pending", "applied"]);

export const idempotencyCleanupDispositionSchema = z.enum([
  "with_recoverable_session",
  "with_complete_snapshot",
  "represented_by_digest",
]);

export const stateTransitionIdempotencyRecordSchema = z
  .strictObject({
    sessionId: runtimeIdentifierSchema,
    transitionKey: runtimeIdentifierSchema,
    inputFingerprint: runtimeSha256DigestSchema,
    status: idempotencyRecordStatusSchema,
    appliedRevision: z.number().int().nonnegative().nullable(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
    expiresAt: z.iso.datetime().nullable(),
    cleanupDisposition: idempotencyCleanupDispositionSchema,
    compactedIntoDigest: runtimeSha256DigestSchema.nullable(),
  })
  .superRefine((record, context) => {
    if (record.status === "pending" && record.appliedRevision !== null) {
      context.addIssue({
        code: "custom",
        message: "Pending transition cannot have an applied revision",
        path: ["appliedRevision"],
      });
    }
    if (record.status === "applied" && record.appliedRevision === null) {
      context.addIssue({
        code: "custom",
        message: "Applied transition requires an applied revision",
        path: ["appliedRevision"],
      });
    }
    if (
      record.cleanupDisposition === "represented_by_digest" &&
      record.compactedIntoDigest === null
    ) {
      context.addIssue({
        code: "custom",
        message: "Digest-compacted transition requires its digest",
        path: ["compactedIntoDigest"],
      });
    }
    if (
      record.cleanupDisposition !== "represented_by_digest" &&
      record.compactedIntoDigest !== null
    ) {
      context.addIssue({
        code: "custom",
        message: "Only digest-compacted transitions may carry a compacted digest",
        path: ["compactedIntoDigest"],
      });
    }
    if (Date.parse(record.updatedAt) < Date.parse(record.createdAt)) {
      context.addIssue({
        code: "custom",
        message: "updatedAt cannot precede createdAt",
        path: ["updatedAt"],
      });
    }
  });

export const runtimeErrorSummarySchema = z.strictObject({
  code: runtimeIdentifierSchema,
  category: z.enum([
    "timeout",
    "rate_limited",
    "network",
    "invalid_result",
    "cancelled",
    "idempotency_conflict",
    "persistence",
    "unknown_technical_failure",
  ]),
  retryable: z.boolean(),
  occurredAt: z.iso.datetime(),
});

export const deploymentCapabilityBaselineSchema = z.strictObject({
  serverStart: z.literal(false),
  serverSecrets: z.literal(true),
  persistentIdempotency: z.literal(false),
  requiresContentGateAttestation: z.literal(false),
});

export const DEPLOYMENT_CAPABILITY_BASELINE = Object.freeze(
  deploymentCapabilityBaselineSchema.parse({
    serverStart: false,
    serverSecrets: true,
    persistentIdempotency: false,
    requiresContentGateAttestation: false,
  }),
);

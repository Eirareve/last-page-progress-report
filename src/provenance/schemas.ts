import { z } from "zod";

import {
  agentModeSchema,
  capabilityIdentifierSchema,
  executionOutcomeSchema,
  resolvedExecutionModeSchema,
  runtimeIdentifierSchema,
  runtimeSha256DigestSchema,
  runtimeVersionIdentifierSchema,
} from "../runtime/schemas";

export const PROVENANCE_CONTRACT_VERSION = "0.1.0" as const;

export const ownedVersionSchema = runtimeVersionIdentifierSchema;
export const deferredOwnedVersionSchema = ownedVersionSchema.nullable();

export const contractVersionVectorSchema = z.strictObject({
  scopeContractVersion: deferredOwnedVersionSchema,
  domainContractVersion: deferredOwnedVersionSchema,
  runtimeContractVersion: deferredOwnedVersionSchema,
  provenanceContractVersion: deferredOwnedVersionSchema,
  namingContractVersion: deferredOwnedVersionSchema,
  finalizationContractVersion: deferredOwnedVersionSchema,
  stateMachineContractVersion: deferredOwnedVersionSchema,
  sessionSchemaVersion: deferredOwnedVersionSchema,
  stableTextAnchorSchemaVersion: deferredOwnedVersionSchema,
  contentSchemaVersion: deferredOwnedVersionSchema,
  agentContractVersion: deferredOwnedVersionSchema,
  finalReviewSchemaVersion: deferredOwnedVersionSchema,
  finalEnvelopeSchemaVersion: deferredOwnedVersionSchema,
});

export const tokenUsageSchema = z
  .strictObject({
    inputTokens: z.number().int().nonnegative(),
    outputTokens: z.number().int().nonnegative(),
    totalTokens: z.number().int().nonnegative(),
  })
  .refine(
    (usage) => usage.totalTokens === usage.inputTokens + usage.outputTokens,
    {
      message: "totalTokens must equal inputTokens plus outputTokens",
      path: ["totalTokens"],
    },
  );

export const capabilityExecutionReceiptSchema = z
  .strictObject({
    capability: capabilityIdentifierSchema,
    operationId: runtimeIdentifierSchema,
    requestId: runtimeIdentifierSchema,
    requestedMode: agentModeSchema,
    resolvedMode: resolvedExecutionModeSchema,
    outcome: executionOutcomeSchema,
    fallbackReason: z.string().trim().min(1).nullable(),
    promptVersion: ownedVersionSchema.nullable(),
    adapterVersion: ownedVersionSchema.nullable(),
    resultSchemaVersion: ownedVersionSchema,
    agentContractVersion: ownedVersionSchema.optional(),
    inputFingerprintDigest: runtimeSha256DigestSchema,
    startedAt: z.iso.datetime(),
    completedAt: z.iso.datetime(),
    tokenUsage: tokenUsageSchema.optional(),
    modelName: z.string().trim().min(1).optional(),
    provider: z.string().trim().min(1).optional(),
    durationMs: z.number().nonnegative().optional(),
    resultDigest: runtimeSha256DigestSchema.optional(),
  })
  .superRefine((receipt, context) => {
    if (Date.parse(receipt.completedAt) < Date.parse(receipt.startedAt)) {
      context.addIssue({
        code: "custom",
        message: "completedAt cannot precede startedAt",
        path: ["completedAt"],
      });
    }
    if (receipt.requestedMode === "mock" && receipt.resolvedMode === "live") {
      context.addIssue({
        code: "custom",
        message: "A mock request cannot resolve through live execution",
        path: ["resolvedMode"],
      });
    }
    if (
      receipt.outcome === "succeeded" &&
      receipt.resolvedMode === "unavailable"
    ) {
      context.addIssue({
        code: "custom",
        message: "Unavailable execution cannot have a succeeded outcome",
        path: ["outcome"],
      });
    }
    if (
      receipt.outcome !== "succeeded" &&
      receipt.resolvedMode !== "unavailable"
    ) {
      context.addIssue({
        code: "custom",
        message: "Failed or skipped execution must resolve as unavailable",
        path: ["resolvedMode"],
      });
    }
    const usedFallback =
      receipt.resolvedMode === "static_template" ||
      receipt.resolvedMode === "unavailable" ||
      (receipt.requestedMode === "live" && receipt.resolvedMode === "mock");
    if (usedFallback && receipt.fallbackReason === null) {
      context.addIssue({
        code: "custom",
        message: "Fallback or unavailable execution requires fallbackReason",
        path: ["fallbackReason"],
      });
    }
  });

export const executionReceiptsDigestSchema = runtimeSha256DigestSchema;

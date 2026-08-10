import { z } from "zod";

import { AGENT_RESULT_SCHEMA_VERSIONS } from "./versions";

export const AGENT_CAPABILITY_NAMES = [
  "retrieveVerifiedEvidence",
  "buildInitialPortraitRecord",
  "extractUserPrinciple",
  "detectTension",
  "generateCharlieResponse",
  "proposeDocumentDiff",
  "compareSemanticDrift",
  "buildDissentRecord",
  "summarizePortraitShift",
] as const;

export const agentCapabilityNameSchema = z.enum(AGENT_CAPABILITY_NAMES);
export type AgentCapabilityName = z.infer<typeof agentCapabilityNameSchema>;

export const agentCapabilityKindSchema = z.enum([
  "deterministic_domain_service",
  "llm_assisted_service",
]);
export type AgentCapabilityKind = z.infer<typeof agentCapabilityKindSchema>;

export const agentFallbackModeSchema = z.enum([
  "mock",
  "static_template",
  "unavailable",
]);
export type AgentFallbackMode = z.infer<typeof agentFallbackModeSchema>;

export const agentCapabilityDescriptorSchema = z.strictObject({
  capability: agentCapabilityNameSchema,
  capabilityKind: agentCapabilityKindSchema,
  resultSchemaVersion: z.string().trim().min(1),
  allowedFallbackModes: z.array(agentFallbackModeSchema),
});
export type AgentCapabilityDescriptor = z.infer<
  typeof agentCapabilityDescriptorSchema
>;

const deterministicFallbacks = ["unavailable"] as const;
const assistedFallbacks = [
  "mock",
  "static_template",
  "unavailable",
] as const;

export const AGENT_CAPABILITY_CATALOG = Object.freeze({
  retrieveVerifiedEvidence: descriptor(
    "retrieveVerifiedEvidence",
    "deterministic_domain_service",
    deterministicFallbacks,
  ),
  buildInitialPortraitRecord: descriptor(
    "buildInitialPortraitRecord",
    "deterministic_domain_service",
    deterministicFallbacks,
  ),
  extractUserPrinciple: descriptor(
    "extractUserPrinciple",
    "llm_assisted_service",
    assistedFallbacks,
  ),
  detectTension: descriptor(
    "detectTension",
    "llm_assisted_service",
    assistedFallbacks,
  ),
  generateCharlieResponse: descriptor(
    "generateCharlieResponse",
    "llm_assisted_service",
    assistedFallbacks,
  ),
  proposeDocumentDiff: descriptor(
    "proposeDocumentDiff",
    "llm_assisted_service",
    assistedFallbacks,
  ),
  compareSemanticDrift: descriptor(
    "compareSemanticDrift",
    "llm_assisted_service",
    assistedFallbacks,
  ),
  buildDissentRecord: descriptor(
    "buildDissentRecord",
    "deterministic_domain_service",
    deterministicFallbacks,
  ),
  summarizePortraitShift: descriptor(
    "summarizePortraitShift",
    "llm_assisted_service",
    assistedFallbacks,
  ),
} satisfies Record<AgentCapabilityName, AgentCapabilityDescriptor>);

function descriptor(
  capability: AgentCapabilityName,
  capabilityKind: AgentCapabilityKind,
  allowedFallbackModes: readonly AgentFallbackMode[],
): AgentCapabilityDescriptor {
  return Object.freeze(
    agentCapabilityDescriptorSchema.parse({
      capability,
      capabilityKind,
      resultSchemaVersion: AGENT_RESULT_SCHEMA_VERSIONS[capability],
      allowedFallbackModes: [...allowedFallbackModes],
    }),
  );
}

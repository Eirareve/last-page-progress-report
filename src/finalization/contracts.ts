import type { z } from "zod";

import {
  finalEnvelopeAttestationSchema,
  finalizationBlockerCodeSchema,
  finalizationBlockerSchema,
  finalizationContextSchema,
  finalizationProvenanceStateSchema,
  finalizationResultSchema,
  finalizationSessionStateSchema,
} from "./schemas";

export type FinalizationBlockerCode = z.infer<
  typeof finalizationBlockerCodeSchema
>;
export type FinalizationBlocker = z.infer<typeof finalizationBlockerSchema>;
export type FinalizationResult = z.infer<typeof finalizationResultSchema>;
export type FinalizationContext = z.infer<typeof finalizationContextSchema>;
export type FinalEnvelopeAttestation = z.infer<
  typeof finalEnvelopeAttestationSchema
>;

export type FinalizationProvenanceState = z.infer<
  typeof finalizationProvenanceStateSchema
>;

/**
 * A concrete composition of the canonical generic SessionState. This is not
 * a second Session schema; it only supplies the Runtime and Provenance slots
 * that finalization reads.
 */
export type FinalizationSessionState = z.infer<
  typeof finalizationSessionStateSchema
>;

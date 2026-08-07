import type { z } from "zod";

import {
  contentGateAttestationMethodSchema,
  contentGateAttestationSchema,
  contentGateBindingSchema,
  contentGateEvaluationSchema,
  contentGateEvaluationStatusSchema,
  passedContentGateEvaluationBindingSchema,
  targetEnvironmentSchema,
} from "./schemas";

export type TargetEnvironment = z.infer<typeof targetEnvironmentSchema>;
export type ContentGateEvaluationStatus = z.infer<
  typeof contentGateEvaluationStatusSchema
>;
export type ContentGateBinding = z.infer<typeof contentGateBindingSchema>;
export type ContentGateEvaluation = z.infer<
  typeof contentGateEvaluationSchema
>;
export type PassedContentGateEvaluationBinding = z.infer<
  typeof passedContentGateEvaluationBindingSchema
>;
export type ContentGateAttestationMethod = z.infer<
  typeof contentGateAttestationMethodSchema
>;
export type ContentGateAttestation = z.infer<
  typeof contentGateAttestationSchema
>;

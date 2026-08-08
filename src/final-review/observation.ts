import type { FinalReviewExecutionObservation } from "./contracts";
import { finalReviewExecutionObservationSchema } from "./schemas";

export const ZERO_FINAL_REVIEW_EXECUTION_OBSERVATION = Object.freeze(
  finalReviewExecutionObservationSchema.parse({
    networkRetries: 0,
    structuredRepairs: 0,
    inputTokens: 0,
    outputTokens: 0,
    latencyMs: 0,
    estimatedCostUsdMicros: 0,
  }),
) satisfies FinalReviewExecutionObservation;

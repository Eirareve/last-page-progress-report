import type { CharlieSignatureReviewError } from "./contracts";
import { charlieSignatureReviewErrorSchema } from "./schemas";

export type CharlieSignatureReviewErrorCode =
  CharlieSignatureReviewError["code"];

const RETRYABLE_ERROR_CODES = new Set<CharlieSignatureReviewErrorCode>([
  "timeout",
  "rate_limited",
  "network_error",
  "invalid_output",
  "schema_validation_failed",
]);

export function createCharlieSignatureReviewError(
  code: CharlieSignatureReviewErrorCode,
  message: string,
): CharlieSignatureReviewError {
  return charlieSignatureReviewErrorSchema.parse({
    code,
    message,
    retryable: RETRYABLE_ERROR_CODES.has(code),
  });
}

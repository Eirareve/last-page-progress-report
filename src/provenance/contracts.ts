import type { z } from "zod";

import type {
  capabilityExecutionReceiptSchema,
  contractVersionVectorSchema,
  executionReceiptsDigestSchema,
  tokenUsageSchema,
} from "./schemas";

export type ContractVersionVector = z.infer<
  typeof contractVersionVectorSchema
>;
export type TokenUsage = z.infer<typeof tokenUsageSchema>;
export type CapabilityExecutionReceipt = z.infer<
  typeof capabilityExecutionReceiptSchema
>;
export type ExecutionReceiptsDigest = z.infer<
  typeof executionReceiptsDigestSchema
>;

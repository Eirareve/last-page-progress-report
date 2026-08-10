import type { CapabilityIdentifier } from "../runtime/contracts";
import { capabilityIdentifierSchema } from "../runtime/schemas";
import type { ConditionalReceiptInventoryInput } from "./contracts";
import { conditionalReceiptInventoryInputSchema } from "./schemas";

export const STAGE3_AGENT_LOGICAL_CAPABILITIES = Object.freeze([
  "retrieveVerifiedEvidence",
  "buildInitialPortraitRecord",
  "extractUserPrinciple",
  "detectTension",
  "generateCharlieResponse",
  "proposeDocumentDiff",
  "compareSemanticDrift",
  "buildDissentRecord",
  "summarizePortraitShift",
] as const satisfies readonly CapabilityIdentifier[]);

export const FINAL_REVIEW_CAPABILITY = "reviewCharlieSignature" as const;
export const PORTRAIT_SHIFT_COMPUTATION_CAPABILITY =
  "computePortraitShift" as const;

/**
 * Returns the unique trusted inventory injected into evaluateFinalization.
 * Placeholder mode cannot require a receipt claiming verified evidence. A
 * dissent receipt is required only on a path that creates one, and a user who
 * never requested signature review cannot require its service receipt.
 */
export function buildConditionalRequiredCapabilityInventory(
  input: ConditionalReceiptInventoryInput,
): readonly CapabilityIdentifier[] {
  const condition = conditionalReceiptInventoryInputSchema.parse(input);
  const required: CapabilityIdentifier[] =
    STAGE3_AGENT_LOGICAL_CAPABILITIES.filter((capability) => {
      if (capability === "retrieveVerifiedEvidence") {
        return condition.contentMode === "verified";
      }
      if (capability === "buildDissentRecord") {
        return condition.dissentRecordRequired;
      }
      return true;
    });
  required.push(PORTRAIT_SHIFT_COMPUTATION_CAPABILITY);
  if (condition.signatureReview === "requested") {
    required.push(FINAL_REVIEW_CAPABILITY);
  }
  const parsed = required.map((capability) =>
    capabilityIdentifierSchema.parse(capability),
  );
  return Object.freeze([...new Set(parsed)]);
}

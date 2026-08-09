import {
  computeStage3RequestFingerprint,
} from "../application";
import {
  serializableRequestContextSchema,
  type RequestContext,
} from "../runtime";
import type { Stage6LiveRequest } from "./contracts";
import { STAGE6_PROMPT_VERSION } from "./versions";

export async function bindStage6LiveRequestContext(input: {
  base: Stage6LiveRequest["operationContext"];
  capability: string;
  semanticMaterial: unknown;
  resultSchemaVersion: string;
  agentContractVersion: string | null;
  adapterVersion: string;
  abortSignal?: AbortSignal;
}): Promise<RequestContext> {
  const base = serializableRequestContextSchema.parse({
    ...input.base,
    capability: input.capability,
    inputFingerprint: `sha256:${"0".repeat(64)}`,
    promptVersion: STAGE6_PROMPT_VERSION,
    adapterVersion: input.adapterVersion,
  });
  const context = serializableRequestContextSchema.parse({
    ...base,
    inputFingerprint: await computeStage3RequestFingerprint({
      context: base,
      semanticMaterial: input.semanticMaterial,
      agentContractVersion: input.agentContractVersion,
      resultSchemaVersion: input.resultSchemaVersion,
    }),
  });
  return input.abortSignal === undefined
    ? context
    : Object.freeze({ ...context, abortSignal: input.abortSignal });
}

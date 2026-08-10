import type { z } from "zod";

import type {
  stage4EventSchema,
  stage4OperationResultEventSchema,
  stage4PersistenceSidecarsSchema,
  stage4PrivateInputsSchema,
  stage4SessionStateSchema,
  stage4FinalEnvelopeSchema,
  stage4UserEventSchema,
} from "./schemas";

export type Stage4SessionState = z.infer<typeof stage4SessionStateSchema>;
export type Stage4FinalEnvelope = z.infer<typeof stage4FinalEnvelopeSchema>;
export type Stage4UserEvent = z.infer<typeof stage4UserEventSchema>;
export type Stage4OperationResultEvent = z.infer<
  typeof stage4OperationResultEventSchema
>;
export type Stage4Event = z.infer<typeof stage4EventSchema>;
export type Stage4PrivateInputs = z.infer<typeof stage4PrivateInputsSchema>;
export type Stage4PersistenceSidecars = z.infer<
  typeof stage4PersistenceSidecarsSchema
>;

export type Stage4Reduction = Readonly<{
  state: Stage4SessionState;
  sidecars: Stage4PersistenceSidecars;
  disposition: "applied" | "ignored_stale_result";
  notice: string | null;
}>;

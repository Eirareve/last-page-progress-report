import type { z } from "zod";

import {
  charliePositionSchema,
  charlieResponseSchema,
  contentItemSchema,
  curatorialInterpretationSchema,
  dissentRecordSchema,
  evidenceCardSchema,
  originalInteractionSchema,
  userPrincipleSchema,
  verifiedFactSchema,
} from "../schemas/evidence.schema";

export type VerifiedFact = z.infer<typeof verifiedFactSchema>;
export type CuratorialInterpretation = z.infer<
  typeof curatorialInterpretationSchema
>;
export type OriginalInteraction = z.infer<typeof originalInteractionSchema>;
export type ContentItem = z.infer<typeof contentItemSchema>;
export type EvidenceCard = z.infer<typeof evidenceCardSchema>;
export type UserPrinciple = z.infer<typeof userPrincipleSchema>;
export type CharliePosition = z.infer<typeof charliePositionSchema>;
export type CharlieResponse = z.infer<typeof charlieResponseSchema>;
export type DissentRecord = z.infer<typeof dissentRecordSchema>;

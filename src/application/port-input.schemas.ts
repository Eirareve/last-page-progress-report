import { z } from "zod";

import {
  agentContentBindingSchema,
  agentRevisionBindingSchema,
  detectTensionInputSchema,
  extractUserPrincipleInputSchema,
  generateCharlieResponseInputSchema,
  proposeDocumentDiffInputSchema,
} from "../agent";

const { currentPrinciple: _currentPrinciple, ...detectTensionPortShape } =
  detectTensionInputSchema.shape;
const {
  principle: _responsePrinciple,
  tensions: _responseTensions,
  ...generateCharlieResponsePortShape
} = generateCharlieResponseInputSchema.shape;
const {
  principle: _diffPrinciple,
  charlieResponse: _diffCharlieResponse,
  ...proposeDocumentDiffPortShape
} = proposeDocumentDiffInputSchema.shape;

void _currentPrinciple;
void _responsePrinciple;
void _responseTensions;
void _diffPrinciple;
void _diffCharlieResponse;

export const roundAnalysisRuntimePortInputSchema = z.strictObject({
  extractUserPrinciple: extractUserPrincipleInputSchema,
  detectTension: z.strictObject(detectTensionPortShape),
  generateCharlieResponse: z.strictObject(generateCharlieResponsePortShape),
  proposeDocumentDiff: z.strictObject(proposeDocumentDiffPortShape),
  contentBinding: agentContentBindingSchema,
  revisions: agentRevisionBindingSchema,
});

export const plainSemanticRuntimePortInputSchema = z.strictObject({
  contentBinding: agentContentBindingSchema,
  sourcePreciseRevisionId: z.string().trim().min(1),
  targetPlainRevisionId: z.string().trim().min(1),
  preciseText: z.string(),
});

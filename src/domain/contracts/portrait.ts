import type { z } from "zod";

import type { CharlieStage } from "./experience";
import {
  finalPortraitChoiceSchema,
  initialPortraitChoiceSchema,
  initialPortraitRecordSchema,
  portraitDescriptorSchema,
  portraitPreludeSchema,
  portraitShiftComparisonSchema,
} from "../schemas/portrait.schema";

export type InitialPortraitChoice = z.infer<typeof initialPortraitChoiceSchema>;
export type FinalPortraitChoice = z.infer<typeof finalPortraitChoiceSchema>;
export type PortraitDescriptor = z.infer<typeof portraitDescriptorSchema>;
export type InitialPortraitRecord = z.infer<typeof initialPortraitRecordSchema>;
export type PortraitShiftComparison = z.infer<typeof portraitShiftComparisonSchema>;
export type PortraitPrelude = z.infer<typeof portraitPreludeSchema>;

const ALL_STAGES: readonly CharlieStage[] = ["early", "peak", "futureFacing"];

export function computePortraitShift(input: {
  initialChoice: InitialPortraitChoice;
  finalChoice: FinalPortraitChoice;
  relatedEvidenceIds?: readonly string[];
  relatedRevisionIds?: readonly string[];
}): PortraitShiftComparison {
  const initialIncludedStages = [input.initialChoice];
  const relatedEvidenceIds = uniqueSorted(input.relatedEvidenceIds ?? []);
  const relatedRevisionIds = uniqueSorted(input.relatedRevisionIds ?? []);

  if (input.finalChoice === "no_unique_answer") {
    return {
      comparisonKind: "no_unique_answer",
      initialChoice: input.initialChoice,
      finalChoice: "no_unique_answer",
      initialIncludedStages,
      finalIncludedStages: null,
      changed: true,
      newlyIncludedStages: [],
      excludedStages: [],
      relatedEvidenceIds,
      relatedRevisionIds,
    };
  }

  const finalIncludedStages =
    input.finalChoice === "all_three" ? [...ALL_STAGES] : [input.finalChoice];
  const newlyIncludedStages = finalIncludedStages.filter(
    (stage) => !initialIncludedStages.includes(stage),
  );
  const excludedStages = initialIncludedStages.filter(
    (stage) => !finalIncludedStages.includes(stage),
  );

  return {
    comparisonKind: "comparable",
    initialChoice: input.initialChoice,
    finalChoice: input.finalChoice,
    initialIncludedStages,
    finalIncludedStages,
    changed: newlyIncludedStages.length > 0 || excludedStages.length > 0,
    newlyIncludedStages,
    excludedStages,
    relatedEvidenceIds,
    relatedRevisionIds,
  };
}

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

import type {
  FinalizationContext,
  FinalizationSessionState,
} from "./contracts";
import { evaluateFinalization } from "./evaluate-finalization";

export function isFinalizable(
  state: FinalizationSessionState,
  context: FinalizationContext,
): boolean {
  return evaluateFinalization(state, context).eligible;
}

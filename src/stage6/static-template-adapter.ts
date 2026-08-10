import type {
  AgentExecutionEnvelope,
  PlainSemanticReviewPortInput,
  ProviderNeutralAgentPort,
  RoundAnalysisPortInput,
  SummarizePortraitShiftInput,
} from "../agent";
import {
  DeterministicMockAgentAdapter,
  MOCK_AGENT_ADAPTER_VERSION,
} from "../agent";
import type { RequestContext } from "../runtime";
import { STAGE6_STATIC_TEMPLATE_ADAPTER_VERSION } from "./versions";

/** A provider-free last-resort template with its own provenance identity. */
export class Stage6StaticSafetyTemplateAdapter
  implements ProviderNeutralAgentPort
{
  readonly executionMode = "mock" as const;
  readonly adapterVersion = STAGE6_STATIC_TEMPLATE_ADAPTER_VERSION;
  readonly #delegate = new DeterministicMockAgentAdapter();

  executeRoundAnalysis(
    input: RoundAnalysisPortInput,
    context: RequestContext,
  ): Promise<AgentExecutionEnvelope> {
    return this.#delegate.executeRoundAnalysis(input, mockContext(context));
  }

  executePlainSemanticReview(
    input: PlainSemanticReviewPortInput,
    context: RequestContext,
  ): Promise<AgentExecutionEnvelope> {
    return this.#delegate.executePlainSemanticReview(input, mockContext(context));
  }

  summarizePortraitShift(
    input: SummarizePortraitShiftInput,
    context: RequestContext,
  ): Promise<AgentExecutionEnvelope> {
    return this.#delegate.summarizePortraitShift(input, mockContext(context));
  }
}

function mockContext(context: RequestContext): RequestContext {
  return {
    ...context,
    adapterVersion: MOCK_AGENT_ADAPTER_VERSION,
    promptVersion: null,
  };
}

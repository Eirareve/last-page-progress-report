import type {
  AgentExecutionEnvelope,
  PlainSemanticReviewPortInput,
  ProviderNeutralAgentPort,
  RoundAnalysisPortInput,
  SummarizePortraitShiftInput,
} from "../../agent";
import {
  agentCapabilityError,
  plainSemanticReviewCandidateBundleSchema,
  roundAnalysisCandidateBundleSchema,
  summarizePortraitShiftCandidateSchema,
} from "../../agent";
import type { RequestContext } from "../../runtime";
import {
  buildPlainSemanticPrompt,
  buildPortraitShiftSummaryPrompt,
  buildRoundAnalysisPrompt,
} from "../prompts";
import {
  executeStage6StructuredCall,
  type Stage6StructuredCallOutcome,
} from "../provider-execution";
import { DEEPSEEK_OPENAI_ADAPTER_VERSION, STAGE6_PROMPT_VERSION } from "../versions";
import type { DeepSeekServerConfig } from "./config";
import type { DeepSeekOpenAICompatibleTransport } from "./transport";

export class DeepSeekLiveAgentAdapter implements ProviderNeutralAgentPort {
  readonly executionMode = "live" as const;
  readonly adapterVersion = DEEPSEEK_OPENAI_ADAPTER_VERSION;
  readonly #transport: DeepSeekOpenAICompatibleTransport;
  readonly #config: DeepSeekServerConfig;

  constructor(input: {
    transport: DeepSeekOpenAICompatibleTransport;
    config: DeepSeekServerConfig;
  }) {
    this.#transport = input.transport;
    this.#config = input.config;
  }

  async executeRoundAnalysis(
    input: RoundAnalysisPortInput,
    context: RequestContext,
  ): Promise<AgentExecutionEnvelope> {
    const invalid = validateContext(context, this.adapterVersion);
    if (invalid !== null) return agentError("extractUserPrinciple", invalid);
    return mapOutcome(
      await executeStage6StructuredCall({
        transport: this.#transport,
        prompt: buildRoundAnalysisPrompt(input),
        candidateSchema: roundAnalysisCandidateBundleSchema,
        timeoutMs: this.#config.requestTimeoutMs,
        abortSignal: context.abortSignal,
      }),
      "extractUserPrinciple",
    );
  }

  async executePlainSemanticReview(
    input: PlainSemanticReviewPortInput,
    context: RequestContext,
  ): Promise<AgentExecutionEnvelope> {
    const invalid = validateContext(context, this.adapterVersion);
    if (invalid !== null) return agentError("compareSemanticDrift", invalid);
    return mapOutcome(
      await executeStage6StructuredCall({
        transport: this.#transport,
        prompt: buildPlainSemanticPrompt(input),
        candidateSchema: plainSemanticReviewCandidateBundleSchema,
        timeoutMs: this.#config.requestTimeoutMs,
        abortSignal: context.abortSignal,
      }),
      "compareSemanticDrift",
    );
  }

  async summarizePortraitShift(
    input: SummarizePortraitShiftInput,
    context: RequestContext,
  ): Promise<AgentExecutionEnvelope> {
    const invalid = validateContext(context, this.adapterVersion);
    if (invalid !== null) return agentError("summarizePortraitShift", invalid);
    return mapOutcome(
      await executeStage6StructuredCall({
        transport: this.#transport,
        prompt: buildPortraitShiftSummaryPrompt(input),
        candidateSchema: summarizePortraitShiftCandidateSchema,
        timeoutMs: this.#config.requestTimeoutMs,
        abortSignal: context.abortSignal,
      }),
      "summarizePortraitShift",
    );
  }
}
function validateContext(
  context: RequestContext,
  adapterVersion: string,
): string | null {
  if (context.requestedMode !== "live") return "Live adapter requires live mode";
  if (context.adapterVersion !== adapterVersion) {
    return "RequestContext adapter version does not match the live adapter";
  }
  if (context.promptVersion !== STAGE6_PROMPT_VERSION) {
    return "RequestContext prompt version does not match Stage 6";
  }
  return null;
}

function mapOutcome(
  outcome: Stage6StructuredCallOutcome,
  capability: "extractUserPrinciple" | "compareSemanticDrift" | "summarizePortraitShift",
): AgentExecutionEnvelope {
  return outcome.outcomeKind === "candidate"
    ? outcome
    : {
        outcomeKind: "error",
        error: agentCapabilityError(capability, outcome.code, outcome.summary),
        observation: outcome.observation,
      };
}

function agentError(
  capability: "extractUserPrinciple" | "compareSemanticDrift" | "summarizePortraitShift",
  summary: string,
): AgentExecutionEnvelope {
  return {
    outcomeKind: "error",
    error: agentCapabilityError(
      capability,
      "schema_validation_failed",
      summary,
    ),
    observation: {
      networkRetries: 0,
      structuredRepairs: 0,
      inputTokens: 0,
      outputTokens: 0,
      latencyMs: 0,
      estimatedCostUsdMicros: 0,
    },
  };
}

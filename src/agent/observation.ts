import type { AgentExecutionObservation } from "./contracts";
import { agentExecutionObservationSchema } from "./schemas";

export const ZERO_AGENT_EXECUTION_OBSERVATION = Object.freeze(
  agentExecutionObservationSchema.parse({
    networkRetries: 0,
    structuredRepairs: 0,
    inputTokens: 0,
    outputTokens: 0,
    latencyMs: 0,
    estimatedCostUsdMicros: 0,
  }),
) satisfies AgentExecutionObservation;

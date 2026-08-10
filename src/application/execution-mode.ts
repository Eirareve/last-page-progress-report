import type {
  AgentExecutionRoute,
  ExecutionAvailability,
  RequestedExecutionMode,
} from "./orchestration.contracts";

/** A trusted availability snapshot, never Candidate data, chooses the route. */
export function resolveAgentExecutionRoute(input: {
  requestedMode: RequestedExecutionMode;
  availability: ExecutionAvailability;
}): AgentExecutionRoute {
  if (input.requestedMode === "mock") {
    return input.availability.mock
      ? { resolvedMode: "mock", fallbackReason: null }
      : { resolvedMode: "unavailable", fallbackReason: "mock_adapter_unavailable" };
  }
  if (input.availability.live) {
    return { resolvedMode: "live", fallbackReason: null };
  }
  return input.availability.mock
    ? { resolvedMode: "mock", fallbackReason: "live_adapter_unavailable" }
    : { resolvedMode: "unavailable", fallbackReason: "agent_adapter_unavailable" };
}

/** Final Review never turns a failed/unavailable live request into a Mock verdict. */
export function resolveFinalReviewExecutionRoute(input: {
  requestedMode: RequestedExecutionMode;
  availability: ExecutionAvailability;
}): AgentExecutionRoute {
  if (input.requestedMode === "mock") {
    return input.availability.mock
      ? { resolvedMode: "mock", fallbackReason: null }
      : { resolvedMode: "unavailable", fallbackReason: "mock_adapter_unavailable" };
  }
  return input.availability.live
    ? { resolvedMode: "live", fallbackReason: null }
    : { resolvedMode: "unavailable", fallbackReason: "live_review_unavailable" };
}

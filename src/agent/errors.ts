import type { AgentCapabilityName } from "./capability-catalog";
import type {
  AgentCapabilityError,
  AgentCapabilityErrorCode,
  AgentOperationResult,
} from "./contracts";
import {
  AGENT_RETRYABLE_ERROR_CODES,
  agentCapabilityErrorSchema,
} from "./schemas";

export function agentCapabilityError(
  capability: AgentCapabilityName,
  code: AgentCapabilityErrorCode,
  summary: string,
  _declaredRetryable?: boolean,
): AgentCapabilityError {
  // Kept as a compatibility parameter for orchestration call sites; callers
  // cannot override the frozen code-to-retryability mapping.
  void _declaredRetryable;
  const retryable = AGENT_RETRYABLE_ERROR_CODES.includes(
    code as (typeof AGENT_RETRYABLE_ERROR_CODES)[number],
  );
  return agentCapabilityErrorSchema.parse({
    kind: "agent_capability_error",
    capability,
    code,
    summary,
    retryable,
  });
}

export function agentSuccess<T>(value: T): AgentOperationResult<T> {
  return Object.freeze({ ok: true, value });
}

export function agentFailure<T>(
  error: AgentCapabilityError,
): AgentOperationResult<T> {
  return Object.freeze({ ok: false, error });
}

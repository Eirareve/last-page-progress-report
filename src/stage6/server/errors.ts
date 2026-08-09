import type { Stage6HttpErrorCode } from "../contracts";

export type Stage6ServerExecutionErrorCode = Extract<
  Stage6HttpErrorCode,
  | "content_gate_unavailable"
  | "idempotency_conflict"
  | "budget_state_mismatch"
  | "request_cancelled"
  | "invalid_request"
>;

export class Stage6ServerExecutionError extends Error {
  readonly code: Stage6ServerExecutionErrorCode;

  constructor(code: Stage6ServerExecutionErrorCode, message: string) {
    super(message);
    this.name = "Stage6ServerExecutionError";
    this.code = code;
  }
}

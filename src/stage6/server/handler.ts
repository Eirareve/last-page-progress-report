import type { Stage3TerminalArtifact } from "../../application";
import {
  FixedWindowRateLimiter,
  KeyedConcurrencyLimiter,
  readJsonBodyWithLimit,
} from "../http-guards";
import type {
  Stage6HttpErrorCode,
  Stage6LiveRequest,
  Stage6LiveResponse,
} from "../contracts";
import {
  stage6LiveRequestSchema,
  stage6LiveResponseSchema,
} from "../contracts";
import { STAGE6_TRANSPORT_VERSION } from "../versions";
import type { Stage6ServerConfig } from "./config";
import { Stage6ServerExecutionError } from "./errors";

export type Stage6OfflineExecutor = (
  request: Stage6LiveRequest,
  context: Readonly<{ abortSignal: AbortSignal }>,
) => Promise<Stage3TerminalArtifact>;

export function createStage6AgentPostHandler(input: {
  config: Stage6ServerConfig;
  execute: Stage6OfflineExecutor;
  sourceKey?: (request: Request) => string;
}) {
  const sessionRate = new FixedWindowRateLimiter(
    input.config.limits.sessionRequestsPerMinute,
    60_000,
  );
  const sourceRate = new FixedWindowRateLimiter(
    input.config.limits.sourceRequestsPerMinute,
    60_000,
  );
  const concurrency = new KeyedConcurrencyLimiter(
    input.config.limits.globalConcurrency,
    input.config.limits.sessionConcurrency,
  );

  return async function handleStage6AgentPost(request: Request): Promise<Response> {
    if (input.config.liveGate === "closed") {
      return errorResponse(503, null, "live_api_gate_closed", false);
    }
    const body = await readJsonBodyWithLimit(
      request,
      input.config.limits.requestBodyBytes,
    );
    if (!body.ok) {
      const status =
        body.code === "invalid_content_type"
          ? 415
          : body.code === "payload_too_large"
            ? 413
            : 400;
      return errorResponse(status, null, body.code, false);
    }
    const parsed = stage6LiveRequestSchema.safeParse(body.value);
    if (!parsed.success) {
      return errorResponse(400, null, "invalid_request", false);
    }
    const liveRequest = parsed.data;
    const sessionDecision = sessionRate.check(liveRequest.sessionId);
    const sourceDecision = sourceRate.check(
      input.sourceKey?.(request) ?? "unidentified-source",
    );
    if (!sessionDecision.allowed || !sourceDecision.allowed) {
      return errorResponse(
        429,
        liveRequest.operationContext.requestId,
        "rate_limited",
        true,
        Math.max(sessionDecision.retryAfterMs, sourceDecision.retryAfterMs),
      );
    }
    const release = concurrency.tryAcquire(liveRequest.sessionId);
    if (release === null) {
      return errorResponse(
        429,
        liveRequest.operationContext.requestId,
        "concurrency_limited",
        true,
      );
    }
    try {
      const artifact = await input.execute(liveRequest, {
        abortSignal: request.signal,
      });
      const response = stage6LiveResponseSchema.safeParse({
        stage6TransportVersion: STAGE6_TRANSPORT_VERSION,
        outcomeKind: "terminal_artifact",
        requestId: liveRequest.operationContext.requestId,
        artifact,
      });
      if (!response.success) {
        return errorResponse(
          502,
          liveRequest.operationContext.requestId,
          "invalid_terminal_artifact",
          false,
        );
      }
      return jsonResponse(response.data, 200);
    } catch (caught) {
      if (caught instanceof Stage6ServerExecutionError) {
        return errorResponse(
          executionErrorStatus(caught.code),
          liveRequest.operationContext.requestId,
          caught.code,
          false,
        );
      }
      return errorResponse(
        503,
        liveRequest.operationContext.requestId,
        "internal_error",
        true,
      );
    } finally {
      release();
    }
  };
}

function errorResponse(
  status: number,
  requestId: string | null,
  code: Stage6HttpErrorCode,
  retryable: boolean,
  retryAfterMs?: number,
): Response {
  const response = stage6LiveResponseSchema.parse({
    stage6TransportVersion: STAGE6_TRANSPORT_VERSION,
    outcomeKind: "error",
    requestId,
    error: { code, message: httpMessage(code), retryable },
  });
  const headers = new Headers({ "Cache-Control": "no-store" });
  if (retryAfterMs !== undefined) {
    headers.set("Retry-After", String(Math.max(1, Math.ceil(retryAfterMs / 1_000))));
  }
  return jsonResponse(response, status, headers);
}

function jsonResponse(
  body: Stage6LiveResponse,
  status: number,
  headers = new Headers({ "Cache-Control": "no-store" }),
): Response {
  headers.set("Content-Type", "application/json; charset=utf-8");
  return new Response(JSON.stringify(body), { status, headers });
}

function httpMessage(
  code: Extract<Stage6LiveResponse, { outcomeKind: "error" }>["error"]["code"],
): string {
  switch (code) {
    case "live_api_gate_closed":
      return "Live model execution is not enabled";
    case "invalid_content_type":
      return "Expected an application/json request";
    case "payload_too_large":
      return "Request body exceeds the configured limit";
    case "invalid_request":
      return "Request did not match the Stage 6 transport contract";
    case "rate_limited":
      return "Request rate limit exceeded";
    case "concurrency_limited":
      return "A live operation is already active for this session";
    case "content_gate_unavailable":
      return "Verified content is unavailable for live execution";
    case "idempotency_conflict":
      return "The request identity conflicts with an existing live operation";
    case "budget_state_mismatch":
      return "The session budget state does not match the server ledger";
    case "request_cancelled":
      return "The live operation was cancelled before commit";
    case "invalid_terminal_artifact":
      return "Server execution returned an invalid terminal artifact";
    case "internal_error":
      return "Live execution could not be completed";
  }
}

function executionErrorStatus(
  code: Stage6ServerExecutionError["code"],
): number {
  switch (code) {
    case "invalid_request":
      return 400;
    case "idempotency_conflict":
    case "budget_state_mismatch":
    case "request_cancelled":
      return 409;
    case "content_gate_unavailable":
      return 503;
  }
}

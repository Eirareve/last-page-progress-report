import type { Stage3TerminalArtifact } from "../application";
import type {
  Stage6HttpErrorCode,
  Stage6LiveRequest,
  Stage6LiveResponse,
} from "./contracts";
import {
  stage6LiveRequestSchema,
  stage6LiveResponseSchema,
} from "./contracts";

const MAXIMUM_CLIENT_RESPONSE_BYTES = 512 * 1024;

export interface Stage6LiveApplicationClient {
  execute(
    request: Stage6LiveRequest,
    abortSignal?: AbortSignal,
  ): Promise<Stage3TerminalArtifact>;
}

export class Stage6LiveHttpError extends Error {
  readonly code: Stage6HttpErrorCode | "network_error" | "invalid_response";
  readonly retryable: boolean;

  constructor(input: {
    code: Stage6LiveHttpError["code"];
    message: string;
    retryable: boolean;
  }) {
    super(input.message);
    this.name = "Stage6LiveHttpError";
    this.code = input.code;
    this.retryable = input.retryable;
  }
}

export class Stage6LiveHttpClient implements Stage6LiveApplicationClient {
  readonly #fetch: typeof fetch;
  readonly #endpoint: string;

  constructor(input: {
    fetchImplementation?: typeof fetch;
    endpoint?: string;
  } = {}) {
    this.#fetch = input.fetchImplementation ?? fetch;
    this.#endpoint = input.endpoint ?? "/api/agent";
  }

  async execute(
    requestValue: Stage6LiveRequest,
    abortSignal?: AbortSignal,
  ): Promise<Stage3TerminalArtifact> {
    const request = stage6LiveRequestSchema.safeParse(requestValue);
    if (!request.success) {
      throw new Stage6LiveHttpError({
        code: "invalid_request",
        message: "Live request failed the local transport contract",
        retryable: false,
      });
    }
    let response: Response;
    try {
      response = await this.#fetch(this.#endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request.data),
        cache: "no-store",
        signal: abortSignal,
      });
    } catch {
      if (abortSignal?.aborted) {
        throw new Stage6LiveHttpError({
          code: "request_cancelled",
          message: "Live server request was cancelled",
          retryable: false,
        });
      }
      throw new Stage6LiveHttpError({
        code: "network_error",
        message: "Live server request failed",
        retryable: true,
      });
    }
    const raw = await readBoundedResponse(response);
    if (raw === null) {
      throw new Stage6LiveHttpError({
        code: "invalid_response",
        message: "Live server returned an unreadable response",
        retryable: false,
      });
    }
    let unknownResponse: unknown;
    try {
      unknownResponse = JSON.parse(raw) as unknown;
    } catch {
      throw new Stage6LiveHttpError({
        code: "invalid_response",
        message: "Live server returned invalid JSON",
        retryable: false,
      });
    }
    const parsed = stage6LiveResponseSchema.safeParse(unknownResponse);
    if (!parsed.success) {
      throw new Stage6LiveHttpError({
        code: "invalid_response",
        message: "Live server response failed its strict contract",
        retryable: false,
      });
    }
    return unwrap(parsed.data);
  }
}

function unwrap(response: Stage6LiveResponse): Stage3TerminalArtifact {
  if (response.outcomeKind === "terminal_artifact") return response.artifact;
  throw new Stage6LiveHttpError({
    code: response.error.code,
    message: response.error.message,
    retryable: response.error.retryable,
  });
}

async function readBoundedResponse(response: Response): Promise<string | null> {
  const declaredLength = response.headers.get("content-length");
  if (
    declaredLength !== null &&
    Number.isFinite(Number(declaredLength)) &&
    Number(declaredLength) > MAXIMUM_CLIENT_RESPONSE_BYTES
  ) {
    void response.body?.cancel().catch(() => undefined);
    return null;
  }
  if (response.body === null) return null;
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const next = await reader.read();
    if (next.done) break;
    total += next.value.byteLength;
    if (total > MAXIMUM_CLIENT_RESPONSE_BYTES) {
      void reader.cancel().catch(() => undefined);
      return null;
    }
    chunks.push(next.value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}

import { describe, expect, it, vi } from "vitest";

import {
  Stage6LiveHttpClient,
  Stage6LiveHttpError,
  STAGE6_TRANSPORT_VERSION,
} from "@/stage6";
import { makeRoundRequest } from "./transport-contract.test";

describe("Stage 6 browser live client", () => {
  it("returns only a stable typed HTTP error without reflecting raw content", async () => {
    const fetchSpy = vi.fn(async () =>
      new Response(
        JSON.stringify({
          stage6TransportVersion: STAGE6_TRANSPORT_VERSION,
          outcomeKind: "error",
          requestId: "request-application-1",
          error: {
            code: "live_api_gate_closed",
            message: "Live model execution is not enabled",
            retryable: false,
          },
        }),
        { status: 503 },
      ),
    );
    const client = new Stage6LiveHttpClient({
      fetchImplementation: fetchSpy as typeof fetch,
    });

    await expect(client.execute(makeRoundRequest())).rejects.toMatchObject({
      code: "live_api_gate_closed",
      retryable: false,
    });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("rejects a local contract violation before fetch", async () => {
    const fetchSpy = vi.fn();
    const client = new Stage6LiveHttpClient({
      fetchImplementation: fetchSpy as typeof fetch,
    });
    const request = makeRoundRequest();
    request.operationContext.requestedMode = "mock" as "live";

    await expect(client.execute(request)).rejects.toBeInstanceOf(
      Stage6LiveHttpError,
    );
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it.each([
    new Response("not-json", { status: 502 }),
    new Response("{}", {
      status: 200,
      headers: { "content-length": String(512 * 1024 + 1) },
    }),
  ])("rejects malformed or oversized responses", async (response) => {
    const client = new Stage6LiveHttpClient({
      fetchImplementation: (async () => response.clone()) as typeof fetch,
    });

    await expect(client.execute(makeRoundRequest())).rejects.toMatchObject({
      code: "invalid_response",
    });
  });

  it("maps fetch exceptions to a stable network error", async () => {
    const client = new Stage6LiveHttpClient({
      fetchImplementation: (async () => {
        throw new Error("raw browser network detail");
      }) as typeof fetch,
    });

    let caught: unknown;
    try {
      await client.execute(makeRoundRequest());
    } catch (error) {
      caught = error;
    }
    expect(caught).toMatchObject({ code: "network_error", retryable: true });
    expect(String(caught)).not.toContain("raw browser network detail");
  });

  it("keeps cancellation distinct from a retryable network failure", async () => {
    const controller = new AbortController();
    controller.abort();
    const client = new Stage6LiveHttpClient({
      fetchImplementation: (async (_input, init) => {
        if (init?.signal instanceof AbortSignal && init.signal.aborted) {
          throw new DOMException("synthetic abort detail", "AbortError");
        }
        return new Response("{}");
      }) as typeof fetch,
    });

    await expect(
      client.execute(makeRoundRequest(), controller.signal),
    ).rejects.toMatchObject({
      code: "request_cancelled",
      retryable: false,
    });
  });
});

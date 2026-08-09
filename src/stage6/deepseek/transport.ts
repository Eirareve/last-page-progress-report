import { z } from "zod";

import type {
  Stage6ProviderAttemptObservation,
  Stage6ProviderAttemptOutcome,
  Stage6ProviderAttemptRequest,
  Stage6ProviderTransport,
} from "../provider-execution";
import type { DeepSeekServerConfig } from "./config";

const deepSeekResponseSchema = z.object({
  model: z.string().trim().min(1),
  choices: z
    .array(
      z.object({
        message: z.object({ content: z.string().nullable() }),
      }),
    )
    .min(1),
  usage: z
    .object({
      prompt_tokens: z.number().int().nonnegative(),
      completion_tokens: z.number().int().nonnegative(),
      total_tokens: z.number().int().nonnegative(),
    })
    .optional(),
});

export class DeepSeekOpenAICompatibleTransport
  implements Stage6ProviderTransport
{
  readonly provider: string;
  readonly modelName: string;
  readonly #config: DeepSeekServerConfig;
  readonly #fetch: typeof fetch;

  constructor(input: {
    config: DeepSeekServerConfig;
    fetchImplementation?: typeof fetch;
  }) {
    this.#config = input.config;
    this.#fetch = input.fetchImplementation ?? fetch;
    this.provider = input.config.provider;
    this.modelName = input.config.modelName;
  }

  async execute(
    request: Stage6ProviderAttemptRequest,
    signal: AbortSignal,
  ): Promise<Stage6ProviderAttemptOutcome> {
    const startedAt = performance.now();
    let body: string;
    try {
      body = this.#buildRequestBody(request);
    } catch {
      return error("invalid_output", observation(0, 0, elapsed(startedAt)));
    }
    const encodedBody = new TextEncoder().encode(body);
    if (encodedBody.byteLength > this.#config.maximumRequestBytes) {
      return error("invalid_output", observation(0, 0, elapsed(startedAt)));
    }
    if (body.includes(this.#config.apiKey)) {
      return error("invalid_output", observation(0, 0, elapsed(startedAt)));
    }

    let response: Response;
    try {
      response = await this.#fetch(this.#config.chatCompletionsUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.#config.apiKey}`,
          "Content-Type": "application/json",
        },
        body,
        cache: "no-store",
        signal,
      });
    } catch (caught) {
      return error(
        isAbortError(caught) ? "timeout" : "network_error",
        observation(0, 0, elapsed(startedAt)),
      );
    }

    const code = httpErrorCode(response.status);
    if (code !== null) {
      await response.body?.cancel();
      return error(code, observation(0, 0, elapsed(startedAt)));
    }
    const responseText = await readResponseBody(
      response,
      this.#config.maximumResponseBytes,
    );
    if (responseText === null) {
      return error("invalid_output", observation(0, 0, elapsed(startedAt)));
    }
    let rawResponse: unknown;
    try {
      rawResponse = JSON.parse(responseText.trim()) as unknown;
    } catch {
      return error("invalid_output", observation(0, 0, elapsed(startedAt)));
    }
    const parsedResponse = deepSeekResponseSchema.safeParse(rawResponse);
    if (!parsedResponse.success) {
      return error("invalid_output", observation(0, 0, elapsed(startedAt)));
    }
    const content = parsedResponse.data.choices[0]?.message.content?.trim();
    const usage = parsedResponse.data.usage;
    const attemptObservation = observation(
      usage?.prompt_tokens ?? 0,
      usage?.completion_tokens ?? 0,
      elapsed(startedAt),
    );
    if (!content) return error("invalid_output", attemptObservation);
    try {
      return Object.freeze({
        outcomeKind: "candidate",
        candidate: JSON.parse(content) as unknown,
        observation: attemptObservation,
      });
    } catch {
      return error("invalid_output", attemptObservation);
    }
  }

  #buildRequestBody(request: Stage6ProviderAttemptRequest): string {
    assertNoForbiddenProviderKeys(request.prompt.trustedData);
    assertNoForbiddenProviderKeys(request.prompt.untrustedData);
    assertNoForbiddenProviderKeys(request.outputJsonSchema);
    assertNoForbiddenProviderKeys(request.previousCandidate);
    const systemContent = [
      request.prompt.systemInstruction,
      "Return one valid JSON object and no Markdown.",
      `The JSON object must match this Draft 7 JSON Schema: ${JSON.stringify(
        request.outputJsonSchema,
      )}`,
    ].join("\n\n");
    const userPayload: Record<string, unknown> = {
      trustedData: request.prompt.trustedData,
      untrustedData: request.prompt.untrustedData,
    };
    if (request.attemptKind === "structured_repair") {
      userPayload.repairData = {
        validationIssues: request.validationIssues ?? [],
        previousCandidate: request.previousCandidate,
      };
    }
    return JSON.stringify({
      model: this.#config.modelName,
      messages: [
        { role: "system", content: systemContent },
        { role: "user", content: JSON.stringify(userPayload) },
      ],
      response_format: { type: "json_object" },
      thinking: { type: "disabled" },
      max_tokens: maximumOutputTokens(request.prompt.promptKind),
      stream: false,
    });
  }
}

function maximumOutputTokens(
  promptKind: Stage6ProviderAttemptRequest["prompt"]["promptKind"],
): number {
  switch (promptKind) {
    case "round_analysis":
      return 1_200;
    case "plain_semantic_review":
      return 1_600;
    case "portrait_shift_summary":
      return 600;
    case "charlie_signature_review":
      return 1_000;
  }
}

function observation(
  inputTokens: number,
  outputTokens: number,
  latencyMs: number,
): Stage6ProviderAttemptObservation {
  return {
    inputTokens,
    outputTokens,
    latencyMs,
    estimatedCostUsdMicros: Math.ceil(
      inputTokens * 0.435 + outputTokens * 0.87,
    ),
  };
}

function error(
  code: Extract<
    Stage6ProviderAttemptOutcome,
    { outcomeKind: "error" }
  >["code"],
  attemptObservation: Stage6ProviderAttemptObservation,
): Stage6ProviderAttemptOutcome {
  return Object.freeze({
    outcomeKind: "error",
    code,
    observation: attemptObservation,
  });
}

function httpErrorCode(status: number) {
  if (status >= 200 && status < 300) return null;
  if (status === 408) return "timeout" as const;
  if (status === 429) return "rate_limited" as const;
  if (status >= 500) return "network_error" as const;
  return "invalid_output" as const;
}

function isAbortError(caught: unknown): boolean {
  return caught instanceof DOMException && caught.name === "AbortError";
}

function elapsed(startedAt: number): number {
  return Math.max(0, Math.round(performance.now() - startedAt));
}

async function readResponseBody(
  response: Response,
  maximumBytes: number,
): Promise<string | null> {
  const declaredLength = response.headers.get("content-length");
  if (
    declaredLength !== null &&
    Number.isFinite(Number(declaredLength)) &&
    Number(declaredLength) > maximumBytes
  ) {
    await response.body?.cancel();
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
    if (total > maximumBytes) {
      await reader.cancel();
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

function assertNoForbiddenProviderKeys(value: unknown): void {
  if (Array.isArray(value)) {
    value.forEach(assertNoForbiddenProviderKeys);
    return;
  }
  if (value === null || typeof value !== "object") return;
  for (const [key, nested] of Object.entries(value)) {
    const normalizedKey = key.replace(/[\s_-]/gu, "").toLocaleLowerCase("en-US");
    if (FORBIDDEN_PROVIDER_KEYS.has(normalizedKey)) {
      throw new Error("Provider payload contains a forbidden data key");
    }
    assertNoForbiddenProviderKeys(nested);
  }
}

const FORBIDDEN_PROVIDER_KEYS = new Set([
  "internalexcerpt",
  "apikey",
  "authorization",
  "secret",
  "secrets",
  "password",
  "credential",
  "credentials",
  "accesstoken",
  "refreshtoken",
  "bearertoken",
]);

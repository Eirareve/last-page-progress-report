import { z } from "zod";

import type {
  AgentCapabilityErrorCode,
  AgentExecutionObservation,
} from "../agent";
import { agentExecutionObservationSchema } from "../agent";
import type { Stage6PromptEnvelope } from "./prompts";

export type Stage6ProviderAttemptKind =
  | "primary"
  | "network_retry"
  | "structured_repair";

export type Stage6ProviderAttemptObservation = Readonly<{
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
  estimatedCostUsdMicros: number;
}>;

export type Stage6ProviderAttemptOutcome =
  | Readonly<{
      outcomeKind: "candidate";
      candidate: unknown;
      observation: Stage6ProviderAttemptObservation;
    }>
  | Readonly<{
      outcomeKind: "error";
      code: Extract<
        AgentCapabilityErrorCode,
        "timeout" | "rate_limited" | "network_error" | "invalid_output"
      >;
      observation: Stage6ProviderAttemptObservation;
    }>;

export type Stage6ProviderAttemptRequest = Readonly<{
  attemptKind: Stage6ProviderAttemptKind;
  prompt: Stage6PromptEnvelope;
  outputJsonSchema: Readonly<Record<string, unknown>>;
  previousCandidate?: unknown;
  validationIssues?: readonly string[];
}>;

export interface Stage6ProviderTransport {
  readonly provider: string;
  readonly modelName: string;
  execute(
    request: Stage6ProviderAttemptRequest,
    signal: AbortSignal,
  ): Promise<Stage6ProviderAttemptOutcome>;
}

export type Stage6StructuredCallOutcome =
  | Readonly<{
      outcomeKind: "candidate";
      candidate: unknown;
      observation: AgentExecutionObservation;
    }>
  | Readonly<{
      outcomeKind: "error";
      code: AgentCapabilityErrorCode;
      summary: string;
      observation: AgentExecutionObservation;
    }>;

export async function executeStage6StructuredCall(input: {
  transport: Stage6ProviderTransport;
  prompt: Stage6PromptEnvelope;
  candidateSchema: z.ZodType<unknown>;
  timeoutMs: number;
  abortSignal?: AbortSignal;
}): Promise<Stage6StructuredCallOutcome> {
  if (!Number.isFinite(input.timeoutMs) || input.timeoutMs <= 0) {
    throw new TypeError("timeoutMs must be a positive finite number");
  }
  const observations: Stage6ProviderAttemptObservation[] = [];
  let networkRetries = 0;
  let structuredRepairs = 0;
  const outputJsonSchema = z.toJSONSchema(input.candidateSchema, {
    target: "draft-07",
    unrepresentable: "any",
  });

  let outcome = await runAttempt(input, {
    attemptKind: "primary",
    prompt: input.prompt,
    outputJsonSchema,
  });
  observations.push(outcome.observation);
  if (
    outcome.outcomeKind === "error" &&
    isNetworkRetryable(outcome.code) &&
    !input.abortSignal?.aborted
  ) {
    networkRetries = 1;
    outcome = await runAttempt(input, {
      attemptKind: "network_retry",
      prompt: input.prompt,
      outputJsonSchema,
    });
    observations.push(outcome.observation);
  }
  if (outcome.outcomeKind === "error") {
    return failure(
      outcome.code,
      technicalSummary(outcome.code),
      aggregateObservation(input.transport, observations, networkRetries, 0),
    );
  }

  let parsed = input.candidateSchema.safeParse(outcome.candidate);
  if (!parsed.success) {
    if (input.abortSignal?.aborted) {
      return failure(
        "network_error",
        "Provider request was cancelled",
        aggregateObservation(input.transport, observations, networkRetries, 0),
      );
    }
    structuredRepairs = 1;
    const repair = await runAttempt(input, {
      attemptKind: "structured_repair",
      prompt: input.prompt,
      outputJsonSchema,
      previousCandidate: outcome.candidate,
      validationIssues: parsed.error.issues.map((issue) =>
        issue.path.length === 0 ? issue.code : issue.path.join("."),
      ),
    });
    observations.push(repair.observation);
    if (repair.outcomeKind === "error") {
      return failure(
        repair.code,
        technicalSummary(repair.code),
        aggregateObservation(
          input.transport,
          observations,
          networkRetries,
          structuredRepairs,
        ),
      );
    }
    parsed = input.candidateSchema.safeParse(repair.candidate);
    if (!parsed.success) {
      return failure(
        "schema_validation_failed",
        "Provider candidate failed the strict schema after one repair",
        aggregateObservation(
          input.transport,
          observations,
          networkRetries,
          structuredRepairs,
        ),
      );
    }
    outcome = repair;
  }

  return Object.freeze({
    outcomeKind: "candidate",
    candidate: parsed.data,
    observation: aggregateObservation(
      input.transport,
      observations,
      networkRetries,
      structuredRepairs,
    ),
  });
}

async function runAttempt(
  input: {
    transport: Stage6ProviderTransport;
    timeoutMs: number;
    abortSignal?: AbortSignal;
  },
  request: Stage6ProviderAttemptRequest,
): Promise<Stage6ProviderAttemptOutcome> {
  const controller = new AbortController();
  const signal = input.abortSignal === undefined
    ? controller.signal
    : AbortSignal.any([controller.signal, input.abortSignal]);
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<Stage6ProviderAttemptOutcome>((resolve) => {
    timeout = setTimeout(() => {
      controller.abort();
      resolve({
        outcomeKind: "error",
        code: "timeout",
        observation: zeroAttemptObservation(input.timeoutMs),
      });
    }, input.timeoutMs);
  });
  try {
    return await Promise.race([
      input.transport.execute(request, signal).catch(() => ({
        outcomeKind: "error" as const,
        code: "network_error" as const,
        observation: zeroAttemptObservation(0),
      })),
      deadline,
    ]);
  } finally {
    if (timeout !== undefined) clearTimeout(timeout);
  }
}

function aggregateObservation(
  transport: Stage6ProviderTransport,
  attempts: readonly Stage6ProviderAttemptObservation[],
  networkRetries: number,
  structuredRepairs: number,
): AgentExecutionObservation {
  const total = attempts.reduce(
    (sum, current) => ({
      inputTokens: sum.inputTokens + current.inputTokens,
      outputTokens: sum.outputTokens + current.outputTokens,
      latencyMs: sum.latencyMs + current.latencyMs,
      estimatedCostUsdMicros:
        sum.estimatedCostUsdMicros + current.estimatedCostUsdMicros,
    }),
    zeroAttemptObservation(0),
  );
  return agentExecutionObservationSchema.parse({
    networkRetries,
    structuredRepairs,
    ...total,
    provider: transport.provider,
    modelName: transport.modelName,
  });
}

function failure(
  code: AgentCapabilityErrorCode,
  summary: string,
  observation: AgentExecutionObservation,
): Stage6StructuredCallOutcome {
  return Object.freeze({ outcomeKind: "error", code, summary, observation });
}

function zeroAttemptObservation(
  latencyMs: number,
): Stage6ProviderAttemptObservation {
  return {
    inputTokens: 0,
    outputTokens: 0,
    latencyMs,
    estimatedCostUsdMicros: 0,
  };
}

function isNetworkRetryable(
  code: "timeout" | "rate_limited" | "network_error" | "invalid_output",
): boolean {
  return code === "timeout" || code === "rate_limited" || code === "network_error";
}

function technicalSummary(
  code: "timeout" | "rate_limited" | "network_error" | "invalid_output",
): string {
  switch (code) {
    case "timeout":
      return "Provider request timed out";
    case "rate_limited":
      return "Provider rate limit prevented completion";
    case "network_error":
      return "Provider network request failed";
    case "invalid_output":
      return "Provider returned an unreadable structured response";
  }
}

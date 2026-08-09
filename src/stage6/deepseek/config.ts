import { z } from "zod";

import {
  DEEPSEEK_OPENAI_ADAPTER_VERSION,
  DEEPSEEK_PRICING_VERSION,
} from "../versions";

export const DEEPSEEK_PROVIDER = "deepseek" as const;
export const DEEPSEEK_MODEL = "deepseek-v4-pro" as const;
export const DEEPSEEK_BASE_URL = "https://api.deepseek.com" as const;

const deepSeekEnvironmentSchema = z.strictObject({
  DEEPSEEK_API_KEY: z.string().trim().min(16),
  DEEPSEEK_BASE_URL: z.string().trim().default(DEEPSEEK_BASE_URL),
  DEEPSEEK_MODEL: z.literal(DEEPSEEK_MODEL).default(DEEPSEEK_MODEL),
  DEEPSEEK_REQUEST_TIMEOUT_MS: z.string().trim().default("20000"),
});

export type DeepSeekServerConfig = Readonly<{
  provider: typeof DEEPSEEK_PROVIDER;
  modelName: typeof DEEPSEEK_MODEL;
  baseUrl: typeof DEEPSEEK_BASE_URL;
  chatCompletionsUrl: `${typeof DEEPSEEK_BASE_URL}/chat/completions`;
  apiKey: string;
  requestTimeoutMs: number;
  maximumRequestBytes: number;
  maximumResponseBytes: number;
  adapterVersion: typeof DEEPSEEK_OPENAI_ADAPTER_VERSION;
  pricingVersion: typeof DEEPSEEK_PRICING_VERSION;
  dataRetentionAssurance: "provider_policy_only";
  zeroRetentionConfirmed: false;
}>;

export function parseDeepSeekServerConfig(
  environment: Readonly<Record<string, string | undefined>>,
): DeepSeekServerConfig {
  if (environment.NODE_TLS_REJECT_UNAUTHORIZED === "0") {
    throw new TypeError(
      "DeepSeek requests require HTTPS certificate verification",
    );
  }
  const parsed = deepSeekEnvironmentSchema.parse({
    DEEPSEEK_API_KEY: environment.DEEPSEEK_API_KEY,
    DEEPSEEK_BASE_URL: environment.DEEPSEEK_BASE_URL,
    DEEPSEEK_MODEL: environment.DEEPSEEK_MODEL,
    DEEPSEEK_REQUEST_TIMEOUT_MS: environment.DEEPSEEK_REQUEST_TIMEOUT_MS,
  });
  const baseUrl = new URL(parsed.DEEPSEEK_BASE_URL);
  if (
    baseUrl.origin !== DEEPSEEK_BASE_URL ||
    (baseUrl.pathname !== "/" && baseUrl.pathname !== "") ||
    baseUrl.search !== "" ||
    baseUrl.hash !== "" ||
    baseUrl.username !== "" ||
    baseUrl.password !== ""
  ) {
    throw new TypeError("DeepSeek base URL must be the approved HTTPS origin");
  }
  const requestTimeoutMs = Number(parsed.DEEPSEEK_REQUEST_TIMEOUT_MS);
  if (
    !Number.isInteger(requestTimeoutMs) ||
    requestTimeoutMs < 1_000 ||
    requestTimeoutMs > 90_000
  ) {
    throw new TypeError(
      "DEEPSEEK_REQUEST_TIMEOUT_MS must be an integer from 1000 through 90000",
    );
  }
  return Object.freeze({
    provider: DEEPSEEK_PROVIDER,
    modelName: DEEPSEEK_MODEL,
    baseUrl: DEEPSEEK_BASE_URL,
    chatCompletionsUrl: `${DEEPSEEK_BASE_URL}/chat/completions`,
    apiKey: parsed.DEEPSEEK_API_KEY,
    requestTimeoutMs,
    maximumRequestBytes: 128 * 1024,
    maximumResponseBytes: 256 * 1024,
    adapterVersion: DEEPSEEK_OPENAI_ADAPTER_VERSION,
    pricingVersion: DEEPSEEK_PRICING_VERSION,
    dataRetentionAssurance: "provider_policy_only",
    zeroRetentionConfirmed: false,
  });
}

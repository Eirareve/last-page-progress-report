import { describe, expect, it } from "vitest";

import {
  DEEPSEEK_BASE_URL,
  DEEPSEEK_MODEL,
  parseDeepSeekServerConfig,
} from "@/stage6/deepseek/config";

const TEST_API_KEY = "sk-test-only-not-a-secret-123456";

describe("DeepSeek server configuration", () => {
  it("accepts only the approved provider identity and records the retention caveat", () => {
    const config = parseDeepSeekServerConfig({
      DEEPSEEK_API_KEY: TEST_API_KEY,
    });

    expect(config).toMatchObject({
      provider: "deepseek",
      modelName: DEEPSEEK_MODEL,
      baseUrl: DEEPSEEK_BASE_URL,
      chatCompletionsUrl: `${DEEPSEEK_BASE_URL}/chat/completions`,
      requestTimeoutMs: 20_000,
      dataRetentionAssurance: "provider_policy_only",
      zeroRetentionConfirmed: false,
    });
  });

  it.each([
    { DEEPSEEK_BASE_URL: "http://api.deepseek.com" },
    { DEEPSEEK_BASE_URL: "https://api.deepseek.com/v1" },
    { DEEPSEEK_BASE_URL: "https://api.deepseek.com.example.test" },
    { DEEPSEEK_MODEL: "deepseek-chat" },
    { DEEPSEEK_REQUEST_TIMEOUT_MS: "999" },
    { DEEPSEEK_REQUEST_TIMEOUT_MS: "90001" },
    { DEEPSEEK_REQUEST_TIMEOUT_MS: "not-a-number" },
    { NODE_TLS_REJECT_UNAUTHORIZED: "0" },
  ])("rejects an unapproved or invalid override: %o", (override) => {
    expect(() =>
      parseDeepSeekServerConfig({
        DEEPSEEK_API_KEY: TEST_API_KEY,
        ...override,
      }),
    ).toThrow();
  });

  it("rejects missing credentials without including credential material in the error", () => {
    let thrown: unknown;
    try {
      parseDeepSeekServerConfig({});
    } catch (caught) {
      thrown = caught;
    }

    expect(thrown).toBeDefined();
    expect(String(thrown)).not.toContain(TEST_API_KEY);
  });
});

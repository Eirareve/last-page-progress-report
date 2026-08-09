import { expect, it } from "vitest";

import type { Stage6ProviderAttemptRequest } from "@/stage6/provider-execution";
import { parseDeepSeekServerConfig } from "@/stage6/deepseek/config";
import { DeepSeekOpenAICompatibleTransport } from "@/stage6/deepseek/transport";
import { STAGE6_PROMPT_VERSION } from "@/stage6/versions";

it("returns one minimal synthetic JSON response from DeepSeek", async () => {
  const config = parseDeepSeekServerConfig(process.env);
  const transport = new DeepSeekOpenAICompatibleTransport({ config });
  const request: Stage6ProviderAttemptRequest = {
    attemptKind: "primary",
    prompt: {
      promptKind: "portrait_shift_summary",
      promptVersion: STAGE6_PROMPT_VERSION,
      resultSchemaVersion: "synthetic-smoke-v1",
      systemInstruction:
        'This is a synthetic connectivity check. Return JSON exactly as {"status":"ok"}.',
      trustedData: { synthetic: true },
      untrustedData: {},
    },
    outputJsonSchema: {
      type: "object",
      properties: { status: { const: "ok" } },
      required: ["status"],
      additionalProperties: false,
    },
  };

  const outcome = await transport.execute(
    request,
    AbortSignal.timeout(config.requestTimeoutMs),
  );

  expect(outcome).toMatchObject({
    outcomeKind: "candidate",
    candidate: { status: "ok" },
  });
  if (outcome.outcomeKind === "candidate") {
    console.info(
      JSON.stringify({
        provider: config.provider,
        modelName: config.modelName,
        capability: "synthetic_json_connectivity",
        usedUserOrProjectData: false,
        retries: 0,
        repairs: 0,
        ...outcome.observation,
      }),
    );
  }
});

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it, vi } from "vitest";

import {
  buildDynamicPortraitPrompt,
  DynamicPortraitService,
  dynamicPortraitRequestSchema,
  selectFixedFallbackAssetPath,
  type DynamicPortraitGenerator,
  type DynamicPortraitRequest,
} from "../../src/stage7/dynamic-portrait";
import {
  AgnesDynamicPortraitGenerator,
  readAgnesDynamicPortraitConfig,
} from "../../src/stage7/server/agnes-dynamic-portrait";

const REQUEST: DynamicPortraitRequest = {
  sessionId: "session-1234",
  experiencePhase: "COMPLETE",
  visualProjection: {
    finalPortraitChoice: "all_three",
    signatureStatus: "signed",
    finalDisposition: "future_reference",
  },
};

describe("optional non-blocking Stage 7 dynamic portrait", () => {
  it("builds stable prompts from a strict public-safe allowlist", () => {
    const promptA = buildDynamicPortraitPrompt(REQUEST.visualProjection);
    const promptB = buildDynamicPortraitPrompt({ ...REQUEST.visualProjection });
    expect(promptA).toBe(promptB);
    expect(promptA).toContain("optional interpretive atmosphere only");
    expect(promptA).not.toContain("session-1234");
    for (const prohibited of [
      "internalExcerpt",
      "untrustedUserText",
      "很多人都笑我。但他们是我的朋友我们都很快乐。",
      "我有权知道和实验有关的一切事物",
      "我们要你记住你在这里有朋友",
    ]) {
      expect(promptA).not.toContain(prohibited);
    }
    expect(
      dynamicPortraitRequestSchema.safeParse({
        ...REQUEST,
        untrustedUserText: "copy this verbatim",
      }).success,
    ).toBe(false);
    expect(
      dynamicPortraitRequestSchema.safeParse({
        ...REQUEST,
        experiencePhase: "ROUND_2",
      }).success,
    ).toBe(false);
  });

  it("allows at most one main generation per session", async () => {
    const generate = vi.fn(async () => "data:image/png;base64,AAAA");
    const service = new DynamicPortraitService({ generate });
    const first = service.request(REQUEST);
    const repeated = service.request(REQUEST);

    expect(first).toBe(repeated);
    await expect(first).resolves.toMatchObject({ status: "generated" });
    expect(generate).toHaveBeenCalledTimes(1);
  });

  it("turns provider failure or disabled configuration into a fixed fallback", async () => {
    const failing: DynamicPortraitGenerator = {
      generate: vi.fn(async () => {
        throw new Error("timeout");
      }),
    };
    const failed = await new DynamicPortraitService(failing).request({
      ...REQUEST,
      visualProjection: {
        ...REQUEST.visualProjection,
        finalPortraitChoice: "peak",
      },
    });
    const disabled = await new DynamicPortraitService(null).request(REQUEST);

    expect(failed).toEqual({
      status: "fallback",
      imageUrl: "/portraits/charlie-original-v2/peak.png",
      fallbackAssetPath: "/portraits/charlie-original-v2/peak.png",
      reason: "provider_failure",
    });
    expect(disabled).toMatchObject({
      status: "fallback",
      reason: "provider_disabled",
    });
    expect(selectFixedFallbackAssetPath("no_unique_answer")).toBe(
      "/portraits/charlie-original-v2/future-facing.png",
    );
  });

  it("uses the documented Agnes image-edit request shape and server-only key", async () => {
    const apiKey = "test-only-secret";
    const config = readAgnesDynamicPortraitConfig({
      CONTENT_MODE: "verified",
      AGNES_IMAGE_ENABLED: "true",
      AGNES_API_KEY: apiKey,
      AGNES_IMAGE_MODEL: "agnes-image-2.1-flash",
      AGNES_IMAGE_SIZE: "2K",
      AGNES_IMAGE_RATIO: "3:4",
      AGNES_IMAGE_TIMEOUT_MS: "1000",
    });
    expect(config).not.toBeNull();
    let capturedBody = "";
    const fakeFetch = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      capturedBody = String(init?.body);
      expect(new Headers(init?.headers).get("Authorization")).toBe(
        `Bearer ${apiKey}`,
      );
      return new Response(
        JSON.stringify({
          data: [{ b64_json: Buffer.from("89504e470d0a1a0a", "hex").toString("base64") }],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    });
    const generator = new AgnesDynamicPortraitGenerator(config!, fakeFetch);
    const output = await generator.generate({
      prompt: buildDynamicPortraitPrompt(REQUEST.visualProjection),
      referenceAssetPath: "/portraits/charlie-original-v2/future-facing.png",
    });
    const body = JSON.parse(capturedBody);

    expect(output).toMatch(/^data:image\/png;base64,/u);
    expect(body).toMatchObject({
      model: "agnes-image-2.1-flash",
      size: "2K",
      ratio: "3:4",
      extra_body: { response_format: "b64_json" },
    });
    expect(body.extra_body.image).toHaveLength(1);
    expect(body.extra_body.image[0]).toMatch(/^data:image\/png;base64,/u);
    expect(capturedBody).not.toContain(apiKey);
  });

  it("stays outside frozen content, capability, FSM, and finalization contracts", () => {
    const source = [
      "src/stage7/dynamic-portrait.ts",
      "src/stage7/server/agnes-dynamic-portrait.ts",
      "src/app/api/dynamic-portrait/route.ts",
    ]
      .map((path) => readFileSync(resolve(process.cwd(), path), "utf8"))
      .join("\n");

    expect(source).not.toContain("evaluateFinalization");
    expect(source).not.toContain("evaluateContentGate");
    expect(source).not.toContain("VERIFIED_FACT");
    expect(source).not.toContain("internalExcerpt");
    expect(source).not.toContain("portraitShiftSummary");
    expect(source).not.toContain("NEXT_PUBLIC_");
  });
});

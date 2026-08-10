import "server-only";

import { readFile } from "node:fs/promises";
import { resolve, sep } from "node:path";

import type { DynamicPortraitGenerator } from "../dynamic-portrait";

export type AgnesDynamicPortraitConfig = Readonly<{
  apiKey: string;
  baseUrl: string;
  model: string;
  size: string;
  ratio: string;
  timeoutMs: number;
}>;

export function readAgnesDynamicPortraitConfig(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): AgnesDynamicPortraitConfig | null {
  if (environment.AGNES_IMAGE_ENABLED !== "true") return null;
  const apiKey = environment.AGNES_API_KEY?.trim();
  if (!apiKey || environment.CONTENT_MODE !== "verified") return null;
  const baseUrl = (
    environment.AGNES_API_BASE_URL ?? "https://apihub.agnes-ai.com/v1"
  ).replace(/\/$/u, "");
  if (!baseUrl.startsWith("https://")) return null;
  const timeoutMs = Number(environment.AGNES_IMAGE_TIMEOUT_MS ?? "120000");
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0) return null;
  return Object.freeze({
    apiKey,
    baseUrl,
    model: environment.AGNES_IMAGE_MODEL ?? "agnes-image-2.1-flash",
    size: environment.AGNES_IMAGE_SIZE ?? "2K",
    ratio: environment.AGNES_IMAGE_RATIO ?? "3:4",
    timeoutMs,
  });
}

export class AgnesDynamicPortraitGenerator implements DynamicPortraitGenerator {
  readonly #config: AgnesDynamicPortraitConfig;
  readonly #fetch: typeof fetch;

  constructor(config: AgnesDynamicPortraitConfig, fetchImplementation = fetch) {
    this.#config = config;
    this.#fetch = fetchImplementation;
  }

  async generate(input: Readonly<{
    prompt: string;
    referenceAssetPath: string;
  }>): Promise<string> {
    const reference = await loadApprovedReference(input.referenceAssetPath);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.#config.timeoutMs);
    try {
      const response = await this.#fetch(
        `${this.#config.baseUrl}/images/generations`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${this.#config.apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: this.#config.model,
            prompt: input.prompt,
            size: this.#config.size,
            ratio: this.#config.ratio,
            extra_body: {
              image: [reference],
              response_format: "b64_json",
            },
          }),
          signal: controller.signal,
        },
      );
      if (!response.ok) throw new Error("Agnes dynamic portrait request failed");
      const payload = (await response.json()) as {
        data?: readonly { b64_json?: unknown; url?: unknown }[];
      };
      const result = payload.data?.[0];
      if (typeof result?.b64_json === "string" && result.b64_json.length > 0) {
        const bytes = Buffer.from(result.b64_json, "base64");
        return `data:${detectImageMimeType(bytes)};base64,${result.b64_json}`;
      }
      if (
        typeof result?.url === "string" &&
        result.url.startsWith("https://")
      ) {
        return result.url;
      }
      throw new Error("Agnes dynamic portrait response contained no image");
    } finally {
      clearTimeout(timeout);
    }
  }
}

async function loadApprovedReference(publicAssetPath: string): Promise<string> {
  const publicRoot = resolve(process.cwd(), "public");
  const assetPath = resolve(publicRoot, publicAssetPath.replace(/^\/+/, ""));
  if (!assetPath.startsWith(`${publicRoot}${sep}`)) {
    throw new Error("Dynamic portrait reference is outside the public asset root");
  }
  const bytes = await readFile(assetPath);
  return `data:${detectImageMimeType(bytes)};base64,${bytes.toString("base64")}`;
}

function detectImageMimeType(bytes: Buffer): string {
  if (bytes.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex"))) {
    return "image/png";
  }
  if (bytes.subarray(0, 3).equals(Buffer.from("ffd8ff", "hex"))) {
    return "image/jpeg";
  }
  if (
    bytes.subarray(0, 4).toString("ascii") === "RIFF" &&
    bytes.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return "image/webp";
  }
  throw new Error("Unsupported dynamic portrait image type");
}

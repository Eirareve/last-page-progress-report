import { z } from "zod";

import { finalPortraitChoiceSchema } from "../domain/schemas/portrait.schema";
import {
  currentCharlieSignatureStatusSchema,
  finalDispositionSchema,
} from "../domain/schemas/signature.schema";

export const dynamicPortraitRequestSchema = z.strictObject({
  sessionId: z
    .string()
    .min(1)
    .max(200)
    .regex(/^[A-Za-z0-9:_-]+$/u),
  experiencePhase: z.literal("COMPLETE"),
  visualProjection: z.strictObject({
    finalPortraitChoice: finalPortraitChoiceSchema,
    signatureStatus: currentCharlieSignatureStatusSchema,
    finalDisposition: finalDispositionSchema,
  }),
});

export type DynamicPortraitRequest = z.infer<typeof dynamicPortraitRequestSchema>;
export type PublicSafeVisualProjection = DynamicPortraitRequest["visualProjection"];
export type DynamicPortraitResult = Readonly<
  | {
      status: "generated";
      imageUrl: string;
      fallbackAssetPath: string;
    }
  | {
      status: "fallback";
      imageUrl: string;
      fallbackAssetPath: string;
      reason: "provider_disabled" | "provider_failure";
    }
>;

export interface DynamicPortraitGenerator {
  generate(input: Readonly<{
    prompt: string;
    referenceAssetPath: string;
  }>): Promise<string>;
}

export class DynamicPortraitService {
  readonly #generator: DynamicPortraitGenerator | null;
  readonly #sessions = new Map<string, Promise<DynamicPortraitResult>>();

  constructor(generator: DynamicPortraitGenerator | null) {
    this.#generator = generator;
  }

  request(input: DynamicPortraitRequest): Promise<DynamicPortraitResult> {
    const request = dynamicPortraitRequestSchema.parse(input);
    const existing = this.#sessions.get(request.sessionId);
    if (existing) return existing;

    const result = this.#generateOrFallback(request.visualProjection);
    this.#sessions.set(request.sessionId, result);
    return result;
  }

  async #generateOrFallback(
    projection: PublicSafeVisualProjection,
  ): Promise<DynamicPortraitResult> {
    const fallbackAssetPath = selectFixedFallbackAssetPath(
      projection.finalPortraitChoice,
    );
    if (this.#generator === null) {
      return Object.freeze({
        status: "fallback",
        imageUrl: fallbackAssetPath,
        fallbackAssetPath,
        reason: "provider_disabled",
      });
    }
    try {
      const imageUrl = await this.#generator.generate({
        prompt: buildDynamicPortraitPrompt(projection),
        referenceAssetPath: fallbackAssetPath,
      });
      return Object.freeze({
        status: "generated",
        imageUrl,
        fallbackAssetPath,
      });
    } catch {
      return Object.freeze({
        status: "fallback",
        imageUrl: fallbackAssetPath,
        fallbackAssetPath,
        reason: "provider_failure",
      });
    }
  }
}

export function buildDynamicPortraitPrompt(
  projection: PublicSafeVisualProjection,
): string {
  const parsed = dynamicPortraitRequestSchema.shape.visualProjection.parse(
    projection,
  );
  return [
    "Edit the supplied approved Charlie portrait as the exact same person in the same cinematic editorial photographic universe.",
    "Preserve facial identity, apparent age, natural asymmetry, skin texture, hairline, and restrained human expression.",
    portraitChoiceDirection(parsed.finalPortraitChoice),
    signatureDirection(parsed.signatureStatus),
    dispositionDirection(parsed.finalDisposition),
    "Create a quiet late-experience literary portrait connected to reflection, writing, and time, without readable text.",
    "Natural proportions, believable skin and eyes, physically plausible clothing and environment, muted literary color, sophisticated cinematic light, subtle optical depth.",
    "No illustration, concept art, plastic skin, glamour retouching, actor likeness, fantasy glow, stock-photo smile, melodrama, illness coding, logo, watermark, or readable writing.",
    "This image is optional interpretive atmosphere only, never factual evidence.",
  ].join("\n");
}

export function selectFixedFallbackAssetPath(
  choice: PublicSafeVisualProjection["finalPortraitChoice"],
): string {
  switch (choice) {
    case "early":
      return "/portraits/charlie-original-v2/early.png";
    case "peak":
      return "/portraits/charlie-original-v2/peak.png";
    case "futureFacing":
    case "all_three":
    case "no_unique_answer":
      return "/portraits/charlie-original-v2/future-facing.png";
  }
}

function portraitChoiceDirection(
  choice: PublicSafeVisualProjection["finalPortraitChoice"],
): string {
  switch (choice) {
    case "early":
      return "Retain a trace of open trust and warmth without youthfulness or infantilization.";
    case "peak":
      return "Retain composed attention and perceptiveness without a genius stereotype or emotional coldness.";
    case "futureFacing":
      return "Emphasize measured forward attention and calm self-possession.";
    case "all_three":
      return "Hold trust, perceptiveness, and forward attention together without turning them into a collage.";
    case "no_unique_answer":
      return "Keep the expression open and unresolved, without privileging one life stage.";
  }
}

function signatureDirection(
  status: PublicSafeVisualProjection["signatureStatus"],
): string {
  switch (status) {
    case "signed":
      return "Suggest a settled act of acknowledgment through posture only.";
    case "declined":
      return "Suggest deliberate restraint and withheld assent through posture only.";
    case "unavailable":
      return "Keep the moment contemplative and non-final without depicting incapacity.";
    case "hidden":
    case "pending":
    case "not_requested":
      return "Keep the gesture neutral and do not imply a completed signature.";
  }
}

function dispositionDirection(
  disposition: PublicSafeVisualProjection["finalDisposition"],
): string {
  switch (disposition) {
    case "future_reference":
      return "Use a subtle sense of looking beyond the immediate room, with records present but unreadable.";
    case "present_record":
      return "Ground the composition in the present moment, with a closed or resting notebook and no legible marks.";
    case "unfinished":
      return "Leave a restrained visual interval or open space that suggests an intentionally unfinished thought.";
  }
}

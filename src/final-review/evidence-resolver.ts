import type { GatedContentAccess } from "../content/server";
import type {
  CharlieSignatureReviewInput,
  FinalReviewEvidenceResolution,
  VerifiedFinalReviewEvidenceItem,
} from "./contracts";
import { createCharlieSignatureReviewError } from "./errors";
import type { FinalReviewEvidenceResolver } from "./ports";
import {
  charlieSignatureReviewInputSchema,
  finalReviewEvidenceResolutionSchema,
  verifiedFinalReviewEvidenceItemSchema,
} from "./schemas";

/**
 * The only production-shaped verified evidence adapter in this layer. It
 * consumes Stage 2's already-gated public access object and never raw content.
 */
export class GatedFinalReviewEvidenceResolver
  implements FinalReviewEvidenceResolver
{
  readonly #gatedContent: GatedContentAccess;

  constructor(gatedContent: GatedContentAccess) {
    this.#gatedContent = gatedContent;
  }

  async resolveEvidence(
    inputValue: CharlieSignatureReviewInput,
  ): Promise<FinalReviewEvidenceResolution> {
    const input = charlieSignatureReviewInputSchema.safeParse(inputValue);
    if (!input.success) {
      return resolutionError(
        "schema_validation_failed",
        "Final Review evidence input failed schema validation",
      );
    }

    const gateError = validateGatedBinding(this.#gatedContent, input.data);
    if (gateError !== null) {
      return gateError;
    }

    const access = this.#gatedContent.access;
    if (access.contentMode === "placeholder") {
      const availableIds = new Set<string>(
        access.evidenceCards.map((card) => card.id),
      );
      if (
        input.data.allowedEvidenceIds.some(
          (evidenceId) => !availableIds.has(evidenceId),
        )
      ) {
        return resolutionError(
          "content_not_found",
          "A requested placeholder evidence identifier was not found",
        );
      }
      return freezeResolution(
        finalReviewEvidenceResolutionSchema.parse({
          resolutionKind: "resolved",
          evidenceContext: {
            evidenceMode: "placeholder",
            contentBundleId: input.data.contentBundleId,
            contentBundleVersion: input.data.contentBundleVersion,
            contentBundleChecksum: input.data.contentBundleChecksum,
            placeholderEvidenceIds: input.data.allowedEvidenceIds,
            evidenceItems: [],
          },
        }),
      );
    }

    const evidenceItems: VerifiedFinalReviewEvidenceItem[] = [];
    try {
      for (const evidenceId of input.data.allowedEvidenceIds) {
        const evidenceCard = access.getDomainEvidenceCard(evidenceId);
        if (evidenceCard.id !== evidenceId) {
          return resolutionError(
            "content_not_found",
            "Resolved evidence did not match the requested identifier",
          );
        }
        const verifiedFacts = access.getVerifiedFactsByIds(
          evidenceCard.verifiedFactIds,
        );
        const interpretations = access.getDomainInterpretationsByIds(
          evidenceCard.interpretationIds,
        );
        if (
          !hasExactOrderedIds(evidenceCard.verifiedFactIds, verifiedFacts) ||
          !hasExactOrderedIds(evidenceCard.interpretationIds, interpretations)
        ) {
          return resolutionError(
            "content_not_found",
            "Resolved evidence dependencies did not match the gated evidence card",
          );
        }
        evidenceItems.push(
          verifiedFinalReviewEvidenceItemSchema.parse({
            evidenceCard,
            verifiedFacts,
            interpretations,
          }),
        );
      }
    } catch {
      return resolutionError(
        "content_not_found",
        "A requested verified evidence identifier was not found",
      );
    }

    return freezeResolution(
      finalReviewEvidenceResolutionSchema.parse({
        resolutionKind: "resolved",
        evidenceContext: {
          evidenceMode: "verified",
          contentBundleId: input.data.contentBundleId,
          contentBundleVersion: input.data.contentBundleVersion,
          contentBundleChecksum: input.data.contentBundleChecksum,
          evidenceItems,
        },
      }),
    );
  }
}

export function createGatedFinalReviewEvidenceResolver(
  gatedContent: GatedContentAccess,
): FinalReviewEvidenceResolver {
  return new GatedFinalReviewEvidenceResolver(gatedContent);
}

function validateGatedBinding(
  gatedContent: GatedContentAccess,
  input: CharlieSignatureReviewInput,
): FinalReviewEvidenceResolution | null {
  const { access, evaluation } = gatedContent;
  if (evaluation.status !== "passed") {
    return resolutionError(
      "content_not_found",
      "Final Review evidence requires a passed Stage 2 content gate",
    );
  }
  if (
    access.binding.contentBundleId !== input.contentBundleId ||
    evaluation.contentBundleId !== input.contentBundleId
  ) {
    return resolutionError(
      "content_not_found",
      "Final Review input does not bind the gated content bundle",
    );
  }
  if (
    access.binding.contentBundleVersion !== input.contentBundleVersion ||
    access.binding.contentBundleChecksum !== input.contentBundleChecksum ||
    evaluation.contentBundleVersion !== input.contentBundleVersion ||
    evaluation.checksum !== input.contentBundleChecksum ||
    evaluation.contentSchemaVersion !== access.binding.contentSchemaVersion
  ) {
    return resolutionError(
      "content_version_mismatch",
      "Final Review input does not match the gated content version or checksum",
    );
  }
  return null;
}

function hasExactOrderedIds(
  expectedIds: readonly string[],
  records: readonly Readonly<{ id: string }>[],
): boolean {
  return (
    expectedIds.length === records.length &&
    expectedIds.every((id, index) => records[index]?.id === id)
  );
}

function resolutionError(
  code: Parameters<typeof createCharlieSignatureReviewError>[0],
  message: string,
): FinalReviewEvidenceResolution {
  return finalReviewEvidenceResolutionSchema.parse({
    resolutionKind: "error",
    error: createCharlieSignatureReviewError(code, message),
  });
}

function freezeResolution<T extends FinalReviewEvidenceResolution>(value: T): T {
  return deepFreeze(value);
}

function deepFreeze<T>(value: T): T {
  if (typeof value === "object" && value !== null && !Object.isFrozen(value)) {
    for (const key of Reflect.ownKeys(value)) {
      const child = (value as Record<PropertyKey, unknown>)[key];
      if (typeof child === "object" && child !== null) {
        deepFreeze(child);
      }
    }
    Object.freeze(value);
  }
  return value;
}

import type {
  CuratorialInterpretation,
  EvidenceCard,
  OriginalInteraction,
  VerifiedFact,
} from "../domain/contracts/evidence";
import { originalInteractionSchema } from "../domain/schemas/evidence.schema";
import {
  finalEnvelopeContentSnapshotSchema,
  type FinalEnvelopeContentSnapshot,
} from "../domain";
import type { TargetEnvironment } from "./contracts";
import type {
  LoadedContentBundle,
  PlaceholderRuntimeContentBundle,
  PublicRuntimeContentBundle,
} from "./bundle.contracts";
import {
  projectDomainCuratorialInterpretation,
  projectDomainEvidenceCard,
  projectDomainVerifiedFact,
} from "./bundle-projection";
import { deepFreeze } from "./deep-freeze";

export type ContentAccessBinding = Readonly<{
  contentBundleId: string;
  contentBundleVersion: string;
  contentBundleChecksum: string;
  contentSchemaVersion: string;
}>;

type BaseContentAccess = Readonly<{
  binding: ContentAccessBinding;
  originalInteraction: Readonly<{
    item: OriginalInteraction;
    publicDeclaration: string;
    attribution: string;
  }>;
}>;

export type PlaceholderContentAccess = BaseContentAccess &
  Readonly<{
    contentMode: "placeholder";
    evidenceCards: ReadonlyArray<
      PlaceholderRuntimeContentBundle["evidenceCards"][number]
    >;
    portraits: ReadonlyArray<PlaceholderRuntimeContentBundle["portraits"][number]>;
  }>;

export type VerifiedContentAccess = BaseContentAccess &
  Readonly<{
    contentMode: "verified";
    evidenceCards: ReadonlyArray<PublicRuntimeContentBundle["evidenceCards"][number]>;
    portraits: ReadonlyArray<PublicRuntimeContentBundle["portraits"][number]>;
    getVerifiedFactsByIds: (factIds: readonly string[]) => readonly VerifiedFact[];
    getDomainEvidenceCard: (cardId: string) => EvidenceCard;
    getDomainInterpretationsByIds: (
      interpretationIds: readonly string[],
    ) => readonly CuratorialInterpretation[];
  }>;

export type ContentAccess = PlaceholderContentAccess | VerifiedContentAccess;

export function createContentAccess(bundle: LoadedContentBundle): ContentAccess {
  const binding = deepFreeze({
    contentBundleId: bundle.contentBundleId,
    contentBundleVersion: bundle.contentBundleVersion,
    contentBundleChecksum: bundle.contentBundleChecksum,
    contentSchemaVersion: bundle.contentSchemaVersion,
  });
  const originalInteraction = deepFreeze({
    item: originalInteractionSchema.parse({
      id: bundle.originalInteraction.id,
      contentType: bundle.originalInteraction.contentType,
      purpose: bundle.originalInteraction.purpose,
      text: bundle.originalInteraction.text,
    }),
    publicDeclaration: bundle.originalInteraction.publicDeclaration,
    attribution: bundle.originalInteraction.attribution,
  });

  if (bundle.contentMode === "placeholder") {
    return deepFreeze({
      contentMode: "placeholder" as const,
      binding,
      originalInteraction,
      evidenceCards: [...bundle.evidenceCards],
      portraits: [...bundle.portraits],
    });
  }

  return deepFreeze({
    contentMode: "verified" as const,
    binding,
    originalInteraction,
    evidenceCards: [...bundle.evidenceCards],
    portraits: [...bundle.portraits],
    getVerifiedFactsByIds: (factIds: readonly string[]) =>
      deepFreeze(factIds.map((factId) => projectDomainVerifiedFact(bundle, factId))),
    getDomainEvidenceCard: (cardId: string) =>
      deepFreeze(projectDomainEvidenceCard(bundle, cardId)),
    getDomainInterpretationsByIds: (interpretationIds: readonly string[]) =>
      deepFreeze(
        interpretationIds.map((interpretationId) =>
          projectDomainCuratorialInterpretation(bundle, interpretationId),
        ),
      ),
  });
}

export function projectFinalEnvelopeContentSnapshot(input: {
  access: ContentAccess;
  targetEnvironment: TargetEnvironment;
}): FinalEnvelopeContentSnapshot {
  const portraitAssets =
    input.access.contentMode === "placeholder"
      ? input.access.portraits.map((portrait) => ({
          assetId: portrait.id,
          stage: portrait.stage,
          assetPath: portrait.assetPath,
          altText: portrait.altText,
          provenance: "placeholder" as const,
        }))
      : input.access.portraits.map((portrait) => ({
          assetId: portrait.assetId,
          stage: portrait.charlieStage,
          assetPath: portrait.publicAssetPath,
          altText: portrait.altText,
          provenance: "verified" as const,
        }));
  return finalEnvelopeContentSnapshotSchema.parse({
    binding: {
      ...input.access.binding,
      targetEnvironment: input.targetEnvironment,
    },
    portraitAssets,
    originalInteraction: input.access.originalInteraction,
  });
}

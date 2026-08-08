import type {
  CuratorialInterpretation,
  EvidenceCard,
  VerifiedFact,
} from "../domain/contracts/evidence";
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

  if (bundle.contentMode === "placeholder") {
    return deepFreeze({
      contentMode: "placeholder" as const,
      binding,
      evidenceCards: [...bundle.evidenceCards],
      portraits: [...bundle.portraits],
    });
  }

  return deepFreeze({
    contentMode: "verified" as const,
    binding,
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

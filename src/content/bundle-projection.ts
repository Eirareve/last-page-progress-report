import {
  curatorialInterpretationSchema,
  verifiedFactSchema,
} from "../domain/schemas/evidence.schema";
import type {
  CuratorialInterpretation,
  EvidenceCard,
  VerifiedFact,
} from "../domain/contracts/evidence";
import {
  placeholderRuntimeContentBundleMaterialSchema,
  placeholderRuntimeContentBundleSchema,
  publicRuntimeContentBundleMaterialSchema,
  publicRuntimeContentBundleSchema,
  sealedVerifiedContentBundleSchema,
  verifiedContentBundleMaterialSchema,
} from "./bundle.schemas";
import type {
  PlaceholderRuntimeContentBundle,
  PlaceholderRuntimeContentBundleMaterial,
  PublicRuntimeContentBundleMaterial,
  PublicRuntimeContentBundle,
  SealedVerifiedContentBundle,
  VerifiedContentBundleMaterial,
} from "./bundle.contracts";
import {
  computeInternalContentBundleChecksum,
  computePublicContentBundleChecksum,
} from "./checksum";
import {
  formatContentSourceReference,
  projectEvidenceCardAuthoringRecord,
} from "./projection";
import { deepFreeze } from "./deep-freeze";

export class ContentIntegrityError extends Error {
  readonly code = "content_checksum_mismatch";

  constructor(message: string) {
    super(message);
    this.name = "ContentIntegrityError";
  }
}

export async function sealVerifiedContentBundle(
  input: VerifiedContentBundleMaterial,
): Promise<{
  internalBundle: SealedVerifiedContentBundle;
  publicBundle: PublicRuntimeContentBundle;
}> {
  const material = verifiedContentBundleMaterialSchema.parse(input);
  const publicBundleWithoutChecksum = projectPublicBundleMaterial(material);
  const [internalContentBundleChecksum, contentBundleChecksum] = await Promise.all([
    computeInternalContentBundleChecksum(material),
    computePublicContentBundleChecksum(publicBundleWithoutChecksum),
  ]);
  const publicBundle = publicRuntimeContentBundleSchema.parse({
    ...publicBundleWithoutChecksum,
    contentBundleChecksum,
  });
  const internalBundle = sealedVerifiedContentBundleSchema.parse({
    ...material,
    internalContentBundleChecksum,
    contentBundleChecksum,
  });

  return deepFreeze({ internalBundle, publicBundle });
}

export async function verifySealedVerifiedContentBundle(
  input: unknown,
): Promise<PublicRuntimeContentBundle> {
  const internalBundle = sealedVerifiedContentBundleSchema.parse(input);
  const publicBundleWithoutChecksum = projectPublicBundleMaterial(internalBundle);
  const [expectedInternalChecksum, expectedPublicChecksum] = await Promise.all([
    computeInternalContentBundleChecksum(internalBundle),
    computePublicContentBundleChecksum(publicBundleWithoutChecksum),
  ]);

  if (
    internalBundle.internalContentBundleChecksum !== expectedInternalChecksum ||
    internalBundle.contentBundleChecksum !== expectedPublicChecksum
  ) {
    throw new ContentIntegrityError(
      "The sealed private or generated public content checksum does not match",
    );
  }

  return deepFreeze(publicRuntimeContentBundleSchema.parse({
    ...publicBundleWithoutChecksum,
    contentBundleChecksum: expectedPublicChecksum,
  }));
}

export async function sealPlaceholderContentBundle(
  input: PlaceholderRuntimeContentBundleMaterial,
): Promise<PlaceholderRuntimeContentBundle> {
  const material = placeholderRuntimeContentBundleMaterialSchema.parse(input);
  const contentBundleChecksum = await computePublicContentBundleChecksum(material);
  return deepFreeze(placeholderRuntimeContentBundleSchema.parse({
    ...material,
    contentBundleChecksum,
  }));
}

export async function verifyPlaceholderContentBundle(
  input: unknown,
): Promise<PlaceholderRuntimeContentBundle> {
  const bundle = placeholderRuntimeContentBundleSchema.parse(input);
  const expectedChecksum = await computePublicContentBundleChecksum(bundle);
  if (bundle.contentBundleChecksum !== expectedChecksum) {
    throw new ContentIntegrityError(
      "The placeholder public content checksum does not match",
    );
  }
  return deepFreeze(bundle);
}

export function projectDomainVerifiedFact(
  bundle: PublicRuntimeContentBundle,
  factId: string,
): VerifiedFact {
  const fact = bundle.verifiedFacts.find((candidate) => candidate.id === factId);
  if (!fact) {
    throw new RangeError(`Verified fact not found: ${factId}`);
  }
  return verifiedFactSchema.parse({
    id: fact.id,
    text: fact.publicSummary,
    contentType: "VERIFIED_FACT",
    sourceReference: formatContentSourceReference(fact.sourceLocation),
    verifiedByHuman: true,
  });
}

export function projectDomainEvidenceCard(
  bundle: PublicRuntimeContentBundle,
  cardId: string,
): EvidenceCard {
  const card = bundle.evidenceCards.find((candidate) => candidate.id === cardId);
  if (!card) {
    throw new RangeError(`Evidence card not found: ${cardId}`);
  }
  return projectEvidenceCardAuthoringRecord(card);
}

export function projectDomainCuratorialInterpretation(
  bundle: PublicRuntimeContentBundle,
  interpretationId: string,
): CuratorialInterpretation {
  const interpretation = bundle.curatorialInterpretations.find(
    (candidate) => candidate.id === interpretationId,
  );
  if (!interpretation) {
    throw new RangeError(`Curatorial interpretation not found: ${interpretationId}`);
  }
  return curatorialInterpretationSchema.parse({
    id: interpretation.id,
    contentType: "CURATORIAL_INTERPRETATION",
    text: interpretation.interpretation,
    basedOnVerifiedFactIds: interpretation.basedOnVerifiedFactIds,
  });
}

function projectPublicBundleMaterial(
  material: VerifiedContentBundleMaterial | SealedVerifiedContentBundle,
): PublicRuntimeContentBundleMaterial {
  return publicRuntimeContentBundleMaterialSchema.parse({
    representation: "public_runtime",
    contentContractVersion: material.contentContractVersion,
    contentSchemaVersion: material.contentSchemaVersion,
    contentMode: "verified",
    contentBundleId: material.contentBundleId,
    contentBundleVersion: material.contentBundleVersion,
    edition: {
      editionId: material.edition.editionId,
      title: material.edition.title,
      language: material.edition.language,
      publisher: material.edition.publisher,
      publicationYear: material.edition.publicationYear,
      isbn: material.edition.isbn,
      editionLabel: material.edition.editionLabel,
    },
    approvalStatus: "approved",
    checksumAlgorithm: material.checksumAlgorithm,
    containsPlaceholderContent: false,
    originalInteraction: { ...material.originalInteraction },
    verifiedFacts: material.verifiedFacts.map((fact) => ({
      id: fact.id,
      contentType: "VERIFIED_FACT",
      theme: fact.theme,
      round: fact.round,
      sourceLocation: fact.sourceLocation,
      publicSummary: fact.publicSummary,
      publicPresentationMode: fact.publicPresentationMode,
      allowedInterpretations: fact.allowedInterpretations,
      prohibitedInferences: fact.prohibitedInferences,
      copyrightStatus: fact.copyrightStatus,
      editionId: fact.editionId,
    })),
    curatorialInterpretations: material.curatorialInterpretations.map(
      (interpretation) => ({
        id: interpretation.id,
        contentType: "CURATORIAL_INTERPRETATION",
        interpretation: interpretation.interpretation,
        basedOnVerifiedFactIds: interpretation.basedOnVerifiedFactIds,
        prohibitedClaims: interpretation.prohibitedClaims,
        presentationMode: interpretation.presentationMode,
      }),
    ),
    evidenceCards: material.evidenceCards.map((card) => ({ ...card })),
    portraits: material.portraits.map((portrait) => ({
      assetId: portrait.assetId,
      charlieStage: portrait.charlieStage,
      publicAssetPath: portrait.publicAssetPath,
      altText: portrait.altText,
      descriptorOptions: portrait.descriptorOptions.map((option) => ({
        ...option,
      })),
      creator: portrait.creator,
      creationMethod: portrait.creationMethod,
      licenseOrPermission: portrait.licenseOrPermission,
      characterDesignVersion: portrait.characterDesignVersion,
      fallbackAssetId: portrait.fallbackAssetId,
      evidenceRole: portrait.evidenceRole,
    })),
  });
}

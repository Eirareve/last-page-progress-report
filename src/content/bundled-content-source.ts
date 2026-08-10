import contentManifestJson from "../../content/content-manifest.json";
import placeholderEvidenceCardsJson from "../../content/placeholder/evidence-cards.json";
import placeholderManifestJson from "../../content/placeholder/manifest.json";
import placeholderOriginalInteractionJson from "../../content/placeholder/original-interaction.json";
import placeholderPortraitsJson from "../../content/placeholder/portrait-config.json";
import verifiedBookEditionJson from "../../content/verified/book-version.json";
import verifiedBundleChecksumsJson from "../../content/verified/bundle-checksums.json";
import verifiedCuratorialInterpretationsJson from "../../content/verified/curatorial-interpretations.json";
import verifiedEvidenceCardsJson from "../../content/verified/evidence-cards.json";
import verifiedManifestTemplateJson from "../../content/verified/manifest.template.json";
import verifiedOriginalInteractionJson from "../../content/verified/original-interaction.json";
import verifiedPortraitsJson from "../../content/verified/portrait-config.json";
import verifiedFactsJson from "../../content/verified/verified-facts.json";
import {
  CONTENT_BUNDLE_VERSION,
  CONTENT_CONTRACT_VERSION,
  CONTENT_SCHEMA_VERSION,
  contentManifestSchema,
  placeholderEvidenceCardCollectionSchema,
  placeholderManifestSchema,
  placeholderPortraitConfigCollectionSchema,
  verifiedContentBundleMaterialSchema,
  verifiedManifestTemplateSchema,
} from "./bundle.schemas";
import { originalInteractionContentRecordSchema } from "./content.schemas";
import {
  ContentLoader,
  type ContentBundleSource,
} from "./loader";
import {
  ContentIntegrityError,
  sealPlaceholderContentBundle,
  sealVerifiedContentBundle,
} from "./bundle-projection";
import { CONTENT_CHECKSUM_ALGORITHM } from "./checksum";

export const BUNDLED_CONTENT_SOURCE: ContentBundleSource = Object.freeze({
  async loadPlaceholderBundle(): Promise<unknown> {
    contentManifestSchema.parse(contentManifestJson);
    const manifest = placeholderManifestSchema.parse(placeholderManifestJson);
    const evidenceCards = placeholderEvidenceCardCollectionSchema.parse(
      placeholderEvidenceCardsJson,
    );
    const portraits = placeholderPortraitConfigCollectionSchema.parse(
      placeholderPortraitsJson,
    );
    const originalInteraction = originalInteractionContentRecordSchema.parse(
      placeholderOriginalInteractionJson,
    );
    const bundle = await sealPlaceholderContentBundle({
      representation: "placeholder_runtime",
      contentContractVersion: manifest.contentContractVersion,
      contentSchemaVersion: manifest.contentSchemaVersion,
      contentMode: "placeholder",
      contentBundleId: manifest.contentBundleId,
      contentBundleVersion: manifest.contentBundleVersion,
      approvalStatus: "placeholder",
      checksumAlgorithm: manifest.checksumAlgorithm,
      containsPlaceholderContent: true,
      originalInteraction,
      evidenceCards: evidenceCards.records,
      portraits: portraits.records,
    });

    if (bundle.contentBundleChecksum !== manifest.contentBundleChecksum) {
      throw new ContentIntegrityError(
        "The bundled placeholder manifest checksum does not match its public payload",
      );
    }
    return bundle;
  },

  async loadVerifiedBundle(): Promise<unknown> {
    contentManifestSchema.parse(contentManifestJson);
    verifiedManifestTemplateSchema.parse(verifiedManifestTemplateJson);
    const { internalBundle, publicBundle } = await sealVerifiedContentBundle(
      verifiedContentBundleMaterialSchema.parse({
        representation: "internal_authoring",
        contentContractVersion: CONTENT_CONTRACT_VERSION,
        contentSchemaVersion: CONTENT_SCHEMA_VERSION,
        contentMode: "verified",
        contentBundleId: "last-page-verified-stage7",
        contentBundleVersion: CONTENT_BUNDLE_VERSION,
        edition: verifiedBookEditionJson,
        verifiedBy: "project-owner",
        verifiedAt: "2026-08-09T19:42:24.0561146Z",
        approvalStatus: "approved",
        checksumAlgorithm: CONTENT_CHECKSUM_ALGORITHM,
        containsPlaceholderContent: false,
        originalInteraction: verifiedOriginalInteractionJson,
        verifiedFacts: verifiedFactsJson.records,
        curatorialInterpretations:
          verifiedCuratorialInterpretationsJson.records,
        evidenceCards: verifiedEvidenceCardsJson.records,
        portraits: verifiedPortraitsJson.records,
      }),
    );
    if (
      internalBundle.internalContentBundleChecksum !==
        verifiedBundleChecksumsJson.internalContentBundleChecksum ||
      publicBundle.contentBundleChecksum !==
        verifiedBundleChecksumsJson.contentBundleChecksum
    ) {
      throw new ContentIntegrityError(
        "The bundled verified content no longer matches the Stage 7 frozen checksums",
      );
    }
    return internalBundle;
  },
});

export function createBundledContentLoader() {
  return new ContentLoader(BUNDLED_CONTENT_SOURCE);
}

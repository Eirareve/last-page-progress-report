import contentManifestJson from "../../content/content-manifest.json";
import placeholderEvidenceCardsJson from "../../content/placeholder/evidence-cards.json";
import placeholderManifestJson from "../../content/placeholder/manifest.json";
import placeholderOriginalInteractionJson from "../../content/placeholder/original-interaction.json";
import placeholderPortraitsJson from "../../content/placeholder/portrait-config.json";
import verifiedManifestTemplateJson from "../../content/verified/manifest.template.json";
import {
  contentManifestSchema,
  placeholderEvidenceCardCollectionSchema,
  placeholderManifestSchema,
  placeholderPortraitConfigCollectionSchema,
  verifiedManifestTemplateSchema,
} from "./bundle.schemas";
import { originalInteractionContentRecordSchema } from "./content.schemas";
import {
  ContentLoader,
  ContentSourceUnavailableError,
  type ContentBundleSource,
} from "./loader";
import {
  ContentIntegrityError,
  sealPlaceholderContentBundle,
} from "./bundle-projection";

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
    verifiedManifestTemplateSchema.parse(verifiedManifestTemplateJson);
    throw new ContentSourceUnavailableError(
      "verified_content_unavailable",
      "Verified content remains an unapproved authoring template",
    );
  },
});

export function createBundledContentLoader() {
  return new ContentLoader(BUNDLED_CONTENT_SOURCE);
}

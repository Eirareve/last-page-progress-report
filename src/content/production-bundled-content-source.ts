import { publicRuntimeContentBundleSchema } from "./bundle.schemas";
import { ContentIntegrityError } from "./bundle-projection";
import { ContentLoader, type ContentBundleSource } from "./loader";
import { PRODUCTION_PUBLIC_RUNTIME_BUNDLE } from "./public-runtime-bundle.generated";

export const BUNDLED_CONTENT_SOURCE: ContentBundleSource = Object.freeze({
  async loadPlaceholderBundle(): Promise<never> {
    throw new ContentIntegrityError(
      "Placeholder content is not present in the production browser bundle",
    );
  },
  async loadVerifiedBundle(): Promise<unknown> {
    return publicRuntimeContentBundleSchema.parse(
      PRODUCTION_PUBLIC_RUNTIME_BUNDLE,
    );
  },
});

export function createBundledContentLoader() {
  return new ContentLoader(BUNDLED_CONTENT_SOURCE);
}

import { ZodError } from "zod";

import type { ContentMode } from "./environment";
import type { LoadedContentBundle } from "./bundle.contracts";
import {
  verifyPlaceholderContentBundle,
  verifySealedVerifiedContentBundle,
} from "./bundle-projection";
import { createContentAccess, type ContentAccess } from "./content-access";
import { deepFreeze } from "./deep-freeze";

export interface ContentBundleSource {
  loadPlaceholderBundle(): Promise<unknown>;
  loadVerifiedBundle(): Promise<unknown>;
}

export type LoadedContent = Readonly<{
  bundle: LoadedContentBundle;
  access: ContentAccess;
}>;

export class ContentSourceUnavailableError extends Error {
  readonly code: "placeholder_content_unavailable" | "verified_content_unavailable";

  constructor(
    code: "placeholder_content_unavailable" | "verified_content_unavailable",
    message: string,
  ) {
    super(message);
    this.name = "ContentSourceUnavailableError";
    this.code = code;
  }
}

export class ContentValidationError extends Error {
  readonly code = "invalid_content_schema";
  readonly issues: readonly string[];

  constructor(error: ZodError) {
    const issues = error.issues.map(
      (issue) => `${issue.path.join(".") || "content"}: ${issue.message}`,
    );
    super(`Content validation failed: ${issues.join("; ")}`);
    this.name = "ContentValidationError";
    this.issues = Object.freeze(issues);
  }
}

export class ContentLoader {
  readonly #source: ContentBundleSource;

  constructor(source: ContentBundleSource) {
    this.#source = source;
  }

  async load(contentMode: ContentMode): Promise<LoadedContent> {
    let bundle: LoadedContentBundle;
    try {
      bundle =
        contentMode === "placeholder"
          ? await verifyPlaceholderContentBundle(
              await this.#source.loadPlaceholderBundle(),
            )
          : await verifySealedVerifiedContentBundle(
              await this.#source.loadVerifiedBundle(),
            );
    } catch (error) {
      if (error instanceof ZodError) {
        throw new ContentValidationError(error);
      }
      throw error;
    }

    const frozenBundle = deepFreeze(bundle);
    return deepFreeze({
      bundle: frozenBundle,
      access: createContentAccess(frozenBundle),
    });
  }
}

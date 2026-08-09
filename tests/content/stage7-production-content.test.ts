import { describe, expect, it } from "vitest";

import bundleChecksums from "../../content/verified/bundle-checksums.json";
import { sealedVerifiedContentBundleSchema } from "../../src/content/bundle.schemas";
import { BUNDLED_CONTENT_SOURCE } from "../../src/content/bundled-content-source";

describe("Stage 7 production content assembly", () => {
  it("seals the approved material with the frozen checksum implementation", async () => {
    const internalBundle = sealedVerifiedContentBundleSchema.parse(
      await BUNDLED_CONTENT_SOURCE.loadVerifiedBundle(),
    );

    expect(internalBundle.internalContentBundleChecksum).toBe(
      bundleChecksums.internalContentBundleChecksum,
    );
    expect(internalBundle.contentBundleChecksum).toBe(
      bundleChecksums.contentBundleChecksum,
    );
    expect(internalBundle.contentBundleChecksum).toBe(
      bundleChecksums.contentBundleChecksum,
    );
  });
});

import { describe, expect, it } from "vitest";

import {
  canonicalizeJson,
  canonicalizeJsonForChecksum,
} from "@/content/canonical-json";
import {
  CONTENT_CHECKSUM_ALGORITHM,
  computeCanonicalJsonChecksum,
  computeInternalContentBundleChecksum,
  computePublicContentBundleChecksum,
} from "@/content/checksum";

describe("content canonical JSON", () => {
  it("uses JCS key ordering and number serialization", () => {
    expect(
      canonicalizeJson({
        z: -0,
        numbers: [333333333.33333329, 1e30, 4.5, 2e-3, 1e-27],
        a: true,
      }),
    ).toBe(
      '{"a":true,"numbers":[333333333.3333333,1e+30,4.5,0.002,1e-27],"z":0}',
    );
  });

  it("normalizes string values and object keys to NFC", async () => {
    const composed = { "caf\u00e9": "Cr\u00e8me br\u00fbl\u00e9e" };
    const decomposed = {
      "cafe\u0301": "Cre\u0300me bru\u0302le\u0301e",
    };

    expect(canonicalizeJson(decomposed)).toBe(canonicalizeJson(composed));
    expect(await computeCanonicalJsonChecksum(decomposed)).toBe(
      await computeCanonicalJsonChecksum(composed),
    );
  });

  it("rejects object-key collisions created by NFC normalization", () => {
    expect(() =>
      canonicalizeJson({ "\u00e9": 1, "e\u0301": 2 }),
    ).toThrow(/collide after NFC normalization/);
  });

  it("is insensitive to parsed JSON whitespace and object insertion order", async () => {
    const compact = JSON.parse('{"b":2,"a":{"y":true,"x":null}}');
    const pretty = JSON.parse(`{
      "a": { "x": null, "y": true },
      "b": 2
    }`);

    expect(await computeCanonicalJsonChecksum(compact)).toBe(
      await computeCanonicalJsonChecksum(pretty),
    );
  });

  it("preserves array order", async () => {
    expect(canonicalizeJson(["first", "second"])).toBe('["first","second"]');
    expect(await computeCanonicalJsonChecksum(["first", "second"])).not.toBe(
      await computeCanonicalJsonChecksum(["second", "first"]),
    );
  });

  it("does not normalize line endings inside strings", async () => {
    expect(canonicalizeJson({ text: "line 1\r\nline 2" })).toContain(
      "line 1\\r\\nline 2",
    );
    expect(await computeCanonicalJsonChecksum({ text: "line 1\r\nline 2" })).not.toBe(
      await computeCanonicalJsonChecksum({ text: "line 1\nline 2" }),
    );
  });

  it("rejects values outside the JSON data model", () => {
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    const sparse = new Array(1);

    for (const invalid of [
      undefined,
      () => undefined,
      Symbol("invalid"),
      1n,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
      cyclic,
      sparse,
    ]) {
      expect(() => canonicalizeJson(invalid)).toThrow(TypeError);
    }
  });
});

describe("content bundle checksums", () => {
  it("exposes the frozen algorithm identifier and checksum representation", async () => {
    expect(CONTENT_CHECKSUM_ALGORITHM).toBe("rfc8785-sha256-nfc-v1");
    expect(await computeCanonicalJsonChecksum({})).toBe(
      "sha256:44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a",
    );
  });

  it("excludes only root self-referential checksum values", async () => {
    const material = {
      checksumAlgorithm: CONTENT_CHECKSUM_ALGORITHM,
      checksum: "sha256:old-generic",
      internalContentBundleChecksum: "sha256:old-internal",
      contentBundleChecksum: "sha256:old-public",
      nested: {
        checksum: "business-checksum",
        contentBundleChecksum: "nested-business-checksum",
      },
    };
    const changedSelfValues = {
      ...material,
      checksum: "sha256:new-generic",
      internalContentBundleChecksum: "sha256:new-internal",
      contentBundleChecksum: "sha256:new-public",
    };

    expect(canonicalizeJsonForChecksum(material)).toBe(
      '{"checksumAlgorithm":"rfc8785-sha256-nfc-v1","nested":{"checksum":"business-checksum","contentBundleChecksum":"nested-business-checksum"}}',
    );
    expect(await computeCanonicalJsonChecksum(material)).toBe(
      await computeCanonicalJsonChecksum(changedSelfValues),
    );
  });

  it("computes internal and public representations independently", async () => {
    const shared = {
      contentBundleId: "bundle-1",
      publicSummary: "Public text",
    };
    const internalBundle = {
      ...shared,
      internalExcerpt: "Private verification excerpt",
    };
    const publicBundle = shared;

    const internalChecksum =
      await computeInternalContentBundleChecksum(internalBundle);
    const publicChecksum = await computePublicContentBundleChecksum(publicBundle);

    expect(internalChecksum).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(publicChecksum).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(internalChecksum).not.toBe(publicChecksum);
  });
});

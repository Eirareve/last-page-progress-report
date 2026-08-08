import { describe, expect, it } from "vitest";

import {
  placeholderRuntimeContentBundleMaterialSchema,
  portraitConfigAuthoringRecordSchema,
  publicRuntimeContentBundleSchema,
  verifiedContentBundleMaterialSchema,
} from "../../src/content/bundle.schemas";
import {
  sealPlaceholderContentBundle,
  sealVerifiedContentBundle,
  verifySealedVerifiedContentBundle,
} from "../../src/content/bundle-projection";
import { createContentAccess } from "../../src/content/content-access";
import { assertSessionContentBindingMatches } from "../../src/content/content-binding";
import {
  CONTENT_CHECKSUM_ALGORITHM,
  computePublicContentBundleChecksum,
} from "../../src/content/checksum";
import { ContentLoader } from "../../src/content/loader";
import { makeVerifiedContentBundleMaterial } from "../fixtures/content";

describe("verified content bundle", () => {
  it("seals private and public representations independently", async () => {
    const material = makeVerifiedContentBundleMaterial();
    const { internalBundle, publicBundle } =
      await sealVerifiedContentBundle(material);
    const serializedPublic = JSON.stringify(publicBundle);

    expect(internalBundle.internalContentBundleChecksum).toMatch(
      /^sha256:[0-9a-f]{64}$/,
    );
    expect(publicBundle.contentBundleChecksum).toMatch(
      /^sha256:[0-9a-f]{64}$/,
    );
    expect(internalBundle.internalContentBundleChecksum).not.toBe(
      publicBundle.contentBundleChecksum,
    );
    expect(serializedPublic).not.toContain("internalExcerpt");
    expect(serializedPublic).not.toContain("Private test excerpt");
    expect(serializedPublic).not.toContain("verifiedBy");
    expect(serializedPublic).not.toContain("verifiedAt");
    expect(await verifySealedVerifiedContentBundle(internalBundle)).toEqual(
      publicBundle,
    );
  });

  it("hashes the final public representation without trimming significant newlines", async () => {
    const material = makeVerifiedContentBundleMaterial();
    material.verifiedFacts[0].publicSummary = "\nPublic summary with framing\r\n";
    const { publicBundle } = await sealVerifiedContentBundle(material);

    expect(publicBundle.verifiedFacts[0].publicSummary).toBe(
      "\nPublic summary with framing\r\n",
    );
    expect(await computePublicContentBundleChecksum(publicBundle)).toBe(
      publicBundle.contentBundleChecksum,
    );
  });

  it("rejects private or public checksum tampering", async () => {
    const { internalBundle } = await sealVerifiedContentBundle(
      makeVerifiedContentBundleMaterial(),
    );
    const tampered = structuredClone(internalBundle);
    tampered.verifiedFacts[0].internalExcerpt = "Tampered private excerpt";

    await expect(verifySealedVerifiedContentBundle(tampered)).rejects.toThrow(
      /checksum/i,
    );
  });

  it("rejects missing fact/interpretation references and duplicate content IDs", () => {
    const missingReference = makeVerifiedContentBundleMaterial();
    missingReference.evidenceCards[0].factIds = ["missing-fact"];
    expect(verifiedContentBundleMaterialSchema.safeParse(missingReference).success).toBe(
      false,
    );

    const missingInterpretation = makeVerifiedContentBundleMaterial();
    missingInterpretation.evidenceCards[0].interpretationIds = [
      "missing-interpretation",
    ];
    expect(
      verifiedContentBundleMaterialSchema.safeParse(missingInterpretation).success,
    ).toBe(false);

    const duplicate = makeVerifiedContentBundleMaterial();
    duplicate.evidenceCards[0].id = duplicate.verifiedFacts[0].id;
    expect(verifiedContentBundleMaterialSchema.safeParse(duplicate).success).toBe(
      false,
    );
  });

  it("rejects authorial-certainty framing and placeholder records in verified bundles", () => {
    const authorialClaim = makeVerifiedContentBundleMaterial();
    authorialClaim.curatorialInterpretations[0] = {
      ...authorialClaim.curatorialInterpretations[0],
      presentationMode: "author_unique_conclusion",
    } as never;
    expect(
      verifiedContentBundleMaterialSchema.safeParse(authorialClaim).success,
    ).toBe(false);

    const placeholderLeak = makeVerifiedContentBundleMaterial();
    placeholderLeak.evidenceCards[0] = {
      recordKind: "placeholder_evidence_card",
      id: "past-self-placeholder",
      round: "round1",
      title: "Placeholder",
      publicText: "PLACEHOLDER",
      question: "PLACEHOLDER",
      allowedFollowUps: [],
      prohibitedClaims: [],
      attribution: "placeholder",
      provenance: "placeholder",
    } as never;
    expect(
      verifiedContentBundleMaterialSchema.safeParse(placeholderLeak).success,
    ).toBe(false);
  });

  it("validates edition binding again at the public bundle boundary", async () => {
    const { publicBundle } = await sealVerifiedContentBundle(
      makeVerifiedContentBundleMaterial(),
    );
    const mismatched = structuredClone(publicBundle);
    mismatched.verifiedFacts[0].sourceLocation.editionId = "other-edition";

    expect(publicRuntimeContentBundleSchema.safeParse(mismatched).success).toBe(
      false,
    );
  });

  it("prevents portrait configuration from claiming an evidence role", () => {
    const portrait = {
      ...makeVerifiedContentBundleMaterial().portraits[0],
      evidenceRole: "verified_evidence",
    };
    expect(portraitConfigAuthoringRecordSchema.safeParse(portrait).success).toBe(
      false,
    );

    expect(
      portraitConfigAuthoringRecordSchema.safeParse({
        ...makeVerifiedContentBundleMaterial().portraits[0],
        publicAssetPath: "C:\\private\\portrait.png",
      }).success,
    ).toBe(false);
  });

  it("normalizes IDs before uniqueness checks, reference lookup, and sealing", async () => {
    const material = makeVerifiedContentBundleMaterial();
    material.verifiedFacts[0].id = "cafe\u0301-fact";
    material.evidenceCards[0].factIds = ["cafe\u0301-fact"];
    material.curatorialInterpretations[0].basedOnVerifiedFactIds = [
      "cafe\u0301-fact",
    ];
    const { publicBundle } = await sealVerifiedContentBundle(material);
    const access = createContentAccess(publicBundle);

    expect(publicBundle.verifiedFacts[0].id).toBe("café-fact");
    expect(publicBundle.evidenceCards[0].factIds).toEqual(["café-fact"]);
    expect(access.contentMode).toBe("verified");
    if (access.contentMode === "verified") {
      expect(access.getVerifiedFactsByIds(["café-fact"])[0].id).toBe(
        "café-fact",
      );
    }
  });
});

describe("ContentLoader and content access", () => {
  it("returns frozen Domain projections only through verified access", async () => {
    const { internalBundle } = await sealVerifiedContentBundle(
      makeVerifiedContentBundleMaterial(),
    );
    const loader = new ContentLoader({
      async loadPlaceholderBundle() {
        throw new Error("not used");
      },
      async loadVerifiedBundle() {
        return internalBundle;
      },
    });
    const loaded = await loader.load("verified");

    expect(loaded.access.contentMode).toBe("verified");
    if (loaded.access.contentMode !== "verified") {
      throw new Error("Expected verified content access");
    }
    expect(loaded.access.getVerifiedFactsByIds(["test-fact-1"])).toEqual([
      {
        id: "test-fact-1",
        text: "Public test summary 1",
        contentType: "VERIFIED_FACT",
        sourceReference:
          'source-location:v1:["test-edition","test-section","Test section 1",1,1,"Synthetic fixture locator"]',
        verifiedByHuman: true,
      },
    ]);
    expect(loaded.access.getDomainEvidenceCard("test-card-1").verifiedFactIds).toEqual(
      ["test-fact-1"],
    );
    expect(JSON.stringify(loaded.access)).not.toContain("internalExcerpt");
    expect(JSON.stringify(loaded.access)).not.toContain("Private test excerpt");
    expect(Object.isFrozen(loaded.bundle)).toBe(true);
    expect(Object.isFrozen(loaded.bundle.evidenceCards[0])).toBe(true);
    expect(Object.isFrozen(loaded.access.evidenceCards[0])).toBe(true);
    expect(() => {
      loaded.bundle.evidenceCards[0].title = "Mutated after validation";
    }).toThrow(TypeError);
  });

  it("keeps placeholder access structurally unable to retrieve verified facts", async () => {
    const bundle = await sealPlaceholderContentBundle({
      representation: "placeholder_runtime",
      contentContractVersion: "0.1.0",
      contentSchemaVersion: "0.1.0",
      contentMode: "placeholder",
      contentBundleId: "placeholder-test",
      contentBundleVersion: "0.1.0",
      approvalStatus: "placeholder",
      checksumAlgorithm: CONTENT_CHECKSUM_ALGORITHM,
      containsPlaceholderContent: true,
      evidenceCards: (["round1", "round2", "round3"] as const).map(
        (round, index) => ({
          recordKind: "placeholder_evidence_card" as const,
          id: [
            "past-self-placeholder",
            "future-forecast-placeholder",
            "relationship-placeholder",
          ][index] as
            | "past-self-placeholder"
            | "future-forecast-placeholder"
            | "relationship-placeholder",
          round,
          title: "Placeholder evidence",
          publicText: "PLACEHOLDER: verified content required",
          question: "PLACEHOLDER: original interaction required",
          allowedFollowUps: [],
          prohibitedClaims: ["novel_fact"],
          attribution: "placeholder" as const,
          provenance: "placeholder" as const,
        }),
      ),
      portraits: (["early", "peak", "futureFacing"] as const).map(
        (stage, index) => ({
          recordKind: "placeholder_portrait_scene" as const,
          id: [
            "early-charlie-placeholder",
            "peak-charlie-placeholder",
            "future-facing-charlie-placeholder",
          ][index] as
            | "early-charlie-placeholder"
            | "peak-charlie-placeholder"
            | "future-facing-charlie-placeholder",
          stage,
          assetPath: `/placeholders/test-${index + 1}.svg`,
          altText: "Placeholder portrait",
          provenance: "placeholder" as const,
        }),
      ),
    });
    const access = createContentAccess(bundle);

    expect(access.contentMode).toBe("placeholder");
    expect("getVerifiedFactsByIds" in access).toBe(false);
    expect(JSON.stringify(access)).not.toContain("VERIFIED_FACT");
  });

  it("rejects content binding mismatches instead of silently restoring", async () => {
    const { publicBundle } = await sealVerifiedContentBundle(
      makeVerifiedContentBundleMaterial(),
    );
    const access = createContentAccess(publicBundle);
    const persisted = {
      ...access.binding,
      contentBundleVersion: "0.0.9",
      targetEnvironment: "test",
    };

    expect(() =>
      assertSessionContentBindingMatches(persisted, access.binding, "test"),
    ).toThrow(/contentBundleVersion/);
  });

  it("rejects duplicate placeholder IDs and incomplete round coverage", async () => {
    const bundle = await sealPlaceholderContentBundle({
      representation: "placeholder_runtime",
      contentContractVersion: "0.1.0",
      contentSchemaVersion: "0.1.0",
      contentMode: "placeholder",
      contentBundleId: "placeholder-test",
      contentBundleVersion: "0.1.0",
      approvalStatus: "placeholder",
      checksumAlgorithm: CONTENT_CHECKSUM_ALGORITHM,
      containsPlaceholderContent: true,
      evidenceCards: (["round1", "round2", "round3"] as const).map(
        (round, index) => ({
          recordKind: "placeholder_evidence_card" as const,
          id: [
            "past-self-placeholder",
            "future-forecast-placeholder",
            "relationship-placeholder",
          ][index] as
            | "past-self-placeholder"
            | "future-forecast-placeholder"
            | "relationship-placeholder",
          round,
          title: "Placeholder evidence",
          publicText: "PLACEHOLDER",
          question: "PLACEHOLDER",
          allowedFollowUps: [],
          prohibitedClaims: [],
          attribution: "placeholder" as const,
          provenance: "placeholder" as const,
        }),
      ),
      portraits: (["early", "peak", "futureFacing"] as const).map(
        (stage, index) => ({
          recordKind: "placeholder_portrait_scene" as const,
          id: [
            "early-charlie-placeholder",
            "peak-charlie-placeholder",
            "future-facing-charlie-placeholder",
          ][index] as
            | "early-charlie-placeholder"
            | "peak-charlie-placeholder"
            | "future-facing-charlie-placeholder",
          stage,
          assetPath: `/placeholders/test-${index + 1}.svg`,
          altText: "Placeholder portrait",
          provenance: "placeholder" as const,
        }),
      ),
    });
    const duplicate = structuredClone(bundle);
    duplicate.evidenceCards[1] = structuredClone(duplicate.evidenceCards[0]);

    expect(
      placeholderRuntimeContentBundleMaterialSchema.safeParse(duplicate).success,
    ).toBe(false);
  });
});

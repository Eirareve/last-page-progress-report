import type { VerifiedContentBundleMaterial } from "../../src/content/bundle.contracts";
import {
  CONTENT_BUNDLE_VERSION,
  CONTENT_CONTRACT_VERSION,
  CONTENT_SCHEMA_VERSION,
} from "../../src/content/bundle.schemas";
import { CONTENT_CHECKSUM_ALGORITHM } from "../../src/content/checksum";

export function makeVerifiedContentBundleMaterial(): VerifiedContentBundleMaterial {
  const verifiedAt = "2026-08-06T12:00:00.000Z";
  const verifiedBy = "test-human-reviewer";
  const editionId = "test-edition";

  return {
    representation: "internal_authoring",
    contentContractVersion: CONTENT_CONTRACT_VERSION,
    contentSchemaVersion: CONTENT_SCHEMA_VERSION,
    contentMode: "verified",
    contentBundleId: "test-verified-content",
    contentBundleVersion: CONTENT_BUNDLE_VERSION,
    edition: {
      editionId,
      title: "Test-only edition",
      language: "en",
      publisher: "Test publisher",
      publicationYear: 2000,
      isbn: null,
      editionLabel: "test fixture",
      verifiedBy,
      verifiedAt,
      verificationStatus: "approved",
    },
    verifiedBy,
    verifiedAt,
    approvalStatus: "approved",
    checksumAlgorithm: CONTENT_CHECKSUM_ALGORITHM,
    containsPlaceholderContent: false,
    originalInteraction: {
      id: "test-original-interaction",
      contentType: "ORIGINAL_INTERACTION",
      purpose: "manuscript",
      text: "Synthetic precise manuscript.",
      publicDeclaration: "Synthetic original interaction for tests.",
      attribution: "Test fixture",
      provenance: "scope_freeze",
    },
    verifiedFacts: (["round1", "round2", "round3"] as const).map(
      (round, index) => ({
        id: `test-fact-${index + 1}`,
        contentType: "VERIFIED_FACT" as const,
        theme: `test-theme-${index + 1}`,
        round,
        verifiedFact: `Private test fact ${index + 1}`,
        sourceLocation: {
          editionId,
          sectionType: "test-section",
          sectionLabel: `Test section ${index + 1}`,
          pageStart: index + 1,
          pageEnd: index + 1,
          locatorNote: "Synthetic fixture locator",
        },
        internalExcerpt: `Private test excerpt ${index + 1}`,
        publicSummary: `Public test summary ${index + 1}`,
        publicPresentationMode: "summary",
        allowedInterpretations: [`test-interpretation-boundary-${index + 1}`],
        prohibitedInferences: [`test-prohibited-inference-${index + 1}`],
        copyrightStatus: "test_fixture_only",
        verifiedBy,
        verifiedAt,
        verificationStatus: "approved" as const,
        editionId,
      }),
    ),
    curatorialInterpretations: [
      {
        id: "test-interpretation-1",
        contentType: "CURATORIAL_INTERPRETATION",
        interpretation: "One test-only interpretation",
        basedOnVerifiedFactIds: ["test-fact-1"],
        prohibitedClaims: ["Do not present this as the author's only conclusion"],
        presentationMode: "one_possible_interpretation",
        approvedBy: verifiedBy,
        approvedAt: verifiedAt,
        approvalStatus: "approved",
      },
    ],
    evidenceCards: (["round1", "round2", "round3"] as const).map(
      (round, index) => ({
        id: `test-card-${index + 1}`,
        round,
        title: `Test card ${index + 1}`,
        factIds: [`test-fact-${index + 1}`],
        interpretationIds: index === 0 ? ["test-interpretation-1"] : [],
        publicText: `Public test evidence ${index + 1}`,
        question: `Test-only question ${index + 1}?`,
        allowedFollowUps: ["Ask for a test qualification"],
        prohibitedClaims: ["Do not present test data as novel evidence"],
        attribution: "Synthetic test fixture",
      }),
    ),
    portraits: (["early", "peak", "futureFacing"] as const).map(
      (charlieStage, index) => ({
        assetId: `test-portrait-${index + 1}`,
        charlieStage,
        publicAssetPath: `/portraits/test-${index + 1}.png`,
        altText: `Synthetic test portrait ${index + 1}`,
        descriptorOptions: [
          {
            id: `test-descriptor-${index + 1}`,
            label: `Descriptor ${index + 1}`,
          },
        ],
        creator: "Test fixture",
        creationMethod: "synthetic_test_asset",
        licenseOrPermission: "test_only",
        approvedForPublicUse: true as const,
        characterDesignVersion: "test-v1",
        fallbackAssetId: null,
        evidenceRole: "not_evidence" as const,
      }),
    ),
  };
}

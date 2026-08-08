import { z } from "zod";

import {
  curatorialInterpretationSchema,
  evidenceCardSchema,
  verifiedFactSchema,
} from "../domain/schemas/evidence.schema";
import {
  charlieStageSchema,
  roundIdSchema,
} from "../domain/schemas/experience.schema";
import { sha256DigestSchema } from "../domain/text/stable-text-anchor.schema";
import { CONTENT_CHECKSUM_ALGORITHM } from "./checksum";
import {
  approvedVerifiedFactAuthoringRecordSchema,
  contentSourceLocationSchema,
  evidenceCardAuthoringRecordSchema,
  placeholderEvidenceCardSchema,
  placeholderPortraitSceneConfigSchema,
  publicAssetPathSchema,
} from "./content.schemas";

export const CONTENT_CONTRACT_VERSION = "0.1.0" as const;
export const CONTENT_SCHEMA_VERSION = "0.1.0" as const;
export const CONTENT_BUNDLE_VERSION = "0.1.0" as const;

const nonEmptyTextSchema = z
  .string()
  .refine((value) => value.trim().length > 0, {
    message: "Text must contain a non-whitespace character",
  })
  .transform((value) => value.normalize("NFC"));
const uniqueTextArraySchema = z
  .array(nonEmptyTextSchema)
  .refine((values) => new Set(values).size === values.length, {
    message: "Values must be unique",
  });

export const contentManifestSchema = z.strictObject({
  contentManifestSchemaVersion: z.literal(CONTENT_SCHEMA_VERSION),
  contentContractVersion: z.literal(CONTENT_CONTRACT_VERSION),
  manifestStatus: z.literal("template_registry"),
  modes: z.strictObject({
    placeholder: z.strictObject({
      manifestPath: z.literal("placeholder/manifest.json"),
      productionEligible: z.literal(false),
      templateOnly: z.literal(false),
      purpose: z.literal("development_test_mock_only"),
    }),
    verified: z.strictObject({
      manifestPath: z.literal("verified/manifest.template.json"),
      productionEligible: z.literal(false),
      templateOnly: z.literal(true),
      purpose: z.literal("human_authoring_template"),
    }),
  }),
});

export const bookEditionAuthoringRecordSchema = z.strictObject({
  editionId: nonEmptyTextSchema,
  title: nonEmptyTextSchema,
  language: nonEmptyTextSchema,
  publisher: nonEmptyTextSchema,
  publicationYear: z.number().int().positive(),
  isbn: nonEmptyTextSchema.nullable(),
  editionLabel: nonEmptyTextSchema,
  verifiedBy: nonEmptyTextSchema,
  verifiedAt: z.iso.datetime(),
  verificationStatus: z.literal("approved"),
});

export const curatorialInterpretationAuthoringRecordSchema = z.strictObject({
  id: nonEmptyTextSchema,
  contentType: z.literal("CURATORIAL_INTERPRETATION"),
  interpretation: nonEmptyTextSchema,
  basedOnVerifiedFactIds: uniqueTextArraySchema.min(1),
  prohibitedClaims: uniqueTextArraySchema,
  presentationMode: z.literal("one_possible_interpretation"),
  approvedBy: nonEmptyTextSchema,
  approvedAt: z.iso.datetime(),
  approvalStatus: z.literal("approved"),
});

export const portraitConfigAuthoringRecordSchema = z.strictObject({
  assetId: nonEmptyTextSchema,
  charlieStage: charlieStageSchema,
  publicAssetPath: publicAssetPathSchema,
  altText: nonEmptyTextSchema,
  creator: nonEmptyTextSchema,
  creationMethod: nonEmptyTextSchema,
  licenseOrPermission: nonEmptyTextSchema,
  approvedForPublicUse: z.literal(true),
  characterDesignVersion: nonEmptyTextSchema,
  fallbackAssetId: nonEmptyTextSchema.nullable(),
  evidenceRole: z.literal("not_evidence"),
});

const verifiedBundleMaterialShape = {
  representation: z.literal("internal_authoring"),
  contentContractVersion: z.literal(CONTENT_CONTRACT_VERSION),
  contentSchemaVersion: z.literal(CONTENT_SCHEMA_VERSION),
  contentMode: z.literal("verified"),
  contentBundleId: nonEmptyTextSchema,
  contentBundleVersion: nonEmptyTextSchema,
  edition: bookEditionAuthoringRecordSchema,
  verifiedBy: nonEmptyTextSchema,
  verifiedAt: z.iso.datetime(),
  approvalStatus: z.literal("approved"),
  checksumAlgorithm: z.literal(CONTENT_CHECKSUM_ALGORITHM),
  containsPlaceholderContent: z.literal(false),
  verifiedFacts: z.array(approvedVerifiedFactAuthoringRecordSchema).min(1),
  curatorialInterpretations: z.array(
    curatorialInterpretationAuthoringRecordSchema,
  ),
  evidenceCards: z.array(evidenceCardAuthoringRecordSchema).length(3),
  portraits: z.array(portraitConfigAuthoringRecordSchema).length(3),
} as const;

export const verifiedContentBundleMaterialSchema = z
  .strictObject(verifiedBundleMaterialShape)
  .superRefine(validateVerifiedBundleReferences);

export const sealedVerifiedContentBundleSchema = z
  .strictObject({
    ...verifiedBundleMaterialShape,
    internalContentBundleChecksum: sha256DigestSchema,
    contentBundleChecksum: sha256DigestSchema,
  })
  .superRefine(validateVerifiedBundleReferences);

export const publicBookEditionSchema = bookEditionAuthoringRecordSchema.omit({
  verifiedBy: true,
  verifiedAt: true,
  verificationStatus: true,
});

export const publicVerifiedFactContentRecordSchema = z.strictObject({
  id: nonEmptyTextSchema,
  contentType: z.literal("VERIFIED_FACT"),
  theme: nonEmptyTextSchema,
  round: roundIdSchema,
  sourceLocation: contentSourceLocationSchema,
  publicSummary: nonEmptyTextSchema,
  publicPresentationMode: nonEmptyTextSchema,
  allowedInterpretations: uniqueTextArraySchema,
  prohibitedInferences: uniqueTextArraySchema,
  copyrightStatus: nonEmptyTextSchema,
  editionId: nonEmptyTextSchema,
});

export const publicCuratorialInterpretationContentRecordSchema = z.strictObject({
  id: nonEmptyTextSchema,
  contentType: z.literal("CURATORIAL_INTERPRETATION"),
  interpretation: nonEmptyTextSchema,
  basedOnVerifiedFactIds: uniqueTextArraySchema.min(1),
  prohibitedClaims: uniqueTextArraySchema,
  presentationMode: z.literal("one_possible_interpretation"),
});

export const publicEvidenceCardContentRecordSchema =
  evidenceCardAuthoringRecordSchema;

export const publicPortraitConfigRecordSchema =
  portraitConfigAuthoringRecordSchema.omit({
    approvedForPublicUse: true,
  });

const publicVerifiedBundleMaterialShape = {
  representation: z.literal("public_runtime"),
  contentContractVersion: z.literal(CONTENT_CONTRACT_VERSION),
  contentSchemaVersion: z.literal(CONTENT_SCHEMA_VERSION),
  contentMode: z.literal("verified"),
  contentBundleId: nonEmptyTextSchema,
  contentBundleVersion: nonEmptyTextSchema,
  edition: publicBookEditionSchema,
  approvalStatus: z.literal("approved"),
  checksumAlgorithm: z.literal(CONTENT_CHECKSUM_ALGORITHM),
  containsPlaceholderContent: z.literal(false),
  verifiedFacts: z.array(publicVerifiedFactContentRecordSchema).min(1),
  curatorialInterpretations: z.array(
    publicCuratorialInterpretationContentRecordSchema,
  ),
  evidenceCards: z.array(publicEvidenceCardContentRecordSchema).length(3),
  portraits: z.array(publicPortraitConfigRecordSchema).length(3),
} as const;

export const publicRuntimeContentBundleMaterialSchema = z
  .strictObject(publicVerifiedBundleMaterialShape)
  .superRefine(validatePublicBundleReferences);

const publicVerifiedBundleShape = {
  ...publicVerifiedBundleMaterialShape,
  contentBundleChecksum: sha256DigestSchema,
} as const;

export const publicRuntimeContentBundleSchema = z
  .strictObject(publicVerifiedBundleShape)
  .superRefine(validatePublicBundleReferences);

export const placeholderEvidenceCardCollectionSchema = z.strictObject({
  placeholderEvidenceCardSchemaVersion: z.literal(CONTENT_SCHEMA_VERSION),
  contentMode: z.literal("placeholder"),
  records: z.array(placeholderEvidenceCardSchema).length(3),
}).superRefine((collection, context) => {
  validateUniqueIds(collection.records.map((record) => record.id), context);
  validateRoundCoverage(collection.records.map((record) => record.round), context);
});

export const placeholderPortraitConfigCollectionSchema = z.strictObject({
  placeholderPortraitConfigSchemaVersion: z.literal(CONTENT_SCHEMA_VERSION),
  contentMode: z.literal("placeholder"),
  records: z.array(placeholderPortraitSceneConfigSchema).length(3),
}).superRefine((collection, context) => {
  validateUniqueIds(collection.records.map((record) => record.id), context);
  validatePortraitCoverage(collection.records.map((record) => record.stage), context);
});

export const verifiedManifestTemplateSchema = z.strictObject({
  verifiedManifestSchemaVersion: z.literal(CONTENT_SCHEMA_VERSION),
  contentContractVersion: z.literal(CONTENT_CONTRACT_VERSION),
  contentSchemaVersion: z.literal(CONTENT_SCHEMA_VERSION),
  contentMode: z.literal("verified"),
  manifestStatus: z.literal("template_only"),
  templateOnly: z.literal(true),
  productionEligible: z.literal(false),
  contentBundleId: z.null(),
  contentBundleVersion: z.null(),
  editionId: z.null(),
  verifiedBy: z.null(),
  verifiedAt: z.null(),
  checksumAlgorithm: z.literal(CONTENT_CHECKSUM_ALGORITHM),
  internalContentBundleChecksum: z.null(),
  contentBundleChecksum: z.null(),
  files: z.strictObject({
    bookVersion: z.literal("book-version.template.json"),
    verifiedFacts: z.literal("verified-facts.template.json"),
    curatorialInterpretations: z.literal(
      "curatorial-interpretations.template.json",
    ),
    evidenceCards: z.literal("evidence-cards.template.json"),
    portraitConfig: z.literal("portrait-config.template.json"),
  }),
  activationRequirements: z.array(nonEmptyTextSchema).min(5),
});

export const placeholderManifestSchema = z.strictObject({
  placeholderManifestSchemaVersion: z.literal(CONTENT_SCHEMA_VERSION),
  contentContractVersion: z.literal(CONTENT_CONTRACT_VERSION),
  contentSchemaVersion: z.literal(CONTENT_SCHEMA_VERSION),
  contentMode: z.literal("placeholder"),
  contentBundleId: nonEmptyTextSchema,
  contentBundleVersion: nonEmptyTextSchema,
  templateOnly: z.literal(false),
  productionEligible: z.literal(false),
  verificationStatus: z.literal("not_applicable_placeholder"),
  editionId: z.null(),
  verifiedBy: z.null(),
  verifiedAt: z.null(),
  checksumAlgorithm: z.literal(CONTENT_CHECKSUM_ALGORITHM),
  internalContentBundleChecksum: z.null(),
  contentBundleChecksum: sha256DigestSchema,
  files: z.strictObject({
    evidenceCards: z.literal("evidence-cards.json"),
    portraitConfig: z.literal("portrait-config.json"),
  }),
  prohibitions: z.array(nonEmptyTextSchema).min(3),
});

const placeholderRuntimeContentBundleMaterialShape = {
  representation: z.literal("placeholder_runtime"),
  contentContractVersion: z.literal(CONTENT_CONTRACT_VERSION),
  contentSchemaVersion: z.literal(CONTENT_SCHEMA_VERSION),
  contentMode: z.literal("placeholder"),
  contentBundleId: nonEmptyTextSchema,
  contentBundleVersion: nonEmptyTextSchema,
  approvalStatus: z.literal("placeholder"),
  checksumAlgorithm: z.literal(CONTENT_CHECKSUM_ALGORITHM),
  containsPlaceholderContent: z.literal(true),
  evidenceCards: z.array(placeholderEvidenceCardSchema).length(3),
  portraits: z.array(placeholderPortraitSceneConfigSchema).length(3),
} as const;

export const placeholderRuntimeContentBundleMaterialSchema = z
  .strictObject(placeholderRuntimeContentBundleMaterialShape)
  .superRefine(validatePlaceholderBundle);

export const placeholderRuntimeContentBundleSchema = z
  .strictObject({
    ...placeholderRuntimeContentBundleMaterialShape,
    contentBundleChecksum: sha256DigestSchema,
  })
  .superRefine(validatePlaceholderBundle);

export const loadedContentBundleSchema = z.discriminatedUnion("contentMode", [
  publicRuntimeContentBundleSchema,
  placeholderRuntimeContentBundleSchema,
]);

function validateVerifiedBundleReferences(
  bundle: z.infer<z.ZodObject<typeof verifiedBundleMaterialShape>>,
  context: z.RefinementCtx,
): void {
  const factIds = new Set(bundle.verifiedFacts.map((fact) => fact.id));
  const interpretationIds = new Set(
    bundle.curatorialInterpretations.map((interpretation) => interpretation.id),
  );
  validateUniqueIds(
    [
      ...bundle.verifiedFacts.map((record) => record.id),
      ...bundle.curatorialInterpretations.map((record) => record.id),
      ...bundle.evidenceCards.map((record) => record.id),
      ...bundle.portraits.map((record) => record.assetId),
    ],
    context,
  );

  for (const [index, fact] of bundle.verifiedFacts.entries()) {
    if (fact.editionId !== bundle.edition.editionId) {
      context.addIssue({
        code: "custom",
        message: "Verified fact must bind the bundle edition",
        path: ["verifiedFacts", index, "editionId"],
      });
    }
    if (fact.sourceLocation.editionId !== fact.editionId) {
      context.addIssue({
        code: "custom",
        message: "Verified fact source location must bind the fact edition",
        path: ["verifiedFacts", index, "sourceLocation", "editionId"],
      });
    }
  }
  for (const [index, interpretation] of bundle.curatorialInterpretations.entries()) {
    validateReferences(
      interpretation.basedOnVerifiedFactIds,
      factIds,
      ["curatorialInterpretations", index, "basedOnVerifiedFactIds"],
      "verified fact",
      context,
    );
  }
  for (const [index, card] of bundle.evidenceCards.entries()) {
    validateReferences(
      card.factIds,
      factIds,
      ["evidenceCards", index, "factIds"],
      "verified fact",
      context,
    );
    validateReferences(
      card.interpretationIds,
      interpretationIds,
      ["evidenceCards", index, "interpretationIds"],
      "approved interpretation",
      context,
    );
  }
  validateRoundCoverage(bundle.evidenceCards.map((card) => card.round), context);
  validatePortraitCoverage(
    bundle.portraits.map((portrait) => portrait.charlieStage),
    context,
  );
}

function validatePublicBundleReferences(
  bundle: z.infer<z.ZodObject<typeof publicVerifiedBundleMaterialShape>>,
  context: z.RefinementCtx,
): void {
  const factIds = new Set(bundle.verifiedFacts.map((fact) => fact.id));
  const interpretationIds = new Set(
    bundle.curatorialInterpretations.map((interpretation) => interpretation.id),
  );
  validateUniqueIds(
    [
      ...bundle.verifiedFacts.map((record) => record.id),
      ...bundle.curatorialInterpretations.map((record) => record.id),
      ...bundle.evidenceCards.map((record) => record.id),
      ...bundle.portraits.map((record) => record.assetId),
    ],
    context,
  );
  for (const [index, fact] of bundle.verifiedFacts.entries()) {
    if (fact.editionId !== bundle.edition.editionId) {
      context.addIssue({
        code: "custom",
        message: "Public fact must bind the public bundle edition",
        path: ["verifiedFacts", index, "editionId"],
      });
    }
    if (fact.sourceLocation.editionId !== fact.editionId) {
      context.addIssue({
        code: "custom",
        message: "Public fact source location must bind the fact edition",
        path: ["verifiedFacts", index, "sourceLocation", "editionId"],
      });
    }
  }
  for (const [index, interpretation] of bundle.curatorialInterpretations.entries()) {
    validateReferences(
      interpretation.basedOnVerifiedFactIds,
      factIds,
      ["curatorialInterpretations", index, "basedOnVerifiedFactIds"],
      "verified fact",
      context,
    );
  }
  for (const [index, card] of bundle.evidenceCards.entries()) {
    validateReferences(
      card.factIds,
      factIds,
      ["evidenceCards", index, "factIds"],
      "verified fact",
      context,
    );
    validateReferences(
      card.interpretationIds,
      interpretationIds,
      ["evidenceCards", index, "interpretationIds"],
      "approved interpretation",
      context,
    );
  }
  validateRoundCoverage(bundle.evidenceCards.map((card) => card.round), context);
  validatePortraitCoverage(
    bundle.portraits.map((portrait) => portrait.charlieStage),
    context,
  );
}

function validatePlaceholderBundle(
  bundle: {
    evidenceCards: readonly z.infer<typeof placeholderEvidenceCardSchema>[];
    portraits: readonly z.infer<typeof placeholderPortraitSceneConfigSchema>[];
  },
  context: z.RefinementCtx,
): void {
  validateUniqueIds(
    [
      ...bundle.evidenceCards.map((record) => record.id),
      ...bundle.portraits.map((record) => record.id),
    ],
    context,
  );
  validateRoundCoverage(bundle.evidenceCards.map((record) => record.round), context);
  validatePortraitCoverage(bundle.portraits.map((record) => record.stage), context);
}

function validateReferences(
  references: readonly string[],
  allowed: ReadonlySet<string>,
  path: PropertyKey[],
  label: string,
  context: z.RefinementCtx,
): void {
  for (const [index, reference] of references.entries()) {
    if (!allowed.has(reference)) {
      context.addIssue({
        code: "custom",
        message: `Unknown or unapproved ${label} ID: ${reference}`,
        path: [...path, index],
      });
    }
  }
}

function validateUniqueIds(ids: readonly string[], context: z.RefinementCtx): void {
  if (new Set(ids).size !== ids.length) {
    context.addIssue({
      code: "custom",
      message: "Content IDs must be unique across the bundle",
      path: [],
    });
  }
}

function validateRoundCoverage(
  rounds: readonly z.infer<typeof roundIdSchema>[],
  context: z.RefinementCtx,
): void {
  if (new Set(rounds).size !== 3) {
    context.addIssue({
      code: "custom",
      message: "Evidence cards must cover round1, round2, and round3 exactly once",
      path: ["evidenceCards"],
    });
  }
}

function validatePortraitCoverage(
  stages: readonly z.infer<typeof charlieStageSchema>[],
  context: z.RefinementCtx,
): void {
  if (new Set(stages).size !== 3) {
    context.addIssue({
      code: "custom",
      message: "Portraits must cover early, peak, and futureFacing exactly once",
      path: ["portraits"],
    });
  }
}

// Compile-time anchors: the public projections remain the frozen Domain types.
void verifiedFactSchema;
void evidenceCardSchema;
void curatorialInterpretationSchema;

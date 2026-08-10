import type { z } from "zod";

import type {
  bookEditionAuthoringRecordSchema,
  contentManifestSchema,
  curatorialInterpretationAuthoringRecordSchema,
  loadedContentBundleSchema,
  placeholderManifestSchema,
  placeholderRuntimeContentBundleMaterialSchema,
  placeholderRuntimeContentBundleSchema,
  portraitConfigAuthoringRecordSchema,
  publicRuntimeContentBundleMaterialSchema,
  publicRuntimeContentBundleSchema,
  sealedVerifiedContentBundleSchema,
  verifiedContentBundleMaterialSchema,
} from "./bundle.schemas";

export type ContentManifest = z.infer<typeof contentManifestSchema>;

export type BookEditionAuthoringRecord = z.infer<
  typeof bookEditionAuthoringRecordSchema
>;
export type CuratorialInterpretationAuthoringRecord = z.infer<
  typeof curatorialInterpretationAuthoringRecordSchema
>;
export type PortraitConfigAuthoringRecord = z.infer<
  typeof portraitConfigAuthoringRecordSchema
>;
export type VerifiedContentBundleMaterial = z.infer<
  typeof verifiedContentBundleMaterialSchema
>;
export type SealedVerifiedContentBundle = z.infer<
  typeof sealedVerifiedContentBundleSchema
>;
export type PublicRuntimeContentBundle = z.infer<
  typeof publicRuntimeContentBundleSchema
>;
export type PublicRuntimeContentBundleMaterial = z.infer<
  typeof publicRuntimeContentBundleMaterialSchema
>;
export type PlaceholderManifest = z.infer<typeof placeholderManifestSchema>;
export type PlaceholderRuntimeContentBundleMaterial = z.infer<
  typeof placeholderRuntimeContentBundleMaterialSchema
>;
export type PlaceholderRuntimeContentBundle = z.infer<
  typeof placeholderRuntimeContentBundleSchema
>;
export type LoadedContentBundle = z.infer<typeof loadedContentBundleSchema>;

import type { z } from "zod";

import type {
  approvedVerifiedFactAuthoringRecordSchema,
  contentSourceLocationSchema,
  domainEvidenceCardProjectionSchema,
  domainVerifiedFactProjectionSchema,
  evidenceCardAuthoringRecordSchema,
  placeholderEvidenceCardSchema,
  placeholderPortraitSceneConfigSchema,
  publicAssetPathSchema,
  verifiedFactAuthoringRecordSchema,
} from "./content.schemas";

export type ContentSourceLocation = z.infer<typeof contentSourceLocationSchema>;
export type VerifiedFactAuthoringRecord = z.infer<
  typeof verifiedFactAuthoringRecordSchema
>;
export type ApprovedVerifiedFactAuthoringRecord = z.infer<
  typeof approvedVerifiedFactAuthoringRecordSchema
>;
export type EvidenceCardAuthoringRecord = z.infer<
  typeof evidenceCardAuthoringRecordSchema
>;
export type DomainVerifiedFactProjection = z.infer<
  typeof domainVerifiedFactProjectionSchema
>;
export type DomainEvidenceCardProjection = z.infer<
  typeof domainEvidenceCardProjectionSchema
>;
export type PlaceholderEvidenceCard = z.infer<
  typeof placeholderEvidenceCardSchema
>;
export type PlaceholderPortraitSceneConfig = z.infer<
  typeof placeholderPortraitSceneConfigSchema
>;
export type PublicAssetPath = z.infer<typeof publicAssetPathSchema>;

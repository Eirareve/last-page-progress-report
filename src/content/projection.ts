import {
  approvedVerifiedFactAuthoringRecordSchema,
  contentSourceLocationSchema,
  domainEvidenceCardProjectionSchema,
  domainVerifiedFactProjectionSchema,
  evidenceCardAuthoringRecordSchema,
} from "./content.schemas";
import type {
  ContentSourceLocation,
  DomainEvidenceCardProjection,
  DomainVerifiedFactProjection,
} from "./content.contracts";

const SOURCE_REFERENCE_FORMAT_VERSION = "source-location:v1" as const;

export function formatContentSourceReference(
  input: ContentSourceLocation,
): string {
  const sourceLocation = contentSourceLocationSchema.parse(input);
  const stableFields = [
    sourceLocation.editionId.normalize("NFC"),
    sourceLocation.sectionType.normalize("NFC"),
    sourceLocation.sectionLabel.normalize("NFC"),
    sourceLocation.pageStart,
    sourceLocation.pageEnd,
    sourceLocation.locatorNote.normalize("NFC"),
  ] as const;

  return `${SOURCE_REFERENCE_FORMAT_VERSION}:${JSON.stringify(stableFields)}`;
}

export function projectVerifiedFactAuthoringRecord(
  input: unknown,
): DomainVerifiedFactProjection {
  const record = approvedVerifiedFactAuthoringRecordSchema.parse(input);

  return domainVerifiedFactProjectionSchema.parse({
    id: record.id,
    text: record.publicSummary,
    contentType: "VERIFIED_FACT",
    sourceReference: formatContentSourceReference(record.sourceLocation),
    verifiedByHuman: true,
  });
}

export function projectEvidenceCardAuthoringRecord(
  input: unknown,
): DomainEvidenceCardProjection {
  const record = evidenceCardAuthoringRecordSchema.parse(input);

  return domainEvidenceCardProjectionSchema.parse({
    id: record.id,
    roundId: record.round,
    title: record.title,
    publicSummary: record.publicText,
    verifiedFactIds: [...record.factIds],
    interpretationIds: [...record.interpretationIds],
  });
}

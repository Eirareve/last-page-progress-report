import { describe, expect, it } from "vitest";

import {
  evidenceCardSchema,
  originalInteractionSchema,
  verifiedFactSchema,
} from "@/domain";
import {
  approvedVerifiedFactAuthoringRecordSchema,
  domainEvidenceCardProjectionSchema,
  domainVerifiedFactProjectionSchema,
  evidenceCardAuthoringRecordSchema,
  placeholderEvidenceCardSchema,
  placeholderPortraitSceneConfigSchema,
  verifiedFactAuthoringRecordSchema,
} from "@/content/content.schemas";
import {
  formatContentSourceReference,
  projectEvidenceCardAuthoringRecord,
  projectVerifiedFactAuthoringRecord,
} from "@/content/projection";

const approvedFact = {
  id: "fact-1",
  contentType: "VERIFIED_FACT",
  theme: "self-representation",
  round: "round1",
  verifiedFact: "Internal fact wording for human verification only.",
  sourceLocation: {
    editionId: "edition-1",
    sectionType: "progress-report",
    sectionLabel: "Report One",
    pageStart: 12,
    pageEnd: 13,
    locatorNote: "Opening section",
  },
  internalExcerpt: "Internal excerpt that must never enter the public projection.",
  publicSummary: "Human-approved public summary.",
  publicPresentationMode: "summary",
  allowedInterpretations: ["A bounded interpretation"],
  prohibitedInferences: ["An unsupported inference"],
  copyrightStatus: "internal_reference_only",
  verifiedBy: "reviewer-1",
  verifiedAt: "2026-08-06T12:00:00.000Z",
  verificationStatus: "approved",
  editionId: "edition-1",
} as const;

const evidenceCard = {
  id: "evidence-card-1",
  round: "round1",
  title: "Past-self evidence",
  factIds: ["fact-1"],
  interpretationIds: ["interpretation-1"],
  publicText: "A public evidence-card summary.",
  question: "What right remains with the past self?",
  allowedFollowUps: ["Ask for a qualification"],
  prohibitedClaims: ["Do not claim one correct answer"],
  attribution: "Human-verified source and curatorial framing",
} as const;

describe("content authoring and public schemas", () => {
  it("projects only an approved fact into the frozen Domain VerifiedFact", () => {
    const before = structuredClone(approvedFact);
    const projected = projectVerifiedFactAuthoringRecord(approvedFact);

    expect(projected).toEqual({
      id: "fact-1",
      text: approvedFact.publicSummary,
      contentType: "VERIFIED_FACT",
      sourceReference:
        'source-location:v1:["edition-1","progress-report","Report One",12,13,"Opening section"]',
      verifiedByHuman: true,
    });
    expect(domainVerifiedFactProjectionSchema.parse(projected)).toEqual(projected);
    expect(verifiedFactSchema.parse(projected)).toEqual(projected);
    expect(projected).not.toHaveProperty("internalExcerpt");
    expect(projected).not.toHaveProperty("verifiedFact");
    expect(approvedFact).toEqual(before);
  });

  it("rejects pending or incorrectly bound facts before public projection", () => {
    const pending = {
      ...approvedFact,
      verificationStatus: "pending",
      verifiedBy: null,
      verifiedAt: null,
    } as const;
    const mismatchedEdition = {
      ...approvedFact,
      sourceLocation: {
        ...approvedFact.sourceLocation,
        editionId: "edition-2",
      },
    };

    expect(verifiedFactAuthoringRecordSchema.safeParse(pending).success).toBe(true);
    expect(approvedVerifiedFactAuthoringRecordSchema.safeParse(pending).success).toBe(
      false,
    );
    expect(() => projectVerifiedFactAuthoringRecord(pending)).toThrow();
    expect(
      verifiedFactAuthoringRecordSchema.safeParse(mismatchedEdition).success,
    ).toBe(false);
    expect(verifiedFactSchema.safeParse(approvedFact).success).toBe(false);
  });

  it("rejects missing source metadata and invalid human approval metadata", () => {
    const missingSource: Record<string, unknown> = { ...approvedFact };
    Reflect.deleteProperty(missingSource, "sourceLocation");
    const missingEdition: Record<string, unknown> = { ...approvedFact };
    Reflect.deleteProperty(missingEdition, "editionId");

    expect(
      approvedVerifiedFactAuthoringRecordSchema.safeParse(missingSource).success,
    ).toBe(false);
    expect(
      approvedVerifiedFactAuthoringRecordSchema.safeParse(missingEdition).success,
    ).toBe(false);
    expect(
      approvedVerifiedFactAuthoringRecordSchema.safeParse({
        ...approvedFact,
        verifiedBy: "   ",
      }).success,
    ).toBe(false);
    expect(
      approvedVerifiedFactAuthoringRecordSchema.safeParse({
        ...approvedFact,
        verifiedAt: "not-an-iso-timestamp",
      }).success,
    ).toBe(false);
  });

  it("normalizes authoring identifiers before reference lookup and projection", () => {
    const decomposed = {
      ...approvedFact,
      id: "cafe\u0301-fact",
      publicSummary: "Cafe\u0301 summary",
    };
    const parsed = approvedVerifiedFactAuthoringRecordSchema.parse(decomposed);

    expect(parsed.id).toBe("café-fact");
    expect(parsed.publicSummary).toBe("Café summary");
    expect(projectVerifiedFactAuthoringRecord(decomposed).id).toBe("café-fact");
  });

  it("cannot parse an original interaction as an authoring VerifiedFact", () => {
    const originalInteraction = originalInteractionSchema.parse({
      id: "original-interaction-1",
      contentType: "ORIGINAL_INTERACTION",
      text: "Synthetic interaction fixture",
      purpose: "ui_copy",
    });

    expect(
      verifiedFactAuthoringRecordSchema.safeParse(originalInteraction).success,
    ).toBe(false);
    expect(verifiedFactSchema.safeParse(originalInteraction).success).toBe(false);
  });

  it("formats source references deterministically with NFC-normalized fields", () => {
    const decomposed = {
      ...approvedFact.sourceLocation,
      sectionLabel: "Cafe\u0301",
    };
    const composed = {
      ...approvedFact.sourceLocation,
      sectionLabel: "Café",
    };

    expect(formatContentSourceReference(decomposed)).toBe(
      formatContentSourceReference(composed),
    );
    expect(
      formatContentSourceReference({
        locatorNote: approvedFact.sourceLocation.locatorNote,
        pageEnd: approvedFact.sourceLocation.pageEnd,
        sectionLabel: approvedFact.sourceLocation.sectionLabel,
        pageStart: approvedFact.sourceLocation.pageStart,
        sectionType: approvedFact.sourceLocation.sectionType,
        editionId: approvedFact.sourceLocation.editionId,
      }),
    ).toBe(
      'source-location:v1:["edition-1","progress-report","Report One",12,13,"Opening section"]',
    );
  });

  it("requires an authoring title and maps fields into Domain EvidenceCard", () => {
    const before = structuredClone(evidenceCard);
    const projected = projectEvidenceCardAuthoringRecord(evidenceCard);
    const withoutTitle: Record<string, unknown> = { ...evidenceCard };
    Reflect.deleteProperty(withoutTitle, "title");

    expect(evidenceCardAuthoringRecordSchema.safeParse(withoutTitle).success).toBe(
      false,
    );
    expect(projected).toEqual({
      id: evidenceCard.id,
      roundId: evidenceCard.round,
      title: evidenceCard.title,
      publicSummary: evidenceCard.publicText,
      verifiedFactIds: evidenceCard.factIds,
      interpretationIds: evidenceCard.interpretationIds,
    });
    expect(domainEvidenceCardProjectionSchema.parse(projected)).toEqual(projected);
    expect(evidenceCardSchema.parse(projected)).toEqual(projected);
    expect(projected).not.toHaveProperty("question");
    expect(projected).not.toHaveProperty("prohibitedClaims");
    expect(evidenceCard).toEqual(before);
  });
});

describe("placeholder isolation", () => {
  it("keeps placeholder evidence structurally outside Domain EvidenceCard", () => {
    const placeholder = placeholderEvidenceCardSchema.parse({
      recordKind: "placeholder_evidence_card",
      id: "past-self-placeholder",
      round: "round1",
      title: "Placeholder evidence",
      publicText: "PLACEHOLDER: human-verified content has not been supplied.",
      question: "Placeholder question",
      allowedFollowUps: [],
      prohibitedClaims: ["Do not present this as a verified fact"],
      attribution: "placeholder",
      provenance: "placeholder",
    });

    expect(evidenceCardSchema.safeParse(placeholder).success).toBe(false);
    expect(domainEvidenceCardProjectionSchema.safeParse(placeholder).success).toBe(
      false,
    );
    expect(evidenceCardAuthoringRecordSchema.safeParse(placeholder).success).toBe(
      false,
    );
  });

  it("binds the frozen placeholder IDs to their rounds and portrait stages", () => {
    expect(
      placeholderEvidenceCardSchema.safeParse({
        recordKind: "placeholder_evidence_card",
        id: "past-self-placeholder",
        round: "round2",
        title: "Placeholder evidence",
        publicText: "PLACEHOLDER",
        question: "Placeholder question",
        allowedFollowUps: [],
        prohibitedClaims: [],
        attribution: "placeholder",
        provenance: "placeholder",
      }).success,
    ).toBe(false);
    expect(
      placeholderPortraitSceneConfigSchema.safeParse({
        recordKind: "placeholder_portrait_scene",
        id: "future-facing-charlie-placeholder",
        stage: "futureFacing",
        assetPath: "/placeholders/future-facing.svg",
        altText: "Placeholder scene for future-facing Charlie",
        provenance: "placeholder",
      }).success,
    ).toBe(true);
    expect(
      placeholderPortraitSceneConfigSchema.safeParse({
        recordKind: "placeholder_portrait_scene",
        id: "future-facing-charlie-placeholder",
        stage: "peak",
        assetPath: "/placeholders/future-facing.svg",
        altText: "Placeholder scene for future-facing Charlie",
        provenance: "placeholder",
      }).success,
    ).toBe(false);
  });
});

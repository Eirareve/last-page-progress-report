import { describe, expect, it } from "vitest";

import bookVersionJson from "../../content/verified/book-version.json";
import contentInputManifestJson from "../../content/verified/CONTENT_INPUT_MANIFEST.json";
import curatorialInterpretationsJson from "../../content/verified/curatorial-interpretations.json";
import evidenceCardsJson from "../../content/verified/evidence-cards.json";
import originalInteractionJson from "../../content/verified/original-interaction.json";
import verifiedFactsJson from "../../content/verified/verified-facts.json";
import {
  bookEditionAuthoringRecordSchema,
  curatorialInterpretationAuthoringRecordSchema,
} from "../../src/content/bundle.schemas";
import {
  projectPublicBookEditionRecord,
  projectPublicCuratorialInterpretationContentRecord,
  projectPublicEvidenceCardContentRecord,
  projectPublicVerifiedFactContentRecord,
} from "../../src/content/bundle-projection";
import {
  evidenceCardAuthoringRecordSchema,
  originalInteractionContentRecordSchema,
  approvedVerifiedFactAuthoringRecordSchema,
} from "../../src/content/content.schemas";
import { computeCanonicalJsonChecksum } from "../../src/content/checksum";

const APPROVAL_TIMESTAMP = "2026-08-09T18:13:12.028Z";
const EDITION_ID = "flowers-algernon-zh-cn-gxnu-2015-9787549565115";

function parseApprovedContent() {
  return {
    edition: bookEditionAuthoringRecordSchema.parse(bookVersionJson),
    facts: verifiedFactsJson.records.map((record) =>
      approvedVerifiedFactAuthoringRecordSchema.parse(record),
    ),
    interpretations: curatorialInterpretationsJson.records.map((record) =>
      curatorialInterpretationAuthoringRecordSchema.parse(record),
    ),
    cards: evidenceCardsJson.records.map((record) =>
      evidenceCardAuthoringRecordSchema.parse(record),
    ),
    originalInteraction: originalInteractionContentRecordSchema.parse(
      originalInteractionJson,
    ),
  };
}

describe("Stage 7 approved content records", () => {
  it("maps every approved record to the frozen authoring Schemas", () => {
    const content = parseApprovedContent();

    expect(content.edition.editionId).toBe(EDITION_ID);
    expect(content.edition.verifiedBy).toBe("project-owner");
    expect(content.edition.verifiedAt).toBe(APPROVAL_TIMESTAMP);
    expect(content.facts).toHaveLength(6);
    expect(content.interpretations).toHaveLength(3);
    expect(content.cards).toHaveLength(3);
    expect(content.cards.map(({ title }) => title)).toEqual([
      "过去的我，谁有解释权？",
      "知道未来，能替未来决定吗？",
      "未来的关系，能提前决定吗？",
    ]);
  });

  it("resolves fact, interpretation, edition, and round references", () => {
    const content = parseApprovedContent();
    const factIds = new Set(content.facts.map(({ id }) => id));
    const interpretationIds = new Set(
      content.interpretations.map(({ id }) => id),
    );

    expect(factIds.size).toBe(6);
    expect(interpretationIds.size).toBe(3);
    expect(new Set(content.cards.map(({ id }) => id)).size).toBe(3);
    expect(new Set(content.cards.map(({ round }) => round))).toEqual(
      new Set(["round1", "round2", "round3"]),
    );
    for (const fact of content.facts) {
      expect(fact.editionId).toBe(EDITION_ID);
      expect(fact.sourceLocation.editionId).toBe(EDITION_ID);
      expect(fact.verificationStatus).toBe("approved");
    }
    for (const interpretation of content.interpretations) {
      expect(
        interpretation.basedOnVerifiedFactIds.every((id) => factIds.has(id)),
      ).toBe(true);
    }
    for (const card of content.cards) {
      expect(card.factIds.every((id) => factIds.has(id))).toBe(true);
      expect(
        card.interpretationIds.every((id) => interpretationIds.has(id)),
      ).toBe(true);
    }
  });

  it("projects only public-safe content before portrait approval", () => {
    const content = parseApprovedContent();
    const publicProjection = {
      edition: projectPublicBookEditionRecord(content.edition),
      verifiedFacts: content.facts.map(
        projectPublicVerifiedFactContentRecord,
      ),
      curatorialInterpretations: content.interpretations.map(
        projectPublicCuratorialInterpretationContentRecord,
      ),
      evidenceCards: content.cards.map(
        projectPublicEvidenceCardContentRecord,
      ),
      originalInteraction: content.originalInteraction,
    };
    const serialized = JSON.stringify(publicProjection);

    expect(serialized).not.toContain("internalExcerpt");
    expect(serialized).not.toContain("verifiedBy");
    expect(serialized).not.toContain("verifiedAt");
    expect(serialized).not.toContain("approvedBy");
    expect(serialized).not.toContain("approvedAt");
    for (const fact of content.facts) {
      expect(serialized).not.toContain(fact.internalExcerpt);
    }
  });

  it("binds every approved audit entry to the canonical checksum of its target", async () => {
    const content = parseApprovedContent();
    const targetRecords = [
      content.edition,
      ...content.facts,
      ...content.interpretations,
      ...content.cards,
      content.originalInteraction,
    ];
    const manifest = contentInputManifestJson;

    expect(manifest.manifestStatus).toBe("approved");
    expect(manifest.approvedBy).toBe("project-owner");
    expect(manifest.approvedAt).toBe(APPROVAL_TIMESTAMP);
    expect(manifest.entries).toHaveLength(14);
    expect(new Set(manifest.entries.map(({ inputId }) => inputId)).size).toBe(14);
    await Promise.all(
      manifest.entries.map(async (entry, index) => {
        expect(entry.approvalStatus).toBe("approved");
        expect(entry.inputChecksum).toBe(
          await computeCanonicalJsonChecksum(targetRecords[index]),
        );
      }),
    );
  });

  it("keeps the approved original interaction attributed to the scope freeze", () => {
    const { originalInteraction } = parseApprovedContent();

    expect(originalInteraction.contentType).toBe("ORIGINAL_INTERACTION");
    expect(originalInteraction.provenance).toBe("scope_freeze");
    expect(originalInteraction.text).toBe(
      "当未来的我无法理解现在写下的话时，请以现在的意愿为准。",
    );
  });
});

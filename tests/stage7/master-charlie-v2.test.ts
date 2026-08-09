import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import visualBible from "../../stage7-work/visual/charlie-original-v2-visual-bible.json";
import manifest from "../../stage7-review/assets/MASTER_CHARACTER_INPUT_MANIFEST.v2.draft.json";

const PRIVATE_OR_UNTRUSTED_TEXT = [
  "internalExcerpt",
  "untrustedUserText",
  "很多人都笑我。但他们是我的朋友我们都很快乐。",
  "这就是乔和其他人正在做的事，他们在嘲笑我。",
  "我有权知道和实验有关的一切事物，这也包括我的未来在内。",
  "所有迹象显示，我自己的心智衰减也会相当快速。",
  "艾丽斯又一次来到门口但我说走开我不要见你。",
  "我们要你记住你在这里有朋友决对不要忘记。",
] as const;

describe("Stage 7 Master Charlie v2 review package", () => {
  it("preserves the four-candidate casting audit after Master B selection", () => {
    expect(visualBible.status).toBe("MASTER_CHARACTER_SELECTED_FOR_REFERENCE");
    expect(visualBible.characterDesignVersion).toBe("charlie-original-v2");
    expect(visualBible.candidates).toHaveLength(4);
    expect(new Set(visualBible.candidates.map(({ candidateId }) => candidateId)).size).toBe(4);
    expect(manifest.scope.stagePortraitsIncluded).toBe(false);
    expect(manifest.scope.productionEffectBeforeApproval).toBe("none");
    expect(manifest.scope.evidenceRole).toBe("not_evidence");
  });

  it("records B as the identity reference while keeping every image non-public", () => {
    expect(manifest.manifestStatus).toBe(
      "MASTER_CHARACTER_SELECTED_FOR_REFERENCE",
    );
    expect(manifest.approval.selectedCandidateId).toBe("MASTER-CHARLIE-B");
    expect(manifest.approval.approvedBy).toBe("project-owner");
    expect(manifest.approval.approvedAt).toBe("2026-08-09T19:18:59.646Z");
    expect(manifest.approval.approvedForPublicUse).toBe(false);
    expect(manifest.entries).toHaveLength(4);
    for (const entry of manifest.entries) {
      expect(entry.approvedForPublicUse).toBe(false);
      expect(entry.stageRole).toBe("none");
      expect(entry.fallbackAssetId).toBeNull();
      expect(entry.productionAssetId).toBeNull();
      expect(entry.evidenceRole).toBe("not_evidence");
    }
    const selected = manifest.entries.find(
      ({ candidateId }) => candidateId === "MASTER-CHARLIE-B",
    );
    expect(selected?.candidateStatus).toBe("MASTER_CHARACTER_REFERENCE_SELECTED");
    expect(selected?.approvalStatus).toBe("selected_as_identity_reference");
    for (const entry of manifest.entries.filter(
      ({ candidateId }) => candidateId !== "MASTER-CHARLIE-B",
    )) {
      expect(entry.candidateStatus).toBe("MASTER_CHARACTER_CANDIDATE_NOT_SELECTED");
      expect(entry.approvalStatus).toBe("not_selected");
    }
    for (const excluded of manifest.excludedVariants) {
      expect(excluded.status).toBe("excluded_by_internal_visual_qa");
      expect(excluded.approvedForPublicUse).toBe(false);
    }
  });

  it("binds all image records and the visual bible to exact file checksums", () => {
    const biblePath = resolve(process.cwd(), manifest.visualBible.path);
    const bibleBytes = readFileSync(biblePath);
    expect(`sha256:${createHash("sha256").update(bibleBytes).digest("hex")}`).toBe(
      manifest.visualBible.checksum,
    );

    for (const entry of manifest.entries) {
      const filePath = resolve(process.cwd(), entry.sourceRef);
      expect(existsSync(filePath)).toBe(true);
      const bytes = readFileSync(filePath);
      expect(bytes.byteLength).toBe(entry.byteLength);
      expect(`sha256:${createHash("sha256").update(bytes).digest("hex")}`).toBe(
        entry.inputChecksum,
      );
      expect(bytes.readUInt32BE(16)).toBe(entry.width);
      expect(bytes.readUInt32BE(20)).toBe(entry.height);
      expect(entry.width).toBe(1728);
      expect(entry.height).toBe(2304);
    }

    for (const excluded of manifest.excludedVariants) {
      const bytes = readFileSync(resolve(process.cwd(), excluded.path));
      expect(`sha256:${createHash("sha256").update(bytes).digest("hex")}`).toBe(
        excluded.checksum,
      );
    }
  });

  it("excludes private excerpts and likeness/copyright shortcuts from authoring input", () => {
    const serialized = JSON.stringify(visualBible);
    for (const prohibited of PRIVATE_OR_UNTRUSTED_TEXT) {
      expect(serialized).not.toContain(prohibited);
    }
    expect(serialized).toContain("actor or public-figure likeness");
    expect(serialized).toContain("book cover");
    expect(visualBible.scope).toContain("not evidence");
  });

  it("uses only the server-side Agnes credential in the project-owned generator", () => {
    const script = readFileSync(
      resolve(process.cwd(), "scripts/stage7-generate-master-charlie-v2.mjs"),
      "utf8",
    );
    expect(script).toContain('requireEnvironment("AGNES_API_KEY")');
    expect(script).not.toContain("NEXT_PUBLIC_AGNES");
    expect(JSON.stringify(manifest)).not.toContain("AGNES_API_KEY");
  });
});

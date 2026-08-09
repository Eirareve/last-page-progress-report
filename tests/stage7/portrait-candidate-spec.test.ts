import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import candidateSpec from "../../stage7-work/visual/portrait-candidate-spec.json";
import assetManifest from "../../stage7-review/assets/ASSET_INPUT_MANIFEST.draft.json";

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

describe("Stage 7 fixed portrait candidate specification", () => {
  it("defines three review-only candidates with one shared character design", () => {
    expect(candidateSpec.status).toBe("REJECTED_BY_HUMAN_VISUAL_REVIEW");
    expect(candidateSpec.characterDesignVersion).toBe("charlie-original-v1");
    expect(candidateSpec.candidates.map(({ charlieStage }) => charlieStage)).toEqual(
      ["early", "peak", "futureFacing"],
    );
    expect(
      new Set(candidateSpec.candidates.map(({ assetId }) => assetId)).size,
    ).toBe(3);
    expect(candidateSpec.outputIntent).toContain("not production assets");
    expect(candidateSpec.outputIntent).toContain("not evidence");
  });

  it("excludes private excerpts, untrusted user prose, and copyrighted likenesses", () => {
    const serialized = JSON.stringify(candidateSpec);

    for (const prohibited of PRIVATE_OR_UNTRUSTED_TEXT) {
      expect(serialized).not.toContain(prohibited);
    }
    expect(candidateSpec.sharedConstraints).toContain("No actor likeness");
    expect(candidateSpec.sharedConstraints).toContain("no copied book-cover");
    expect(candidateSpec.sharedConstraints).toContain("not factual evidence");
  });

  it("keeps Agnes credentials server-side and outside the candidate manifest input", () => {
    const script = readFileSync(
      resolve(process.cwd(), "scripts/stage7-generate-portrait-candidates.mjs"),
      "utf8",
    );
    const envExample = readFileSync(resolve(process.cwd(), ".env.example"), "utf8");

    expect(script).toContain('requireEnvironment("AGNES_API_KEY")');
    expect(script).not.toContain("NEXT_PUBLIC_AGNES");
    expect(JSON.stringify(candidateSpec)).not.toContain("AGNES_API_KEY");
    expect(envExample).toContain("AGNES_API_KEY=");
    expect(envExample).not.toContain("NEXT_PUBLIC_AGNES");
  });

  it("preserves three rejected candidates and their original checksums", () => {
    expect(assetManifest.manifestStatus).toBe(
      "REJECTED_BY_HUMAN_VISUAL_REVIEW",
    );
    expect(assetManifest.approval.approvalStatus).toBe("rejected");
    expect(assetManifest.approval.approvedBy).toBe("project-owner");
    expect(assetManifest.approval.approvedAt).toBe(
      "2026-08-09T18:43:06.768Z",
    );
    expect(assetManifest.approval.approvedForPublicUse).toBe(false);
    expect(assetManifest.entries.map(({ charlieStage }) => charlieStage)).toEqual(
      ["early", "peak", "futureFacing"],
    );
    for (const entry of assetManifest.entries) {
      expect(entry.candidateStatus).toBe("REJECTED_ASSET_CANDIDATE");
      expect(entry.approvalStatus).toBe("rejected");
      expect(entry.approvedForPublicUse).toBe(false);
      expect(entry.licenseOrPermission).toContain("pending_project_owner");
      expect(entry.fallbackAssetId).toBeNull();
      expect(entry.proposedFallbackAssetIdAfterApproval).toBe(entry.assetId);
      expect(entry.evidenceRole).toBe("not_evidence");

      const filePath = resolve(process.cwd(), entry.sourceRef);
      expect(existsSync(filePath)).toBe(true);
      const bytes = readFileSync(filePath);
      expect(bytes.byteLength).toBe(entry.byteLength);
      expect(`sha256:${createHash("sha256").update(bytes).digest("hex")}`).toBe(
        entry.inputChecksum,
      );
    }
    for (const excluded of assetManifest.excludedVariants) {
      expect(excluded.approvedForPublicUse).toBe(false);
    }
  });
});

import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import spec from "../../stage7-work/visual/fixed-portrait-candidate-spec-v2.json";
import manifest from "../../stage7-review/assets/ASSET_INPUT_MANIFEST.v2.draft.json";

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

describe("Stage 7 fixed portrait candidates v2", () => {
  it("uses only the human-selected Master B reference", () => {
    expect(spec.masterReference.candidateId).toBe("MASTER-CHARLIE-B");
    expect(spec.masterReference.assetId).toBe("charlie-master-b-candidate-v2");
    expect(spec.masterReference.selectedBy).toBe("project-owner");
    expect(spec.masterReference.approvedForPublicUse).toBe(false);
    expect(manifest.masterReference.candidateId).toBe("MASTER-CHARLIE-B");

    const referenceBytes = readFileSync(
      resolve(process.cwd(), spec.masterReference.path),
    );
    expect(`sha256:${createHash("sha256").update(referenceBytes).digest("hex")}`).toBe(
      spec.masterReference.checksum,
    );
    expect(manifest.masterReference.inputChecksum).toBe(
      spec.masterReference.checksum,
    );
  });

  it("freezes the exact three fixed stages after project-owner approval", () => {
    expect(spec.status).toBe("ASSET_CANDIDATES_PENDING_HUMAN_APPROVAL");
    expect(spec.candidates.map(({ charlieStage }) => charlieStage)).toEqual([
      "early",
      "peak",
      "futureFacing",
    ]);
    expect(manifest.entries.map(({ charlieStage }) => charlieStage)).toEqual([
      "early",
      "peak",
      "futureFacing",
    ]);
    expect(manifest.approval).toMatchObject({
      approvalStatus: "approved",
      approvedBy: "project-owner",
      approvedAt: "2026-08-09T19:42:24.0561146Z",
      approvedForPublicUse: true,
    });
    expect(manifest.fallbackPlan.status).toBe("approved");
    expect(manifest.fallbackPlan.productionEffectBeforeApproval).toBe("none");
  });

  it("binds submitted and excluded variants to exact image bytes", () => {
    const specBytes = readFileSync(resolve(process.cwd(), manifest.promptSpec.path));
    expect(`sha256:${createHash("sha256").update(specBytes).digest("hex")}`).toBe(
      manifest.promptSpec.checksum,
    );
    for (const entry of manifest.entries) {
      expect(entry.candidateStatus).toBe("APPROVED_ASSET");
      expect(entry.approvalStatus).toBe("approved");
      expect(entry.approvedForPublicUse).toBe(true);
      expect(entry.fallbackAssetId).toBe(entry.assetId);
      expect(entry.evidenceRole).toBe("not_evidence");
      expect(entry.masterReferenceAssetId).toBe("charlie-master-b-candidate-v2");

      const filePath = resolve(process.cwd(), entry.sourceRef);
      expect(existsSync(filePath)).toBe(true);
      const bytes = readFileSync(filePath);
      expect(bytes.byteLength).toBe(entry.byteLength);
      expect(bytes.readUInt32BE(16)).toBe(entry.width);
      expect(bytes.readUInt32BE(20)).toBe(entry.height);
      expect(`sha256:${createHash("sha256").update(bytes).digest("hex")}`).toBe(
        entry.inputChecksum,
      );
    }
    for (const excluded of manifest.excludedVariants) {
      expect(excluded.approvedForPublicUse).toBe(false);
      const bytes = readFileSync(resolve(process.cwd(), excluded.path));
      expect(`sha256:${createHash("sha256").update(bytes).digest("hex")}`).toBe(
        excluded.checksum,
      );
    }
  });

  it("copies only the approved bytes to stable public fallback paths", () => {
    const publicPaths = {
      early: "public/portraits/charlie-original-v2/early.png",
      peak: "public/portraits/charlie-original-v2/peak.png",
      futureFacing: "public/portraits/charlie-original-v2/future-facing.png",
    } as const;

    for (const entry of manifest.entries) {
      const bytes = readFileSync(
        resolve(
          process.cwd(),
          publicPaths[entry.charlieStage as keyof typeof publicPaths],
        ),
      );
      expect(`sha256:${createHash("sha256").update(bytes).digest("hex")}`).toBe(
        entry.inputChecksum,
      );
    }
  });

  it("excludes private excerpts and untrusted prose from the visual input", () => {
    const serialized = JSON.stringify(spec);
    for (const prohibited of PRIVATE_OR_UNTRUSTED_TEXT) {
      expect(serialized).not.toContain(prohibited);
    }
    expect(serialized).toContain("not factual evidence");
    expect(serialized).toContain("No actor or public-figure likeness");
  });

  it("sends the reference through the server-only Agnes generator", () => {
    const script = readFileSync(
      resolve(process.cwd(), "scripts/stage7-generate-fixed-portraits-v2.mjs"),
      "utf8",
    );
    expect(script).toContain('requireEnvironment("AGNES_API_KEY")');
    expect(script).toContain("image: [reference]");
    expect(script).toContain("Master Charlie reference checksum mismatch");
    expect(script).not.toContain("NEXT_PUBLIC_AGNES");
  });
});

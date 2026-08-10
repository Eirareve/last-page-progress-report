import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

import manifest from "../../stage8-input/RC_TEST_MANIFEST.json";
import handoff from "../../stage8-input/STAGE8_HANDOFF.json";
import assetManifest from "../../content/verified/ASSET_INPUT_MANIFEST.json";
import contentManifest from "../../content/verified/CONTENT_INPUT_MANIFEST.json";
import {
  AGENT_CONTRACT_VERSION,
  AGENT_RESULT_SCHEMA_VERSIONS,
  MOCK_AGENT_ADAPTER_VERSION,
  PLAIN_SEMANTIC_BUNDLE_SCHEMA_VERSION,
  ROUND_ANALYSIS_BUNDLE_SCHEMA_VERSION,
} from "@/agent";
import { buildStage4ContractVersionVector } from "@/application/stage4-contract-versions";
import { createBundledContentLoader } from "@/content";
import { CONTENT_SCHEMA_VERSION } from "@/content/bundle.schemas";
import { runConfiguredContentGate } from "@/content/production-gate";
import { FINAL_REVIEW_SCHEMA_VERSION, MOCK_FINAL_REVIEW_ADAPTER_VERSION } from "@/final-review";
import {
  DEEPSEEK_OPENAI_ADAPTER_VERSION,
  DEEPSEEK_PROVIDER_PROJECTION_SCHEMA_VERSION,
  STAGE6_PROMPT_VERSION,
  STAGE6_STATIC_TEMPLATE_ADAPTER_VERSION,
  STAGE6_TRANSPORT_VERSION,
} from "@/stage6";

const RC_ID = manifest.rcId;

describe("Stage 8 frozen RC manifest", () => {
  it("binds the executing rcId and every frozen version owner", () => {
    expect(manifest.rcId).toBe(RC_ID);
    if (process.env.RC_ID !== undefined) {
      expect(process.env.RC_ID).toBe(manifest.rcId);
    }
    expect(manifest.contractVersionVector).toEqual(
      buildStage4ContractVersionVector(),
    );
    expect(manifest.contractVersionVector.contentSchemaVersion).toBe(
      CONTENT_SCHEMA_VERSION,
    );
    expect(manifest.contractVersionVector.agentContractVersion).toBe(
      AGENT_CONTRACT_VERSION,
    );
    expect(manifest.contractVersionVector.finalReviewSchemaVersion).toBe(
      FINAL_REVIEW_SCHEMA_VERSION,
    );
    expect(manifest.resultSchemaVersionVector).toMatchObject({
      ...AGENT_RESULT_SCHEMA_VERSIONS,
      roundAnalysisBundle: ROUND_ANALYSIS_BUNDLE_SCHEMA_VERSION,
      plainSemanticBundle: PLAIN_SEMANTIC_BUNDLE_SCHEMA_VERSION,
      charlieSignatureReview: FINAL_REVIEW_SCHEMA_VERSION,
    });
    expect(new Set(Object.values(manifest.promptVersionVector))).toEqual(
      new Set([STAGE6_PROMPT_VERSION]),
    );
    expect(manifest.adapterVersionVector).toMatchObject({
      deepseekOpenAiCompatible: DEEPSEEK_OPENAI_ADAPTER_VERSION,
      deepseekProviderProjectionSchema:
        DEEPSEEK_PROVIDER_PROJECTION_SCHEMA_VERSION,
      mockAgent: MOCK_AGENT_ADAPTER_VERSION,
      mockFinalReview: MOCK_FINAL_REVIEW_ADAPTER_VERSION,
      staticTemplate: STAGE6_STATIC_TEMPLATE_ADAPTER_VERSION,
      stage6Transport: STAGE6_TRANSPORT_VERSION,
    });
  });

  it("binds exact guide, handoff, content manifest, and asset manifest bytes", async () => {
    expect(await sha256("../../docs/最后一页进步报告_Codex协作开发指南_v1.2.7-draft_阶段8review修补版.md")).toBe(
      manifest.stage8Guide.sha256,
    );
    expect(await sha256("../../stage8-input/STAGE8_HANDOFF.json")).toBe(
      manifest.stage7Handoff.sha256,
    );
    expect(await sha256("../../content/verified/CONTENT_INPUT_MANIFEST.json")).toBe(
      manifest.content.contentInputManifestSha256,
    );
    expect(await sha256("../../content/verified/ASSET_INPUT_MANIFEST.json")).toBe(
      manifest.assets.assetManifestSha256,
    );
    expect(manifest.stage7Handoff.handoffVersion).toBe(handoff.handoffVersion);
    expect(manifest.content.contentInputManifestVersion).toBe(
      contentManifest.contentInputManifestVersion,
    );
    expect(manifest.assets.assetManifestVersion).toBe(
      assetManifest.assetManifestVersion,
    );
  });

  it("binds the passed production gate and public-safe verified bundle", async () => {
    const loaded = await createBundledContentLoader().load("verified");
    const gate = await runConfiguredContentGate(
      "build_time",
      { APP_ENV: "production", CONTENT_MODE: "verified", AGENT_MODE: "mock" },
      manifest.testStartedAt,
    );

    expect(gate.status).toBe("passed");
    expect(loaded.bundle).toMatchObject({
      contentBundleId: manifest.content.contentBundleId,
      contentBundleVersion: manifest.content.contentBundleVersion,
      contentBundleChecksum: manifest.content.contentBundleChecksum,
      contentMode: "verified",
      containsPlaceholderContent: false,
    });
    if (loaded.bundle.contentMode !== "verified") {
      throw new Error("RC verified bundle resolved as placeholder content");
    }
    expect(loaded.bundle.edition.editionId).toBe(manifest.content.editionId);
    expect(loaded.bundle.evidenceCards.map(({ id }) => id)).toEqual(
      manifest.content.evidenceCardIds,
    );
    const publicPayload = JSON.stringify(loaded.bundle);
    expect(publicPayload).not.toContain("internalExcerpt");
    expect(publicPayload).not.toContain("PLACEHOLDER:");
  });

  it("binds approved public portrait bytes and the mock/live target matrix", async () => {
    expect(assetManifest.entries.map(({ assetId }) => assetId)).toEqual(
      manifest.assets.portraitAssetIds,
    );
    expect(assetManifest.entries.map(({ fallbackAssetId }) => fallbackAssetId)).toEqual(
      manifest.assets.fallbackAssetIds,
    );
    for (const entry of assetManifest.entries) {
      expect(entry.approvedForPublicUse).toBe(true);
      expect(await sha256(`../../${entry.productionPath}`)).toBe(entry.inputChecksum);
    }
    expect(manifest.targetRuntimeMatrix.profiles).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          contentMode: "verified",
          requestedAgentMode: "mock",
          networkExpectation: "no_provider_network",
        }),
        expect.objectContaining({
          contentMode: "verified",
          requestedAgentMode: "live",
          networkExpectation: "real_provider_smoke_only",
        }),
      ]),
    );
    expect(manifest.secretMaterialIncluded).toBe(false);
    expect(JSON.stringify(manifest)).not.toMatch(/DEEPSEEK_API_KEY|AGNES_API_KEY/u);
  });
});

async function sha256(relativePath: string): Promise<string> {
  const bytes = await readFile(new URL(relativePath, import.meta.url));
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

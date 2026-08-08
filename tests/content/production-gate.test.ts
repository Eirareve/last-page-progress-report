import { describe, expect, it, vi } from "vitest";

import { createBundledContentLoader } from "../../src/content/bundled-content-source";
import {
  assertBuildTimeContentGate,
  assertFirstRequestContentGate,
  ContentGateRejectedError,
  getFirstRequestGatedContent,
  loadConfiguredGatedContent,
  runConfiguredContentGate,
} from "../../src/content/production-gate";

const EVALUATED_AT = "2026-08-06T20:00:00.000Z";

describe("bundled content source", () => {
  it("loads the checksummed placeholder bundle for development Mock mode", async () => {
    const loaded = await createBundledContentLoader().load("placeholder");

    expect(loaded.bundle.contentMode).toBe("placeholder");
    expect(loaded.bundle.contentBundleChecksum).toBe(
      "sha256:bb487c96ea44606bdec3ce99f8ff9fee1196aa0d052691d03f4a585be5572ffd",
    );
    expect(loaded.bundle.evidenceCards).toHaveLength(3);
    expect(loaded.bundle.portraits).toHaveLength(3);
  });

  it("keeps the verified authoring template non-runnable", async () => {
    await expect(createBundledContentLoader().load("verified")).rejects.toMatchObject(
      { code: "verified_content_unavailable" },
    );
  });
});

describe("production gate entrypoints", () => {
  it("runs the public build/request wrappers and memoizes first-request validation", async () => {
    vi.stubEnv("APP_ENV", "test");
    vi.stubEnv("CONTENT_MODE", "placeholder");
    vi.stubEnv("AGENT_MODE", "mock");
    const buildEvaluation = await assertBuildTimeContentGate({
      APP_ENV: "test",
      CONTENT_MODE: "placeholder",
      AGENT_MODE: "mock",
    });
    const firstRequest = assertFirstRequestContentGate();
    const repeatedRequest = assertFirstRequestContentGate();
    const gatedContent = getFirstRequestGatedContent();
    const repeatedGatedContent = getFirstRequestGatedContent();

    expect(buildEvaluation.status).toBe("passed");
    expect(buildEvaluation.evaluationId).toContain("build_time");
    expect(firstRequest).toBe(repeatedRequest);
    expect(gatedContent).toBe(repeatedGatedContent);
    try {
      await expect(firstRequest).resolves.toMatchObject({
        status: "passed",
        targetEnvironment: "test",
      });
      await expect(gatedContent).resolves.toMatchObject({
        evaluation: { status: "passed", targetEnvironment: "test" },
        access: { contentMode: "placeholder" },
      });
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("returns content access atomically bound to a passed evaluation", async () => {
    const gated = await loadConfiguredGatedContent(
      "first_request",
      {
        APP_ENV: "development",
        CONTENT_MODE: "placeholder",
        AGENT_MODE: "mock",
      },
      EVALUATED_AT,
    );

    expect(gated.evaluation.status).toBe("passed");
    expect(gated.access.binding).toEqual({
      contentBundleId: gated.evaluation.contentBundleId,
      contentBundleVersion: gated.evaluation.contentBundleVersion,
      contentBundleChecksum: gated.evaluation.checksum,
      contentSchemaVersion: gated.evaluation.contentSchemaVersion,
    });
    expect(Object.isFrozen(gated)).toBe(true);
  });

  it("uses the same evaluator at build time and first request", async () => {
    const environment = {
      APP_ENV: "development",
      CONTENT_MODE: "placeholder",
      AGENT_MODE: "mock",
    };
    const [buildEvaluation, requestEvaluation] = await Promise.all([
      runConfiguredContentGate("build_time", environment, EVALUATED_AT),
      runConfiguredContentGate("first_request", environment, EVALUATED_AT),
    ]);
    expect(buildEvaluation.evaluationId).toContain("build_time");
    expect(requestEvaluation.evaluationId).toContain("first_request");
    expect({ ...buildEvaluation, evaluationId: "normalized" }).toEqual({
      ...requestEvaluation,
      evaluationId: "normalized",
    });
  });

  it("rejects production placeholder without switching content modes", async () => {
    await expect(
      runConfiguredContentGate(
        "build_time",
        {
          APP_ENV: "production",
          CONTENT_MODE: "placeholder",
          AGENT_MODE: "mock",
        },
        EVALUATED_AT,
      ),
    ).rejects.toBeInstanceOf(ContentGateRejectedError);
  });

  it("blocks production while verified content is still only a template", async () => {
    await expect(
      runConfiguredContentGate(
        "build_time",
        {
          APP_ENV: "production",
          CONTENT_MODE: "verified",
          AGENT_MODE: "live",
        },
        EVALUATED_AT,
      ),
    ).rejects.toMatchObject({ code: "verified_content_unavailable" });
  });
});

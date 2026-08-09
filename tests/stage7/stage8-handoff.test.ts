import { describe, expect, it } from "vitest";

import handoff from "../../stage8-input/STAGE8_HANDOFF.json";
import { createBundledContentLoader } from "../../src/content/bundled-content-source";
import { runConfiguredContentGate } from "../../src/content/production-gate";

describe("Stage 8 frozen handoff", () => {
  it("binds the handoff to the verified public bundle and passed production gate", async () => {
    const loaded = await createBundledContentLoader().load("verified");
    const gate = await runConfiguredContentGate(
      "build_time",
      {
        APP_ENV: "production",
        CONTENT_MODE: "verified",
        AGENT_MODE: "live",
      },
      handoff.productionGate.evaluatedAt,
    );

    expect(handoff.status).toBe("READY_FOR_STAGE_8");
    expect(loaded.bundle.contentBundleId).toBe(
      handoff.contentBundle.contentBundleId,
    );
    expect(loaded.bundle.contentBundleChecksum).toBe(
      handoff.contentBundle.contentBundleChecksum,
    );
    expect(gate).toMatchObject({
      status: "passed",
      evaluationId: handoff.productionGate.evaluationId,
      checksum: handoff.contentBundle.contentBundleChecksum,
      failureCodes: [],
    });
    const publicPayload = JSON.stringify(loaded.bundle);
    expect(publicPayload).not.toContain("internalExcerpt");
    expect(publicPayload).not.toContain(
      "很多人都笑我。但他们是我的朋友我们都很快乐。",
    );
  });
});

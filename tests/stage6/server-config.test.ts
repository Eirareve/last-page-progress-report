import { describe, expect, it } from "vitest";

import { readStage6ServerConfig } from "@/stage6/server/config";

describe("Stage 6 live gate configuration", () => {
  it("is closed by default without reading provider credentials", () => {
    expect(readStage6ServerConfig({})).toMatchObject({
      liveGate: "closed",
      providerPolicyAccepted: false,
    });
  });

  it("opens only for the complete approved environment tuple", () => {
    expect(
      readStage6ServerConfig({
        STAGE6_LIVE_API_ENABLED: "true",
        STAGE6_PROVIDER_POLICY_ACCEPTED: "true",
        CONTENT_MODE: "verified",
        AGENT_MODE: "live",
      }),
    ).toMatchObject({ liveGate: "open", providerPolicyAccepted: true });
  });

  it.each([
    {},
    { STAGE6_PROVIDER_POLICY_ACCEPTED: "true" },
    { STAGE6_PROVIDER_POLICY_ACCEPTED: "true", CONTENT_MODE: "verified" },
    {
      STAGE6_PROVIDER_POLICY_ACCEPTED: "true",
      CONTENT_MODE: "verified",
      AGENT_MODE: "mock",
    },
    {
      STAGE6_PROVIDER_POLICY_ACCEPTED: "true",
      CONTENT_MODE: "verified",
      AGENT_MODE: "live",
      NODE_TLS_REJECT_UNAUTHORIZED: "0",
    },
  ])("rejects an incomplete open-gate tuple: %o", (environment) => {
    expect(() =>
      readStage6ServerConfig({
        STAGE6_LIVE_API_ENABLED: "true",
        ...environment,
      }),
    ).toThrow();
  });
});

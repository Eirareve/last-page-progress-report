import "server-only";

import { STAGE6_DEFAULT_HTTP_LIMITS } from "../http-guards";
import { STAGE6_SERVER_GUARD_VERSION } from "../versions";

export type Stage6ServerConfig = Readonly<{
  guardVersion: typeof STAGE6_SERVER_GUARD_VERSION;
  liveGate: "closed" | "open";
  providerPolicyAccepted: boolean;
  limits: typeof STAGE6_DEFAULT_HTTP_LIMITS;
}>;

export function readStage6ServerConfig(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): Stage6ServerConfig {
  const liveRequested = environment.STAGE6_LIVE_API_ENABLED === "true";
  const providerPolicyAccepted =
    environment.STAGE6_PROVIDER_POLICY_ACCEPTED === "true";
  if (!liveRequested) {
    return Object.freeze({
      guardVersion: STAGE6_SERVER_GUARD_VERSION,
      liveGate: "closed",
      providerPolicyAccepted,
      limits: STAGE6_DEFAULT_HTTP_LIMITS,
    });
  }
  if (
    environment.CONTENT_MODE !== "verified" ||
    environment.AGENT_MODE !== "live" ||
    !providerPolicyAccepted ||
    environment.NODE_TLS_REJECT_UNAUTHORIZED === "0"
  ) {
    throw new Error(
      "Opening the Live API Gate requires verified content, live Agent mode, accepted provider policy, and TLS verification",
    );
  }
  return Object.freeze({
    guardVersion: STAGE6_SERVER_GUARD_VERSION,
    liveGate: "open",
    providerPolicyAccepted,
    limits: STAGE6_DEFAULT_HTTP_LIMITS,
  });
}

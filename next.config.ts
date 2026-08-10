import type { NextConfig } from "next";
import { PHASE_PRODUCTION_BUILD } from "next/constants";

import { assertBuildTimeContentGate } from "./src/content/server";

const nextConfig: NextConfig = {
  generateBuildId: async () =>
    process.env.RC_ID ?? "unfrozen-local-build",
  reactStrictMode: true,
};

export default async function configureNext(phase: string): Promise<NextConfig> {
  if (phase === PHASE_PRODUCTION_BUILD) {
    await assertBuildTimeContentGate();
    return {
      ...nextConfig,
      outputFileTracingExcludes: {
        "/*": ["public/placeholders/**/*"],
      },
    };
  }
  return nextConfig;
}

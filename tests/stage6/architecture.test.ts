import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

describe("Stage 6 provider boundary architecture", () => {
  it("adds no model SDK and keeps provider networking out of the neutral executor", () => {
    const packageJson = JSON.parse(
      readFileSync(resolve(root, "package.json"), "utf8"),
    ) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
    const packages = new Set([
      ...Object.keys(packageJson.dependencies ?? {}),
      ...Object.keys(packageJson.devDependencies ?? {}),
    ]);
    for (const name of [
      "openai",
      "@anthropic-ai/sdk",
      "@google/generative-ai",
      "ai",
    ]) {
      expect(packages.has(name)).toBe(false);
    }

    const providerSource = readFileSync(
      resolve(root, "src/stage6/provider-execution.ts"),
      "utf8",
    );
    expect(providerSource).not.toMatch(/\bfetch\s*\(/);
  });

  it("keeps the route server-only and the default live gate closed", () => {
    const routePath = resolve(root, "src/app/api/agent/route.ts");
    expect(existsSync(routePath)).toBe(true);
    const configSource = readFileSync(
      resolve(root, "src/stage6/server/config.ts"),
      "utf8",
    );
    expect(configSource).toContain('import "server-only"');
    expect(configSource).toContain('liveGate: "closed"');
    expect(configSource).toContain('CONTENT_MODE !== "verified"');
    expect(configSource).toContain('AGENT_MODE !== "live"');
    expect(configSource).toContain("STAGE6_PROVIDER_POLICY_ACCEPTED");
    expect(configSource).not.toMatch(/API_KEY|SECRET|TOKEN/);
  });

  it("keeps local credentials ignored and the tracked example credential-free", () => {
    const gitignore = readFileSync(resolve(root, ".gitignore"), "utf8");
    const example = readFileSync(resolve(root, ".env.example"), "utf8");

    expect(gitignore).toContain(".env.*");
    expect(gitignore).toContain("!.env.example");
    expect(example).toMatch(/^DEEPSEEK_API_KEY=$/mu);
    expect(example).not.toMatch(/^DEEPSEEK_API_KEY=.+$/mu);
  });
});

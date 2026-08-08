import { existsSync, readFileSync, readdirSync } from "node:fs";
import { relative, resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { experienceEventSchema } from "@/domain";

const PROJECT_ROOT = process.cwd();
const SOURCE_ROOT = resolve(PROJECT_ROOT, "src");

describe("stage 3 architecture boundaries", () => {
  it("keeps the frozen stage 1 layers independent from stage 3 services", () => {
    const forbiddenImporters = [
      "domain",
      "runtime",
      "provenance",
      "finalization",
    ].flatMap((directory) =>
      sourceFiles(resolve(SOURCE_ROOT, directory))
        .filter((filePath) =>
          /(?:from|import\s*)\s*["'][^"']*(?:agent|final-review|application)(?:\/|["'])/.test(
            readFileSync(filePath, "utf8").replaceAll("\\", "/"),
          ),
        )
        .map((filePath) => relative(SOURCE_ROOT, filePath).replaceAll("\\", "/")),
    );

    expect(forbiddenImporters).toEqual([]);
  });

  it("keeps deterministic Agent code free of runtime and provenance metadata", () => {
    const deterministicFiles = sourceFiles(resolve(SOURCE_ROOT, "agent"))
      .filter((filePath) => /deterministic/i.test(filePath));

    expect(deterministicFiles.length).toBeGreaterThan(0);
    for (const filePath of deterministicFiles) {
      const source = readFileSync(filePath, "utf8").replaceAll("\\", "/");
      expect(source).not.toMatch(/(?:from|import\s*)\s*["'][^"']*(?:runtime|provenance)(?:\/|["'])/);
      expect(source).not.toMatch(/\b(?:RequestContext|ActiveOperation|CapabilityExecutionReceipt)\b/);
    }
  });

  it("keeps Final Review independent from the nine-capability Agent layer", () => {
    for (const filePath of sourceFiles(resolve(SOURCE_ROOT, "final-review"))) {
      const source = readFileSync(filePath, "utf8").replaceAll("\\", "/");
      expect(source).not.toMatch(/(?:from|import\s*)\s*["'][^"']*agent(?:\/|["'])/);
    }
  });

  it("keeps every stage 3 layer behind the public gated content boundary", () => {
    const offenders = ["agent", "application", "final-review"].flatMap(
      (directory) =>
        sourceFiles(resolve(SOURCE_ROOT, directory))
          .filter((filePath) => {
            const source = readFileSync(filePath, "utf8").replaceAll("\\", "/");
            return (
              /from\s+["'][^"']*content\/[^"']*\.json["']/.test(source) ||
              /content\/(?:loader|bundled-content-source|bundle-projection|content-access)/.test(
                source,
              )
            );
          })
          .map((filePath) =>
            relative(SOURCE_ROOT, filePath).replaceAll("\\", "/"),
          ),
    );

    expect(offenders).toEqual([]);
  });

  it("does not introduce an ownerless generic schemaVersion", () => {
    const offenders = ["agent", "application", "final-review"].flatMap(
      (directory) =>
        sourceFiles(resolve(SOURCE_ROOT, directory))
          .filter((filePath) => /\bschemaVersion\b/.test(readFileSync(filePath, "utf8")))
          .map((filePath) => relative(SOURCE_ROOT, filePath).replaceAll("\\", "/")),
    );

    expect(offenders).toEqual([]);
  });

  it("uses only the frozen experience-event inventory for application events", () => {
    const source = readFileSync(
      resolve(SOURCE_ROOT, "application", "orchestration.schemas.ts"),
      "utf8",
    );
    const eventTypes = Array.from(
      source.matchAll(/eventType:\s*z\.literal\("([A-Z0-9_]+)"\)/gu),
      (match) => match[1],
    );
    expect(eventTypes.length).toBeGreaterThan(0);
    for (const eventType of eventTypes) {
      expect(
        experienceEventSchema.safeParse(eventType).success,
        `${eventType} is not in the frozen experience-event inventory`,
      ).toBe(true);
    }
  });

  it("keeps Mock semantics independent from ambient time and randomness", () => {
    const mockFiles = ["agent", "final-review"].flatMap((directory) =>
      sourceFiles(resolve(SOURCE_ROOT, directory)).filter((filePath) =>
        filePath.replaceAll("\\", "/").includes("/mock/"),
      ),
    );

    expect(mockFiles.length).toBeGreaterThan(0);
    for (const filePath of mockFiles) {
      const source = readFileSync(filePath, "utf8");
      expect(source).not.toMatch(/\bDate\.now\s*\(/);
      expect(source).not.toMatch(/\bMath\.random\s*\(/);
      expect(source).not.toMatch(/\brandomUUID\s*\(/);
    }
  });

  it("does not add a real model SDK, an Agent route, or logging of untrusted input", () => {
    const packageJson = JSON.parse(
      readFileSync(resolve(PROJECT_ROOT, "package.json"), "utf8"),
    ) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
    const installedPackages = new Set([
      ...Object.keys(packageJson.dependencies ?? {}),
      ...Object.keys(packageJson.devDependencies ?? {}),
    ]);

    for (const forbiddenPackage of [
      "openai",
      "@anthropic-ai/sdk",
      "@google/generative-ai",
      "ai",
    ]) {
      expect(installedPackages.has(forbiddenPackage)).toBe(false);
    }

    expect(existsSync(resolve(SOURCE_ROOT, "app", "api", "agent"))).toBe(false);

    for (const filePath of ["agent", "application", "final-review"].flatMap(
      (directory) => sourceFiles(resolve(SOURCE_ROOT, directory)),
    )) {
      const source = readFileSync(filePath, "utf8");
      expect(source).not.toMatch(/\bconsole\.(?:debug|info|log|warn|error)\s*\(/);
    }
  });
});

function sourceFiles(directory: string): string[] {
  if (!existsSync(directory)) {
    return [];
  }
  return readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      const path = resolve(directory, entry.name);
      return entry.isDirectory()
        ? sourceFiles(path)
        : /\.(?:ts|tsx)$/.test(entry.name)
          ? [path]
          : [];
    })
    .sort();
}

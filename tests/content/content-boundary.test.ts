import { readFileSync, readdirSync } from "node:fs";
import { relative, resolve } from "node:path";

import { describe, expect, it } from "vitest";

const PROJECT_ROOT = process.cwd();
const SOURCE_ROOT = resolve(PROJECT_ROOT, "src");

describe("content architecture boundary", () => {
  it("keeps raw content JSON imports inside the bundled source adapter", () => {
    const rawContentImporters = sourceFiles(SOURCE_ROOT)
      .filter((filePath) => /from\s+["'][^"']*content\/[^"']*\.json["']/.test(
        readFileSync(filePath, "utf8").replaceAll("\\", "/"),
      ))
      .map((filePath) => relative(SOURCE_ROOT, filePath).replaceAll("\\", "/"));

    expect(rawContentImporters).toEqual(["content/bundled-content-source.ts"]);
  });

  it("wires both supported Next entrypoints to the shared production gate", () => {
    const nextConfig = readFileSync(resolve(PROJECT_ROOT, "next.config.ts"), "utf8");
    const rootLayout = readFileSync(
      resolve(SOURCE_ROOT, "app", "layout.tsx"),
      "utf8",
    );
    const productionGate = readFileSync(
      resolve(SOURCE_ROOT, "content", "production-gate.ts"),
      "utf8",
    );

    expect(nextConfig).toContain("assertBuildTimeContentGate");
    expect(nextConfig).toContain("PHASE_PRODUCTION_BUILD");
    expect(rootLayout).toContain("assertFirstRequestContentGate");
    expect(rootLayout).toContain("await connection()");
    expect(productionGate).toContain("evaluateContentGate");
    expect(nextConfig).toContain("./src/content/server");
    expect(rootLayout).toContain("../content/server");
  });

  it("keeps downstream source away from ungated content internals", () => {
    const forbiddenImporters = sourceFiles(SOURCE_ROOT)
      .filter((filePath) => !filePath.includes(`${resolve(SOURCE_ROOT, "content")}`))
      .filter((filePath) =>
        /content\/(?:loader|bundled-content-source|bundle-projection|content-access)/.test(
          readFileSync(filePath, "utf8").replaceAll("\\", "/"),
        ),
      )
      .map((filePath) => relative(SOURCE_ROOT, filePath).replaceAll("\\", "/"));

    expect(forbiddenImporters).toEqual([]);
    expect(readFileSync(resolve(SOURCE_ROOT, "content", "index.ts"), "utf8"))
      .not.toContain('export * from "./loader"');
  });

  it("does not define a competing production-gate result type", () => {
    const contentSource = sourceFiles(resolve(SOURCE_ROOT, "content"))
      .map((filePath) => readFileSync(filePath, "utf8"))
      .join("\n");

    for (const forbiddenName of [
      "ProductionGateResult",
      "ContentValidationResult",
      "ContentVerificationResult",
    ]) {
      expect(contentSource).not.toContain(forbiddenName);
    }
  });
});

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) {
        return sourceFiles(path);
      }
      return /\.(?:ts|tsx)$/.test(entry.name) ? [path] : [];
    })
    .sort();
}

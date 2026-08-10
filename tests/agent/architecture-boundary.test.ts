import { readFileSync, readdirSync } from "node:fs";
import { relative, resolve } from "node:path";

import { describe, expect, it } from "vitest";

const AGENT_ROOT = resolve(process.cwd(), "src", "agent");

describe("Agent architecture boundary", () => {
  it("does not import raw content, ContentLoader internals, application, or FinalReview", () => {
    const violations = sourceFiles(AGENT_ROOT)
      .filter((filePath) => {
        const source = readFileSync(filePath, "utf8").replaceAll("\\", "/");
        return (
          /\.json["']/u.test(source) ||
          /content\/(?:loader|bundled-content-source|bundle-projection|content-access)/u.test(
            source,
          ) ||
          /from\s+["'][^"']*(?:application|final-review)/u.test(source)
        );
      })
      .map((filePath) => relative(AGENT_ROOT, filePath).replaceAll("\\", "/"));
    expect(violations).toEqual([]);
  });

  it("contains no Session mutation, logging of user text, or provider/network client", () => {
    const source = sourceFiles(AGENT_ROOT)
      .map((filePath) => readFileSync(filePath, "utf8"))
      .join("\n");
    expect(source).not.toMatch(/SessionState|sessionState\s*[.=]/u);
    expect(source).not.toMatch(/console\.(?:log|debug|info|warn|error)/u);
    expect(source).not.toMatch(/fetch\s*\(|axios|OpenAI|Anthropic|GoogleGenerativeAI/u);
  });
});

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      const path = resolve(directory, entry.name);
      return entry.isDirectory()
        ? sourceFiles(path)
        : /\.ts$/u.test(entry.name)
          ? [path]
          : [];
    })
    .sort();
}

import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("Stage 5 UI boundary", () => {
  it("keeps React components behind the application facade", async () => {
    const source = await readFile(
      new URL("../../src/stage5/experience-client.tsx", import.meta.url),
      "utf8",
    );
    expect(source).not.toMatch(/from\s+["'][^"']*\/(domain|fsm|persistence|application|agent)/u);
    expect(source).not.toContain("reduceStage4Event");
    expect(source).not.toContain("IndexedDbStage4Store");
    expect(source).not.toContain("dangerouslySetInnerHTML");
  });

  it("does not derive a business stage from the URL", async () => {
    const page = await readFile(
      new URL("../../src/app/page.tsx", import.meta.url),
      "utf8",
    );
    expect(page).toContain("params.session");
    expect(page).not.toContain("params.stage");
  });
});

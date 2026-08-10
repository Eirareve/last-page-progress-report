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

  it("projects explicit Live loading, fallback, and no-Mock-signature copy", async () => {
    const source = await readFile(
      new URL("../../src/stage5/experience-client.tsx", import.meta.url),
      "utf8",
    );
    expect(source).toContain('data-testid="live-execution-status"');
    expect(source).toContain("Live Agent 正在处理");
    expect(source).toContain("已使用本地安全 Mock");
    expect(source).toContain("签名审阅不会由 Mock 代签");
    expect(source).toContain("重试 Live 查理签名审阅（最后一次）");
  });
});

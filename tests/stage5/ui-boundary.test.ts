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
    expect(page).toContain("resolveContentEnvironment(process.env)");
    expect(page).toContain("contentMode={environment.contentMode}");
    expect(page).toContain("targetEnvironment={environment.appEnvironment}");
  });

  it("projects explicit Live loading, fallback, and no-Mock-signature copy", async () => {
    const source = await readFile(
      new URL("../../src/stage5/experience-client.tsx", import.meta.url),
      "utf8",
    );
    expect(source).toContain('data-testid="execution-status"');
    expect(source).toContain("AI 正在处理");
    expect(source).toContain("已使用本地安全演示结果");
    expect(source).toContain("签名审阅不会由演示结果代替");
    expect(source).toContain("if (requestedMode === \"mock\")");
    expect(source).toContain("return null");
    expect(source).toContain("重试查理签名审阅（最后一次）");
    expect(source).not.toContain('fetch("/api/dynamic-portrait"');
    expect(source).not.toContain("不会调用 DeepSeek");
    expect(source).toContain("Agnes 动态图片生成暂未启用");
  });
});

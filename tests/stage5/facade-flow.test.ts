import { IDBKeyRange, indexedDB } from "fake-indexeddb";
import { beforeAll, describe, expect, it } from "vitest";

import { Stage5ExperienceFacade } from "@/stage5";

describe("Stage 5 application facade", () => {
  beforeAll(() => {
    Object.defineProperty(globalThis, "indexedDB", {
      configurable: true,
      value: indexedDB,
    });
    Object.defineProperty(globalThis, "IDBKeyRange", {
      configurable: true,
      value: IDBKeyRange,
    });
  });

  it("completes the approved Mock-only flow through atomic snapshots", async () => {
    const facade = new Stage5ExperienceFacade(null);
    await facade.initialize();
    expectReady(facade, "WELCOME");

    await facade.start();
    const prelude = expectReady(facade, "PORTRAIT_PRELUDE");
    await facade.submitPortraitDescriptors(
      prelude.portraits.flatMap((portrait) => portrait.selectedDescriptors),
    );
    expectReady(facade, "PORTRAIT_CHOICE");

    await facade.submitInitialPortrait({
      choice: "early",
      reason: "早期的期待仍然给关系留下了空间。",
    });
    expectReady(facade, "ROUND_1_PAST_SELF");

    await facade.submitRound({ response: "过去的理解不能只因现在更聪明就被抹除。" });
    expectReady(facade, "ROUND_1_DIFF");
    await facade.decideDiff("accept");
    expectReady(facade, "ROUND_2_FORECAST");

    await facade.submitRound({
      response: "预测未来并不等于替未来作出全部决定。",
      clarification: "我区分风险提示与替代授权。",
    });
    expectReady(facade, "ROUND_3_RELATIONSHIP");

    await facade.submitRound({ response: "关系本身也是未来自我可以重新判断的部分。" });
    const placement = expectReady(facade, "SEMANTIC_PLACEMENT");
    expect(placement.plainText).not.toBeNull();
    expect(placement.semanticFragments).toHaveLength(1);

    await facade.chooseFragmentPlacement({
      fragmentId: placement.semanticFragments[0]!.id,
      placement: "margin_note",
    });
    expectReady(facade, "PORTRAIT_REASSEMBLY");

    await facade.submitFinalPortrait({
      choice: "all_three",
      reason: "三个阶段都保留一部分解释权。",
    });
    expectReady(facade, "FINAL_SIGNATURE");
    await facade.skipSignature();
    expectReady(facade, "FINAL_DISPOSITION");
    await facade.chooseDisposition("unfinished");

    const complete = expectReady(facade, "COMPLETE");
    expect(complete.envelope).toMatchObject({
      requestedAgentMode: "mock",
      finalDisposition: "unfinished",
      contentSchemaVersion: "0.2.0",
    });
    expect(complete.envelope?.originalDeclaration).toContain("原创互动草案");
    expect(facade.getSnapshot().error).toBeNull();
  });

  it("loads the frozen verified bundle for a production Mock session", async () => {
    const facade = new Stage5ExperienceFacade(null, {
      requestedMode: "mock",
      contentMode: "verified",
      targetEnvironment: "production",
    });

    await facade.initialize();
    const welcome = expectReady(facade, "WELCOME");
    expect(welcome.contentMode).toBe("verified");
    expect(welcome.portraits.map(({ assetPath }) => assetPath)).toEqual([
      "/portraits/charlie-original-v2/early.png",
      "/portraits/charlie-original-v2/peak.png",
      "/portraits/charlie-original-v2/future-facing.png",
    ]);

    await facade.start();
    const prelude = expectReady(facade, "PORTRAIT_PRELUDE");
    await facade.submitPortraitDescriptors(
      prelude.portraits.flatMap((portrait) => portrait.selectedDescriptors),
    );
    await facade.submitInitialPortrait({
      choice: "early",
      reason: "正式内容下仍使用确定性 Mock 执行。",
    });

    const round = expectReady(facade, "ROUND_1_PAST_SELF");
    expect(round.currentRound?.evidenceTitle).toBe("过去的我，谁有解释权？");
    expect(JSON.stringify(round)).not.toContain("PLACEHOLDER:");
    expect(JSON.stringify(round)).not.toContain("internalExcerpt");
  });
});

function expectReady(facade: Stage5ExperienceFacade, stage: string) {
  const snapshot = facade.getSnapshot();
  expect(snapshot.status).toBe("ready");
  expect(snapshot.error).toBeNull();
  expect(snapshot.view?.stage).toBe(stage);
  return snapshot.view!;
}

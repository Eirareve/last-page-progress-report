import { expect, test, type Page } from "@playwright/test";

test("首个纵向切片原子保存、双击幂等并可刷新恢复", async ({ page }) => {
  await reachRoundOne(page);
  const preciseBefore = await preciseText(page);
  const accept = page.getByRole("button", { name: "接受修改" });
  await accept.evaluate((element) => {
    (element as HTMLButtonElement).click();
    (element as HTMLButtonElement).click();
  });

  await expectStage(page, "第二轮：对未来的预测边界");
  const preciseAfter = await preciseText(page);
  expect(preciseAfter).toContain("也请保留我此刻无法消除的犹疑");
  expect(preciseAfter).not.toBe(preciseBefore);
  expect(new URL(page.url()).searchParams.has("stage")).toBe(false);
  const sessionId = new URL(page.url()).searchParams.get("session");
  expect(sessionId).toBeTruthy();

  await page.reload();
  await expectStage(page, "第二轮：对未来的预测边界");
  await expect(page.getByTestId("persistence-status")).toHaveText("已保存到本地");
  expect(await preciseText(page)).toBe(preciseAfter);
  await expect(page.getByTestId("stage-heading")).toBeFocused();
});

test("完整 Mock 主路径从欢迎页到只读完成档案", async ({ page }) => {
  await reachFinalSignature(page);
  await page.getByRole("button", { name: "不请求签名，继续" }).click();
  await expectStage(page, "这份文稿将被如何留下？");
  await page.getByRole("button", { name: /保持未完成/ }).click();

  await expectStage(page, "未被签收的封套");
  await expect(page.getByText("只读完成档案")).toBeVisible();
  await expect(page.getByText("未请求 · 保持未完成")).toBeVisible();
  await expect(page.getByText(/以下内容为基于原著核心矛盾设计的原创互动草案/)).toBeVisible();
  await expect(page.getByRole("button", { name: "开始新的体验" })).toBeVisible();
  expect(new URL(page.url()).searchParams.has("stage")).toBe(false);
  const completedSession = new URL(page.url()).searchParams.get("session");
  await page.reload();
  await expectStage(page, "未被签收的封套");
  await page.getByRole("button", { name: "开始新的体验" }).click();
  await expectStage(page, "欢迎");
  expect(new URL(page.url()).searchParams.get("session")).not.toBe(completedSession);
});

test("production verified Mock 使用冻结内容与正式肖像", async ({ page }) => {
  await page.goto("/");
  await expectStage(page, "欢迎");
  await expect(page.getByText("本地演示模式")).toBeVisible();
  await page.getByRole("button", { name: "开始体验" }).click();
  await expectStage(page, "三次看见查理");
  await expect(page.locator('img[src*="/portraits/charlie-original-v2/"]')).toHaveCount(3);
  await expect(page.getByText(/PLACEHOLDER:/)).toHaveCount(0);
});

test("恢复提案必须二次确认，并可得到独立的 Mock 签名结果", async ({ page }) => {
  await reachSemanticPlacement(page);
  await page.getByRole("button", { name: "恢复到朴素文本" }).click();
  await expect(page.getByText("恢复提案 · 等待确认")).toBeVisible();
  await page.getByRole("button", { name: "确认并应用" }).click();
  await expectStage(page, "重新拼合三次看见");
  await page.getByRole("button", { name: "保存最终选择" }).click();
  await expectStage(page, "现在的查理是否签名？");
  await page.getByRole("button", { name: "演示同意签名" }).click();
  await expectStage(page, "这份文稿将被如何留下？");
  await expect(page.getByText("签名状态：已签名")).toBeVisible();
});

test("Mock 明确拒签保持角色语义，不与技术失败混同", async ({ page }) => {
  await reachFinalSignature(page);
  await page.getByRole("button", { name: "演示明确拒绝" }).click();
  await expectStage(page, "这份文稿将被如何留下？");
  await expect(page.getByText("签名状态：明确拒绝")).toBeVisible();
  await expect(page.getByText("签名状态：技术上未完成")).toHaveCount(0);
});

test("技术未完成不显示成角色拒绝，并允许安全继续", async ({ page }) => {
  await reachFinalSignature(page);
  await page.getByRole("button", { name: "模拟技术上未完成" }).click();
  await expectStage(page, "现在的查理是否签名？");
  await expect(page.getByRole("heading", { name: "当前状态：技术上未完成" })).toBeVisible();
  await expect(page.getByText("明确拒绝", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "保留技术未完成状态并继续" }).click();
  await expectStage(page, "这份文稿将被如何留下？");
  await expect(page.getByText("签名状态：技术上未完成")).toBeVisible();
});

test("最终签名前可取消返回，也可提交修改并重建语义版本", async ({ page }) => {
  await reachFinalSignature(page);
  await page.getByRole("button", { name: "返回修改手稿" }).click();
  await expectStage(page, "返回修改手稿");
  await page.getByRole("button", { name: "取消并返回" }).click();
  await expectStage(page, "现在的查理是否签名？");

  await page.getByRole("button", { name: "返回修改手稿" }).click();
  const draft = page.getByLabel("修改后的精确版本");
  await draft.fill(`${await draft.inputValue()} 这次补充由现在的我承担。`);
  await page.getByRole("button", { name: "提交修改" }).click();
  await expectStage(page, "安放不能被完整传递的意义");
  await expect(page.getByText(/这次补充由现在的我承担/).first()).toBeVisible();
});

test("320px 视口保持单栏、无横向裁剪且图片失败不阻塞主流程", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await page.route("**/portraits/charlie-original-v2/early.png", (route) => route.abort());
  await page.goto("/");
  await expectStage(page, "欢迎");
  await page.getByRole("button", { name: "开始体验" }).click();
  await expectStage(page, "三次看见查理");
  await expect(page.getByRole("img", { name: /图片暂不可用/ })).toBeVisible();
  const noHorizontalOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
  );
  expect(noHorizontalOverflow).toBe(true);
  await expect(page.getByRole("button", { name: "保存这些描述" })).toBeVisible();
});

test("320px production verified Mock 可完整走到 COMPLETE", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await reachFinalSignature(page);
  await page.getByRole("button", { name: "不请求签名，继续" }).click();
  await expectStage(page, "这份文稿将被如何留下？");
  await page.getByRole("button", { name: /保持未完成/ }).click();
  await expectStage(page, "未被签收的封套");
  await expect(page.getByText("只读完成档案")).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    ),
  ).toBe(true);
});

test("键盘可以完成 production verified Mock 主路径", async ({ page }) => {
  await page.goto("/");
  await expectStage(page, "欢迎");
  await pressButton(page, "开始体验");
  await expectStage(page, "三次看见查理");
  await pressButton(page, "保存这些描述");
  await expectStage(page, "哪一个最接近真正的查理？");
  await page.getByLabel("为什么？").fill("键盘流程保留每个阶段的解释权。");
  await pressButton(page, "记录这个判断");
  await expectStage(page, "第一轮：过去自我的解释权");
  await submitRoundByKeyboard(page, "过去的理解不能被取消。");
  await pressButton(page, "拒绝并保留分歧");
  await expectStage(page, "第二轮：对未来的预测边界");
  await submitRoundByKeyboard(page, "预测不等于授权。");
  await expectStage(page, "第三轮：未来自我与他人的连接");
  await submitRoundByKeyboard(page, "未来关系仍应由未来重新判断。");
  await expectStage(page, "安放不能被完整传递的意义");
  await pressButton(page, "放入语义花束");
  await expectStage(page, "重新拼合三次看见");
  await pressButton(page, "保存最终选择");
  await expectStage(page, "现在的查理是否签名？");
  await pressButton(page, "不请求签名，继续");
  await expectStage(page, "这份文稿将被如何留下？");
  await pressButton(page, /保持未完成/);
  await expectStage(page, "未被签收的封套");
});

async function reachRoundOne(page: Page) {
  await page.goto("/");
  await expectStage(page, "欢迎");
  await page.getByRole("button", { name: "开始体验" }).click();
  await expectStage(page, "三次看见查理");
  await expect(page.getByRole("checkbox", { checked: true })).toHaveCount(3);
  await page.getByRole("button", { name: "保存这些描述" }).click();
  await expectStage(page, "哪一个最接近真正的查理？");
  await page.getByLabel("为什么？").fill("早期的期待仍然给关系留下了空间。");
  await page.getByRole("button", { name: "记录这个判断" }).click();
  await expectStage(page, "第一轮：过去自我的解释权");
  await submitRound(page, "过去的理解不能只因现在更聪明就被抹除。");
  await expectStage(page, "第一轮：审阅局部修改");
}

async function reachSemanticPlacement(page: Page) {
  await reachRoundOne(page);
  await page.getByRole("button", { name: "拒绝并保留分歧" }).click();
  await expectStage(page, "第二轮：对未来的预测边界");
  await submitRound(
    page,
    "预测未来并不等于替未来作出全部决定。",
    "我区分风险提示与替代授权。",
  );
  await expectStage(page, "第三轮：未来自我与他人的连接");
  await submitRound(page, "关系本身也是未来自我可以重新判断的部分。");
  await expectStage(page, "安放不能被完整传递的意义");
}

async function reachFinalSignature(page: Page) {
  await reachSemanticPlacement(page);
  await page.getByRole("button", { name: "放入语义花束" }).click();
  await expectStage(page, "重新拼合三次看见");
  await page.getByLabel("最终理由（可选）").fill("三个阶段都保留一部分解释权。");
  await page.getByRole("button", { name: "保存最终选择" }).click();
  await expectStage(page, "现在的查理是否签名？");
}

async function submitRound(page: Page, response: string, clarification?: string) {
  await page.locator("#round-response").fill(response);
  if (clarification) {
    await page.getByText("补充一次可选澄清").click();
    await page.getByLabel("澄清（可选）").fill(clarification);
  }
  await page.getByRole("button", { name: clarification ? "提交回答与澄清" : "提交并继续，不作澄清" }).click();
}

async function submitRoundByKeyboard(page: Page, response: string) {
  await page.locator("#round-response").fill(response);
  await pressButton(page, "提交并继续，不作澄清");
}

async function pressButton(page: Page, name: string | RegExp) {
  const button = page.getByRole("button", { name });
  await button.focus();
  await expect(button).toBeFocused();
  await button.press("Enter");
}

async function expectStage(page: Page, title: string) {
  await expect(page.getByTestId("stage-heading")).toHaveText(title);
}

async function preciseText(page: Page) {
  return page.locator(".document-card").first().locator("p").innerText();
}

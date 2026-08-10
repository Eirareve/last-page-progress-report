import { expect, test } from "@playwright/test";

test("Stage 9 consent is explicit, optional, local-only, and allowlisted", async ({ page }) => {
  await page.goto("/");
  const start = page.getByRole("button", { name: "开始体验" });
  await expect(start).toBeDisabled();
  await page.getByRole("button", { name: "同意记录匿名事件" }).click();
  await expect(page.getByText("当前选择：同意本地记录。")).toBeVisible();
  await expect(start).toBeEnabled();
  await start.click();
  await expect(page.getByTestId("stage-heading")).toHaveText("三次看见查理");

  const records = await page.evaluate(() =>
    Object.entries(window.localStorage)
      .filter(([key]) => key.startsWith("last-page-progress-report:stage9:research:"))
      .map(([, value]) => JSON.parse(value)),
  );
  expect(records).toHaveLength(1);
  expect(records[0]).toMatchObject({
    consent: "accepted",
    storageScope: "browser_local_only",
    purpose: "stage9_usability_research",
  });
  const serialized = JSON.stringify(records[0]);
  for (const forbidden of [
    "privateResponse",
    "privateClarification",
    "internalExcerpt",
    "promptText",
    "apiKey",
  ]) {
    expect(serialized).not.toContain(forbidden);
  }
});

test("release responses include baseline security headers and missing assets return 404", async ({
  page,
  request,
}) => {
  const response = await page.goto("/");
  expect(response).not.toBeNull();
  const headers = response!.headers();
  expect(headers["content-security-policy"]).toContain("frame-ancestors 'none'");
  expect(headers["x-content-type-options"]).toBe("nosniff");
  expect(headers["x-frame-options"]).toBe("DENY");
  expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
  expect(headers["permissions-policy"]).toContain("camera=()");

  const missing = await request.get("/portraits/charlie-original-v2/not-present.png");
  expect(missing.status()).toBe(404);
});

test("participant can delete the current local experience and research record", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "同意记录匿名事件" }).click();
  await page.getByRole("button", { name: "开始体验" }).click();
  const oldSession = new URL(page.url()).searchParams.get("session");
  expect(oldSession).toBeTruthy();

  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "删除当前体验的本地数据" }).click();
  await expect(page.getByTestId("stage-heading")).toHaveText("欢迎");
  const newSession = new URL(page.url()).searchParams.get("session");
  expect(newSession).toBeTruthy();
  expect(newSession).not.toBe(oldSession);
  const oldResearchExists = await page.evaluate(
    (sessionId) =>
      window.localStorage.getItem(
        `last-page-progress-report:stage9:research:${sessionId}`,
      ) !== null,
    oldSession,
  );
  expect(oldResearchExists).toBe(false);
});

import { expect, test } from "@playwright/test";

test("Stage 6A live route stays closed and never reflects submitted secrets", async ({
  request,
}) => {
  const response = await request.post("/api/agent", {
    headers: { "content-type": "text/plain" },
    data: "API_KEY=must-not-be-read; untrustedUserText=private",
  });

  expect(response.status()).toBe(503);
  expect(response.headers()["cache-control"]).toBe("no-store");
  const body = await response.text();
  expect(body).toContain("live_api_gate_closed");
  expect(body).not.toContain("must-not-be-read");
  expect(body).not.toContain("private");
});

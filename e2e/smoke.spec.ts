import { test, expect } from "@playwright/test";

test("e2e plumbing: health fixture renders", async ({ page }) => {
  const response = await page.goto("/e2e-health");
  expect(response?.status()).toBe(200);

  const marker = page.getByTestId("e2e-health");
  await expect(marker).toHaveText("ok");
});

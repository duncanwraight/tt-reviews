import { test, expect } from "@playwright/test";

// Read-only smoke tests run against a deployed URL (preview or prod).
// They share prod Supabase + R2 bindings, so never mutate data.

test("health fixture responds 200", async ({ page }) => {
  const response = await page.goto("/e2e-health");
  expect(response?.status()).toBe(200);
  await expect(page.getByTestId("e2e-health")).toHaveText("ok");
});

test("homepage renders", async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: /Table Tennis Equipment Reviews/i,
    })
  ).toBeVisible();
});

test("equipment list renders with at least one item", async ({ page }) => {
  await page.goto("/equipment");
  await expect(
    page.getByRole("heading", { level: 1, name: /Equipment Reviews/i })
  ).toBeVisible();

  const firstEquipmentLink = page
    .locator(
      'a[href^="/equipment/"]:not([href*="/compare/"]):not([href*="/submit"])'
    )
    .first();
  await expect(firstEquipmentLink).toBeVisible();
  const href = await firstEquipmentLink.getAttribute("href");
  expect(href).toMatch(/^\/equipment\/[^/]+$/);
});

test("equipment detail page renders", async ({ page }) => {
  await page.goto("/equipment");
  const firstEquipmentLink = page
    .locator(
      'a[href^="/equipment/"]:not([href*="/compare/"]):not([href*="/submit"])'
    )
    .first();
  const href = await firstEquipmentLink.getAttribute("href");
  expect(href).toBeTruthy();

  await page.goto(href!);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
});

test("login page renders with form", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByLabel("Email Address")).toBeVisible();
  await expect(page.getByLabel("Password")).toBeVisible();
});

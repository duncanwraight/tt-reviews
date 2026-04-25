import { test, expect } from "@playwright/test";

test("anon browse: homepage → equipment list → equipment detail", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: /Table Tennis Equipment Reviews/i,
    })
  ).toBeVisible();

  // Use the global nav's Equipment link rather than the homepage CTA so the
  // test stays decoupled from the Featured-Equipment section's visibility.
  await page
    .getByRole("link", { name: "Equipment", exact: true })
    .first()
    .click();
  await page.waitForURL(/\/equipment$/);
  await expect(
    page.getByRole("heading", { level: 1, name: /Equipment Reviews/i })
  ).toBeVisible();

  const firstEquipmentLink = page
    .locator(
      'a[href^="/equipment/"]:not([href*="/compare/"]):not([href*="/submit"])'
    )
    .first();

  const href = await firstEquipmentLink.getAttribute("href");
  expect(href).toMatch(/^\/equipment\/[^/]+$/);
  await firstEquipmentLink.click();

  await page.waitForURL(/\/equipment\/[^/]+$/);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
});

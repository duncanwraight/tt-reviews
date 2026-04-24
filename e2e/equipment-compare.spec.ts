import { test, expect } from "@playwright/test";

// Seed slugs we rely on. Both are inverted rubbers ranked high enough under
// default (created_at desc) sort to land on page 1 of /equipment?subcategory=inverted.
// LONG_PIPS_SLUG is the first item on page 1 of the long_pips filter — used
// to assert cross-subcategory blocking.
const INVERTED_A = "dhs-neo-hurricane-3";
const INVERTED_B = "yasaka-mark-v";
const LONG_PIPS_SLUG = "tsp-curl-p1r";

// Canonical: alphabetical order. Since INVERTED_A < INVERTED_B alphabetically,
// INVERTED_A appears first in the canonical URL.
const CANONICAL = `/equipment/compare/${INVERTED_A}-vs-${INVERTED_B}`;
const REVERSED = `/equipment/compare/${INVERTED_B}-vs-${INVERTED_A}`;

test.describe("Equipment comparison (TT-29)", () => {
  test("tick two same-subcategory items → tray → canonical compare URL", async ({
    page,
  }) => {
    await page.goto("/equipment?subcategory=inverted");

    const cardA = page.locator(
      `[data-testid="equipment-card"][data-slug="${INVERTED_A}"]`
    );
    const cardB = page.locator(
      `[data-testid="equipment-card"][data-slug="${INVERTED_B}"]`
    );

    await cardA.getByTestId("comparison-toggle").click();
    await cardB.getByTestId("comparison-toggle").click();

    const tray = page.getByTestId("comparison-tray");
    await expect(tray).toBeVisible();
    await tray.getByTestId("comparison-tray-compare").click();

    await expect(page).toHaveURL(CANONICAL);
    await expect(page.getByTestId("comparison-header")).toBeVisible();
    await expect(page.getByTestId("ratings-table")).toBeVisible();
  });

  test("reversed-order URL redirects (301) to canonical", async ({ page }) => {
    await page.goto(REVERSED);
    await expect(page).toHaveURL(CANONICAL);
  });

  test("mismatched-subcategory URL redirects to /equipment", async ({
    page,
  }) => {
    await page.goto(`/equipment/compare/${INVERTED_A}-vs-${LONG_PIPS_SLUG}`);
    await expect(page).toHaveURL(/\/equipment\/?($|\?)/);
  });

  test("compare badge is disabled for an item in a different subcategory", async ({
    page,
  }) => {
    // Tick an inverted rubber on the inverted list.
    await page.goto("/equipment?subcategory=inverted");
    await page
      .locator(`[data-testid="equipment-card"][data-slug="${INVERTED_A}"]`)
      .getByTestId("comparison-toggle")
      .click();

    // Move to the long_pips list — the inverted selection persists via
    // localStorage, so every long_pips card's badge should be disabled.
    await page.goto("/equipment?subcategory=long_pips");
    const blockedToggle = page
      .locator(`[data-testid="equipment-card"][data-slug="${LONG_PIPS_SLUG}"]`)
      .getByTestId("comparison-toggle");
    await expect(blockedToggle).toBeDisabled();
    await expect(blockedToggle).toHaveAttribute("title", /same-subcategory/i);
  });

  test("selection persists across page reload via localStorage", async ({
    page,
  }) => {
    await page.goto("/equipment?subcategory=inverted");

    const card = page.locator(
      `[data-testid="equipment-card"][data-slug="${INVERTED_A}"]`
    );
    await card.getByTestId("comparison-toggle").click();
    await expect(page.getByTestId("comparison-tray")).toBeVisible();

    await page.reload();

    await expect(page.getByTestId("comparison-tray")).toBeVisible();
    await expect(
      page
        .locator(`[data-testid="equipment-card"][data-slug="${INVERTED_A}"]`)
        .getByTestId("comparison-toggle")
    ).toHaveAttribute("data-selected", "true");
  });
});

import { test, expect } from "@playwright/test";

// Three same-subcategory inverted rubbers, all on page 1 of
// /equipment?subcategory=inverted under the default created_at-desc sort.
const A = "dhs-neo-hurricane-3";
const B = "yasaka-mark-v";
const C = "yasaka-rakza-7";
// A fourth, also on page 1, used to assert oldest-eviction at cap-3.
const D = "butterfly-tenergy-05-fx";
// Different subcategory — used for the mismatched ?ids redirect.
const LONG_PIPS = "tsp-curl-p1r";

// Alphabetical canonical order for the query-param URL.
const SORTED = [A, B, C].sort();
const QUERY_URL = `/equipment/compare?ids=${SORTED.join(",")}`;

// Each test starts with a clean tt-compare-selection. We can't rely on
// per-test context isolation alone — under fully-parallel runs we've seen
// state leak in. Clearing once at the very start (then letting localStorage
// behave normally for the rest of the test) covers both cases without
// breaking tests that rely on cross-navigation persistence.
async function clearComparisonStorage(page: import("@playwright/test").Page) {
  await page.goto("/");
  await page.evaluate(() => {
    try {
      window.localStorage.removeItem("tt-compare-selection");
    } catch {
      /* noop */
    }
  });
}

test.describe("Equipment comparison — 3-item (TT-30)", () => {
  test.beforeEach(async ({ page }) => {
    await clearComparisonStorage(page);
  });

  test("tick three same-subcategory items → tray '3 of 3' → query-param URL with noindex", async ({
    page,
  }) => {
    await page.goto("/equipment?subcategory=inverted");

    for (const slug of [A, B, C]) {
      await page
        .locator(`[data-testid="equipment-card"][data-slug="${slug}"]`)
        .getByTestId("comparison-toggle")
        .click();
    }

    const tray = page.getByTestId("comparison-tray");
    await expect(tray).toBeVisible();
    await expect(tray).toContainText("3 of 3");

    await tray.getByTestId("comparison-tray-compare").click();
    await expect(page).toHaveURL(QUERY_URL);

    await expect(page.getByTestId("comparison-header")).toBeVisible();
    await expect(page.getByTestId("ratings-table")).toBeVisible();

    const robots = await page
      .locator('meta[name="robots"]')
      .first()
      .getAttribute("content");
    expect(robots).toMatch(/noindex/);
  });

  test("ticking a 4th item replaces the oldest selection", async ({ page }) => {
    await page.goto("/equipment?subcategory=inverted");

    for (const slug of [A, B, C]) {
      await page
        .locator(`[data-testid="equipment-card"][data-slug="${slug}"]`)
        .getByTestId("comparison-toggle")
        .click();
    }

    const tray = page.getByTestId("comparison-tray");
    await expect(tray).toContainText("3 of 3");

    // Adding D should drop A (oldest) and keep B, C, D.
    await page
      .locator(`[data-testid="equipment-card"][data-slug="${D}"]`)
      .getByTestId("comparison-toggle")
      .click();

    await expect(tray).toContainText("3 of 3");
    await expect(
      page
        .locator(`[data-testid="equipment-card"][data-slug="${A}"]`)
        .getByTestId("comparison-toggle")
    ).toHaveAttribute("data-selected", "false");
    await expect(
      page
        .locator(`[data-testid="equipment-card"][data-slug="${D}"]`)
        .getByTestId("comparison-toggle")
    ).toHaveAttribute("data-selected", "true");
  });

  test("?ids=a,b (2 ids) redirects to the canonical slug-pair route", async ({
    page,
  }) => {
    const [a, b] = [A, B].sort();
    await page.goto(`/equipment/compare?ids=${a},${b}`);
    await expect(page).toHaveURL(`/equipment/compare/${a}-vs-${b}`);
  });

  test("?ids=... with mismatched subcategory redirects to /equipment", async ({
    page,
  }) => {
    await page.goto(`/equipment/compare?ids=${A},${B},${LONG_PIPS}`);
    await expect(page).toHaveURL(/\/equipment\/?($|\?)/);
  });
});

import { test, expect } from "@playwright/test";

// "Tenergy" matches several seeded Butterfly inverted rubbers via the
// equipment.name full-text search — enough to guarantee at least one
// equipment hit on the search page regardless of seed-order changes.
const QUERY = "Tenergy";

test.describe("Search results — unified EquipmentCard (TT-44)", () => {
  test("equipment hit renders unified EquipmentCard markers and links to detail", async ({
    page,
  }) => {
    await page.goto(`/search?q=${encodeURIComponent(QUERY)}`);

    // The Equipment section only renders when there are equipment hits.
    await expect(
      page.getByRole("heading", { level: 2, name: "Equipment" })
    ).toBeVisible();

    // Equipment results are rendered as <Link to="/equipment/<slug>"> by the
    // unified EquipmentCard's PlainCard. The compare detail page lives at
    // /equipment/compare/... so exclude that to avoid false positives.
    const firstResult = page
      .locator(
        'a[href^="/equipment/"]:not([href*="/compare/"]):not([href*="/submit"])'
      )
      .first();
    await expect(firstResult).toBeVisible();

    // Unified-card marker: title uses line-clamp-2, never truncate.
    const title = firstResult.locator("h3");
    await expect(title).toHaveClass(/line-clamp-2/);
    await expect(title).not.toHaveClass(/truncate/);

    // Unified-card marker: category pill is present. Tenergy hits are all
    // rubbers, so the visible category label is "Rubber".
    await expect(
      firstResult.getByText("Rubber", { exact: true })
    ).toBeVisible();

    // Unified-card marker: no standalone manufacturer subtitle. Asserting on
    // the bare manufacturer text catches the old `<p>{manufacturer}</p>` line
    // without false-matching the manufacturer prefix inside equipment.name.
    await expect(
      firstResult.getByText("Butterfly", { exact: true })
    ).toHaveCount(0);

    // Search results render the plain card (showCompareToggle defaults off).
    await expect(firstResult.getByTestId("comparison-toggle")).toHaveCount(0);

    // Card click navigates to the equipment detail page.
    const href = await firstResult.getAttribute("href");
    expect(href).toMatch(/^\/equipment\/[^/]+$/);
    await firstResult.click();
    await page.waitForURL(/\/equipment\/[^/]+$/);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  });

  // TT-144 regression: multi-word user input was being passed straight to
  // PostgREST `fts.`, which expects tsquery syntax (`butterfly & tenergy`).
  // Raw whitespace returned 42601 and was swallowed by `.catch(() => [])`,
  // so every multi-term query rendered NoResults in production. Now using
  // `{ type: "websearch" }` so user input is parsed via websearch_to_tsquery.
  test("multi-word query returns equipment hits (TT-144)", async ({ page }) => {
    await page.goto(`/search?q=${encodeURIComponent("Butterfly Tenergy")}`);

    await expect(
      page.getByRole("heading", { level: 2, name: "Equipment" })
    ).toBeVisible();

    const firstResult = page
      .locator(
        'a[href^="/equipment/"]:not([href*="/compare/"]):not([href*="/submit"])'
      )
      .first();
    await expect(firstResult).toBeVisible();
  });
});

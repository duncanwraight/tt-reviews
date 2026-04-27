import { test, expect } from "@playwright/test";

// Sortable numeric/range columns on the comparison specs table (TT-77).
//
// Seed pairing: DHS NEO Hurricane 3 vs Yasaka Mark V.
//   speed:    DHS 8.5,  Yasaka 8.0  → asc reorders, desc reverses
//   spin:     DHS 9.9,  Yasaka 8.5  → ascends with Yasaka first
//   hardness: DHS {40,40}, Yasaka {40,42} → tie on min, max tiebreak
//
// SpecsTable is only rendered when the category has equipment_spec_field rows
// seeded. We assert the table is visible up front so the test fails loudly
// if seed data drifts rather than silently no-op-ing.

const PAIR_URL = "/equipment/compare/dhs-neo-hurricane-3-vs-yasaka-mark-v";

async function equipmentNameOrder(
  page: import("@playwright/test").Page
): Promise<string[]> {
  return page
    .getByTestId("specs-table-equipment-header")
    .allTextContents()
    .then(names => names.map(n => n.trim()));
}

test.describe("SpecsTable sortable columns (TT-77)", () => {
  test("clicking a numeric spec header sorts ascending, then descending", async ({
    page,
  }) => {
    await page.goto(PAIR_URL);
    await expect(page.getByTestId("specs-table")).toBeVisible();

    expect(await equipmentNameOrder(page)).toEqual([
      "DHS NEO Hurricane 3",
      "Yasaka Mark V",
    ]);

    const specsTable = page.getByTestId("specs-table");

    await page.getByTestId("specs-table-sort-speed").click();
    expect(await equipmentNameOrder(page)).toEqual([
      "Yasaka Mark V",
      "DHS NEO Hurricane 3",
    ]);
    await expect(
      specsTable.getByRole("rowheader", { name: /Speed/ })
    ).toHaveAttribute("aria-sort", "ascending");

    await page.getByTestId("specs-table-sort-speed").click();
    expect(await equipmentNameOrder(page)).toEqual([
      "DHS NEO Hurricane 3",
      "Yasaka Mark V",
    ]);
    await expect(
      specsTable.getByRole("rowheader", { name: /Speed/ })
    ).toHaveAttribute("aria-sort", "descending");
  });

  test("text spec rows have no sort affordance", async ({ page }) => {
    await page.goto(PAIR_URL);
    await expect(page.getByTestId("specs-table")).toBeVisible();
    // topsheet is text-typed in the seed; sponge as well.
    await expect(page.getByTestId("specs-table-sort-topsheet")).toHaveCount(0);
    await expect(page.getByTestId("specs-table-sort-sponge")).toHaveCount(0);
  });

  test("range spec sorts by min with max as tiebreaker", async ({ page }) => {
    await page.goto(PAIR_URL);
    await expect(page.getByTestId("specs-table")).toBeVisible();

    // Hardness — DHS {40,40}, Yasaka {40,42}. Tie on min, max tiebreak puts
    // DHS first ascending, Yasaka first descending.
    await page.getByTestId("specs-table-sort-hardness").click();
    expect(await equipmentNameOrder(page)).toEqual([
      "DHS NEO Hurricane 3",
      "Yasaka Mark V",
    ]);

    await page.getByTestId("specs-table-sort-hardness").click();
    expect(await equipmentNameOrder(page)).toEqual([
      "Yasaka Mark V",
      "DHS NEO Hurricane 3",
    ]);
  });
});

import { test, expect } from "@playwright/test";

// TT-34: equipment detail page surfaces the manufacturer's own spec/rating
// numbers (the JSONB `equipment.specifications` blob, projected through the
// `equipment_spec_field` taxonomy) in a SpecsTable — same component as the
// compare page, fed a single-item array.
//
// Fixture: dhs-neo-hurricane-3 is seeded with a populated specifications blob
// (topsheet, sponge, speed, spin, control, hardness) and the inverted-rubber
// subcategory has spec_field rows configured, so SpecsTable renders rows.

const HURRICANE_SLUG = "dhs-neo-hurricane-3";

test.describe("Equipment detail — manufacturer specifications (TT-34)", () => {
  test("renders SpecsTable with manufacturer values for a seeded rubber", async ({
    page,
  }) => {
    await page.goto(`/equipment/${HURRICANE_SLUG}`);

    await expect(
      page.getByRole("heading", { name: "Manufacturer specifications" })
    ).toBeVisible();

    const specsTable = page.getByTestId("specs-table");
    await expect(specsTable).toBeVisible();

    // Single-item detail page renders as <dl> with a <dt>label</dt><dd>value</dd>
    // pair per row; comparison page uses a <table> with <tr> rows. Locate the
    // label's parent row so the value assertion stays scoped to that pair.
    const speedRow = specsTable
      .locator("dt", { hasText: "Speed" })
      .locator("..");
    await expect(speedRow).toContainText("8.5");

    const spinRow = specsTable.locator("dt", { hasText: "Spin" }).locator("..");
    await expect(spinRow).toContainText("9.9");
  });

  test("specs section appears between equipment header and reviews section", async ({
    page,
  }) => {
    await page.goto(`/equipment/${HURRICANE_SLUG}`);

    const specsHeading = page.getByRole("heading", {
      name: "Manufacturer specifications",
    });
    await expect(specsHeading).toBeVisible();

    const reviewsHeading = page.getByRole("heading", { name: /^Reviews \(/ });
    await expect(reviewsHeading).toBeVisible();

    const specsBox = await specsHeading.boundingBox();
    const reviewsBox = await reviewsHeading.boundingBox();
    expect(specsBox).not.toBeNull();
    expect(reviewsBox).not.toBeNull();
    if (specsBox && reviewsBox) {
      expect(specsBox.y).toBeLessThan(reviewsBox.y);
    }
  });
});

test.describe("Equipment detail — manufacturer + bare-model rendering (TT-163)", () => {
  test("H1 is the bare model and the manufacturer renders separately above it", async ({
    page,
  }) => {
    await page.goto(`/equipment/${HURRICANE_SLUG}`);

    // H1 is the bare model — DHS is shown above as a small uppercase line.
    await expect(
      page.getByRole("heading", { level: 1, name: "NEO Hurricane 3" })
    ).toBeVisible();

    // Manufacturer is on the page (in the subtitle and elsewhere) but
    // never doubled — "DHS DHS" was the regression mode this prevents.
    await expect(page.getByText("DHS", { exact: true }).first()).toBeVisible();
    expect(await page.getByText("DHS DHS").count()).toBe(0);
  });
});

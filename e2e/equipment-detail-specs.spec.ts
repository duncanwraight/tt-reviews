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

    // Seed: speed=8.5, spin=9.9 for dhs-neo-hurricane-3. Confirm at least one
    // manufacturer-supplied number is rendered against its spec label.
    const speedRow = specsTable.locator("tr", { hasText: "Speed" });
    await expect(speedRow).toContainText("8.5");

    const spinRow = specsTable.locator("tr", { hasText: "Spin" });
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

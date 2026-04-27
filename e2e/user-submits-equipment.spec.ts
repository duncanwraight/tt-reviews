import { test, expect } from "@playwright/test";
import {
  createUser,
  deleteUser,
  generateTestEmail,
  login,
  setUserRole,
} from "./utils/auth";
import { getPendingEquipmentSubmissions } from "./utils/data";

/**
 * Regression coverage for TT-76 — typed manufacturer specs on the public
 * equipment submission form.
 *
 * The original implementation used a PostgREST self-FK embed
 * (`parent:categories!parent_id(value)`) to load spec metadata grouped by
 * category. PostgREST silently returned `parent: []` instead of erroring,
 * so every category showed "No specification fields configured" while
 * unit tests with mocked Supabase remained green. The fix is two queries
 * joined in JS — but only an end-to-end check guards against the same
 * shape-of-failure recurring elsewhere.
 *
 * Each test:
 *  1. Selects a category (and subcategory for rubbers).
 *  2. Asserts the typed inputs ACTUALLY RENDER for that category — the
 *     bare-minimum signal the loader returned non-empty data.
 *  3. Submits realistic manufacturer values.
 *  4. Verifies the row in equipment_submissions has typed JSONB matching
 *     archive/EQUIPMENT-SPECS.md.
 */

test("user submits a blade with typed manufacturer specs", async ({ page }) => {
  const email = generateTestEmail("equipment-blade");
  const { userId } = await createUser(email);
  // Bypass FORM_SUBMISSION rate limit so parallel test workers don't
  // trip each other on shared-IP submission caps. Role must be set
  // before login so the JWT picks it up at sign-in.
  await setUserRole(userId, "admin");

  try {
    await login(page, email);

    await page.goto("/submissions/equipment/submit");
    await expect(
      page.getByRole("heading", { name: /Submit New Equipment/i })
    ).toBeVisible();

    const uniqueName = `e2e Blade ${Date.now()}`;
    await page.getByLabel(/^Equipment Name/i).fill(uniqueName);
    await page.getByLabel(/^Manufacturer/i).fill("E2E Manufacturer");
    await page.getByLabel(/^Category/i).selectOption("blade");

    // Loader-data assertion: typed inputs must appear once category=blade
    // is selected. If the loader returns an empty spec_fields_by_parent
    // (the bug we're guarding against) the form would show
    // "No specification fields configured for this category" instead.
    await expect(page.getByLabel("Thickness (mm)")).toBeVisible();
    await expect(page.getByLabel("Weight (g)")).toBeVisible();
    await expect(page.getByText(/Plies \(wood \+ composite\)/i)).toBeVisible();

    await page.getByLabel("Thickness (mm)").fill("5.7");
    await page.getByLabel("Weight (g)").fill("86");
    await page.getByLabel("Wood plies").fill("5");
    await page.getByLabel("Composite plies").fill("2");
    await page.getByLabel("Material").fill("Limba + ALC");

    await page.getByRole("button", { name: /Submit Equipment/i }).click();
    await page.waitForURL("/profile", { timeout: 20000 });

    const rows = await getPendingEquipmentSubmissions(userId);
    expect(rows).toHaveLength(1);
    const submitted = rows[0];
    expect(submitted.name).toBe(uniqueName);
    expect(submitted.category).toBe("blade");
    expect(submitted.specifications).toEqual({
      thickness: 5.7,
      weight: 86,
      plies_wood: 5,
      plies_composite: 2,
      material: "Limba + ALC",
    });
  } finally {
    // user_id has ON DELETE CASCADE so equipment_submissions cleans up.
    await deleteUser(userId);
  }
});

test("user submits an inverted rubber with hardness range", async ({
  page,
}) => {
  const email = generateTestEmail("equipment-rubber");
  const { userId } = await createUser(email);
  // Bypass FORM_SUBMISSION rate limit so parallel test workers don't
  // trip each other on shared-IP submission caps. Role must be set
  // before login so the JWT picks it up at sign-in.
  await setUserRole(userId, "admin");

  try {
    await login(page, email);

    await page.goto("/submissions/equipment/submit");
    await expect(
      page.getByRole("heading", { name: /Submit New Equipment/i })
    ).toBeVisible();

    const uniqueName = `e2e Rubber ${Date.now()}`;
    await page.getByLabel(/^Equipment Name/i).fill(uniqueName);
    await page.getByLabel(/^Manufacturer/i).fill("E2E Manufacturer");
    await page.getByLabel(/^Category/i).selectOption("rubber");
    await page.getByLabel(/^Subcategory/i).selectOption("inverted");

    // Subcategory takes precedence — the inverted-specific range field
    // (hardness) must render with its paired min/max inputs.
    await expect(page.getByLabel("Hardness minimum")).toBeVisible();
    await expect(page.getByLabel("Hardness maximum")).toBeVisible();
    await expect(page.getByLabel("Speed")).toBeVisible();

    await page.getByLabel("Hardness minimum").fill("40");
    await page.getByLabel("Hardness maximum").fill("42");
    await page.getByLabel("Speed").fill("9.5");
    await page.getByLabel("Sponge").fill("Spring Sponge");

    await page.getByRole("button", { name: /Submit Equipment/i }).click();
    await page.waitForURL("/profile", { timeout: 20000 });

    const rows = await getPendingEquipmentSubmissions(userId);
    expect(rows).toHaveLength(1);
    const submitted = rows[0];
    expect(submitted.category).toBe("rubber");
    expect(submitted.subcategory).toBe("inverted");
    expect(submitted.specifications).toEqual({
      hardness: { min: 40, max: 42 },
      speed: 9.5,
      sponge: "Spring Sponge",
    });
  } finally {
    await deleteUser(userId);
  }
});

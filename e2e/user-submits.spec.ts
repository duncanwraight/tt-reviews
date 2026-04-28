import { test, expect } from "@playwright/test";
import {
  createUser,
  deleteUser,
  generateTestEmail,
  login,
  setUserRole,
} from "./utils/auth";
import {
  getPendingEquipmentReviews,
  getPendingEquipmentSubmissions,
  getFirstEquipment,
} from "./utils/data";
import { SUPABASE_URL, adminHeaders } from "./utils/supabase";

// One shared admin user covers all three tests:
//   * Equipment submissions (TT-76 typed-specs regression) need admin role
//     to bypass the FORM_SUBMISSION rate limit so parallel workers don't
//     drain the bucket — admin is the cheapest way to skip it.
//   * Review submission has no role requirement, but reusing the admin
//     keeps the fixture surface small and the redirect-to-/profile path
//     is identical for both roles.
// Each test cleans up its own user-scoped submissions/reviews so the
// "exactly 1 row" assertions remain accurate across tests.

async function deletePendingEquipmentSubmissions(
  userId: string
): Promise<void> {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/equipment_submissions?user_id=eq.${userId}`,
    { method: "DELETE", headers: adminHeaders() }
  );
  if (!res.ok && res.status !== 404) {
    throw new Error(
      `deletePendingEquipmentSubmissions failed (${res.status}): ${await res.text()}`
    );
  }
}

async function deletePendingEquipmentReviews(userId: string): Promise<void> {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/equipment_reviews?user_id=eq.${userId}`,
    { method: "DELETE", headers: adminHeaders() }
  );
  if (!res.ok && res.status !== 404) {
    throw new Error(
      `deletePendingEquipmentReviews failed (${res.status}): ${await res.text()}`
    );
  }
}

test.describe("User submission flows", () => {
  let userId: string;
  let userEmail: string;

  test.beforeAll(async () => {
    userEmail = generateTestEmail("submitter");
    const created = await createUser(userEmail);
    userId = created.userId;
    await setUserRole(userId, "admin");
  });

  test.afterAll(async () => {
    if (userId) await deleteUser(userId);
  });

  test.beforeEach(async ({ page }) => {
    await deletePendingEquipmentSubmissions(userId);
    await deletePendingEquipmentReviews(userId);
    await login(page, userEmail);
  });

  // Regression coverage for TT-76 — typed manufacturer specs on the public
  // equipment submission form. The original implementation used a PostgREST
  // self-FK embed (`parent:categories!parent_id(value)`) to load spec
  // metadata grouped by category. PostgREST silently returned `parent: []`
  // instead of erroring, so every category showed "No specification fields
  // configured" while unit tests with mocked Supabase remained green. Each
  // equipment-submission test:
  //  1. Selects a category (and subcategory for rubbers).
  //  2. Asserts the typed inputs ACTUALLY RENDER for that category — the
  //     bare-minimum signal the loader returned non-empty data.
  //  3. Submits realistic manufacturer values.
  //  4. Verifies the row in equipment_submissions has typed JSONB matching
  //     archive/EQUIPMENT-SPECS.md.
  test("user submits a blade with typed manufacturer specs", async ({
    page,
  }) => {
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
  });

  test("user submits an inverted rubber with hardness range", async ({
    page,
  }) => {
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
  });

  test("user submits equipment review → pending row created", async ({
    page,
  }) => {
    const equipment = await getFirstEquipment();

    await page.goto(
      `/submissions/review/submit?equipment_slug=${equipment.slug}`
    );
    await expect(
      page.getByRole("heading", { name: /Write Equipment Review/i })
    ).toBeVisible();

    await page.getByLabel("Your Playing Level").selectOption("intermediate");
    await page
      .getByLabel("How long have you used this equipment?")
      .selectOption("1_to_3_months");

    // Overall rating is a <input type="range"> — fill dispatches input/change
    // events so React state stays in sync.
    await page.locator("#overall_rating").fill("8");

    // Label renders as "Review*" for required fields; anchor the regex so
    // it doesn't also match "Reviewing", "Submit Review", etc.
    await page
      .getByLabel(/^Review\*?$/)
      .fill("Playwright e2e test review — please ignore.");

    await page.getByRole("button", { name: /Submit Review/i }).click();

    // Success path redirects to /profile (see review config.redirectPath).
    await page.waitForURL("/profile", { timeout: 20000 });

    const rows = await getPendingEquipmentReviews(userId);
    expect(rows).toHaveLength(1);
    expect(rows[0].review_text).toContain("e2e test review");
    expect(Number(rows[0].overall_rating)).toBe(8);
  });
});

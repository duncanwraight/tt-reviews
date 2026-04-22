import { test, expect } from "@playwright/test";
import { createUser, deleteUser, generateTestEmail, login } from "./utils/auth";
import { getFirstEquipment, getPendingEquipmentReviews } from "./utils/data";

test("user submits equipment review → pending row created", async ({
  page,
}) => {
  const email = generateTestEmail("reviewer");
  const { userId } = await createUser(email);
  const equipment = await getFirstEquipment();

  try {
    await login(page, email);

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

    await page
      .getByLabel("Review", { exact: true })
      .fill("Playwright e2e test review — please ignore.");

    await page.getByRole("button", { name: /Submit Review/i }).click();

    // Success path redirects to /profile (see review config.redirectPath).
    await page.waitForURL("/profile", { timeout: 20000 });

    const rows = await getPendingEquipmentReviews(userId);
    expect(rows).toHaveLength(1);
    expect(rows[0].review_text).toContain("e2e test review");
    expect(Number(rows[0].overall_rating)).toBe(8);
  } finally {
    // Deleting the auth user cascades to equipment_reviews.
    await deleteUser(userId);
  }
});

import { test, expect } from "@playwright/test";
import {
  createUser,
  deleteUser,
  generateTestEmail,
  login,
  setUserRole,
} from "./utils/auth";
import {
  getEquipmentReviewStatus,
  getFirstEquipment,
  insertPendingEquipmentReview,
} from "./utils/data";

test("admin approves pending review → visible on public detail page", async ({
  page,
  browser,
}) => {
  const reviewerEmail = generateTestEmail("reviewer3b5");
  const adminEmail = generateTestEmail("admin3b5");
  const { userId: reviewerId } = await createUser(reviewerEmail);
  const { userId: adminId } = await createUser(adminEmail);
  await setUserRole(adminId, "admin");

  const equipment = await getFirstEquipment();
  const reviewText = `Playwright 3b5 marker ${Date.now()}`;
  const review = await insertPendingEquipmentReview({
    userId: reviewerId,
    equipmentId: equipment.id,
    reviewText,
    overallRating: 7,
  });

  try {
    await login(page, adminEmail);

    await page.goto("/admin/equipment-reviews");
    await expect(page).toHaveURL(/\/admin\/equipment-reviews$/);

    const reviewCard = page.locator("li").filter({ hasText: reviewText });
    await expect(reviewCard).toBeVisible();
    await reviewCard.getByRole("button", { name: /^Approve$/ }).click();

    // DB is the source of truth; poll until the trigger flips status.
    await expect
      .poll(() => getEquipmentReviewStatus(review.id), { timeout: 10000 })
      .toBe("approved");

    // Approve button for this card should be gone after the redirect +
    // loader revalidation.
    await expect(
      reviewCard.getByRole("button", { name: /^Approve$/ })
    ).toHaveCount(0);

    // Fresh anonymous context — verifies public visibility, not
    // admin-only visibility.
    const anonContext = await browser.newContext();
    const anonPage = await anonContext.newPage();
    try {
      await anonPage.goto(`/equipment/${equipment.slug}`);
      await expect(anonPage.getByText(reviewText)).toBeVisible();
    } finally {
      await anonContext.close();
    }
  } finally {
    await deleteUser(reviewerId);
    await deleteUser(adminId);
  }
});

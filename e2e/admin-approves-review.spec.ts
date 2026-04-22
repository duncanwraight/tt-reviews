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
    // Admin-only route — if role didn't land in JWT we'd be redirected to /.
    await expect(
      page.getByRole("heading", { name: /Equipment Reviews/i }).first()
    ).toBeVisible();

    const reviewCard = page.locator("li").filter({ hasText: reviewText });
    await expect(reviewCard).toBeVisible();
    await reviewCard.getByRole("button", { name: /^Approve$/ }).click();

    // After POST the action redirects to the same admin page; the approve
    // button for this review should be gone because canApprove returns
    // false for non-pending rows.
    await expect(
      reviewCard.getByRole("button", { name: /^Approve$/ })
    ).toHaveCount(0);

    expect(await getEquipmentReviewStatus(review.id)).toBe("approved");

    // Verify publicly visible via an anonymous context so the test isn't
    // fooled by any admin-level visibility.
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

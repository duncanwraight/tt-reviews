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
    await expect(page).toHaveURL(/\/admin\/equipment-reviews$/);

    const reviewCard = page.locator("li").filter({ hasText: reviewText });
    await expect(reviewCard).toBeVisible();

    // Go through the Form by hitting its action endpoint directly with
    // Playwright's request context — this carries the same session
    // cookies as the page but lets us see the raw response.
    const approveResponse = await page.request.post(
      "/admin/equipment-reviews",
      {
        form: { reviewId: review.id, intent: "approve" },
        maxRedirects: 0,
      }
    );
    // The action returns a 302 redirect on success. 4xx/5xx = failure.
    if (approveResponse.status() >= 400) {
      throw new Error(
        `Approve action returned ${approveResponse.status()}: ${await approveResponse.text()}`
      );
    }

    await expect
      .poll(() => getEquipmentReviewStatus(review.id), { timeout: 10000 })
      .toBe("approved");

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

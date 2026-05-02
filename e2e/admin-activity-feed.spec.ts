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
// TT-127: the Recent Activity widget on /admin reads moderator emails via
// the `get_user_emails_by_ids` RPC against `auth.users`. The old path
// read from `profiles.email`, which was stale or null for any pre-trigger
// user or post-signup email change — the widget rendered "Admin" (the
// literal fallback) for those rows. The profiles table itself was
// dropped in TT-128. This spec asserts the widget surfaces the real
// auth.users email, locking in the auth.users-backed path.

test("recent activity widget shows admin email from auth.users", async ({
  page,
}) => {
  const reviewerEmail = generateTestEmail("activity-r");
  const adminEmail = generateTestEmail("activity-a");
  const { userId: reviewerId } = await createUser(reviewerEmail);
  const { userId: adminId } = await createUser(adminEmail);
  await setUserRole(adminId, "admin");

  const equipment = await getFirstEquipment();
  const reviewText = `TT-127 activity widget marker ${Date.now()}`;
  const review = await insertPendingEquipmentReview({
    userId: reviewerId,
    equipmentId: equipment.id,
    reviewText,
    overallRating: 7,
  });

  try {
    await login(page, adminEmail);

    await page.goto("/admin/equipment-reviews");
    const reviewCard = page.locator("li").filter({ hasText: reviewText });
    await expect(reviewCard).toBeVisible();
    await reviewCard.getByRole("button", { name: /^Approve$/ }).click();

    await expect
      .poll(() => getEquipmentReviewStatus(review.id), { timeout: 10000 })
      .toBe("approved");

    await page.goto("/admin");
    await expect(page).toHaveURL(/\/admin$/);

    // The newest activity row should be this approval, attributed to the
    // admin's actual email — not the "Admin" fallback. Scope the assertion
    // to the Recent Activity card so it isn't satisfied by the admin
    // header showing the same email elsewhere on the page.
    const activityCard = page
      .locator("div", {
        has: page.getByRole("heading", { name: /Recent Activity/i }),
      })
      .first();
    await expect(activityCard).toBeVisible();

    const topEntry = activityCard.locator("li").first();
    // Entity label is now a link to the public view page; the
    // approved-vs-rejected and admin-vs-discord signals moved to icons,
    // so the verb and "(Admin UI)" suffix were dropped.
    const reviewLink = topEntry.getByRole("link", {
      name: "Equipment review",
    });
    await expect(reviewLink).toBeVisible();
    await expect(reviewLink).toHaveAttribute(
      "href",
      `/equipment/${equipment.slug}`
    );
    await expect(topEntry).toContainText(adminEmail);
    await expect(topEntry).not.toContainText("Admin UI");
    await expect(topEntry).not.toContainText(/Admin\s*$/);
  } finally {
    await deleteUser(reviewerId);
    await deleteUser(adminId);
  }
});

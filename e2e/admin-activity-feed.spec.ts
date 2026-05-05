import { test, expect } from "@playwright/test";
import {
  createUser,
  deleteUser,
  generateTestEmail,
  login,
  setUserRole,
} from "./utils/auth";
import {
  createTestEquipment,
  deleteEquipment,
  deleteEquipmentReview,
  getEquipmentReviewStatus,
  insertPendingEquipmentReview,
} from "./utils/data";
// TT-127: the Recent Activity widget on /admin reads moderator emails via
// the `get_user_emails_by_ids` RPC against `auth.users`. The old path
// read from `profiles.email`, which was stale or null for any pre-trigger
// user or post-signup email change — the widget rendered "Admin" (the
// literal fallback) for those rows. The profiles table itself was
// dropped in TT-128. This spec asserts the widget surfaces the real
// auth.users email, locking in the auth.users-backed path.
//
// TT-169: the widget feed is global, so under parallel scheduling
// another spec's approval can land between this test's approval and
// its assertion — `.first()` then picks the wrong row. We avoid both
// halves: hermetic equipment row (so the entity link's `/equipment/:slug`
// is unique to this test) plus a row-scoping filter on that href so we
// only inspect *our* approval regardless of recency.

test("recent activity widget shows admin email from auth.users", async ({
  page,
}) => {
  const reviewerEmail = generateTestEmail("activity-r");
  const adminEmail = generateTestEmail("activity-a");
  const { userId: reviewerId } = await createUser(reviewerEmail);
  const { userId: adminId } = await createUser(adminEmail);
  await setUserRole(adminId, "admin");

  const equipment = await createTestEquipment("activity-feed", "rubber");
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

    // Scope to the Recent Activity card so the assertion isn't satisfied
    // by the admin header showing the same email elsewhere on the page.
    const activityCard = page
      .locator("div", {
        has: page.getByRole("heading", { name: /Recent Activity/i }),
      })
      .first();
    await expect(activityCard).toBeVisible();

    // Find *this* test's row by the unique equipment href. Other parallel
    // specs may insert their own activity rows in this window; without
    // this filter, `.first()` could land on one of theirs and surface a
    // different email.
    const reviewLink = activityCard.getByRole("link", {
      name: "Equipment review",
    });
    const ourEntry = activityCard
      .locator("li")
      .filter({ has: page.locator(`a[href="/equipment/${equipment.slug}"]`) });
    await expect(ourEntry).toBeVisible();

    const ourLink = ourEntry.getByRole("link", { name: "Equipment review" });
    await expect(ourLink).toHaveAttribute(
      "href",
      `/equipment/${equipment.slug}`
    );
    // Sanity: at least one Equipment review link is rendered (catches the
    // entire-widget regression where no entries surface at all).
    await expect(reviewLink.first()).toBeVisible();
    await expect(ourEntry).toContainText(adminEmail);
    // Entity label is now a link to the public view page; the
    // approved-vs-rejected and admin-vs-discord signals moved to icons,
    // so the verb and "(Admin UI)" suffix were dropped.
    await expect(ourEntry).not.toContainText("Admin UI");
    await expect(ourEntry).not.toContainText(/Admin\s*$/);
  } finally {
    await deleteEquipmentReview(review.id);
    await deleteEquipment(equipment.id);
    await deleteUser(reviewerId);
    await deleteUser(adminId);
  }
});

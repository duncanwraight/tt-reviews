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
import { SUPABASE_URL, adminHeaders } from "./utils/supabase";

// TT-127: the Recent Activity widget on /admin reads moderator emails via
// the `get_user_emails_by_ids` RPC against `auth.users`, not via
// `profiles.email`. On production `profiles.email` is unreliable — the
// `handle_new_user` trigger only runs on auth INSERT, so any pre-trigger
// user or post-signup email change leaves it stale. Before the fix the
// widget rendered "Admin" (the literal fallback) for those rows.
//
// To prove the fix: null out the test admin's `profiles.email` *after*
// creating the user, then assert the widget still surfaces the real email
// from `auth.users`. With the old code this would render "Admin (Admin
// UI)" and fail.

test("recent activity widget shows admin email even when profiles.email is null", async ({
  page,
}) => {
  const reviewerEmail = generateTestEmail("activity-r");
  const adminEmail = generateTestEmail("activity-a");
  const { userId: reviewerId } = await createUser(reviewerEmail);
  const { userId: adminId } = await createUser(adminEmail);
  await setUserRole(adminId, "admin");

  // Simulate the prod failure mode: the auth user has an email, but the
  // profiles row's email column is null. The new code path doesn't read
  // profiles at all, so this should not affect the widget output.
  const nullRes = await fetch(
    `${SUPABASE_URL}/rest/v1/profiles?id=eq.${adminId}`,
    {
      method: "PATCH",
      headers: { ...adminHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ email: null }),
    }
  );
  if (!nullRes.ok) {
    throw new Error(
      `Failed to null profiles.email (${nullRes.status}): ${await nullRes.text()}`
    );
  }

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
    await expect(topEntry).toContainText("Equipment review approved");
    await expect(topEntry).toContainText(`by ${adminEmail}`);
    await expect(topEntry).toContainText("(Admin UI)");
    await expect(topEntry).not.toContainText(/^by Admin /);
  } finally {
    await deleteUser(reviewerId);
    await deleteUser(adminId);
  }
});

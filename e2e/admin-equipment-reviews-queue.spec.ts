import { test, expect } from "@playwright/test";
import {
  createUser,
  deleteUser,
  generateTestEmail,
  login,
  setUserRole,
} from "./utils/auth";
import {
  getFirstEquipment,
  insertModeratorApproval,
  insertPendingEquipmentReview,
} from "./utils/data";

// Regression guard for TT-10. The admin equipment-reviews loader used
// to query loadApprovalsForSubmissions(..., "equipment_review", ...);
// the moderator_approvals.submission_type column was renamed to
// "review" by migration 20251231180000, so the query silently returned
// empty and previously-recorded approvals never appeared on the queue.
// This spec plants one approval against a still-pending review and
// asserts the "Approval History" section shows it.
test("admin equipment-reviews queue surfaces a recorded approval on a still-pending review", async ({
  page,
}) => {
  const reviewerEmail = generateTestEmail("revqueue");
  const adminEmail = generateTestEmail("adminqueue");
  const moderatorEmail = generateTestEmail("modqueue");
  const { userId: reviewerId } = await createUser(reviewerEmail);
  const { userId: adminId } = await createUser(adminEmail);
  const { userId: moderatorId } = await createUser(moderatorEmail);
  await setUserRole(adminId, "admin");
  await setUserRole(moderatorId, "moderator");

  const equipment = await getFirstEquipment();
  const reviewText = `Playwright queue marker ${Date.now()}`;
  const review = await insertPendingEquipmentReview({
    userId: reviewerId,
    equipmentId: equipment.id,
    reviewText,
    overallRating: 6,
  });

  try {
    await insertModeratorApproval({
      submissionType: "review",
      submissionId: review.id,
      moderatorId,
      action: "approved",
      source: "admin_ui",
    });

    await login(page, adminEmail);
    await page.goto("/admin/equipment-reviews");

    const reviewCard = page.locator("li").filter({ hasText: reviewText });
    await expect(reviewCard).toBeVisible();
    await expect(reviewCard.getByText("Approval History:")).toBeVisible();
    await expect(reviewCard.getByText(/approved by admin_ui/i)).toBeVisible();
  } finally {
    await deleteUser(reviewerId);
    await deleteUser(adminId);
    await deleteUser(moderatorId);
  }
});

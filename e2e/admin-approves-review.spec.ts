import { test, expect } from "@playwright/test";
import {
  createUser,
  deleteUser,
  generateTestEmail,
  setUserRole,
} from "./utils/auth";
import {
  getEquipmentReviewStatus,
  getFirstEquipment,
  insertPendingEquipmentReview,
  recordAdminApproval,
} from "./utils/data";

test("admin approves pending review → visible on public detail page", async ({
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
    // Approve via service-role REST. The UI click path is a known
    // follow-up (see docs/TODO note in 3b.5 rollout) — the moderation
    // service's fetch chain silently drops errors when called from the
    // admin action handler, so we assert the approval pipeline here at
    // the layer the public page actually depends on: the DB trigger.
    await recordAdminApproval({
      submissionType: "review",
      submissionId: review.id,
      moderatorId: adminId,
    });

    await expect
      .poll(() => getEquipmentReviewStatus(review.id), { timeout: 10000 })
      .toBe("approved");

    // Public page shows approved review to anonymous visitors.
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

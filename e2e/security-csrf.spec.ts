import { test, expect } from "@playwright/test";
import {
  createUser,
  deleteUser,
  generateTestEmail,
  login,
  setUserRole,
} from "./utils/auth";
import { getFirstEquipment, insertPendingEquipmentReview } from "./utils/data";

// Phase 2 of SECURITY.md: CSRF tokens used to be signed with a hardcoded
// fallback because `process.env.SESSION_SECRET` is undefined on Workers.
// This spec proves the admin action path now (a) requires a token, and
// (b) rejects a forged / tampered one. The positive path is already
// covered by admin-approves-review.spec.ts — if that spec still passes,
// valid tokens still round-trip correctly.

test("admin action rejects POST with no CSRF token", async ({
  page,
  request,
}) => {
  const reviewerEmail = generateTestEmail("csrf-reviewer");
  const adminEmail = generateTestEmail("csrf-admin");
  const { userId: reviewerId } = await createUser(reviewerEmail);
  const { userId: adminId } = await createUser(adminEmail);
  await setUserRole(adminId, "admin");

  const equipment = await getFirstEquipment();
  const review = await insertPendingEquipmentReview({
    userId: reviewerId,
    equipmentId: equipment.id,
    reviewText: `csrf missing-token probe ${Date.now()}`,
    overallRating: 5,
  });

  try {
    await login(page, adminEmail);

    // Piggy-back on the authenticated browser's cookies for the raw
    // POST. `request.storageState` is a no-arg getter here — we take it
    // from `page.context()` and pass it to `request.post` via extraHTTP.
    const cookies = await page.context().cookies();
    const cookieHeader = cookies.map(c => `${c.name}=${c.value}`).join("; ");

    const form = new URLSearchParams();
    form.set("intent", "approve");
    form.set("reviewId", review.id);
    // Intentionally no _csrf field.

    const response = await request.post("/admin/equipment-reviews", {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Cookie: cookieHeader,
      },
      data: form.toString(),
      maxRedirects: 0,
    });

    // React Router v7 re-renders the UI route alongside a returned
    // Response from an action, so the body is HTML — but the status is
    // the contract we care about for CSRF rejection.
    expect(response.status()).toBe(403);
  } finally {
    await deleteUser(reviewerId);
    await deleteUser(adminId);
  }
});

test("admin action rejects POST with forged CSRF token", async ({
  page,
  request,
}) => {
  const reviewerEmail = generateTestEmail("csrf-reviewer2");
  const adminEmail = generateTestEmail("csrf-admin2");
  const { userId: reviewerId } = await createUser(reviewerEmail);
  const { userId: adminId } = await createUser(adminEmail);
  await setUserRole(adminId, "admin");

  const equipment = await getFirstEquipment();
  const review = await insertPendingEquipmentReview({
    userId: reviewerId,
    equipmentId: equipment.id,
    reviewText: `csrf forged-token probe ${Date.now()}`,
    overallRating: 5,
  });

  try {
    await login(page, adminEmail);

    // Scrape a real token from the admin page, then tamper with its
    // signature byte. The server must reject it.
    await page.goto("/admin/equipment-reviews");
    const validToken = await page
      .locator('input[name="_csrf"]')
      .first()
      .getAttribute("value");
    expect(validToken, "expected form to include a _csrf input").toBeTruthy();

    const decoded = JSON.parse(
      Buffer.from(validToken!, "base64url").toString()
    );
    const sig = decoded.signature as string;
    decoded.signature = sig.slice(0, -1) + (sig.slice(-1) === "0" ? "1" : "0");
    const forged = Buffer.from(JSON.stringify(decoded)).toString("base64url");

    const cookies = await page.context().cookies();
    const cookieHeader = cookies.map(c => `${c.name}=${c.value}`).join("; ");

    const form = new URLSearchParams();
    form.set("_csrf", forged);
    form.set("intent", "approve");
    form.set("reviewId", review.id);

    const response = await request.post("/admin/equipment-reviews", {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Cookie: cookieHeader,
      },
      data: form.toString(),
      maxRedirects: 0,
    });

    expect(response.status()).toBe(403);
  } finally {
    await deleteUser(reviewerId);
    await deleteUser(adminId);
  }
});

import { test, expect } from "@playwright/test";
import {
  createUser,
  deleteUser,
  generateTestEmail,
  login,
  setUserRole,
} from "./utils/auth";

// TT-24 / SECURITY.md Phase 8 follow-up. Admin routes already gate on
// CSRF + admin role, but had no throughput cap — a compromised admin
// cred could fire unlimited moderation actions. `enforceAdminActionGate`
// now enforces 30/60s per admin via ADMIN_RATE_LIMITER. The bucket keys
// on user.id, not client IP, so rotating IPs does not bypass the cap.
//
// This spec exercises the in-memory fallback (the CF binding isn't
// available under the Vite dev server used by `npm run test:e2e`) but
// pins the same /admin endpoint behaviour — the key generator shape
// doesn't differ between the binding and the fallback path.

test("burst of admin POSTs returns at least one 429", async ({
  page,
  request,
}) => {
  const adminEmail = generateTestEmail("rl-admin");
  const { userId: adminId } = await createUser(adminEmail);
  await setUserRole(adminId, "admin");

  try {
    await login(page, adminEmail);

    // Scrape a valid CSRF token so the rate limit — not CSRF — is what
    // rejects the burst. Without this, every POST 403s before reaching
    // the rate-limit check.
    await page.goto("/admin/equipment-reviews");
    const validToken = await page
      .locator('input[name="_csrf"]')
      .first()
      .getAttribute("value");
    expect(validToken, "expected form to include a _csrf input").toBeTruthy();

    const cookies = await page.context().cookies();
    const cookieHeader = cookies.map(c => `${c.name}=${c.value}`).join("; ");

    // ADMIN_ACTION budget is 30/60s. 35 parallel POSTs with a
    // deliberately malformed form body — the action rejects each with a
    // 4xx once it parses, but the rate-limit gate runs before that, so
    // the 31st+ attempts short-circuit to 429 regardless of the payload.
    const form = new URLSearchParams();
    form.set("_csrf", validToken!);
    form.set("intent", "approve");
    form.set("reviewId", "00000000-0000-0000-0000-000000000000");

    const attempts = [];
    for (let i = 0; i < 35; i++) {
      attempts.push(
        request.post("/admin/equipment-reviews", {
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            Cookie: cookieHeader,
          },
          data: form.toString(),
          maxRedirects: 0,
        })
      );
    }
    const responses = await Promise.all(attempts);
    const statuses = responses.map(r => r.status());
    const blocked = statuses.filter(s => s === 429);

    expect(
      blocked.length,
      `expected at least one 429; statuses were ${statuses.join(",")}`
    ).toBeGreaterThan(0);
  } finally {
    await deleteUser(adminId);
  }
});

import { test, expect } from "@playwright/test";
import {
  createUser,
  deleteUser,
  generateTestEmail,
  login,
  setUserRole,
} from "./utils/auth";
import { SUPABASE_URL, adminHeaders } from "./utils/supabase";

/**
 * TT-80 — manufacturer description on equipment.
 *
 * Covers the column end-to-end: public submission writes description to
 * equipment_submissions, admin approval copies it onto the live equipment
 * row, and the public detail page surfaces it as the "Description:" row
 * inside the manufacturer specs card. Validator + DB CHECK length cap is
 * unit-tested separately in app/lib/submissions/__tests__/validate.server.test.ts.
 */
test("equipment submission with description persists through approval to public detail", async ({
  page,
  browser,
}) => {
  const submitterEmail = generateTestEmail("submitter-desc");
  const adminEmail = generateTestEmail("admin-desc");
  const { userId: submitterId } = await createUser(submitterEmail);
  const { userId: adminId } = await createUser(adminEmail);
  await setUserRole(adminId, "admin");

  const uniqueName = `e2e Description Blade ${Date.now()}`;
  const description =
    "Crisp, fast all-wood blade with excellent control on short pushes.";

  try {
    // 1. User submits new equipment with a description.
    await login(page, submitterEmail);
    await page.goto("/submissions/equipment/submit");
    await page.getByLabel(/^Equipment Name/i).fill(uniqueName);
    await page.getByLabel(/^Manufacturer/i).fill("E2E Manufacturer");
    await page.getByLabel(/^Category/i).selectOption("blade");
    await page.getByLabel(/^Description/i).fill(description);
    await page.getByRole("button", { name: /Submit Equipment/i }).click();
    await page.waitForURL("/profile", { timeout: 20000 });

    // 2. Submission row carries the description.
    const submissionRes = await fetch(
      `${SUPABASE_URL}/rest/v1/equipment_submissions?user_id=eq.${submitterId}&select=id,description,status`,
      { headers: adminHeaders() }
    );
    if (!submissionRes.ok) {
      throw new Error(`submission fetch failed (${submissionRes.status})`);
    }
    const submissions = (await submissionRes.json()) as Array<{
      id: string;
      description: string | null;
      status: string;
    }>;
    expect(submissions).toHaveLength(1);
    expect(submissions[0].description).toBe(description);

    // 3. Admin approves the submission. Single click suffices because the
    //    update_submission_status trigger treats source='admin_ui' as a
    //    complete approval (admin_ui_single_approval migration); the
    //    Discord-source path still needs two.
    await page
      .getByRole("button", { name: /Logout/i })
      .first()
      .click();
    await login(page, adminEmail);
    await page.goto("/admin/equipment-submissions");

    const card = page.locator("li, article").filter({ hasText: uniqueName });
    await expect(card.first()).toBeVisible();
    await card
      .first()
      .getByRole("button", { name: /^Approve$/ })
      .click();

    // Poll the live equipment table for the row created by the approval-
    // copy step in admin.equipment-submissions.tsx.
    let liveRow: { slug: string; description: string | null } | null = null;
    await expect
      .poll(
        async () => {
          const res = await fetch(
            `${SUPABASE_URL}/rest/v1/equipment?name=eq.${encodeURIComponent(uniqueName)}&select=slug,description`,
            { headers: adminHeaders() }
          );
          if (!res.ok) return null;
          const rows = (await res.json()) as Array<{
            slug: string;
            description: string | null;
          }>;
          if (rows.length === 0) return null;
          liveRow = rows[0];
          return liveRow.description;
        },
        { timeout: 15000 }
      )
      .toBe(description);

    // 4. Public detail page renders the description as the "Description:"
    //    row attached to the bottom of the manufacturer specs card.
    const anonContext = await browser.newContext();
    const anonPage = await anonContext.newPage();
    try {
      await anonPage.goto(`/equipment/${liveRow!.slug}`);
      await expect(anonPage.getByText("Description:")).toBeVisible();
      await expect(anonPage.getByText(description)).toBeVisible();
    } finally {
      await anonContext.close();
    }
  } finally {
    // Cleanup: delete the live equipment row created by approval, then
    // the users (submission + reviews cascade off auth.users).
    await fetch(
      `${SUPABASE_URL}/rest/v1/equipment?name=eq.${encodeURIComponent(uniqueName)}`,
      { method: "DELETE", headers: adminHeaders() }
    );
    await deleteUser(submitterId);
    await deleteUser(adminId);
  }
});

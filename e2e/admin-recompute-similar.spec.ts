import { test, expect } from "@playwright/test";
import {
  createUser,
  deleteUser,
  generateTestEmail,
  login,
  setUserRole,
} from "./utils/auth";
import { SUPABASE_URL, adminHeaders } from "./utils/supabase";

// TT-70: admin manual trigger for the equipment-similar recompute job.
// Asserts the button on the admin dashboard runs the job end-to-end against
// the local DB, populates equipment_similar, and surfaces a success message.
// TT-82: also asserts the status indicator transitions from the "never run"
// empty state into "Last run: just now — N pairs" without a page reload.
// Memory note: new server-side data paths need e2e — mocked-Supabase unit
// tests don't catch RLS / PostgREST query-shape bugs.

test("admin can trigger similar-equipment recompute and writes rows", async ({
  page,
}) => {
  const adminEmail = generateTestEmail("recomp");
  const { userId: adminId } = await createUser(adminEmail);
  await setUserRole(adminId, "admin");

  try {
    // Clear any stale rows from a previous local run so the assertion is
    // honest. Filter is required by PostgREST; rank >= 0 covers everything.
    await fetch(`${SUPABASE_URL}/rest/v1/equipment_similar?rank=gte.0`, {
      method: "DELETE",
      headers: adminHeaders(),
    });

    await login(page, adminEmail);
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/admin$/);

    // Empty table → indicator should render the "Never run" copy initially.
    await expect(page.getByTestId("recompute-similar-never-run")).toBeVisible();

    const button = page.getByTestId("recompute-similar-button");
    await expect(button).toBeVisible();
    await button.click();

    // Action runs against the seeded equipment + reviews — finishes in
    // milliseconds, but give it slack on slow CI.
    const success = page.getByTestId("recompute-similar-success");
    await expect(success).toBeVisible({ timeout: 30_000 });
    await expect(success).toContainText(/Recomputed \d+ pairs/);

    // Status indicator updates from the action result without a reload.
    const lastRun = page.getByTestId("recompute-similar-last-run");
    await expect(lastRun).toBeVisible();
    await expect(lastRun).toHaveText("just now");

    const pairCount = page.getByTestId("recompute-similar-pair-count");
    await expect(pairCount).toBeVisible();
    const pairText = (await pairCount.textContent()) ?? "";
    expect(parseInt(pairText.replace(/[^0-9]/g, ""), 10)).toBeGreaterThan(0);

    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/equipment_similar?select=equipment_id,similar_equipment_id,rank&limit=5`,
      { headers: adminHeaders() }
    );
    expect(res.ok).toBe(true);
    const rows = (await res.json()) as Array<{ rank: number }>;
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every(r => r.rank >= 1 && r.rank <= 6)).toBe(true);
  } finally {
    await deleteUser(adminId);
  }
});

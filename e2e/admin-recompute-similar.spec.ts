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
// TT-82 (pipeline): a second test exercises compute → store → load → render
// end-to-end so the cron's full payoff (similar items showing up on detail
// pages) is verified, not just the recompute write path.
// Memory note: new server-side data paths need e2e — mocked-Supabase unit
// tests don't catch RLS / PostgREST query-shape bugs.
//
// Serial: both tests truncate equipment_similar at start, so running them in
// parallel would cause the empty-state assertion in one to flake against
// rows the other has just written.

const PIPELINE_ANCHOR_SLUG = "butterfly-viscaria";

async function clearEquipmentSimilar(): Promise<void> {
  // PostgREST DELETE requires a filter; rank >= 0 covers every row.
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/equipment_similar?rank=gte.0`,
    { method: "DELETE", headers: adminHeaders() }
  );
  if (!res.ok && res.status !== 404) {
    throw new Error(
      `clearEquipmentSimilar failed (${res.status}): ${await res.text()}`
    );
  }
}

test.describe
  .serial("Equipment-similar recompute → detail page pipeline", () => {
  test("admin can trigger similar-equipment recompute and writes rows", async ({
    page,
  }) => {
    const adminEmail = generateTestEmail("recomp");
    const { userId: adminId } = await createUser(adminEmail);
    await setUserRole(adminId, "admin");

    try {
      await clearEquipmentSimilar();

      await login(page, adminEmail);
      await page.goto("/admin");
      await expect(page).toHaveURL(/\/admin$/);

      // Empty table → indicator should render the "Never run" copy initially.
      await expect(
        page.getByTestId("recompute-similar-never-run")
      ).toBeVisible();

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

  test("recompute populates the similar section on a detail page (full pipeline)", async ({
    page,
  }) => {
    const adminEmail = generateTestEmail("pipeline");
    const { userId: adminId } = await createUser(adminEmail);
    await setUserRole(adminId, "admin");

    try {
      // (a) Empty table → detail page must NOT render the section.
      await clearEquipmentSimilar();

      await page.goto(`/equipment/${PIPELINE_ANCHOR_SLUG}`);
      await expect(
        page.getByRole("heading", { name: /Manufacturer specifications/ })
      ).toBeVisible();
      await expect(page.getByTestId("similar-equipment-section")).toHaveCount(
        0
      );

      // (b) Trigger recompute via the admin button — same code the cron runs.
      await login(page, adminEmail);
      await page.goto("/admin");
      await page.getByTestId("recompute-similar-button").click();
      await expect(page.getByTestId("recompute-similar-success")).toBeVisible({
        timeout: 30_000,
      });

      // (c) Detail page now shows similar items picked by the algorithm.
      // Anonymous read works because equipment_similar has a public select
      // policy — no need to remain logged in for this assertion.
      await page.goto(`/equipment/${PIPELINE_ANCHOR_SLUG}`);
      const section = page.getByTestId("similar-equipment-section");
      await expect(section).toBeVisible();
      await expect(
        section.getByRole("heading", { name: /^Similar Blades$/ })
      ).toBeVisible();

      const cards = section.locator('a[href^="/equipment/"]');
      const count = await cards.count();
      expect(count).toBeGreaterThanOrEqual(2);

      // Every card links somewhere other than the anchor itself — the
      // algorithm must exclude self-pairings (CHECK constraint enforces it
      // at the DB level, but verify via the rendered hrefs too).
      for (let i = 0; i < count; i++) {
        const href = await cards.nth(i).getAttribute("href");
        expect(href).toMatch(/^\/equipment\/[^/]+$/);
        expect(href).not.toBe(`/equipment/${PIPELINE_ANCHOR_SLUG}`);
      }
    } finally {
      await deleteUser(adminId);
    }
  });
});

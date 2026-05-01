import { test, expect } from "@playwright/test";
import {
  createUser,
  deleteUser,
  generateTestEmail,
  login,
  setUserRole,
} from "./utils/auth";
import { SUPABASE_URL, adminHeaders } from "./utils/supabase";

// TT-131 regression coverage for the player submission route. Three
// links of the original chain were broken at the form layer:
//
//   1. Ticking "Include Equipment Setup" 500'd because the action
//      was inserting `include_equipment` (a UI-only toggle) into
//      player_submissions, hitting PGRST204.
//   2. Filling year / source_url under the toggle never reached the
//      submission row because the action only extracted those for
//      submissionType === "player_equipment_setup".
//   3. Adding videos via VideoSubmissionSection emitted bracketed
//      `videos[N][...]` hidden inputs, but the action never parsed
//      them.
//
// This spec drives the form end-to-end with the toggle on, plus a
// couple of videos, and asserts the resulting player_submissions row
// carries the data the cascade applier needs on approval. The
// approve-then-cascade path is covered by the discord-applier spec —
// keeping these scopes separate keeps each test small and the
// failure mode obvious.

interface PlayerSubmissionRow {
  id: string;
  name: string;
  highest_rating: string | null;
  equipment_setup: Record<string, unknown>;
  videos: unknown;
}

async function getPlayerSubmissionsForUser(
  userId: string
): Promise<PlayerSubmissionRow[]> {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/player_submissions?user_id=eq.${userId}&select=id,name,highest_rating,equipment_setup,videos&order=created_at.desc`,
    { headers: adminHeaders() }
  );
  return res.json();
}

async function deletePlayerSubmissionsForUser(userId: string): Promise<void> {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/player_submissions?user_id=eq.${userId}`,
    { method: "DELETE", headers: adminHeaders() }
  );
  if (!res.ok && res.status !== 404) {
    throw new Error(
      `deletePlayerSubmissions failed (${res.status}): ${await res.text()}`
    );
  }
}

test.describe("Player submission flow", () => {
  let userId: string;
  let userEmail: string;

  test.beforeAll(async () => {
    userEmail = generateTestEmail("player-submitter");
    const created = await createUser(userEmail);
    userId = created.userId;
    // Admin role to skip rate limit so parallel workers don't drain
    // the bucket — same trick user-submits.spec.ts uses.
    await setUserRole(userId, "admin");
  });

  test.afterAll(async () => {
    if (userId) await deleteUser(userId);
  });

  test.beforeEach(async ({ page }) => {
    await deletePlayerSubmissionsForUser(userId);
    await login(page, userEmail);
  });

  test("submits a player with include_equipment + videos → row carries equipment_setup + videos JSONB", async ({
    page,
  }) => {
    const ts = Date.now();
    const playerName = `e2e-player-${ts}`;

    await page.goto("/submissions/player/submit");
    await expect(
      page.getByRole("heading", { name: /Submit New Player/i })
    ).toBeVisible();

    await page.getByLabel(/^Player Name/i).fill(playerName);
    await page.getByLabel(/^Highest Rating/i).fill("2700");

    // Tick the toggle and fill the simple fields exposed by
    // PlayerEquipmentSetup. blade/rubber comboboxes are skipped here
    // — the cascade applier's mapping is unit-tested directly, and
    // this spec only needs to prove the action stops 500ing on the
    // toggle and routes year/source through onto equipment_setup.
    await page.getByLabel("Include Equipment Setup").check();
    await page.getByLabel(/^Year$/).fill("2024");
    await page.getByLabel(/^Source URL$/).fill("https://example.com/source");

    // Add two videos via the VideoSubmissionSection.
    await page.getByLabel(/Video URL/i).fill("https://youtube.com/watch?v=v1");
    await page.getByLabel(/Video Title/i).fill("E2E Match Final");
    await page.getByRole("button", { name: /Add Video/i }).click();
    await page
      .getByLabel(/Video URL/i)
      .fill("https://example.com/practice.mp4");
    await page.getByLabel(/Video Title/i).fill("E2E Practice Clip");
    await page.getByRole("button", { name: /Add Video/i }).click();

    await page.getByRole("button", { name: /Submit Player/i }).click();

    // Submitting redirects to /profile (player config.redirectPath).
    await page.waitForURL("/profile", { timeout: 20000 });

    const rows = await getPlayerSubmissionsForUser(userId);
    expect(rows).toHaveLength(1);
    const row = rows[0];
    expect(row.name).toBe(playerName);
    expect(row.highest_rating).toBe("2700");
    // include_equipment toggle no longer 500s — the row exists at all.
    // equipment_setup carries the year + source_url even though the
    // combobox-driven fields were left blank.
    expect(row.equipment_setup).toMatchObject({
      year: 2024,
      source_url: "https://example.com/source",
    });
    // Videos JSONB carries both entries with platform inferred from
    // the URL by the client-side YouTube detector.
    expect(Array.isArray(row.videos)).toBe(true);
    const videos = row.videos as Array<{
      url: string;
      title: string;
      platform: string;
    }>;
    expect(videos).toHaveLength(2);
    expect(videos[0]).toMatchObject({
      url: "https://youtube.com/watch?v=v1",
      title: "E2E Match Final",
      platform: "youtube",
    });
    expect(videos[1]).toMatchObject({
      url: "https://example.com/practice.mp4",
      title: "E2E Practice Clip",
      platform: "other",
    });
  });

  test("submits a bare player with no equipment + no videos still lands a row", async ({
    page,
  }) => {
    // Locks the basic happy path so the equipment_setup parsing
    // doesn't accidentally regress the no-toggle flow.
    const ts = Date.now();
    const playerName = `e2e-bare-player-${ts}`;

    await page.goto("/submissions/player/submit");
    await page.getByLabel(/^Player Name/i).fill(playerName);
    await page.getByRole("button", { name: /Submit Player/i }).click();
    await page.waitForURL("/profile", { timeout: 20000 });

    const rows = await getPlayerSubmissionsForUser(userId);
    expect(rows).toHaveLength(1);
    expect(rows[0].equipment_setup).toEqual({});
    expect(rows[0].videos).toEqual([]);
  });
});

import { test, expect } from "@playwright/test";
import {
  createUser,
  deleteUser,
  generateTestEmail,
  login,
  setUserRole,
} from "./utils/auth";
import { SUPABASE_URL, adminHeaders } from "./utils/supabase";

// TT-225: round-trip for the amateur submission path. The public
// /submissions/player/submit form now has a kind toggle (Pro /
// Amateur) plus per-kind peak inputs; an admin moderation approval
// must land a players row with player_kind='amateur' and the typed
// peak_rating_value / peak_rating_year populated.
//
// This is the kind of cross-cutting integration the e2e-for-new-
// data-paths memory rule calls for: the form / validator / applier
// each have their own unit tests, but only this spec catches a
// PostgREST embed shape bug or a kind-flip that the validator
// missed.

test.describe.configure({ mode: "serial" });

interface PlayerSubmissionRow {
  id: string;
  name: string;
  player_kind: string;
  peak_rating_value: number | null;
  peak_rating_year: number | null;
  status: string;
}

async function getSubmissionsForUser(
  userId: string
): Promise<PlayerSubmissionRow[]> {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/player_submissions?user_id=eq.${userId}&select=id,name,player_kind,peak_rating_value,peak_rating_year,status&order=created_at.desc`,
    { headers: adminHeaders() }
  );
  return res.json();
}

async function deleteSubmissionsForUser(userId: string): Promise<void> {
  await fetch(
    `${SUPABASE_URL}/rest/v1/player_submissions?user_id=eq.${userId}`,
    {
      method: "DELETE",
      headers: adminHeaders(),
    }
  );
}

async function deletePlayerBySlug(slug: string): Promise<void> {
  await fetch(`${SUPABASE_URL}/rest/v1/players?slug=eq.${slug}`, {
    method: "DELETE",
    headers: adminHeaders(),
  });
}

test("amateur path: user submits → admin approves → row lands with player_kind=amateur", async ({
  page,
}) => {
  const submitterEmail = generateTestEmail("amateur-sub");
  const adminEmail = generateTestEmail("amateur-adm");
  const { userId: submitterId } = await createUser(submitterEmail);
  const { userId: adminId } = await createUser(adminEmail);
  await setUserRole(submitterId, "admin");
  await setUserRole(adminId, "admin");

  const ts = Date.now();
  const playerName = `e2e Amateur ${ts}`;
  const slug = `e2e-amateur-${ts}`;

  try {
    // Phase 1 — submitter fills the form with kind=amateur + typed
    // peak rating value.
    await login(page, submitterEmail);
    await deleteSubmissionsForUser(submitterId);

    await page.goto("/submissions/player/submit");
    await page.getByLabel(/^Player Name/i).fill(playerName);

    // Pick Amateur from the kind select. After selection the amateur
    // peak inputs mount; the pro inputs unmount.
    await page.locator('select[name="player_kind"]').selectOption("amateur");
    await expect(page.locator('input[name="peak_rating_value"]')).toBeVisible();
    await expect(page.locator('input[name="peak_world_rank"]')).toHaveCount(0);

    await page.locator('input[name="peak_rating_value"]').fill("2350");
    await page.locator('input[name="peak_rating_year"]').fill("2023");
    // Represents drives the country-derived rating label at render
    // time. Pick GER so the eventual /players card reads "TTR".
    await page.locator('select[name="represents"]').selectOption("GER");

    await page.getByRole("button", { name: /Submit Player/i }).click();
    await page.waitForURL("/profile", { timeout: 20000 });

    const rows = await getSubmissionsForUser(submitterId);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      name: playerName,
      player_kind: "amateur",
      peak_rating_value: 2350,
      peak_rating_year: 2023,
      status: "pending",
    });

    // Phase 2 — admin approves via /admin/player-submissions. The
    // applier (TT-225) writes the typed peak fields + player_kind
    // onto the players row.
    await page
      .getByRole("button", { name: /Logout/i })
      .first()
      .click();
    await login(page, adminEmail);
    await page.goto("/admin/player-submissions");

    const card = page.locator("li").filter({ hasText: playerName }).first();
    await expect(card).toBeVisible();
    await card.getByRole("button", { name: /^Approve$/ }).click();

    // Wait for the players row to materialise.
    await expect
      .poll(
        async () => {
          const res = await fetch(
            `${SUPABASE_URL}/rest/v1/players?name=eq.${encodeURIComponent(playerName)}&select=slug,player_kind,peak_rating_value,peak_rating_year`,
            { headers: adminHeaders() }
          );
          const list = (await res.json()) as Array<{
            slug: string;
            player_kind: string;
            peak_rating_value: number | null;
            peak_rating_year: number | null;
          }>;
          return list[0] ?? null;
        },
        { timeout: 15000 }
      )
      .toMatchObject({
        player_kind: "amateur",
        peak_rating_value: 2350,
        peak_rating_year: 2023,
      });

    // Capture the actual slug for cleanup (generateSlug strips spaces
    // + lowercases, so the predicted shape may not exactly match).
    const playerRes = await fetch(
      `${SUPABASE_URL}/rest/v1/players?name=eq.${encodeURIComponent(playerName)}&select=slug`,
      { headers: adminHeaders() }
    );
    const playerList = (await playerRes.json()) as Array<{ slug: string }>;
    if (playerList[0]?.slug) {
      await deletePlayerBySlug(playerList[0].slug);
    } else {
      await deletePlayerBySlug(slug);
    }
  } finally {
    await deleteSubmissionsForUser(submitterId);
    await deleteUser(submitterId);
    await deleteUser(adminId);
  }
});

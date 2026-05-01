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
 * TT-108 — player_edit submission flow end-to-end. Mirrors the shape of
 * equipment-edit-flow.spec.ts so the two edit-style submissions have
 * consistent coverage.
 *
 * The relevant audit-and-fix outcome from TT-108 is the new "no
 * meaningful change" gate in submissions.$type.submit.tsx — submitting
 * the form with only an edit_reason and no field changes used to land
 * an empty-edit_data row in the moderation queue. This spec drives the
 * full UI flow:
 *
 *   1. submit empty edit (only edit_reason filled) → 400 + error banner
 *   2. submit a real field change → row created, moderator can apply it
 *
 * Suite is serial + admin submitter for the same reason as the
 * equipment_edit suite: the FORM_SUBMISSION rate limiter is keyed by
 * client IP and Playwright's loopback IP is shared across workers.
 */
test.describe.configure({ mode: "serial" });

interface CreatedPlayer {
  id: string;
  slug: string;
  name: string;
}

async function createTestPlayer(): Promise<CreatedPlayer> {
  const ts = Date.now();
  const name = `e2e Pe Original ${ts}`;
  const slug = `e2e-pe-${ts}`;
  const res = await fetch(`${SUPABASE_URL}/rest/v1/players`, {
    method: "POST",
    headers: { ...adminHeaders(), Prefer: "return=representation" },
    body: JSON.stringify({ name, slug, active: true }),
  });
  if (!res.ok) {
    throw new Error(
      `seed player insert failed (${res.status}): ${await res.text()}`
    );
  }
  const rows = (await res.json()) as Array<{ id: string; slug: string }>;
  return { id: rows[0].id, slug: rows[0].slug, name };
}

async function deleteTestPlayer(id: string): Promise<void> {
  await fetch(`${SUPABASE_URL}/rest/v1/players?id=eq.${id}`, {
    method: "DELETE",
    headers: adminHeaders(),
  });
}

test("player_edit: empty submission rejected with 'No changes detected' banner", async ({
  page,
}) => {
  const submitterEmail = generateTestEmail("pe-empty-sub");
  const { userId: submitterId } = await createUser(submitterEmail);
  // Admin to skip the IP-keyed FORM_SUBMISSION rate limiter — see the
  // suite docstring above.
  await setUserRole(submitterId, "admin");

  const player = await createTestPlayer();

  try {
    await login(page, submitterEmail);
    await page.goto(`/submissions/player_edit/submit?player_id=${player.id}`);

    // Fill ONLY edit_reason (which is required) — no actual field
    // changes. The server gate must reject this; edit_reason alone
    // is not a meaningful change.
    await page.getByLabel(/^Reason for Changes/i).fill("e2e empty edit");
    await page.getByRole("button", { name: /Submit Changes/i }).click();

    // Expect the rejection banner. Stay on the same URL — submission
    // was blocked at the action.
    await expect(page.getByText(/No changes detected/i)).toBeVisible();
    expect(page.url()).toContain("/submissions/player_edit/submit");

    // No player_edits row was inserted for this submitter.
    const editsRes = await fetch(
      `${SUPABASE_URL}/rest/v1/player_edits?user_id=eq.${submitterId}&select=id`,
      { headers: adminHeaders() }
    );
    const edits = (await editsRes.json()) as Array<{ id: string }>;
    expect(edits).toHaveLength(0);
  } finally {
    await deleteTestPlayer(player.id);
    await deleteUser(submitterId);
  }
});

test("player_edit: real field change submits and lands in the moderation queue", async ({
  page,
}) => {
  const submitterEmail = generateTestEmail("pe-real-sub");
  const { userId: submitterId } = await createUser(submitterEmail);
  await setUserRole(submitterId, "admin");

  const player = await createTestPlayer();
  const newRating = "3050+";

  try {
    await login(page, submitterEmail);
    await page.goto(`/submissions/player_edit/submit?player_id=${player.id}`);

    // Fill at least one editable field.
    await page.getByLabel(/^Highest Rating/i).fill(newRating);
    await page.getByLabel(/^Reason for Changes/i).fill("e2e real edit");
    await page.getByRole("button", { name: /Submit Changes/i }).click();

    await page.waitForURL("/profile", { timeout: 20000 });

    // Pending player_edit row exists and carries the field change.
    const editsRes = await fetch(
      `${SUPABASE_URL}/rest/v1/player_edits?user_id=eq.${submitterId}&select=id,edit_data,status`,
      { headers: adminHeaders() }
    );
    const edits = (await editsRes.json()) as Array<{
      id: string;
      edit_data: Record<string, unknown>;
      status: string;
    }>;
    expect(edits).toHaveLength(1);
    expect(edits[0].status).toBe("pending");
    expect(edits[0].edit_data.highest_rating).toBe(newRating);
    expect(edits[0].edit_data.edit_reason).toBe("e2e real edit");

    // Cleanup the edit row so the test is self-contained.
    await fetch(`${SUPABASE_URL}/rest/v1/player_edits?id=eq.${edits[0].id}`, {
      method: "DELETE",
      headers: adminHeaders(),
    });
  } finally {
    await deleteTestPlayer(player.id);
    await deleteUser(submitterId);
  }
});

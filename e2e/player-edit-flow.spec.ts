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
 * TT-108 / TT-129 — player_edit submission flow end-to-end. Mirrors the
 * shape of equipment-edit-flow.spec.ts so the two edit-style submissions
 * have consistent coverage.
 *
 * Coverage:
 *   1. pre-fill: form renders with the current player's values (TT-129).
 *   2. submit empty edit (no field changes, only edit_reason) → 400 +
 *      error banner. The "no meaningful change" gate keeps empty-edit_data
 *      rows out of the moderation queue (TT-108 audit outcome).
 *   3. real field change → row created carrying the diff.
 *   4. clear-a-field: clearing a pre-filled optional field encodes
 *      `null` in edit_data and the applier nulls the column on approval
 *      (TT-129).
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

interface PlayerSeedOverrides {
  active_years?: string | null;
  active?: boolean;
}

async function createTestPlayer(
  overrides: PlayerSeedOverrides = {}
): Promise<CreatedPlayer> {
  const ts = Date.now();
  const name = `e2e Pe Original ${ts}`;
  const slug = `e2e-pe-${ts}`;
  const res = await fetch(`${SUPABASE_URL}/rest/v1/players`, {
    method: "POST",
    headers: { ...adminHeaders(), Prefer: "return=representation" },
    body: JSON.stringify({ name, slug, active: true, ...overrides }),
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

test("player_edit: form pre-fills from the current player row", async ({
  page,
}) => {
  // TT-129: form pre-fills text fields from the players row so the
  // submitter sees and edits the current state instead of working
  // against blank fields. Locks in pre-fill for name + the optional
  // text fields used downstream by the diff/clear tests.
  const submitterEmail = generateTestEmail("pe-prefill-sub");
  const { userId: submitterId } = await createUser(submitterEmail);
  await setUserRole(submitterId, "admin");

  const player = await createTestPlayer({
    active_years: "2010-present",
  });

  try {
    await login(page, submitterEmail);
    await page.goto(`/submissions/player_edit/submit?player_id=${player.id}`);

    await expect(page.locator('input[name="name"]')).toHaveValue(player.name);
    await expect(page.locator('input[name="active_years"]')).toHaveValue(
      "2010-present"
    );
    // active is a select pre-filled with the boolean cast to string —
    // seeded `active: true` should land "true" so the visible label is
    // "Active".
    await expect(page.locator('select[name="active"]')).toHaveValue("true");
  } finally {
    await deleteTestPlayer(player.id);
    await deleteUser(submitterId);
  }
});

test("player_edit: empty submission rejected with 'No changes detected' banner", async ({
  page,
}) => {
  const submitterEmail = generateTestEmail("pe-empty-sub");
  const { userId: submitterId } = await createUser(submitterEmail);
  // Admin to skip the IP-keyed FORM_SUBMISSION rate limiter — see the
  // suite docstring above.
  await setUserRole(submitterId, "admin");

  const player = await createTestPlayer({ active_years: "2010-2020" });

  try {
    await login(page, submitterEmail);
    await page.goto(`/submissions/player_edit/submit?player_id=${player.id}`);

    // With pre-fill (TT-129), every text field already carries the
    // current value. Filling ONLY edit_reason and submitting must
    // still trip the no-meaningful-change gate — pre-fills don't
    // count as changes.
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
  const newActiveYears = "2005-2025";

  try {
    await login(page, submitterEmail);
    await page.goto(`/submissions/player_edit/submit?player_id=${player.id}`);

    // Fill at least one editable field. Playwright fill() on a
    // controlled React input pre-filled by the loader leaves the
    // original value in place — clear explicitly before typing.
    // TT-225 will re-introduce the typed peak-rating inputs; for now
    // the edit form's free-form text fields are name + active_years +
    // playing_style. Drive the diff via active_years.
    const activeField = page.getByLabel(/^Active Years/i);
    await activeField.click();
    await activeField.press("Control+a");
    await activeField.fill(newActiveYears);
    await page.getByLabel(/^Reason for Changes/i).fill("e2e real edit");
    await page.getByRole("button", { name: /Submit Changes/i }).click();

    await page.waitForURL("/profile", { timeout: 20000 });

    // Pending player_edit row exists and carries ONLY the active_years
    // diff — pre-filled name that the user didn't touch must not appear
    // in edit_data.
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
    expect(edits[0].edit_data.active_years).toBe(newActiveYears);
    expect(edits[0].edit_data.edit_reason).toBe("e2e real edit");
    expect(edits[0].edit_data).not.toHaveProperty("name");

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

test("player_edit: clearing a pre-filled optional field nulls the column on approval", async ({
  page,
}) => {
  // TT-129: with pre-fill + diff semantics, an empty submission for a
  // pre-filled optional field is an explicit clear. The applier writes
  // null to the underlying column on approval (where the column is
  // nullable) so the moderator-approved end state matches what the
  // submitter saw on the form.
  const submitterEmail = generateTestEmail("pe-clear-sub");
  const adminEmail = generateTestEmail("pe-clear-adm");
  const { userId: submitterId } = await createUser(submitterEmail);
  const { userId: adminId } = await createUser(adminEmail);
  await setUserRole(adminId, "admin");
  await setUserRole(submitterId, "admin");

  const player = await createTestPlayer({ active_years: "2010-2020" });

  try {
    await login(page, submitterEmail);
    await page.goto(`/submissions/player_edit/submit?player_id=${player.id}`);

    // Confirm pre-fill landed, then clear the field. Use Control+a +
    // empty fill rather than fill("") which Playwright treats as a
    // no-op on controlled inputs that already carry text.
    // TT-225 will swap this back to a peak-rating field once the typed
    // kind toggle ships; for now the optional pre-filled text field is
    // active_years.
    const activeField = page.locator('input[name="active_years"]');
    await expect(activeField).toHaveValue("2010-2020");
    await activeField.click();
    await activeField.press("Control+a");
    await activeField.press("Delete");
    await expect(activeField).toHaveValue("");

    await page.getByLabel(/^Reason for Changes/i).fill("e2e clear edit");
    await page.getByRole("button", { name: /Submit Changes/i }).click();

    await page.waitForURL("/profile", { timeout: 20000 });

    // edit_data carries an explicit `active_years: null` (the diff
    // signal for "user cleared this field").
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
    expect(edits[0].edit_data).toHaveProperty("active_years", null);

    // Admin approves via the moderation queue. Column ends up null.
    await page
      .getByRole("button", { name: /Logout/i })
      .first()
      .click();
    await login(page, adminEmail);
    await page.goto("/admin/player-edits");

    const card = page.locator("li").filter({ hasText: player.name }).first();
    await expect(card).toBeVisible();
    await card.getByRole("button", { name: /^Approve$/ }).click();

    await expect
      .poll(
        async () => {
          const res = await fetch(
            `${SUPABASE_URL}/rest/v1/players?id=eq.${player.id}&select=active_years`,
            { headers: adminHeaders() }
          );
          const rows = (await res.json()) as Array<{
            active_years: string | null;
          }>;
          return rows[0]?.active_years;
        },
        { timeout: 15000 }
      )
      .toBeNull();
  } finally {
    await deleteTestPlayer(player.id);
    await deleteUser(submitterId);
    await deleteUser(adminId);
  }
});

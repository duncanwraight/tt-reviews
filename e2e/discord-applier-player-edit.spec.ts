import { test, expect } from "@playwright/test";
import { createUser, deleteUser, generateTestEmail } from "./utils/auth";
import { buildButtonInteraction, signDiscordRequest } from "./utils/discord";
import { SUPABASE_URL, adminHeaders } from "./utils/supabase";

// TT-113: when two distinct Discord moderators click ✅ on a
// player_edit, the second click flips status="approved" and the
// dispatch table (app/lib/discord/moderation-appliers.ts) must run
// applyPlayerEdit so the players row receives the diff. Without this
// hook the row is silently approved-but-unapplied — TT-106 closed the
// equivalent gap for equipment_edit; this seals player_edit.
//
// The spec drives the full end-to-end shape:
//   1. Seed a fresh player row (so the assertion target is unambiguous
//      and we can clean up).
//   2. Insert a pending player_edit referencing it.
//   3. Sign + POST a button click as moderator A → status flips to
//      awaiting_second_approval, players row UNCHANGED.
//   4. Sign + POST a button click as moderator B → status flips to
//      approved, players row reflects edit_data.
// The two-click split is what guards against the "single Discord
// approval lands awaiting_second_approval" trigger logic — the apply
// step must NOT fire on click 1.

async function postInteraction(
  request: import("@playwright/test").APIRequestContext,
  interaction: ReturnType<typeof buildButtonInteraction>
) {
  const body = JSON.stringify(interaction);
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const { signature } = signDiscordRequest(timestamp, body);
  return request.post("/api/discord/interactions", {
    headers: {
      "Content-Type": "application/json",
      "x-signature-ed25519": signature,
      "x-signature-timestamp": timestamp,
    },
    data: body,
  });
}

async function getPlayerName(playerId: string): Promise<string> {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/players?id=eq.${playerId}&select=name`,
    { headers: adminHeaders() }
  );
  const rows = (await res.json()) as Array<{ name: string }>;
  return rows[0]?.name ?? "missing";
}

async function getPlayerEditStatus(editId: string): Promise<string> {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/player_edits?id=eq.${editId}&select=status`,
    { headers: adminHeaders() }
  );
  const rows = (await res.json()) as Array<{ status: string }>;
  return rows[0]?.status ?? "missing";
}

test("Discord 2× approval applies player_edit to the players row", async ({
  request,
}) => {
  // Two distinct Discord moderators — recordApproval is keyed on
  // moderator_id, so the same id twice would land at
  // awaiting_second_approval and never advance.
  const modAEmail = generateTestEmail("pe-mod-a");
  const modBEmail = generateTestEmail("pe-mod-b");
  const { userId: modAUserId } = await createUser(modAEmail);
  const { userId: modBUserId } = await createUser(modBEmail);

  // Fresh player row: gives us an unambiguous assertion target and
  // lets cleanup just delete it without restoring seed state.
  const startName = `e2e-pe-original-${Date.now()}`;
  const newName = `e2e-pe-renamed-${Date.now()}`;
  const slug = `e2e-pe-${Date.now()}`;
  const playerInsertRes = await fetch(`${SUPABASE_URL}/rest/v1/players`, {
    method: "POST",
    headers: { ...adminHeaders(), Prefer: "return=representation" },
    body: JSON.stringify({
      name: startName,
      slug,
      active: true,
    }),
  });
  if (!playerInsertRes.ok) {
    throw new Error(
      `seed player insert failed (${playerInsertRes.status}): ${await playerInsertRes.text()}`
    );
  }
  const [player] = (await playerInsertRes.json()) as Array<{ id: string }>;

  // Pending player_edit. edit_data carries only the renamed name; the
  // applier should set players.name = newName and leave the slug alone
  // (the schema doesn't regenerate player slugs on edit — name and
  // slug are independent on this table).
  const editInsertRes = await fetch(`${SUPABASE_URL}/rest/v1/player_edits`, {
    method: "POST",
    headers: { ...adminHeaders(), Prefer: "return=representation" },
    body: JSON.stringify({
      player_id: player.id,
      user_id: modAUserId,
      edit_data: { name: newName, edit_reason: "e2e player_edit dispatch" },
      status: "pending",
    }),
  });
  if (!editInsertRes.ok) {
    throw new Error(
      `player_edit insert failed (${editInsertRes.status}): ${await editInsertRes.text()}`
    );
  }
  const [edit] = (await editInsertRes.json()) as Array<{ id: string }>;

  try {
    // Click 1 — moderator A. Single Discord approval lands at
    // awaiting_second_approval per the update_submission_status
    // trigger (two Discord clicks needed to fully approve).
    const click1 = await postInteraction(
      request,
      buildButtonInteraction({
        customId: `approve_player_edit_${edit.id}`,
        userId: "discord-mod-a",
        username: "discord-mod-a",
      })
    );
    expect(click1.status()).toBe(200);

    await expect
      .poll(() => getPlayerEditStatus(edit.id), { timeout: 10000 })
      .toBe("awaiting_second_approval");

    // Apply must NOT have fired — players row still has the original
    // name. This is the half of the assertion that guards against
    // "applier runs on every approval click instead of only on the
    // status='approved' flip."
    expect(await getPlayerName(player.id)).toBe(startName);

    // Click 2 — distinct moderator B. This is the click that should
    // flip status='approved' and run applyPlayerEdit.
    const click2 = await postInteraction(
      request,
      buildButtonInteraction({
        customId: `approve_player_edit_${edit.id}`,
        userId: "discord-mod-b",
        username: "discord-mod-b",
      })
    );
    expect(click2.status()).toBe(200);
    const click2Json = (await click2.json()) as {
      type: number;
      data?: { content?: string };
    };
    expect(click2Json.type).toBe(4);
    // Must not be the "Approved but apply failed" warning — that's
    // what the apply hook returns when the helper rejects. The
    // success path returns the per-type buildSuccess string.
    expect(click2Json.data?.content ?? "").not.toContain("apply failed");

    await expect
      .poll(() => getPlayerEditStatus(edit.id), { timeout: 10000 })
      .toBe("approved");

    // The full-approval click must have run applyPlayerEdit and
    // updated players.name. Polling because the trigger + apply both
    // run in the same request, but the rest call afterwards is
    // independent.
    await expect
      .poll(() => getPlayerName(player.id), { timeout: 10000 })
      .toBe(newName);
  } finally {
    // Clean up: delete the edit row, the player row, then both
    // moderator users (deleteUser also clears moderator_approvals).
    await fetch(`${SUPABASE_URL}/rest/v1/player_edits?id=eq.${edit.id}`, {
      method: "DELETE",
      headers: adminHeaders(),
    });
    await fetch(`${SUPABASE_URL}/rest/v1/players?id=eq.${player.id}`, {
      method: "DELETE",
      headers: adminHeaders(),
    });
    await deleteUser(modAUserId);
    await deleteUser(modBUserId);
  }
});

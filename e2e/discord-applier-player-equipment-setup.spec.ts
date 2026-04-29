import { test, expect } from "@playwright/test";
import { createUser, deleteUser, generateTestEmail } from "./utils/auth";
import { buildButtonInteraction, signDiscordRequest } from "./utils/discord";
import { SUPABASE_URL, adminHeaders } from "./utils/supabase";

// TT-117: closes the last staging→canonical gap in the TT-111
// umbrella. Before this fix, the admin route bypassed
// moderationService.recordApproval entirely (single-click admin
// approval, no audit trail), and the Discord path went through
// recordApproval but no apply ran. So Discord-approved setups
// silently dropped: status flipped to approved on the submission row
// but no row in player_equipment_setups, the canonical table that
// EquipmentTimeline reads.
//
// This spec drives the full fixed lifecycle on the Discord path:
//   1. Seed a fresh player + use a real blade row (FK to equipment).
//   2. Insert a pending player_equipment_setup_submissions row.
//   3. Click 1 (mod A) → status=awaiting_second_approval, no
//      player_equipment_setups row.
//   4. Click 2 (mod B) → status=approved AND player_equipment_setups
//      row created with verified=true and the side→colour mapping.

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

async function getSetupSubmissionStatus(submissionId: string): Promise<string> {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/player_equipment_setup_submissions?id=eq.${submissionId}&select=status`,
    { headers: adminHeaders() }
  );
  const rows = (await res.json()) as Array<{ status: string }>;
  return rows[0]?.status ?? "missing";
}

async function getPlayerEquipmentSetups(playerId: string): Promise<
  Array<{
    id: string;
    blade_id: string | null;
    forehand_color: string | null;
    backhand_color: string | null;
    forehand_thickness: string | null;
    verified: boolean;
    year: number;
  }>
> {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/player_equipment_setups?player_id=eq.${playerId}&select=id,blade_id,forehand_color,backhand_color,forehand_thickness,verified,year`,
    { headers: adminHeaders() }
  );
  return (await res.json()) as Array<{
    id: string;
    blade_id: string | null;
    forehand_color: string | null;
    backhand_color: string | null;
    forehand_thickness: string | null;
    verified: boolean;
    year: number;
  }>;
}

async function getFirstBlade(): Promise<{ id: string }> {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/equipment?category=eq.blade&select=id&limit=1`,
    { headers: adminHeaders() }
  );
  const rows = (await res.json()) as Array<{ id: string }>;
  if (!rows[0]) {
    throw new Error("No blade equipment seeded — needed for FK test");
  }
  return rows[0];
}

test("Discord 2× approval applies player_equipment_setup to player_equipment_setups", async ({
  request,
}) => {
  const submitterEmail = generateTestEmail("ses-submitter");
  const { userId: submitterId } = await createUser(submitterEmail);
  const blade = await getFirstBlade();

  // Fresh player to keep the assertion target unambiguous.
  const ts = Date.now();
  const playerInsertRes = await fetch(`${SUPABASE_URL}/rest/v1/players`, {
    method: "POST",
    headers: { ...adminHeaders(), Prefer: "return=representation" },
    body: JSON.stringify({
      name: `e2e-ses-player-${ts}`,
      slug: `e2e-ses-player-${ts}`,
      active: true,
    }),
  });
  if (!playerInsertRes.ok) {
    throw new Error(
      `seed player insert failed (${playerInsertRes.status}): ${await playerInsertRes.text()}`
    );
  }
  const [player] = (await playerInsertRes.json()) as Array<{ id: string }>;

  const submissionInsertRes = await fetch(
    `${SUPABASE_URL}/rest/v1/player_equipment_setup_submissions`,
    {
      method: "POST",
      headers: { ...adminHeaders(), Prefer: "return=representation" },
      body: JSON.stringify({
        user_id: submitterId,
        player_id: player.id,
        year: 2024,
        blade_id: blade.id,
        forehand_thickness: "max",
        // Side→colour mapping: forehand=red, backhand=black per applier.
        forehand_side: "forehand",
        backhand_side: "backhand",
        backhand_thickness: "1.9",
        status: "pending",
      }),
    }
  );
  if (!submissionInsertRes.ok) {
    throw new Error(
      `setup_submissions insert failed (${submissionInsertRes.status}): ${await submissionInsertRes.text()}`
    );
  }
  const [submission] = (await submissionInsertRes.json()) as Array<{
    id: string;
  }>;

  try {
    // Click 1 — moderator A.
    const click1 = await postInteraction(
      request,
      buildButtonInteraction({
        customId: `approve_player_equipment_setup_${submission.id}`,
        userId: "discord-mod-a",
        username: "discord-mod-a",
      })
    );
    expect(click1.status()).toBe(200);

    await expect
      .poll(() => getSetupSubmissionStatus(submission.id), { timeout: 10000 })
      .toBe("awaiting_second_approval");

    // Apply must NOT have fired yet.
    expect(await getPlayerEquipmentSetups(player.id)).toHaveLength(0);

    // Click 2 — distinct moderator B. Status flips to approved and
    // applyPlayerEquipmentSetup should INSERT the canonical row.
    const click2 = await postInteraction(
      request,
      buildButtonInteraction({
        customId: `approve_player_equipment_setup_${submission.id}`,
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
    expect(click2Json.data?.content ?? "").not.toContain("apply failed");

    await expect
      .poll(() => getSetupSubmissionStatus(submission.id), { timeout: 10000 })
      .toBe("approved");

    await expect
      .poll(async () => (await getPlayerEquipmentSetups(player.id)).length, {
        timeout: 10000,
      })
      .toBe(1);

    const setups = await getPlayerEquipmentSetups(player.id);
    expect(setups[0].blade_id).toBe(blade.id);
    expect(setups[0].year).toBe(2024);
    expect(setups[0].forehand_color).toBe("red");
    expect(setups[0].backhand_color).toBe("black");
    expect(setups[0].forehand_thickness).toBe("max");
    expect(setups[0].verified).toBe(true);
  } finally {
    // Cascading FK on player_equipment_setups → players cleans the
    // canonical row when the player is deleted.
    await fetch(
      `${SUPABASE_URL}/rest/v1/player_equipment_setup_submissions?id=eq.${submission.id}`,
      { method: "DELETE", headers: adminHeaders() }
    );
    await fetch(`${SUPABASE_URL}/rest/v1/players?id=eq.${player.id}`, {
      method: "DELETE",
      headers: adminHeaders(),
    });
    await deleteUser(submitterId);
  }
});

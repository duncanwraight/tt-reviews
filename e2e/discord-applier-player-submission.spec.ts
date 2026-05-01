import { test, expect } from "@playwright/test";
import { createUser, deleteUser, generateTestEmail } from "./utils/auth";
import { buildButtonInteraction, signDiscordRequest } from "./utils/discord";
import { SUPABASE_URL, adminHeaders } from "./utils/supabase";

// TT-115: when two distinct Discord moderators click ✅ on a new
// player submission, the second click flips status="approved" and the
// dispatch table (app/lib/discord/moderation-appliers.ts) must run
// applyPlayerSubmission so a row in the canonical `players` table
// gets created. Without this hook, the player_submission is silently
// approved-but-unpublished — public player pages query `players`, so
// a Discord-approved submission never appears.
//
// Mirrors discord-applier-equipment-submission.spec.ts shape.

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

async function getPlayerSubmissionStatus(
  submissionId: string
): Promise<string> {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/player_submissions?id=eq.${submissionId}&select=status`,
    { headers: adminHeaders() }
  );
  const rows = (await res.json()) as Array<{ status: string }>;
  return rows[0]?.status ?? "missing";
}

async function getPlayerBySlug(slug: string): Promise<{
  id: string;
  name: string;
  highest_rating: string | null;
  active_years: string | null;
  playing_style: string | null;
  birth_country: string | null;
  represents: string | null;
  active: boolean;
} | null> {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/players?slug=eq.${slug}&select=id,name,highest_rating,active_years,playing_style,birth_country,represents,active`,
    { headers: adminHeaders() }
  );
  const rows = (await res.json()) as Array<{
    id: string;
    name: string;
    highest_rating: string | null;
    active_years: string | null;
    playing_style: string | null;
    birth_country: string | null;
    represents: string | null;
    active: boolean;
  }>;
  return rows[0] ?? null;
}

async function getPlayerEquipmentSetups(playerId: string): Promise<
  Array<{
    year: number;
    blade_id: string | null;
    forehand_rubber_id: string | null;
    forehand_thickness: string | null;
    forehand_color: string | null;
    backhand_rubber_id: string | null;
    backhand_thickness: string | null;
    backhand_color: string | null;
    verified: boolean;
  }>
> {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/player_equipment_setups?player_id=eq.${playerId}&select=year,blade_id,forehand_rubber_id,forehand_thickness,forehand_color,backhand_rubber_id,backhand_thickness,backhand_color,verified&order=created_at.asc`,
    { headers: adminHeaders() }
  );
  return res.json();
}

async function getPlayerFootage(playerId: string): Promise<
  Array<{
    url: string;
    title: string;
    platform: string;
    active: boolean;
  }>
> {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/player_footage?player_id=eq.${playerId}&select=url,title,platform,active&order=created_at.asc`,
    { headers: adminHeaders() }
  );
  return res.json();
}

test("Discord 2× approval applies player submission to the players table", async ({
  request,
}) => {
  const submitterEmail = generateTestEmail("ps-submitter");
  const { userId: submitterId } = await createUser(submitterEmail);

  const ts = Date.now();
  const submittedName = `e2e-player-${ts}`;
  const expectedSlug = `e2e-player-${ts}`;

  const submissionInsertRes = await fetch(
    `${SUPABASE_URL}/rest/v1/player_submissions`,
    {
      method: "POST",
      headers: { ...adminHeaders(), Prefer: "return=representation" },
      body: JSON.stringify({
        user_id: submitterId,
        name: submittedName,
        highest_rating: "2750",
        active_years: "2010-",
        playing_style: "shakehand offensive",
        birth_country: "GBR",
        represents: "GBR",
        status: "pending",
      }),
    }
  );
  if (!submissionInsertRes.ok) {
    throw new Error(
      `player_submissions insert failed (${submissionInsertRes.status}): ${await submissionInsertRes.text()}`
    );
  }
  const [submission] = (await submissionInsertRes.json()) as Array<{
    id: string;
  }>;

  let createdPlayerId: string | null = null;
  try {
    // Click 1 — moderator A. Single Discord click lands at
    // awaiting_second_approval (two clicks needed to fully approve).
    const click1 = await postInteraction(
      request,
      buildButtonInteraction({
        customId: `approve_player_${submission.id}`,
        userId: "discord-mod-a",
        username: "discord-mod-a",
      })
    );
    expect(click1.status()).toBe(200);

    await expect
      .poll(() => getPlayerSubmissionStatus(submission.id), { timeout: 10000 })
      .toBe("awaiting_second_approval");

    // No players row created yet — applier must NOT fire on click 1.
    expect(await getPlayerBySlug(expectedSlug)).toBeNull();

    // Click 2 — distinct moderator B. Status should flip to approved
    // and applyPlayerSubmission should INSERT the players row.
    const click2 = await postInteraction(
      request,
      buildButtonInteraction({
        customId: `approve_player_${submission.id}`,
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
      .poll(() => getPlayerSubmissionStatus(submission.id), { timeout: 10000 })
      .toBe("approved");

    const player = await new Promise<{
      id: string;
      name: string;
      highest_rating: string | null;
      active_years: string | null;
      playing_style: string | null;
      birth_country: string | null;
      represents: string | null;
      active: boolean;
    }>(resolve => {
      const tick = async () => {
        const row = await getPlayerBySlug(expectedSlug);
        if (row) {
          resolve(row);
          return;
        }
        setTimeout(tick, 200);
      };
      void tick();
    });
    createdPlayerId = player.id;

    expect(player.name).toBe(submittedName);
    expect(player.highest_rating).toBe("2750");
    expect(player.active_years).toBe("2010-");
    expect(player.playing_style).toBe("shakehand offensive");
    expect(player.birth_country).toBe("GBR");
    expect(player.represents).toBe("GBR");
    expect(player.active).toBe(true);
  } finally {
    if (createdPlayerId) {
      await fetch(`${SUPABASE_URL}/rest/v1/players?id=eq.${createdPlayerId}`, {
        method: "DELETE",
        headers: adminHeaders(),
      });
    }
    await fetch(
      `${SUPABASE_URL}/rest/v1/player_submissions?id=eq.${submission.id}`,
      { method: "DELETE", headers: adminHeaders() }
    );
    await deleteUser(submitterId);
  }
});

async function getFirstBlade(): Promise<{ id: string }> {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/equipment?category=eq.blade&select=id&limit=1`,
    { headers: adminHeaders() }
  );
  const rows = (await res.json()) as Array<{ id: string }>;
  if (!rows[0]) throw new Error("No blade equipment seeded — needed for FK");
  return rows[0];
}

// TT-131: when the player_submissions row carries equipment_setup +
// videos JSONB, two-Discord-approval should not only INSERT the
// players row but also cascade into player_equipment_setups and
// player_footage. Pre-fix the applier created the bare players row
// only, silently dropping the rest of the submission.
test("Discord 2× approval cascades equipment_setup + videos to canonical rows", async ({
  request,
}) => {
  const submitterEmail = generateTestEmail("ps-cascade");
  const { userId: submitterId } = await createUser(submitterEmail);
  const blade = await getFirstBlade();

  const ts = Date.now();
  const submittedName = `e2e-cascade-player-${ts}`;
  const expectedSlug = `e2e-cascade-player-${ts}`;

  const submissionInsertRes = await fetch(
    `${SUPABASE_URL}/rest/v1/player_submissions`,
    {
      method: "POST",
      headers: { ...adminHeaders(), Prefer: "return=representation" },
      body: JSON.stringify({
        user_id: submitterId,
        name: submittedName,
        highest_rating: "2700",
        equipment_setup: {
          year: 2024,
          blade_id: blade.id,
          forehand_thickness: "max",
          forehand_side: "forehand",
          backhand_thickness: "1.9",
          backhand_side: "backhand",
        },
        videos: [
          {
            url: "https://youtube.com/watch?v=cascade1",
            title: "Cascade Final",
            platform: "youtube",
          },
          {
            url: "https://example.com/cascade2",
            title: "Cascade Practice",
            platform: "other",
          },
        ],
        status: "pending",
      }),
    }
  );
  if (!submissionInsertRes.ok) {
    throw new Error(
      `cascade player_submissions insert failed (${submissionInsertRes.status}): ${await submissionInsertRes.text()}`
    );
  }
  const [submission] = (await submissionInsertRes.json()) as Array<{
    id: string;
  }>;

  let createdPlayerId: string | null = null;
  try {
    // Two distinct moderators → status approved → applier fires.
    for (const username of ["cascade-mod-a", "cascade-mod-b"]) {
      const click = await postInteraction(
        request,
        buildButtonInteraction({
          customId: `approve_player_${submission.id}`,
          userId: username,
          username,
        })
      );
      expect(click.status()).toBe(200);
    }

    await expect
      .poll(() => getPlayerSubmissionStatus(submission.id), { timeout: 10000 })
      .toBe("approved");

    const player = await new Promise<{ id: string }>(resolve => {
      const tick = async () => {
        const row = await getPlayerBySlug(expectedSlug);
        if (row) {
          resolve(row);
          return;
        }
        setTimeout(tick, 200);
      };
      void tick();
    });
    createdPlayerId = player.id;

    await expect
      .poll(async () => (await getPlayerEquipmentSetups(player.id)).length, {
        timeout: 10000,
      })
      .toBe(1);
    const setups = await getPlayerEquipmentSetups(player.id);
    expect(setups[0]).toMatchObject({
      year: 2024,
      blade_id: blade.id,
      forehand_thickness: "max",
      forehand_color: "red",
      backhand_thickness: "1.9",
      backhand_color: "black",
      verified: true,
    });

    await expect
      .poll(async () => (await getPlayerFootage(player.id)).length, {
        timeout: 10000,
      })
      .toBe(2);
    const footage = await getPlayerFootage(player.id);
    expect(footage.map(f => f.title).sort()).toEqual([
      "Cascade Final",
      "Cascade Practice",
    ]);
    expect(footage.find(f => f.title === "Cascade Final")?.platform).toBe(
      "youtube"
    );
    expect(footage.find(f => f.title === "Cascade Practice")?.platform).toBe(
      "other"
    );
  } finally {
    if (createdPlayerId) {
      // CASCADE on player_equipment_setups + player_footage cleans
      // the cascade rows when the player goes.
      await fetch(`${SUPABASE_URL}/rest/v1/players?id=eq.${createdPlayerId}`, {
        method: "DELETE",
        headers: adminHeaders(),
      });
    }
    await fetch(
      `${SUPABASE_URL}/rest/v1/player_submissions?id=eq.${submission.id}`,
      { method: "DELETE", headers: adminHeaders() }
    );
    await deleteUser(submitterId);
  }
});

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

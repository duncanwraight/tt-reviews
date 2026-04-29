import { test, expect } from "@playwright/test";
import { createUser, deleteUser, generateTestEmail } from "./utils/auth";
import { buildButtonInteraction, signDiscordRequest } from "./utils/discord";
import { SUPABASE_URL, adminHeaders } from "./utils/supabase";

// TT-116: highest-impact slice of the TT-111 umbrella. BEFORE this
// fix, both admin and Discord approval paths flipped
// video_submissions.status to "approved" but never inserted any rows
// into player_footage — the canonical table that PlayerTabs reads.
// So every approved video submission was a dead pipe: the moderator
// would see the success ack, the submitter would see "approved" in
// their profile, and the public would never see the videos.
//
// This spec drives the full fixed lifecycle:
//   1. Seed a fresh player + a video_submission with two videos
//      pointing at it.
//   2. Click 1 (mod A) → status=awaiting_second_approval, no
//      player_footage rows for the player.
//   3. Click 2 (mod B) → status=approved AND two player_footage rows
//      exist for the player, matching the submitted url/title/platform.

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

async function getVideoSubmissionStatus(submissionId: string): Promise<string> {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/video_submissions?id=eq.${submissionId}&select=status`,
    { headers: adminHeaders() }
  );
  const rows = (await res.json()) as Array<{ status: string }>;
  return rows[0]?.status ?? "missing";
}

async function getPlayerFootage(playerId: string): Promise<
  Array<{
    id: string;
    url: string;
    title: string;
    platform: string;
    active: boolean;
  }>
> {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/player_footage?player_id=eq.${playerId}&select=id,url,title,platform,active&order=created_at.asc`,
    { headers: adminHeaders() }
  );
  return (await res.json()) as Array<{
    id: string;
    url: string;
    title: string;
    platform: string;
    active: boolean;
  }>;
}

test("Discord 2× approval applies video submission to player_footage", async ({
  request,
}) => {
  const submitterEmail = generateTestEmail("vs-submitter");
  const { userId: submitterId } = await createUser(submitterEmail);

  // Fresh player so player_footage rows we assert on are unambiguously
  // ours, and cleanup is straightforward.
  const ts = Date.now();
  const playerInsertRes = await fetch(`${SUPABASE_URL}/rest/v1/players`, {
    method: "POST",
    headers: { ...adminHeaders(), Prefer: "return=representation" },
    body: JSON.stringify({
      name: `e2e-vs-player-${ts}`,
      slug: `e2e-vs-player-${ts}`,
      active: true,
    }),
  });
  if (!playerInsertRes.ok) {
    throw new Error(
      `seed player insert failed (${playerInsertRes.status}): ${await playerInsertRes.text()}`
    );
  }
  const [player] = (await playerInsertRes.json()) as Array<{ id: string }>;

  const videoUrl1 = `https://www.youtube.com/watch?v=e2e-${ts}-A`;
  const videoUrl2 = `https://www.youtube.com/watch?v=e2e-${ts}-B`;

  const submissionInsertRes = await fetch(
    `${SUPABASE_URL}/rest/v1/video_submissions`,
    {
      method: "POST",
      headers: { ...adminHeaders(), Prefer: "return=representation" },
      body: JSON.stringify({
        user_id: submitterId,
        player_id: player.id,
        videos: [
          {
            url: videoUrl1,
            title: `e2e match A ${ts}`,
            platform: "youtube",
          },
          {
            url: videoUrl2,
            title: `e2e match B ${ts}`,
            platform: "youtube",
          },
        ],
        status: "pending",
      }),
    }
  );
  if (!submissionInsertRes.ok) {
    throw new Error(
      `video_submissions insert failed (${submissionInsertRes.status}): ${await submissionInsertRes.text()}`
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
        customId: `approve_video_${submission.id}`,
        userId: "discord-mod-a",
        username: "discord-mod-a",
      })
    );
    expect(click1.status()).toBe(200);

    await expect
      .poll(() => getVideoSubmissionStatus(submission.id), { timeout: 10000 })
      .toBe("awaiting_second_approval");

    // Apply must NOT have fired — no player_footage rows yet.
    expect(await getPlayerFootage(player.id)).toHaveLength(0);

    // Click 2 — distinct moderator B. Status should flip to approved
    // and applyVideoSubmission should INSERT both player_footage rows.
    const click2 = await postInteraction(
      request,
      buildButtonInteraction({
        customId: `approve_video_${submission.id}`,
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
      .poll(() => getVideoSubmissionStatus(submission.id), { timeout: 10000 })
      .toBe("approved");

    // Both rows must exist for the player. Polling — apply runs in
    // the request lifecycle but the rest call is independent.
    await expect
      .poll(async () => (await getPlayerFootage(player.id)).length, {
        timeout: 10000,
      })
      .toBe(2);

    const footage = await getPlayerFootage(player.id);
    const urls = footage.map(f => f.url).sort();
    expect(urls).toEqual([videoUrl1, videoUrl2].sort());
    for (const row of footage) {
      expect(row.platform).toBe("youtube");
      expect(row.active).toBe(true);
    }
  } finally {
    // Cascading FK on player_footage cleans up its rows when the
    // player is deleted. Order: submission first (no FK to player),
    // then player (cascades to footage), then submitter user.
    await fetch(
      `${SUPABASE_URL}/rest/v1/video_submissions?id=eq.${submission.id}`,
      { method: "DELETE", headers: adminHeaders() }
    );
    await fetch(`${SUPABASE_URL}/rest/v1/players?id=eq.${player.id}`, {
      method: "DELETE",
      headers: adminHeaders(),
    });
    await deleteUser(submitterId);
  }
});

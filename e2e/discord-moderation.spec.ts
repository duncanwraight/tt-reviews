import { test, expect } from "@playwright/test";
import { createUser, deleteUser, generateTestEmail } from "./utils/auth";
import {
  getEquipmentReviewStatus,
  getFirstEquipment,
  insertPendingEquipmentReview,
} from "./utils/data";
import { buildButtonInteraction, signDiscordRequest } from "./utils/discord";
import { SUPABASE_URL, adminHeaders } from "./utils/supabase";

// These specs sign Discord-style interactions with a test-only Ed25519
// keypair (see e2e/utils/discord.ts). The matching public key and the
// e2e-only role string are auto-accepted by the dev server when
// ENVIRONMENT=development (see app/lib/discord/messages.ts and
// app/lib/discord/moderation.ts) — no .dev.vars tweak required.

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

test("Discord approval button POST flips review status", async ({
  request,
}) => {
  const reviewerEmail = generateTestEmail("reviewer3b6");
  const { userId: reviewerId } = await createUser(reviewerEmail);
  const equipment = await getFirstEquipment();
  const reviewText = `Playwright 3b6 marker ${Date.now()}`;
  const review = await insertPendingEquipmentReview({
    userId: reviewerId,
    equipmentId: equipment.id,
    reviewText,
    overallRating: 6,
  });

  try {
    const response = await postInteraction(
      request,
      buildButtonInteraction({ customId: `approve_review_${review.id}` })
    );

    expect(response.status()).toBe(200);
    const json = (await response.json()) as {
      type: number;
      data?: { content?: string };
    };
    // Type 4 = CHANNEL_MESSAGE_WITH_SOURCE (ephemeral ack to Discord).
    expect(json.type).toBe(4);
    expect(json.data?.content ?? "").toMatch(/Review.*approval/i);

    // A single Discord approval lands "awaiting_second_approval" — see
    // update_submission_status trigger: two Discord approvals are needed
    // to fully approve, one admin_ui click is enough (flow 3).
    await expect
      .poll(() => getEquipmentReviewStatus(review.id), { timeout: 10000 })
      .toBe("awaiting_second_approval");
  } finally {
    await deleteUser(reviewerId);
  }
});

// Regression guard: TT-101 created equipment_edits without the
// discord_message_id column that every other tracked-message table
// carries. The moderation handler clones player_edit's shape
// (hasTrackedMessage: true), so each Discord approval invoked
// updateDiscordMessageAfterModeration → getDiscordMessageId, whose
// SELECT id, discord_message_id FROM equipment_edits 500'd. The
// approval response still came back ✅ (the failure was swallowed
// inside withLogging) but Logger.error fired twice per approval and
// spammed the alerts channel. The mocked-Supabase unit tests for
// approveEquipmentEdit didn't see this because they never hit the
// real schema. This e2e drives the same HTTP path with the real DB
// and additionally selects the column off the row to fail loudly if
// the migration is ever reverted.
test("Discord approval button POST advances equipment_edit + reads discord_message_id", async ({
  request,
}) => {
  const submitterEmail = generateTestEmail("ee-disc");
  const { userId: submitterId } = await createUser(submitterEmail);
  const equipment = await getFirstEquipment();

  const editRes = await fetch(`${SUPABASE_URL}/rest/v1/equipment_edits`, {
    method: "POST",
    headers: { ...adminHeaders(), Prefer: "return=representation" },
    body: JSON.stringify({
      equipment_id: equipment.id,
      user_id: submitterId,
      edit_data: { description: `e2e disc marker ${Date.now()}` },
      status: "pending",
    }),
  });
  if (!editRes.ok) {
    throw new Error(
      `equipment_edit insert failed (${editRes.status}): ${await editRes.text()}`
    );
  }
  const [edit] = (await editRes.json()) as Array<{ id: string }>;

  try {
    const response = await postInteraction(
      request,
      buildButtonInteraction({ customId: `approve_equipment_edit_${edit.id}` })
    );

    expect(response.status()).toBe(200);
    const json = (await response.json()) as {
      type: number;
      data?: { content?: string };
    };
    expect(json.type).toBe(4);
    expect(json.data?.content ?? "").toMatch(/Equipment Edit Approved/i);

    // First Discord click → awaiting_second_approval (two Discord
    // approvals needed; one admin_ui click is enough — see
    // update_submission_status trigger).
    await expect
      .poll(
        async () => {
          const res = await fetch(
            `${SUPABASE_URL}/rest/v1/equipment_edits?id=eq.${edit.id}&select=status`,
            { headers: adminHeaders() }
          );
          const rows = (await res.json()) as Array<{ status: string }>;
          return rows[0]?.status;
        },
        { timeout: 10000 }
      )
      .toBe("awaiting_second_approval");

    // Direct schema check: the production SELECT in getDiscordMessageId
    // selects id + discord_message_id from this table. Mirror that
    // shape — without the column, PostgREST returns 4xx with
    // "column equipment_edits.discord_message_id does not exist".
    const colRes = await fetch(
      `${SUPABASE_URL}/rest/v1/equipment_edits?id=eq.${edit.id}&select=id,discord_message_id`,
      { headers: adminHeaders() }
    );
    expect(colRes.status).toBe(200);
  } finally {
    await fetch(`${SUPABASE_URL}/rest/v1/equipment_edits?id=eq.${edit.id}`, {
      method: "DELETE",
      headers: adminHeaders(),
    });
    await deleteUser(submitterId);
  }
});

// Guards the fix from archive/DISCORD-HARDENING.md Sub-problem A (TT-4):
// a Discord button click whose submission_id does not exist in the target
// environment must return an ephemeral "Submission not found" error and
// must NOT insert an orphan row into moderator_approvals.
test("Discord approve for missing review returns env-mismatch, writes no row", async ({
  request,
}) => {
  // Random UUID that is not present in equipment_reviews. The handler
  // should short-circuit at the service-level submissionExists check;
  // the BEFORE-INSERT trigger is the backstop if the check is ever
  // removed.
  const missingReviewId = crypto.randomUUID();

  const response = await postInteraction(
    request,
    buildButtonInteraction({ customId: `approve_review_${missingReviewId}` })
  );

  expect(response.status()).toBe(200);
  const json = (await response.json()) as {
    type: number;
    data?: { content?: string; flags?: number };
  };
  expect(json.type).toBe(4);
  expect(json.data?.flags).toBe(64); // ephemeral
  expect(json.data?.content ?? "").toContain("Submission not found");
  expect(json.data?.content ?? "").toContain("different environment");

  // No orphan row should have been inserted for this submission_id.
  const rowsRes = await fetch(
    `${SUPABASE_URL}/rest/v1/moderator_approvals?submission_id=eq.${missingReviewId}&select=id`,
    { headers: adminHeaders() }
  );
  expect(rowsRes.status).toBe(200);
  const rows = (await rowsRes.json()) as Array<{ id: string }>;
  expect(rows).toHaveLength(0);
});

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

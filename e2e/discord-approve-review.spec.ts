import { test, expect } from "@playwright/test";
import { createUser, deleteUser, generateTestEmail } from "./utils/auth";
import {
  getEquipmentReviewStatus,
  getFirstEquipment,
  insertPendingEquipmentReview,
} from "./utils/data";
import { buildButtonInteraction, signDiscordRequest } from "./utils/discord";

// This spec signs Discord-style interactions with a test-only Ed25519
// keypair (see e2e/utils/discord.ts). The matching public key and the
// e2e-only role string are auto-accepted by the dev server when
// ENVIRONMENT=development (see app/lib/discord/messages.ts and
// app/lib/discord/moderation.ts) — no .dev.vars tweak required.

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
    const interaction = buildButtonInteraction({
      customId: `approve_review_${review.id}`,
    });
    const body = JSON.stringify(interaction);
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const { signature } = signDiscordRequest(timestamp, body);

    const response = await request.post("/api/discord/interactions", {
      headers: {
        "Content-Type": "application/json",
        "x-signature-ed25519": signature,
        "x-signature-timestamp": timestamp,
      },
      data: body,
    });

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

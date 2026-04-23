import { test, expect } from "@playwright/test";
import { SUPABASE_URL, adminHeaders } from "./utils/supabase";
import { buildButtonInteraction, signDiscordRequest } from "./utils/discord";

// Guards the fix from archive/DISCORD-HARDENING.md Sub-problem A (TT-4):
// a Discord button click whose submission_id does not exist in the target
// environment must return an ephemeral "Submission not found" error and
// must NOT insert an orphan row into moderator_approvals.
test.skip(
  !process.env.CI,
  "Discord flow requires the CI-only test Ed25519 keypair in .dev.vars"
);

test("Discord approve for missing review returns env-mismatch, writes no row", async ({
  request,
}) => {
  // Random UUID that is not present in equipment_reviews. The handler
  // should short-circuit at the service-level submissionExists check;
  // the BEFORE-INSERT trigger is the backstop if the check is ever
  // removed.
  const missingReviewId = crypto.randomUUID();

  const interaction = buildButtonInteraction({
    customId: `approve_review_${missingReviewId}`,
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

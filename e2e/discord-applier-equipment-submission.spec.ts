import { test, expect } from "@playwright/test";
import { createUser, deleteUser, generateTestEmail } from "./utils/auth";
import { buildButtonInteraction, signDiscordRequest } from "./utils/discord";
import { SUPABASE_URL, adminHeaders } from "./utils/supabase";

// TT-114: when two distinct Discord moderators click ✅ on a new
// equipment submission, the second click flips status="approved" and
// the dispatch table (app/lib/discord/moderation-appliers.ts) must
// run applyEquipmentSubmission so a row in the canonical `equipment`
// table gets created. Without this hook, the equipment_submission is
// silently approved-but-unpublished — admin search and detail pages
// query `equipment`, not `equipment_submissions`, so a Discord-approved
// submission never appears.
//
// Mirrors discord-applier-player-edit.spec.ts shape: 2 distinct
// moderators, click 1 lands at awaiting_second_approval with no
// equipment row created, click 2 flips to approved AND creates the
// equipment row via applyEquipmentSubmission.

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

async function getEquipmentSubmissionStatus(
  submissionId: string
): Promise<string> {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/equipment_submissions?id=eq.${submissionId}&select=status`,
    { headers: adminHeaders() }
  );
  const rows = (await res.json()) as Array<{ status: string }>;
  return rows[0]?.status ?? "missing";
}

async function getEquipmentBySlug(slug: string): Promise<{
  id: string;
  name: string;
  manufacturer: string;
  category: string;
  subcategory: string | null;
  description: string | null;
} | null> {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/equipment?slug=eq.${slug}&select=id,name,manufacturer,category,subcategory,description`,
    { headers: adminHeaders() }
  );
  const rows = (await res.json()) as Array<{
    id: string;
    name: string;
    manufacturer: string;
    category: string;
    subcategory: string | null;
    description: string | null;
  }>;
  return rows[0] ?? null;
}

test("Discord 2× approval applies equipment submission to the equipment table", async ({
  request,
}) => {
  const submitterEmail = generateTestEmail("es-submitter");
  const { userId: submitterId } = await createUser(submitterEmail);

  // Unique submission name → unique slug → unambiguous assertion that
  // the canonical row is the one this test created. Slugs are
  // brand-prefixed (TT-163), so the applier prepends manufacturer.
  const ts = Date.now();
  const submittedName = `e2e equipment ${ts}`;
  const expectedSlug = `e2e-mfr-e2e-equipment-${ts}`;

  const submissionInsertRes = await fetch(
    `${SUPABASE_URL}/rest/v1/equipment_submissions`,
    {
      method: "POST",
      headers: { ...adminHeaders(), Prefer: "return=representation" },
      body: JSON.stringify({
        user_id: submitterId,
        name: submittedName,
        manufacturer: "e2e-mfr",
        category: "rubber",
        subcategory: "inverted",
        specifications: { speed: 9, spin: 9, control: 8 },
        description: `e2e applier description ${ts}`,
        status: "pending",
      }),
    }
  );
  if (!submissionInsertRes.ok) {
    throw new Error(
      `equipment_submissions insert failed (${submissionInsertRes.status}): ${await submissionInsertRes.text()}`
    );
  }
  const [submission] = (await submissionInsertRes.json()) as Array<{
    id: string;
  }>;

  let createdEquipmentId: string | null = null;
  try {
    // Click 1 — moderator A. Single Discord click lands at
    // awaiting_second_approval (two clicks needed to fully approve).
    const click1 = await postInteraction(
      request,
      buildButtonInteraction({
        customId: `approve_equipment_${submission.id}`,
        userId: "discord-mod-a",
        username: "discord-mod-a",
      })
    );
    expect(click1.status()).toBe(200);

    await expect
      .poll(() => getEquipmentSubmissionStatus(submission.id), {
        timeout: 10000,
      })
      .toBe("awaiting_second_approval");

    // No equipment row created yet — applier must NOT fire on click 1.
    expect(await getEquipmentBySlug(expectedSlug)).toBeNull();

    // Click 2 — distinct moderator B. Status should flip to approved
    // and applyEquipmentSubmission should INSERT the equipment row.
    const click2 = await postInteraction(
      request,
      buildButtonInteraction({
        customId: `approve_equipment_${submission.id}`,
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
      .poll(() => getEquipmentSubmissionStatus(submission.id), {
        timeout: 10000,
      })
      .toBe("approved");

    // Canonical row must now exist with submission fields preserved
    // and the slug derived from the name. Polling — apply runs in the
    // request lifecycle but the rest call is independent.
    const equipment = await new Promise<{
      id: string;
      name: string;
      manufacturer: string;
      category: string;
      subcategory: string | null;
      description: string | null;
    }>(resolve => {
      const tick = async () => {
        const row = await getEquipmentBySlug(expectedSlug);
        if (row) {
          resolve(row);
          return;
        }
        setTimeout(tick, 200);
      };
      void tick();
    });
    createdEquipmentId = equipment.id;

    expect(equipment.name).toBe(submittedName);
    expect(equipment.manufacturer).toBe("e2e-mfr");
    expect(equipment.category).toBe("rubber");
    expect(equipment.subcategory).toBe("inverted");
    expect(equipment.description).toBe(`e2e applier description ${ts}`);
  } finally {
    // Order: drop equipment row first (FK-free), then submission, then
    // submitter (deleteUser also clears moderator_approvals).
    if (createdEquipmentId) {
      await fetch(
        `${SUPABASE_URL}/rest/v1/equipment?id=eq.${createdEquipmentId}`,
        { method: "DELETE", headers: adminHeaders() }
      );
    }
    await fetch(
      `${SUPABASE_URL}/rest/v1/equipment_submissions?id=eq.${submission.id}`,
      { method: "DELETE", headers: adminHeaders() }
    );
    await deleteUser(submitterId);
  }
});

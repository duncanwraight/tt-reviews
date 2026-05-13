import { expect, test } from "@playwright/test";

import {
  createUser,
  generateTestEmail,
  login,
  setUserRole,
} from "./utils/auth";
import { adminHeaders, SUPABASE_URL } from "./utils/supabase";

// TT-201: unified player importer admin UI.
//
// Two lifecycles covered against the real local Supabase:
//   1. Pending proposal → Review → Approve → players row materialised
//      → /players/:slug renders. Mirrors the deleted TT-199 path.
//   2. Pending proposal → inline Reject on queue page → status flips,
//      no players row. New shortcut path added in TT-201.
//
// The "Run import" action hits the real WTT endpoint (~800 players +
// ITTF rate-limit), so the full WTT-roster → auto-apply path is
// covered by importer.test.ts (unit) instead of e2e.
//
// Memory note: new server-side data-loading paths need e2e — mocked-
// Supabase unit tests pass through PostgREST query-shape bugs.

const PROBE_APPROVE = 999700;
const PROBE_REJECT_DETAIL = 999701;
const PROBE_REJECT_INLINE = 999702;

const ALL_PROBES = [PROBE_APPROVE, PROBE_REJECT_DETAIL, PROBE_REJECT_INLINE];

async function clearProbes(ittfids: number[]): Promise<void> {
  const list = ittfids.join(",");
  for (const table of ["player_proposals", "players"]) {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/${table}?ittfid=in.(${list})`,
      { method: "DELETE", headers: adminHeaders() }
    );
    if (!res.ok && res.status !== 404) {
      throw new Error(
        `clearProbes ${table} failed (${res.status}): ${await res.text()}`
      );
    }
  }
}

async function seedPendingProposal(args: {
  ittfid: number;
  name: string;
  represents: string;
}): Promise<string> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/player_proposals`, {
    method: "POST",
    headers: { ...adminHeaders(), Prefer: "return=representation" },
    body: JSON.stringify({
      ittfid: args.ittfid,
      merged: {
        ittfid: args.ittfid,
        name: args.name,
        represents: args.represents,
        gender: "M",
        wtt_profile_url: `https://www.worldtabletennis.com/playerDescription?playerId=${args.ittfid}`,
        per_field_source: { name: "wtt", represents: "wtt", gender: "wtt" },
      },
      candidates: {
        wtt: {
          source: "wtt",
          ittfid: args.ittfid,
          name: args.name,
          represents: args.represents,
          gender: "M",
          wtt_profile_url: `https://www.worldtabletennis.com/playerDescription?playerId=${args.ittfid}`,
          fetched_at: new Date().toISOString(),
        },
      },
      status: "pending_review",
    }),
  });
  if (!res.ok) {
    throw new Error(
      `seedPendingProposal failed (${res.status}): ${await res.text()}`
    );
  }
  const [row] = (await res.json()) as Array<{ id: string }>;
  return row.id;
}

async function fetchProposal(
  id: string
): Promise<{ status: string; applied_player_id: string | null }> {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/player_proposals?id=eq.${id}&select=status,applied_player_id`,
    { headers: adminHeaders() }
  );
  if (!res.ok) {
    throw new Error(
      `fetchProposal failed (${res.status}): ${await res.text()}`
    );
  }
  const [row] = (await res.json()) as Array<{
    status: string;
    applied_player_id: string | null;
  }>;
  return row;
}

async function countPlayersByIttfid(ittfid: number): Promise<number> {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/players?ittfid=eq.${ittfid}&select=id`,
    { headers: adminHeaders() }
  );
  if (!res.ok) {
    throw new Error(
      `countPlayersByIttfid failed (${res.status}): ${await res.text()}`
    );
  }
  const rows = (await res.json()) as unknown[];
  return rows.length;
}

test.describe.serial("Admin import-players review lifecycle", () => {
  test.beforeEach(async () => {
    await clearProbes(ALL_PROBES);
  });

  test.afterAll(async () => {
    await clearProbes(ALL_PROBES);
  });

  test("renders the queue + Run import button", async ({ page }) => {
    const adminEmail = generateTestEmail("impplayers-load");
    const { userId: adminId } = await createUser(adminEmail);
    await setUserRole(adminId, "admin");

    await login(page, adminEmail);
    await page.goto("/admin/import-players");

    await expect(
      page.getByRole("heading", { name: /import players/i })
    ).toBeVisible();
    await expect(page.getByTestId("import-players-run-button")).toBeEnabled();
  });

  test("approve materialises a players row visible at /players/:slug", async ({
    page,
  }) => {
    const adminEmail = generateTestEmail("impplayers-ok");
    const { userId: adminId } = await createUser(adminEmail);
    await setUserRole(adminId, "admin");

    const playerName = `Probe Approve ${PROBE_APPROVE}`;
    const proposalId = await seedPendingProposal({
      ittfid: PROBE_APPROVE,
      name: playerName,
      represents: "FRA",
    });

    await login(page, adminEmail);
    await page.goto("/admin/import-players");

    // The queued row appears in the pending section.
    await expect(
      page.getByTestId(`import-players-pending-row-${proposalId}`)
    ).toBeVisible();

    // Drill into the detail view.
    await page.getByTestId(`import-players-review-${proposalId}`).click();
    await expect(page).toHaveURL(
      new RegExp(`/admin/import-players/${proposalId}$`)
    );
    await expect(page.getByTestId("import-player-detail-name")).toContainText(
      playerName
    );

    // Approve → redirect to the new player page.
    await page.getByTestId("import-player-approve").click();
    await expect(page).toHaveURL(/\/players\/probe-approve-\d+/);
    await expect(page.getByRole("heading", { name: playerName })).toBeVisible();

    // Proposal flipped + linked.
    const proposalAfter = await fetchProposal(proposalId);
    expect(proposalAfter.status).toBe("applied");
    expect(proposalAfter.applied_player_id).not.toBeNull();
  });

  test("reject on detail flips status and keeps no players row", async ({
    page,
  }) => {
    const adminEmail = generateTestEmail("impplayers-rejd");
    const { userId: adminId } = await createUser(adminEmail);
    await setUserRole(adminId, "admin");

    const proposalId = await seedPendingProposal({
      ittfid: PROBE_REJECT_DETAIL,
      name: `Probe Reject Detail ${PROBE_REJECT_DETAIL}`,
      represents: "ESP",
    });

    await login(page, adminEmail);
    await page.goto(`/admin/import-players/${proposalId}`);

    await page.getByTestId("import-player-reject").click();
    await expect(page).toHaveURL(/\/admin\/import-players$/);

    const proposalAfter = await fetchProposal(proposalId);
    expect(proposalAfter.status).toBe("rejected");
    expect(proposalAfter.applied_player_id).toBeNull();

    expect(await countPlayersByIttfid(PROBE_REJECT_DETAIL)).toBe(0);
  });

  test("inline reject from the queue flips status without leaving the page", async ({
    page,
  }) => {
    const adminEmail = generateTestEmail("impplayers-reji");
    const { userId: adminId } = await createUser(adminEmail);
    await setUserRole(adminId, "admin");

    const proposalId = await seedPendingProposal({
      ittfid: PROBE_REJECT_INLINE,
      name: `Probe Reject Inline ${PROBE_REJECT_INLINE}`,
      represents: "GBR",
    });

    await login(page, adminEmail);
    await page.goto("/admin/import-players");

    await expect(
      page.getByTestId(`import-players-pending-row-${proposalId}`)
    ).toBeVisible();
    await page.getByTestId(`import-players-reject-${proposalId}`).click();

    // Action completes — the row drops out of the pending list.
    await expect(
      page.getByTestId(`import-players-pending-row-${proposalId}`)
    ).toHaveCount(0);

    const proposalAfter = await fetchProposal(proposalId);
    expect(proposalAfter.status).toBe("rejected");

    expect(await countPlayersByIttfid(PROBE_REJECT_INLINE)).toBe(0);
  });
});

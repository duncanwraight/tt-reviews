import { test, expect } from "@playwright/test";
import {
  createUser,
  generateTestEmail,
  login,
  setUserRole,
} from "./utils/auth";
import { SUPABASE_URL, adminHeaders } from "./utils/supabase";

// TT-199: admin review UI for player proposals (parent TT-168).
// Full lifecycle: seed a pending proposal → admin approves → players
// row materialises → /players/:slug renders. Plus a reject-path
// assertion. Memory note: new server-side data-loading paths need
// e2e — mocked-Supabase unit tests don't catch PostgREST query-shape
// bugs (here: the loader's .select() shape and the applier's INSERT).

const PROBE_ITTFID_APPROVE = 999700;
const PROBE_ITTFID_REJECT = 999701;
const PROBE_SLUG = `e2e-probe-${PROBE_ITTFID_APPROVE}`;

async function clearProposals(ittfids: number[]): Promise<void> {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/player_proposals?ittfid=in.(${ittfids.join(",")})`,
    { method: "DELETE", headers: adminHeaders() }
  );
  if (!res.ok && res.status !== 404) {
    throw new Error(
      `clearProposals failed (${res.status}): ${await res.text()}`
    );
  }
}

async function clearPlayersByIttfid(ittfids: number[]): Promise<void> {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/players?ittfid=in.(${ittfids.join(",")})`,
    { method: "DELETE", headers: adminHeaders() }
  );
  if (!res.ok && res.status !== 404) {
    throw new Error(
      `clearPlayersByIttfid failed (${res.status}): ${await res.text()}`
    );
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
        name: args.name,
        represents: args.represents,
        gender: "M",
        per_field_source: { name: "wtt", represents: "wtt", gender: "wtt" },
      },
      candidates: {
        wtt: {
          source: "wtt",
          ittfid: args.ittfid,
          name: args.name,
          represents: args.represents,
          gender: "M",
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

test.describe.serial("Admin player-proposals review lifecycle", () => {
  test.beforeEach(async () => {
    await clearProposals([PROBE_ITTFID_APPROVE, PROBE_ITTFID_REJECT]);
    await clearPlayersByIttfid([PROBE_ITTFID_APPROVE, PROBE_ITTFID_REJECT]);
  });

  test.afterAll(async () => {
    await clearProposals([PROBE_ITTFID_APPROVE, PROBE_ITTFID_REJECT]);
    await clearPlayersByIttfid([PROBE_ITTFID_APPROVE, PROBE_ITTFID_REJECT]);
  });

  test("approve materialises a players row visible at /players/:slug", async ({
    page,
  }) => {
    const adminEmail = generateTestEmail("plprop-ok");
    const { userId: adminId } = await createUser(adminEmail);
    await setUserRole(adminId, "admin");

    const playerName = `E2E Probe ${PROBE_ITTFID_APPROVE}`;
    const proposalId = await seedPendingProposal({
      ittfid: PROBE_ITTFID_APPROVE,
      name: playerName,
      represents: "FRA",
    });

    await login(page, adminEmail);

    // Queue lists the pending proposal.
    await page.goto("/admin/player-proposals");
    const rowCells = page.getByTestId("player-proposal-row").locator("td");
    await expect(rowCells.first()).toContainText(playerName, { timeout: 5000 });

    // Detail page renders the merged fields.
    await page.goto(`/admin/player-proposals/${proposalId}`);
    await expect(page.getByTestId("merged-name")).toContainText(playerName);
    await expect(page.getByTestId("merged-represents")).toContainText("FRA");
    await expect(page.getByTestId("proposal-status")).toHaveText(
      "pending_review"
    );

    // Approve.
    await page.getByTestId("proposal-approve-button").click();

    // Redirected to the public player page.
    await expect(page).toHaveURL(/\/players\/e2e-probe-\d+/);
    await expect(page.getByRole("heading", { name: playerName })).toBeVisible();

    // Proposal row flipped + applied_player_id populated.
    const proposalAfter = await fetchProposal(proposalId);
    expect(proposalAfter.status).toBe("applied");
    expect(proposalAfter.applied_player_id).not.toBeNull();
  });

  test("reject flips status without creating a players row", async ({
    page,
  }) => {
    const adminEmail = generateTestEmail("plprop-rej");
    const { userId: adminId } = await createUser(adminEmail);
    await setUserRole(adminId, "admin");

    const proposalId = await seedPendingProposal({
      ittfid: PROBE_ITTFID_REJECT,
      name: `E2E Reject ${PROBE_ITTFID_REJECT}`,
      represents: "ESP",
    });

    await login(page, adminEmail);
    await page.goto(`/admin/player-proposals/${proposalId}`);
    await page.getByTestId("proposal-reject-button").click();

    await expect(page).toHaveURL(/\/admin\/player-proposals$/);

    const proposalAfter = await fetchProposal(proposalId);
    expect(proposalAfter.status).toBe("rejected");
    expect(proposalAfter.applied_player_id).toBeNull();

    // No players row was created.
    const playersRes = await fetch(
      `${SUPABASE_URL}/rest/v1/players?ittfid=eq.${PROBE_ITTFID_REJECT}`,
      { headers: adminHeaders() }
    );
    const players = (await playersRes.json()) as unknown[];
    expect(players).toHaveLength(0);
  });
});

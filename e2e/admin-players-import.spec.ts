import { test, expect } from "@playwright/test";
import {
  createUser,
  generateTestEmail,
  login,
  setUserRole,
} from "./utils/auth";
import { SUPABASE_URL, adminHeaders } from "./utils/supabase";

// TT-198: admin trigger for the WTT player importer.
//
// Scope: this test covers the *loader* path — counts banner +
// proposal-queue render against the real local Supabase. The "Run
// import" action hits the real WTT endpoint, which (a) is slow and (b)
// would pollute the DB with ~800 proposals per CI run, so the full
// propose→approve→/players/:slug lifecycle is covered separately in
// TT-199's spec where the proposal is seeded directly.
//
// Memory note: new server-side data-loading paths need e2e — mocked-
// Supabase unit tests don't catch PostgREST query-shape bugs.

const PROBE_ITTFIDS = [999800, 999801, 999802];

async function clearProbeProposals(): Promise<void> {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/player_proposals?ittfid=in.(${PROBE_ITTFIDS.join(",")})`,
    { method: "DELETE", headers: adminHeaders() }
  );
  if (!res.ok && res.status !== 404) {
    throw new Error(
      `clearProbeProposals failed (${res.status}): ${await res.text()}`
    );
  }
}

async function seedProbeProposals(): Promise<void> {
  const rows = [
    {
      ittfid: 999800,
      merged: { name: "Probe Alpha" },
      candidates: { wtt: { name: "Probe Alpha" } },
      status: "pending_review",
    },
    {
      ittfid: 999801,
      merged: { name: "Probe Beta" },
      candidates: { wtt: { name: "Probe Beta" } },
      status: "applied",
    },
    {
      ittfid: 999802,
      merged: { name: "Probe Gamma" },
      candidates: { wtt: { name: "Probe Gamma" } },
      status: "rejected",
    },
  ];
  const res = await fetch(`${SUPABASE_URL}/rest/v1/player_proposals`, {
    method: "POST",
    headers: { ...adminHeaders(), Prefer: "return=minimal" },
    body: JSON.stringify(rows),
  });
  if (!res.ok) {
    throw new Error(
      `seedProbeProposals failed (${res.status}): ${await res.text()}`
    );
  }
}

test.describe("Player importer admin page", () => {
  test("renders proposal counts from player_proposals", async ({ page }) => {
    const adminEmail = generateTestEmail("playerimp");
    const { userId: adminId } = await createUser(adminEmail);
    await setUserRole(adminId, "admin");

    try {
      await clearProbeProposals();
      await seedProbeProposals();

      await login(page, adminEmail);
      await page.goto("/admin/players-import");

      await expect(
        page.getByRole("heading", { name: /player importer/i })
      ).toBeVisible();

      // Counts pull from player_proposals via the loader's
      // PostgREST .select("status") call. The bucket totals must
      // include our probe rows.
      const pending = await page
        .getByTestId("proposal-count-pending")
        .textContent();
      expect(parseInt(pending ?? "0", 10)).toBeGreaterThanOrEqual(1);

      // Button is present and enabled.
      await expect(page.getByTestId("run-import-button")).toBeEnabled();
    } finally {
      await clearProbeProposals();
    }
  });
});

import { test, expect } from "@playwright/test";
import {
  createUser,
  deleteUser,
  generateTestEmail,
  login,
  setUserRole,
} from "./utils/auth";

// Serialize: each test mutates the same `getFirstEquipment` row.
// Running in parallel would let one test clear or restore state mid-
// flight under another, producing flaky "card not visible" failures.
test.describe.configure({ mode: "serial" });
import {
  clearEquipmentImage,
  deleteCandidatesForEquipment,
  getCandidatesForEquipment,
  getFirstEquipment,
  insertEquipmentPhotoCandidates,
  setEquipmentImage,
  snapshotEquipmentImage,
  type EquipmentImageSnapshot,
} from "./utils/data";

// TT-56: admin equipment photo review queue.
//
// Hermetic: candidates are seeded directly into Postgres rather than
// triggered via the Brave/CF Images pipeline. The CF delete that
// pickCandidate fires on runners-up will fail (no real CF account in
// test env) but review.server's deleteCandidates wraps it in a
// .catch, so the DB side stays consistent. That's exactly the
// behaviour we want production-side too if CF ever 5xx's.

// Real R2 keys would be `equipment/<slug>/cand/<uuid>.<ext>` — these
// fixtures don't have to point at actual R2 objects since the admin
// queue UI just renders the URL and the action operations are
// best-effort R2 deletes (wrapped in .catch in deleteCandidates).
const FAKE_KEY_A = "equipment/test/cand/11111111.png";
const FAKE_KEY_B = "equipment/test/cand/22222222.png";

async function withFixture(
  fn: (args: {
    equipmentId: string;
    equipmentSlug: string;
    candidateAId: string;
    candidateBId: string;
    snapshot: EquipmentImageSnapshot;
  }) => Promise<void>
): Promise<void> {
  const equipment = await getFirstEquipment();
  const snapshot = await snapshotEquipmentImage(equipment.id);

  await deleteCandidatesForEquipment(equipment.id);
  await clearEquipmentImage(equipment.id);

  const inserted = await insertEquipmentPhotoCandidates(equipment.id, [
    {
      r2_key: FAKE_KEY_A,
      source_url: "https://www.revspin.net/test-a",
      image_source_host: "www.revspin.net",
      source_label: "revspin",
      match_kind: "trailing",
      tier: 1,
    },
    {
      r2_key: FAKE_KEY_B,
      source_url: "https://contra.de/test-b",
      image_source_host: "contra.de",
      source_label: "contra",
      match_kind: "loose",
      tier: 2,
    },
  ]);

  try {
    await fn({
      equipmentId: equipment.id,
      equipmentSlug: equipment.slug,
      candidateAId: inserted[0].id,
      candidateBId: inserted[1].id,
      snapshot,
    });
  } finally {
    await deleteCandidatesForEquipment(equipment.id);
    await setEquipmentImage(equipment.id, snapshot);
  }
}

test("admin picks a candidate → equipment.image_key is set, runners-up are removed", async ({
  page,
}) => {
  const adminEmail = generateTestEmail("photoadm");
  const { userId: adminId } = await createUser(adminEmail);
  await setUserRole(adminId, "admin");

  try {
    await withFixture(async ({ equipmentSlug, candidateAId, equipmentId }) => {
      await login(page, adminEmail);
      await page.goto("/admin/equipment-photos");
      await expect(page).toHaveURL(/\/admin\/equipment-photos$/);

      const card = page.locator(
        `[data-testid="equipment-review-card"][data-equipment-slug="${equipmentSlug}"]`
      );
      await expect(card).toBeVisible();

      const tile = card.locator(
        `[data-testid="candidate-tile"][data-candidate-id="${candidateAId}"]`
      );
      await expect(tile).toBeVisible();
      await tile.getByTestId("candidate-pick").click();

      // Loader revalidates after the redirect; the row should drop
      // out of the queue once image_key is set.
      await expect(card).toHaveCount(0, { timeout: 10000 });

      const snapshot = await snapshotEquipmentImage(equipmentId);
      expect(snapshot.image_key).toBe(FAKE_KEY_A);
      expect(snapshot.image_etag).toBe(FAKE_KEY_A.slice(-12));

      const remaining = await getCandidatesForEquipment(equipmentId);
      expect(remaining).toHaveLength(1);
      expect(remaining[0].picked_at).not.toBeNull();
      expect(remaining[0].r2_key).toBe(FAKE_KEY_A);
    });
  } finally {
    await deleteUser(adminId);
  }
});

test("admin clicks 'None of these' → image_skipped_at set, candidates cleared", async ({
  page,
}) => {
  const adminEmail = generateTestEmail("photoadm");
  const { userId: adminId } = await createUser(adminEmail);
  await setUserRole(adminId, "admin");

  try {
    await withFixture(async ({ equipmentSlug, equipmentId }) => {
      await login(page, adminEmail);
      await page.goto("/admin/equipment-photos");

      const card = page.locator(
        `[data-testid="equipment-review-card"][data-equipment-slug="${equipmentSlug}"]`
      );
      await expect(card).toBeVisible();
      await card.getByRole("button", { name: /None of these/i }).click();

      await expect(card).toHaveCount(0, { timeout: 10000 });

      const snapshot = await snapshotEquipmentImage(equipmentId);
      expect(snapshot.image_key).toBeNull();
      expect(snapshot.image_skipped_at).not.toBeNull();

      const remaining = await getCandidatesForEquipment(equipmentId);
      expect(remaining).toHaveLength(0);
    });
  } finally {
    await deleteUser(adminId);
  }
});

// Regression guard for the route-collision class of bug: when admin
// clicks "Source next chunk", the form must POST to a real route, not
// a 404. We don't exercise the full Brave + R2 pipeline here (that's
// covered by the bulk.server unit tests with mocks). All we want to
// know is "does the URL exist and accept admin POSTs?". A 500 from a
// missing BRAVE_SEARCH_API_KEY in test would be acceptable; a 404 is
// the failure mode this test exists to prevent.
test("'Source next chunk' button POSTs to a non-404 route", async ({
  page,
}) => {
  const adminEmail = generateTestEmail("photoadm");
  const { userId: adminId } = await createUser(adminEmail);
  await setUserRole(adminId, "admin");

  try {
    await login(page, adminEmail);
    await page.goto("/admin/equipment-photos");

    // Capture the response status of the POST initiated by the form
    // submission. The button performs a `fetch`-like navigation (RR
    // Form), so we listen on the network for the request URL.
    const responsePromise = page.waitForResponse(resp =>
      resp.url().includes("/admin/equipment-photos-bulk-source")
    );
    await page.getByRole("button", { name: /Source next chunk/i }).click();
    const response = await responsePromise;

    // The point of this test is to catch route-collision regressions
    // where flatRoutes maps the URL to a non-existent or unrenderable
    // route. Any meaningful response (auth gate, rate limit, success
    // redirect, or even a 5xx from missing prod creds) proves the URL
    // is wired up. A 404 or "Not Found" body is the failure mode.
    expect(response.status()).not.toBe(404);
  } finally {
    await deleteUser(adminId);
  }
});

test("admin rejects a single candidate → only that candidate disappears", async ({
  page,
}) => {
  const adminEmail = generateTestEmail("photoadm");
  const { userId: adminId } = await createUser(adminEmail);
  await setUserRole(adminId, "admin");

  try {
    await withFixture(
      async ({ equipmentSlug, equipmentId, candidateAId, candidateBId }) => {
        await login(page, adminEmail);
        await page.goto("/admin/equipment-photos");

        const card = page.locator(
          `[data-testid="equipment-review-card"][data-equipment-slug="${equipmentSlug}"]`
        );
        const tileA = card.locator(
          `[data-testid="candidate-tile"][data-candidate-id="${candidateAId}"]`
        );
        const tileB = card.locator(
          `[data-testid="candidate-tile"][data-candidate-id="${candidateBId}"]`
        );
        await expect(tileA).toBeVisible();
        await expect(tileB).toBeVisible();

        await tileA.getByTestId("candidate-reject").click();

        // Card should still be visible with the other candidate.
        await expect(card).toBeVisible();
        await expect(tileA).toHaveCount(0);
        await expect(tileB).toBeVisible();

        const remaining = await getCandidatesForEquipment(equipmentId);
        expect(remaining.map(r => r.r2_key)).toEqual([FAKE_KEY_B]);
      }
    );
  } finally {
    await deleteUser(adminId);
  }
});

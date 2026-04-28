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
// clicks "Enqueue all unsourced", the form must POST to a real route,
// not a 404. TT-91 replaced the chunk-by-chunk "Source next chunk"
// button with this queue-driven path. We don't exercise the queue
// drain here (TT-92 covers that); only the route's existence + admin
// gating + CSRF.
test("'Enqueue all unsourced' button POSTs to a non-404 route", async ({
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
      resp.url().includes("/admin/equipment-photos-enqueue-all")
    );
    await page.getByTestId("enqueue-all-button").click();
    const response = await responsePromise;

    // Any non-404 means the URL is wired. The action might 500 in dev
    // because the queue binding is unbound under non-wrangler-dev test
    // contexts (e2e uses `npm run dev` which DOES bind PHOTO_SOURCE_
    // QUEUE locally via Miniflare, so 200/302 is the expected case
    // here). 404 is the failure mode this test exists to prevent.
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

// TT-88: admin manual force-trim toggle on the public equipment detail
// page. Sets equipment.image_trim_kind between 'border' and NULL so
// buildEquipmentImageUrl injects `,trim=border` into variant URLs.
test("admin can toggle image trim on the public equipment page", async ({
  page,
}) => {
  const adminEmail = generateTestEmail("trimadm");
  const { userId: adminId } = await createUser(adminEmail);
  await setUserRole(adminId, "admin");

  const equipment = await getFirstEquipment();
  const snapshot = await snapshotEquipmentImage(equipment.id);

  // Need image_key set so the toggle widget renders. trim_kind starts
  // null so the first click should switch it to 'border'.
  await setEquipmentImage(equipment.id, {
    image_key: "equipment/test/picked.png",
    image_trim_kind: null,
  });

  try {
    await login(page, adminEmail);
    await page.goto(`/equipment/${equipment.slug}`);

    const toggle = page.getByTestId("admin-trim-toggle");
    await expect(toggle).toBeVisible();

    const status = page.getByTestId("admin-trim-status");
    await expect(status).toHaveAttribute("data-trim-kind", "null");

    await page.getByTestId("admin-trim-button").click();
    // Action redirects back to the public page; loader revalidates.
    await expect(status).toHaveAttribute("data-trim-kind", "border");

    let after = await snapshotEquipmentImage(equipment.id);
    expect(after.image_trim_kind).toBe("border");

    // Toggle off.
    await page.getByTestId("admin-trim-button").click();
    await expect(status).toHaveAttribute("data-trim-kind", "null");
    after = await snapshotEquipmentImage(equipment.id);
    expect(after.image_trim_kind).toBeNull();
  } finally {
    await setEquipmentImage(equipment.id, snapshot);
    await deleteUser(adminId);
  }
});

test("non-admin user does not see the trim toggle", async ({ page }) => {
  const userEmail = generateTestEmail("triuser");
  const { userId } = await createUser(userEmail);
  // Default role is `user`; no setUserRole call.

  const equipment = await getFirstEquipment();
  const snapshot = await snapshotEquipmentImage(equipment.id);

  await setEquipmentImage(equipment.id, {
    image_key: "equipment/test/picked.png",
    image_trim_kind: null,
  });

  try {
    await login(page, userEmail);
    await page.goto(`/equipment/${equipment.slug}`);

    // Page renders, toggle does not.
    await expect(
      page.getByRole("heading", { name: equipment.name })
    ).toBeVisible();
    await expect(page.getByTestId("admin-trim-toggle")).toHaveCount(0);
  } finally {
    await setEquipmentImage(equipment.id, snapshot);
    await deleteUser(userId);
  }
});

// TT-92: end-to-end smoke for the photo-source queue. Verifies the
// chain admin-click → action-route → queue.send → queue() handler →
// processOneSourceMessage → DB writeback. The test stub provider
// (TEST_SOURCING_PROVIDER=true, set by playwright.config.ts) returns
// status='ok' with no candidates, so the consumer hits the
// no-candidates branch and stamps image_sourcing_attempted_at — that's
// the assertion target.
//
// Fully exercising auto-pick / review-queue paths requires fakeable
// image bytes for R2 PUT, which would mean stubbing fetchImpl on the
// queue side too. That's covered by unit tests (queue.test.ts);
// here we just want the integration-level confidence that the queue
// plumbing works under wrangler dev's Miniflare Queues.
test("queue end-to-end: enqueue → consumer drains → attempted_at stamped", async ({
  page,
}) => {
  const adminEmail = generateTestEmail("queueadm");
  const { userId: adminId } = await createUser(adminEmail);
  await setUserRole(adminId, "admin");

  const equipment = await getFirstEquipment();
  const snapshot = await snapshotEquipmentImage(equipment.id);

  // Reset to the unsourced state so 'Enqueue all unsourced' picks it
  // up. Local seed typically leaves rows already-attempted; without
  // this clear the click would enqueue zero messages.
  await setEquipmentImage(equipment.id, {
    image_key: null,
    image_etag: null,
    image_credit_text: null,
    image_credit_link: null,
    image_license_short: null,
    image_license_url: null,
    image_source_url: null,
    image_skipped_at: null,
    image_sourcing_attempted_at: null,
    image_trim_kind: null,
  });

  try {
    await login(page, adminEmail);
    await page.goto("/admin/equipment-photos");
    await page.getByTestId("enqueue-all-button").click();

    // Poll for attempted_at to flip from null. The queue + consumer
    // need a moment to wake up under Miniflare; 20s is conservative
    // for a single-message drain.
    const deadline = Date.now() + 20_000;
    let after: EquipmentImageSnapshot | null = null;
    while (Date.now() < deadline) {
      after = await snapshotEquipmentImage(equipment.id);
      if (after.image_sourcing_attempted_at) break;
      await page.waitForTimeout(500);
    }
    expect(after?.image_sourcing_attempted_at).toBeTruthy();
  } finally {
    await setEquipmentImage(equipment.id, snapshot);
    await deleteUser(adminId);
  }
});

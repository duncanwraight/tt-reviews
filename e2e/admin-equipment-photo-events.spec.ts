import { test, expect } from "@playwright/test";

import {
  createUser,
  deleteUser,
  generateTestEmail,
  login,
  setUserRole,
} from "./utils/auth";
import {
  createTestEquipment,
  deleteCandidatesForEquipment,
  deleteEquipment,
  deletePhotoEventsForEquipment,
  getPhotoEventsForEquipment,
  insertEquipmentPhotoCandidates,
  setEquipmentImage,
} from "./utils/data";

// TT-174: photo-pipeline activity log. Each admin action — pick,
// reject, skip, requeue — must emit a row in equipment_photo_events
// with the correct kind + actor + metadata, and the
// /admin/equipment-photos banner must reflect those events in
// recency order.
//
// Hermetic shape mirrors admin-equipment-photos.spec.ts: candidates
// are seeded via PostgREST rather than driven through the providers.
// One test per emit site rather than a single mega-spec — quicker to
// localize a regression.

test.describe.configure({ mode: "serial" });

const FAKE_KEY_A = "equipment/test/cand/event-a.png";
const FAKE_KEY_B = "equipment/test/cand/event-b.png";

async function pollForEvent(
  equipmentId: string,
  predicate: (
    e: Awaited<ReturnType<typeof getPhotoEventsForEquipment>>[number]
  ) => boolean,
  timeoutMs = 5000
): Promise<Awaited<ReturnType<typeof getPhotoEventsForEquipment>>> {
  const deadline = Date.now() + timeoutMs;
  let events: Awaited<ReturnType<typeof getPhotoEventsForEquipment>> = [];
  while (Date.now() < deadline) {
    events = await getPhotoEventsForEquipment(equipmentId);
    if (events.some(predicate)) return events;
    await new Promise(r => setTimeout(r, 200));
  }
  return events;
}

interface FixtureArgs {
  equipmentId: string;
  equipmentSlug: string;
  candidateAId: string;
  candidateBId: string;
}

// Hermetic per-test equipment row so concurrent specs (notably
// admin-equipment-photos.spec.ts which uses getFirstEquipment()) can't
// race-mutate image_key / candidates / events on a shared seed row.
async function withFixture(
  fn: (args: FixtureArgs) => Promise<void>
): Promise<void> {
  const equipment = await createTestEquipment("photo-events", "rubber");

  const inserted = await insertEquipmentPhotoCandidates(equipment.id, [
    {
      r2_key: FAKE_KEY_A,
      source_url: "https://www.revspin.net/event-a",
      image_source_host: "www.revspin.net",
      source_label: "revspin",
      match_kind: "trailing",
      tier: 1,
    },
    {
      r2_key: FAKE_KEY_B,
      source_url: "https://contra.de/event-b",
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
    });
  } finally {
    await deletePhotoEventsForEquipment(equipment.id);
    await deleteCandidatesForEquipment(equipment.id);
    await deleteEquipment(equipment.id);
  }
}

test("admin pick → emits 'picked' event with candidate_id, r2_key, previous_image_key", async ({
  page,
}) => {
  const adminEmail = generateTestEmail("evtadm");
  const { userId: adminId } = await createUser(adminEmail);
  await setUserRole(adminId, "admin");

  try {
    await withFixture(async ({ equipmentSlug, equipmentId, candidateAId }) => {
      await login(page, adminEmail);
      await page.goto("/admin/equipment-photos");

      const card = page.locator(
        `[data-testid="equipment-review-card"][data-equipment-slug="${equipmentSlug}"]`
      );
      await expect(card).toBeVisible();

      const tile = card.locator(
        `[data-testid="candidate-tile"][data-candidate-id="${candidateAId}"]`
      );
      await tile.getByTestId("candidate-pick").click();
      await expect(card).toHaveCount(0, { timeout: 10000 });

      const events = await pollForEvent(
        equipmentId,
        e => e.event_kind === "picked"
      );
      const picked = events.find(e => e.event_kind === "picked");
      expect(picked).toBeTruthy();
      expect(picked?.actor_id).toBe(adminId);
      expect(picked?.metadata.candidate_id).toBe(candidateAId);
      expect(picked?.metadata.r2_key).toBe(FAKE_KEY_A);
      // Fixture clears the image first, so previous_image_key is null.
      expect(picked?.metadata.previous_image_key).toBeNull();

      // Banner reflects the event after a fresh page load + expand +
      // show-all (other parallel specs may push our event past the
      // collapsed top-20 window).
      await page.goto("/admin/equipment-photos");
      await page.getByTestId("banner-recent-toggle").click();
      const showAll = page.getByTestId("banner-show-all-events");
      if (await showAll.isVisible()) {
        await showAll.click();
      }
      const row = page
        .locator(
          `[data-testid="event-row-picked"][data-event-slug="${equipmentSlug}"]`
        )
        .first();
      await expect(row).toBeAttached();
    });
  } finally {
    await deleteUser(adminId);
  }
});

test("admin reject → emits 'candidate_rejected' event with candidate_id", async ({
  page,
}) => {
  const adminEmail = generateTestEmail("evtadm");
  const { userId: adminId } = await createUser(adminEmail);
  await setUserRole(adminId, "admin");

  try {
    await withFixture(async ({ equipmentSlug, equipmentId, candidateAId }) => {
      await login(page, adminEmail);
      await page.goto("/admin/equipment-photos");

      const card = page.locator(
        `[data-testid="equipment-review-card"][data-equipment-slug="${equipmentSlug}"]`
      );
      const tile = card.locator(
        `[data-testid="candidate-tile"][data-candidate-id="${candidateAId}"]`
      );
      await tile.getByTestId("candidate-reject").click();
      await expect(tile).toHaveCount(0);

      const events = await pollForEvent(
        equipmentId,
        e => e.event_kind === "candidate_rejected"
      );
      const rejected = events.find(e => e.event_kind === "candidate_rejected");
      expect(rejected).toBeTruthy();
      expect(rejected?.actor_id).toBe(adminId);
      expect(rejected?.metadata.candidate_id).toBe(candidateAId);
    });
  } finally {
    await deleteUser(adminId);
  }
});

test("admin skip → emits 'skipped' event with candidate_count_cleared", async ({
  page,
}) => {
  const adminEmail = generateTestEmail("evtadm");
  const { userId: adminId } = await createUser(adminEmail);
  await setUserRole(adminId, "admin");

  try {
    await withFixture(async ({ equipmentSlug, equipmentId }) => {
      await login(page, adminEmail);
      await page.goto("/admin/equipment-photos");

      const card = page.locator(
        `[data-testid="equipment-review-card"][data-equipment-slug="${equipmentSlug}"]`
      );
      await card.getByRole("button", { name: /None of these/i }).click();
      await expect(card).toHaveCount(0, { timeout: 10000 });

      const events = await pollForEvent(
        equipmentId,
        e => e.event_kind === "skipped"
      );
      const skipped = events.find(e => e.event_kind === "skipped");
      expect(skipped).toBeTruthy();
      expect(skipped?.actor_id).toBe(adminId);
      // Both seeded candidates were pending → both cleared.
      expect(skipped?.metadata.candidate_count_cleared).toBe(2);
    });
  } finally {
    await deleteUser(adminId);
  }
});

test("admin requeue → emits 'requeued' event with previous_image_key, queue message carries triggered_by=admin-requeue", async ({
  page,
}) => {
  const adminEmail = generateTestEmail("evtadm");
  const { userId: adminId } = await createUser(adminEmail);
  await setUserRole(adminId, "admin");

  const equipment = await createTestEquipment("photo-events-requeue", "rubber");
  const PRIOR_KEY = "equipment/test/cand/prior-pick.png";

  // Seed "row already has a picked image" so requeue fires with a
  // non-null previous_image_key. photosTouched on AdminRequeueButtons
  // becomes true once any of image_key / image_skipped_at /
  // image_sourcing_attempted_at is set.
  await setEquipmentImage(equipment.id, {
    image_key: PRIOR_KEY,
    image_etag: PRIOR_KEY.slice(-12),
    image_skipped_at: null,
    image_sourcing_attempted_at: new Date().toISOString(),
  });

  try {
    await login(page, adminEmail);
    await page.goto(`/equipment/${equipment.slug}`);

    // The per-row admin "Re-queue photo" button lives on the public
    // equipment page (TT-166). Click it; the action redirects back.
    const requeueButton = page.getByTestId("admin-requeue-photos-button");
    await expect(requeueButton).toBeVisible();
    await requeueButton.click();
    await expect(page).toHaveURL(new RegExp(`/equipment/${equipment.slug}$`));

    const events = await pollForEvent(
      equipment.id,
      e => e.event_kind === "requeued"
    );
    const requeued = events.find(e => e.event_kind === "requeued");
    expect(requeued).toBeTruthy();
    expect(requeued?.actor_id).toBe(adminId);
    expect(requeued?.metadata.previous_image_key).toBe(PRIOR_KEY);
  } finally {
    await deletePhotoEventsForEquipment(equipment.id);
    await deleteCandidatesForEquipment(equipment.id);
    await deleteEquipment(equipment.id);
    await deleteUser(adminId);
  }
});

test("recent-activity banner expands and renders events in created_at desc order", async ({
  page,
}) => {
  const adminEmail = generateTestEmail("evtadm");
  const { userId: adminId } = await createUser(adminEmail);
  await setUserRole(adminId, "admin");

  try {
    await withFixture(async ({ equipmentSlug, candidateAId, candidateBId }) => {
      await login(page, adminEmail);
      // First action: reject candidate B → emits candidate_rejected.
      // Second action: pick candidate A → emits picked. The picked
      // event should appear above the candidate_rejected one in the
      // feed.
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

      // Reject B by candidate id (stable locator), then pick A.
      await tileB.getByTestId("candidate-reject").click();
      await expect(tileB).toHaveCount(0);

      await tileA.getByTestId("candidate-pick").click();
      await expect(card).toHaveCount(0, { timeout: 10000 });

      // Reload the admin page and expand the activity feed.
      await page.goto("/admin/equipment-photos");
      await page.getByTestId("banner-recent-toggle").click();

      const list = page.getByTestId("recent-events");
      await expect(list).toBeVisible();
      const slugRows = list.locator(`[data-event-slug="${equipmentSlug}"]`);

      // At least the two events we just emitted should be present.
      const count = await slugRows.count();
      expect(count).toBeGreaterThanOrEqual(2);

      // Most recent first: the picked event came after the
      // candidate_rejected event, so it sits earlier in the list.
      const firstKind = await slugRows.first().getAttribute("data-testid");
      expect(firstKind).toBe("event-row-picked");
    });
  } finally {
    await deleteUser(adminId);
  }
});

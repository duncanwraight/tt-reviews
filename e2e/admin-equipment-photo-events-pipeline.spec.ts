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
  setEquipmentImage,
  setEquipmentSlug,
  type PhotoEventRow,
} from "./utils/data";

// TT-174: cron / queue-side events. Drives the photo-source queue
// end-to-end via the test provider (TEST_SOURCING_PROVIDER=true,
// playwright.config.ts) and asserts equipment_photo_events reflects
// every kind we can elicit through the queue path:
//   sourcing_attempted, no_candidates, provider_transient.
//
// We use the per-row admin re-queue button rather than 'Enqueue all
// unsourced' — the latter would queue every never-sourced row in the
// seed (or in other parallel specs' fixtures) and stamp
// image_sourcing_attempted_at on them, breaking specs that assert on
// pristine row state. The re-queue button gives `triggered_by:
// admin-requeue` instead of 'cron', but the source/queue plumbing
// being exercised is identical — and the cron path is unit-tested.
//
// candidates_found / routed_to_review / auto_picked require
// fetchable image bytes from the provider — those are covered by
// queue.test.ts unit tests, not e2e.
//
// resourced is admin-driven from the review queue; the four other
// admin paths (picked, candidate_rejected, skipped, requeued) live
// in admin-equipment-photo-events.spec.ts.

test.describe.configure({ mode: "serial" });

async function pollForEvent(
  equipmentId: string,
  predicate: (e: PhotoEventRow) => boolean,
  timeoutMs = 20_000
): Promise<PhotoEventRow[]> {
  const deadline = Date.now() + timeoutMs;
  let events: PhotoEventRow[] = [];
  while (Date.now() < deadline) {
    events = await getPhotoEventsForEquipment(equipmentId);
    if (events.some(predicate)) return events;
    await new Promise(r => setTimeout(r, 500));
  }
  return events;
}

// Pre-stamp image_sourcing_attempted_at so AdminRequeueButtons sees
// photosTouched=true and renders the button enabled. The requeue
// action clears the cooldown anyway, so this is just to unblock the
// click — it doesn't affect the assertion target.
async function prepareRequeueable(equipmentId: string): Promise<void> {
  await setEquipmentImage(equipmentId, {
    image_key: null,
    image_etag: null,
    image_credit_text: null,
    image_credit_link: null,
    image_license_short: null,
    image_license_url: null,
    image_source_url: null,
    image_skipped_at: null,
    image_sourcing_attempted_at: new Date().toISOString(),
    image_trim_kind: null,
  });
}

test("admin re-queue drains and emits sourcing_attempted + no_candidates with triggered_by=admin-requeue", async ({
  page,
}) => {
  const adminEmail = generateTestEmail("evtpipe");
  const { userId: adminId } = await createUser(adminEmail);
  await setUserRole(adminId, "admin");

  const equipment = await createTestEquipment("photo-evtpipe", "rubber");
  await prepareRequeueable(equipment.id);

  try {
    await login(page, adminEmail);
    await page.goto(`/equipment/${equipment.slug}`);
    await page.getByTestId("admin-requeue-photos-button").click();
    await expect(page).toHaveURL(new RegExp(`/equipment/${equipment.slug}$`));

    const events = await pollForEvent(
      equipment.id,
      e => e.event_kind === "no_candidates"
    );

    const sourcing = events.find(e => e.event_kind === "sourcing_attempted");
    const noCandidates = events.find(e => e.event_kind === "no_candidates");
    expect(sourcing).toBeTruthy();
    expect(noCandidates).toBeTruthy();
    // sourcing_attempted lands first (recorded at start of source);
    // no_candidates after providers settled. created_at is desc-sorted
    // so sourcing should appear later (older) in the array.
    const sourcingTime = new Date(sourcing!.created_at).getTime();
    const noCandTime = new Date(noCandidates!.created_at).getTime();
    expect(sourcingTime).toBeLessThanOrEqual(noCandTime);

    // Triggered via the per-row admin re-queue, so the queue message
    // carries triggered_by=admin-requeue and source forwards that into
    // the sourcing_attempted metadata.
    expect(sourcing!.metadata.triggered_by).toBe("admin-requeue");
    expect(sourcing!.actor_id).toBeNull();
  } finally {
    await deletePhotoEventsForEquipment(equipment.id);
    await deleteCandidatesForEquipment(equipment.id);
    await deleteEquipment(equipment.id);
    await deleteUser(adminId);
  }
});

test("admin re-queue on a *-rate slug emits provider_transient with reason + attempts", async ({
  page,
}) => {
  const adminEmail = generateTestEmail("evtpipe");
  const { userId: adminId } = await createUser(adminEmail);
  await setUserRole(adminId, "admin");

  const equipment = await createTestEquipment("photo-evtpipe", "rubber");
  // Slug-suffix triggers the test provider's rate_limited branch.
  const renamedSlug = `${equipment.slug}-rate`;
  await setEquipmentSlug(equipment.id, renamedSlug);
  await prepareRequeueable(equipment.id);

  try {
    await login(page, adminEmail);
    await page.goto(`/equipment/${renamedSlug}`);
    await page.getByTestId("admin-requeue-photos-button").click();
    await expect(page).toHaveURL(new RegExp(`/equipment/${renamedSlug}$`));

    const events = await pollForEvent(
      equipment.id,
      e => e.event_kind === "provider_transient"
    );

    const transient = events.find(e => e.event_kind === "provider_transient");
    expect(transient).toBeTruthy();
    expect(transient?.metadata.provider).toBe("test");
    expect(transient?.metadata.reason).toBe("rate_limited");
    expect(typeof transient?.metadata.attempts).toBe("number");

    // sourcing_attempted is also emitted even when providers all
    // came back transient — it's "providers ran" not "providers ok".
    const sourcing = events.find(e => e.event_kind === "sourcing_attempted");
    expect(sourcing).toBeTruthy();
  } finally {
    await deletePhotoEventsForEquipment(equipment.id);
    await deleteCandidatesForEquipment(equipment.id);
    await deleteEquipment(equipment.id);
    await deleteUser(adminId);
  }
});

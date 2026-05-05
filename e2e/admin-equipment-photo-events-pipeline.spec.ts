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
  setEquipmentSlug,
  type PhotoEventRow,
} from "./utils/data";

// TT-174: cron / queue-side events. Drives the photo-source queue
// end-to-end via the test provider (TEST_SOURCING_PROVIDER=true,
// playwright.config.ts) and asserts equipment_photo_events reflects
// every kind we can elicit through the queue path:
//   sourcing_attempted, no_candidates, provider_transient.
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

test("queue drain on default slug emits sourcing_attempted + no_candidates", async ({
  page,
}) => {
  const adminEmail = generateTestEmail("evtpipe");
  const { userId: adminId } = await createUser(adminEmail);
  await setUserRole(adminId, "admin");

  // Hermetic per-test row — created unsourced (image_key + flags
  // already null on a fresh insert) so 'Enqueue all unsourced' will
  // pick it up. No teardown of foreign-row state needed.
  const equipment = await createTestEquipment("photo-evtpipe", "rubber");

  try {
    await login(page, adminEmail);
    await page.goto("/admin/equipment-photos");
    await page.getByTestId("enqueue-all-button").click();

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

    // Default fixture has no admin-requeue or queue-retry hint, so
    // metadata.triggered_by is 'cron' (the helper's default).
    expect(sourcing!.metadata.triggered_by).toBe("cron");
    expect(sourcing!.actor_id).toBeNull();
  } finally {
    await deletePhotoEventsForEquipment(equipment.id);
    await deleteCandidatesForEquipment(equipment.id);
    await deleteEquipment(equipment.id);
    await deleteUser(adminId);
  }
});

test("queue drain on a *-rate slug emits provider_transient with reason + attempts", async ({
  page,
}) => {
  const adminEmail = generateTestEmail("evtpipe");
  const { userId: adminId } = await createUser(adminEmail);
  await setUserRole(adminId, "admin");

  // Hermetic per-test row, then rename the slug so it ends in "-rate"
  // — that suffix triggers the test provider's rate_limited branch.
  const equipment = await createTestEquipment("photo-evtpipe", "rubber");
  const renamedSlug = `${equipment.slug}-rate`;
  await setEquipmentSlug(equipment.id, renamedSlug);

  try {
    await login(page, adminEmail);
    await page.goto("/admin/equipment-photos");
    await page.getByTestId("enqueue-all-button").click();

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

import { test, expect } from "@playwright/test";
import {
  createUser,
  deleteUser,
  generateTestEmail,
  login,
  setUserRole,
} from "./utils/auth";

// Serialize: each test mutates the same blade fixture row's sourcing
// state. Running in parallel would let one test clear another's
// seeded cooldown mid-flight.
test.describe.configure({ mode: "serial" });

import {
  deleteCandidatesForEquipment,
  deleteSpecProposalsForEquipment,
  getEquipmentSpecsAndDescription,
  getFirstEquipmentByCategory,
  setEquipmentImage,
  setEquipmentSpecsCooldown,
  snapshotEquipmentImage,
  type EquipmentImageSnapshot,
} from "./utils/data";

// TT-166: per-equipment admin re-queue buttons on /equipment/:slug.
// Asserts the buttons render under the right gating; the underlying
// wipe + queue.send logic is covered by the unit tests for
// requeueOneEquipmentSpecs / requeueOneEquipmentPhotos. We don't drive
// the click→drain path end-to-end here because the spec-sourcing
// consumer races the assertion (it wakes immediately, finds no
// candidates in the test environment, and re-stamps the cooldown
// columns we'd want to assert as cleared).

test("admin sees both re-queue buttons enabled when sourcing has run", async ({
  page,
}) => {
  const adminEmail = generateTestEmail("requadm");
  const { userId: adminId } = await createUser(adminEmail);
  await setUserRole(adminId, "admin");

  const equipment = await getFirstEquipmentByCategory("blade");
  const imageSnapshot = await snapshotEquipmentImage(equipment.id);
  const specsSnapshot = await getEquipmentSpecsAndDescription(equipment.id);

  // Plant "previously-sourced" state so the buttons enable.
  await deleteSpecProposalsForEquipment(equipment.id);
  await deleteCandidatesForEquipment(equipment.id);
  await setEquipmentSpecsCooldown(equipment.id, {
    specs_source_status: "no_results",
    specs_sourced_at: new Date().toISOString(),
  });
  await setEquipmentImage(equipment.id, {
    image_sourcing_attempted_at: new Date().toISOString(),
  });

  try {
    await login(page, adminEmail);
    await page.goto(`/equipment/${equipment.slug}`);

    await expect(page.getByTestId("admin-requeue-specs-button")).toBeEnabled();
    await expect(page.getByTestId("admin-requeue-photos-button")).toBeEnabled();
  } finally {
    await setEquipmentSpecsCooldown(equipment.id, {
      specifications: specsSnapshot.specifications,
      description: specsSnapshot.description,
      specs_source_status: specsSnapshot.specs_source_status,
      specs_sourced_at: specsSnapshot.specs_sourced_at,
    });
    await setEquipmentImage(equipment.id, imageSnapshot);
    await deleteUser(adminId);
  }
});

test("admin sees re-queue buttons disabled when sourcing has never run", async ({
  page,
}) => {
  const adminEmail = generateTestEmail("requadm");
  const { userId: adminId } = await createUser(adminEmail);
  await setUserRole(adminId, "admin");

  const equipment = await getFirstEquipmentByCategory("blade");
  const imageSnapshot = await snapshotEquipmentImage(equipment.id);
  const specsSnapshot = await getEquipmentSpecsAndDescription(equipment.id);

  // Reset to pristine "never-sourced" state. image_key needs to be
  // null too — the photo button stays enabled when there's a live
  // picked image so admin can request a fresh one.
  await deleteSpecProposalsForEquipment(equipment.id);
  await deleteCandidatesForEquipment(equipment.id);
  await setEquipmentSpecsCooldown(equipment.id, {
    specs_source_status: null,
    specs_sourced_at: null,
  });
  await setEquipmentImage(equipment.id, {
    image_key: null,
    image_etag: null,
    image_sourcing_attempted_at: null,
    image_skipped_at: null,
  } as Partial<EquipmentImageSnapshot>);

  try {
    await login(page, adminEmail);
    await page.goto(`/equipment/${equipment.slug}`);

    await expect(page.getByTestId("admin-requeue-specs-button")).toBeDisabled();
    await expect(
      page.getByTestId("admin-requeue-photos-button")
    ).toBeDisabled();
  } finally {
    await setEquipmentSpecsCooldown(equipment.id, {
      specifications: specsSnapshot.specifications,
      description: specsSnapshot.description,
      specs_source_status: specsSnapshot.specs_source_status,
      specs_sourced_at: specsSnapshot.specs_sourced_at,
    });
    await setEquipmentImage(equipment.id, imageSnapshot);
    await deleteUser(adminId);
  }
});

test("non-admin user does not see the re-queue buttons", async ({ page }) => {
  const userEmail = generateTestEmail("requuser");
  const { userId } = await createUser(userEmail);
  // Default role is `user`; no setUserRole.

  const equipment = await getFirstEquipmentByCategory("blade");

  try {
    await login(page, userEmail);
    await page.goto(`/equipment/${equipment.slug}`);

    await expect(
      page.getByRole("heading", { name: equipment.name })
    ).toBeVisible();
    await expect(page.getByTestId("admin-requeue-specs-button")).toHaveCount(0);
    await expect(page.getByTestId("admin-requeue-photos-button")).toHaveCount(
      0
    );
  } finally {
    await deleteUser(userId);
  }
});

// Regression guard for the route-collision class of bug: clicking the
// admin button must POST to a real route, not a 404. Doesn't drain the
// queue (the consumer races the assertion) — just confirms the URL is
// wired and the action returns 2xx/3xx, mirroring the TT-91 photos
// regression test.
test("clicking the re-queue specs button POSTs to a non-404 route", async ({
  page,
}) => {
  const adminEmail = generateTestEmail("requadm");
  const { userId: adminId } = await createUser(adminEmail);
  await setUserRole(adminId, "admin");

  const equipment = await getFirstEquipmentByCategory("blade");
  const imageSnapshot = await snapshotEquipmentImage(equipment.id);
  const specsSnapshot = await getEquipmentSpecsAndDescription(equipment.id);

  await deleteSpecProposalsForEquipment(equipment.id);
  await setEquipmentSpecsCooldown(equipment.id, {
    specs_source_status: "no_results",
    specs_sourced_at: new Date().toISOString(),
  });

  try {
    await login(page, adminEmail);
    await page.goto(`/equipment/${equipment.slug}`);

    const responsePromise = page.waitForResponse(resp =>
      resp.url().includes(`/admin/equipment/${equipment.slug}/requeue-specs`)
    );
    await page.getByTestId("admin-requeue-specs-button").click();
    const response = await responsePromise;
    expect(response.status()).not.toBe(404);
  } finally {
    await setEquipmentSpecsCooldown(equipment.id, {
      specifications: specsSnapshot.specifications,
      description: specsSnapshot.description,
      specs_source_status: specsSnapshot.specs_source_status,
      specs_sourced_at: specsSnapshot.specs_sourced_at,
    });
    await setEquipmentImage(equipment.id, imageSnapshot);
    await deleteUser(adminId);
  }
});

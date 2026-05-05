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
  deleteSpecProposalsForEquipment,
  setEquipmentImage,
  setEquipmentSpecsCooldown,
} from "./utils/data";

// TT-166: per-equipment admin re-queue buttons on /equipment/:slug.
// Asserts the buttons render under the right gating; the underlying
// wipe + queue.send logic is covered by the unit tests for
// requeueOneEquipmentSpecs / requeueOneEquipmentPhotos. We don't drive
// the click→drain path end-to-end here because the spec-sourcing
// consumer races the assertion (it wakes immediately, finds no
// candidates in the test environment, and re-stamps the cooldown
// columns we'd want to assert as cleared).
//
// TT-177: each test creates its own hermetic blade equipment row.
// The earlier shared seed picker (`getFirstEquipmentByCategory("blade")`)
// raced admin-manufacturer-specs.spec.ts under parallel scheduling —
// both files target the same seeded blade and rewrite
// `specs_source_status` mid-flight. Hermetic rows can't collide.

test("admin sees both re-queue buttons enabled when sourcing has run", async ({
  page,
}) => {
  const adminEmail = generateTestEmail("requadm");
  const { userId: adminId } = await createUser(adminEmail);
  await setUserRole(adminId, "admin");

  const equipment = await createTestEquipment("requeue-enabled", "blade");

  // Plant "previously-sourced" state so the buttons enable.
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
    await deleteSpecProposalsForEquipment(equipment.id);
    await deleteCandidatesForEquipment(equipment.id);
    await deleteEquipment(equipment.id);
    await deleteUser(adminId);
  }
});

test("admin sees re-queue buttons disabled when sourcing has never run", async ({
  page,
}) => {
  const adminEmail = generateTestEmail("requadm");
  const { userId: adminId } = await createUser(adminEmail);
  await setUserRole(adminId, "admin");

  // Fresh row → all sourcing/image state is null by default, which is
  // the "never sourced" case the buttons gate on.
  const equipment = await createTestEquipment("requeue-disabled", "blade");

  try {
    await login(page, adminEmail);
    await page.goto(`/equipment/${equipment.slug}`);

    await expect(page.getByTestId("admin-requeue-specs-button")).toBeDisabled();
    await expect(
      page.getByTestId("admin-requeue-photos-button")
    ).toBeDisabled();
  } finally {
    await deleteSpecProposalsForEquipment(equipment.id);
    await deleteCandidatesForEquipment(equipment.id);
    await deleteEquipment(equipment.id);
    await deleteUser(adminId);
  }
});

test("non-admin user does not see the re-queue buttons", async ({ page }) => {
  const userEmail = generateTestEmail("requuser");
  const { userId } = await createUser(userEmail);
  // Default role is `user`; no setUserRole.

  const equipment = await createTestEquipment("requeue-nonadmin", "blade");

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
    await deleteEquipment(equipment.id);
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

  const equipment = await createTestEquipment("requeue-route", "blade");

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
    await deleteSpecProposalsForEquipment(equipment.id);
    await deleteCandidatesForEquipment(equipment.id);
    await deleteEquipment(equipment.id);
    await deleteUser(adminId);
  }
});

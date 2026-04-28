import { test, expect } from "@playwright/test";
import {
  createUser,
  deleteUser,
  generateTestEmail,
  login,
  setUserRole,
} from "./utils/auth";
import {
  getFirstEquipment,
  setEquipmentImage,
  snapshotEquipmentImage,
} from "./utils/data";

// TT-99: admin-only direct-upload form on /equipment/:slug.
//
// Hermetic: snapshot the seeded equipment row's image_* state, run the
// upload, assert image_key swings to a manual/<uuid>.<ext> key with
// credit_text='manual upload', then restore. Reuses the same first-row
// fixture pattern as admin-equipment-photos.spec.ts; serial mode keeps
// us from clobbering the admin-photos spec's fixture mid-run.

test.describe.configure({ mode: "serial" });

// 1x1 transparent PNG. Smallest valid bytes — just enough for the
// upload action to satisfy MIME + non-empty checks.
const PNG_1X1_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNgAAIAAAUAAeImBZsAAAAASUVORK5CYII=";

test("admin uploads an image on the equipment detail page → image_key swings to manual/<uuid>.png", async ({
  page,
}) => {
  const adminEmail = generateTestEmail("photoupl");
  const { userId: adminId } = await createUser(adminEmail);
  await setUserRole(adminId, "admin");

  const equipment = await getFirstEquipment();
  const snapshot = await snapshotEquipmentImage(equipment.id);

  try {
    await login(page, adminEmail);
    await page.goto(`/equipment/${equipment.slug}`);

    const uploadBar = page.getByTestId("admin-photo-upload");
    await expect(uploadBar).toBeVisible();

    const fileBuffer = Buffer.from(PNG_1X1_BASE64, "base64");
    await uploadBar.getByTestId("admin-photo-upload-input").setInputFiles({
      name: "tiny.png",
      mimeType: "image/png",
      buffer: fileBuffer,
    });

    await Promise.all([
      page.waitForURL(`**/equipment/${equipment.slug}`),
      uploadBar.getByTestId("admin-photo-upload-button").click(),
    ]);

    // Loader revalidates after the redirect; the status label flips to
    // "Image set" once the new image_key is read back from the DB.
    await expect(
      uploadBar.getByTestId("admin-photo-upload-status")
    ).toHaveAttribute("data-has-image", "true");

    const updated = await snapshotEquipmentImage(equipment.id);
    expect(updated.image_key).toMatch(
      new RegExp(`^equipment/${equipment.slug}/manual/[^/]+\\.png$`)
    );
    expect(updated.image_credit_text).toBe("manual upload");
    expect(updated.image_credit_link).toBeNull();
    expect(updated.image_source_url).toBeNull();
    expect(updated.image_trim_kind).toBeNull();
    expect(updated.image_skipped_at).toBeNull();
  } finally {
    // Restore the seeded image_* state so the admin-photos spec and
    // any subsequent run see a clean fixture. Local R2 leaks the
    // uploaded object — acceptable, it's a wrangler-local persisted
    // store that resets on dev restart.
    await setEquipmentImage(equipment.id, snapshot);
    await deleteUser(adminId);
  }
});

test("non-admin visiting the detail page sees no upload bar", async ({
  page,
}) => {
  const userEmail = generateTestEmail("photouplneg");
  const { userId } = await createUser(userEmail);

  try {
    const equipment = await getFirstEquipment();
    await login(page, userEmail);
    await page.goto(`/equipment/${equipment.slug}`);
    await expect(page.getByTestId("admin-photo-upload")).toHaveCount(0);
  } finally {
    await deleteUser(userId);
  }
});

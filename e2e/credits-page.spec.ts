import { test, expect } from "@playwright/test";
import {
  getFirstEquipment,
  setEquipmentImage,
  snapshotEquipmentImage,
} from "./utils/data";

// Image attribution surfaces — TT-36 + TT-48.
//
// Player photos sourced from Wikimedia Commons must be credited
// somewhere reachable from a stable link. We verify four surfaces:
//
//   1. Footer Credits link is present site-wide.
//   2. /credits lists at least one player with creator + license + source.
//   3. The relevant player detail page renders the same caption inline.
//   4. /credits lists equipment with attribution when seeded.

test("footer Credits link points to /credits", async ({ page }) => {
  await page.goto("/");
  const footerLink = page
    .getByRole("contentinfo")
    .getByRole("link", { name: "Credits", exact: true });
  await expect(footerLink).toBeVisible();
  await expect(footerLink).toHaveAttribute("href", "/credits");
});

test("/credits lists creator, license and source for at least one player", async ({
  page,
}) => {
  await page.goto("/credits");
  await expect(
    page.getByRole("heading", { level: 1, name: /Image Credits/i })
  ).toBeVisible();

  // Scope to listitems that carry an /api/images/* thumbnail so we
  // skip the breadcrumb's <li>. Any seeded player with a populated
  // image_credit_text yields one such row.
  const firstRow = page.locator('li:has(img[src^="/api/images/"])').first();
  await expect(firstRow).toBeVisible();
  await expect(firstRow.getByText(/Photo by/)).toBeVisible();

  // License + source links should both be `nofollow noreferrer noopener`
  // by construction; require at least one external link to be present.
  await expect(firstRow.locator('a[rel*="nofollow"]').first()).toBeVisible();
});

test("/credits surfaces equipment attribution when seeded (TT-55)", async ({
  page,
}) => {
  // Plant a credit on a real equipment row so the page query has
  // something to render. Snapshot + restore so other tests aren't
  // disturbed.
  const equipment = await getFirstEquipment();
  const snapshot = await snapshotEquipmentImage(equipment.id);

  const FAKE_CF_ID = "33333333-3333-3333-3333-333333333333";
  await setEquipmentImage(equipment.id, {
    image_key: `cf/${FAKE_CF_ID}`,
    image_etag: FAKE_CF_ID.slice(0, 8),
    image_credit_text: "www.revspin.net",
    image_credit_link: "https://www.revspin.net/test",
    image_license_short: null,
    image_license_url: null,
    image_source_url: "https://www.revspin.net/test",
  });

  try {
    await page.goto("/credits");
    await expect(
      page.getByRole("heading", { level: 2, name: "Equipment" })
    ).toBeVisible();
    const equipmentRow = page
      .locator('[data-testid="equipment-credit"]')
      .filter({ hasText: equipment.name });
    await expect(equipmentRow).toBeVisible();
    await expect(equipmentRow.getByText(/Photo by/)).toBeVisible();
    await expect(
      equipmentRow.locator(`a[href="/equipment/${equipment.slug}"]`)
    ).toBeVisible();
  } finally {
    await setEquipmentImage(equipment.id, snapshot);
  }
});

test("player detail page surfaces a Photo: caption when seeded", async ({
  page,
}) => {
  // Resolve a player slug dynamically from the credits list so the
  // test doesn't pin to a specific seeded player.
  await page.goto("/credits");
  const playerLink = page
    .locator('li:has(img[src^="/api/images/"])')
    .first()
    .locator('a[href^="/players/"]');
  await expect(playerLink).toBeVisible();
  await playerLink.click();

  await page.waitForURL(/\/players\/[^/]+$/);

  const caption = page.locator(".player-photo p", { hasText: /^Photo:/ });
  await expect(caption).toBeVisible();
  await expect(caption.locator("a", { hasText: /source/ })).toBeVisible();
});

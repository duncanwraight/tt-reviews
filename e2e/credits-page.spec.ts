import { test, expect } from "@playwright/test";

// Image attribution surfaces — TT-36.
//
// Player photos sourced from Wikimedia Commons must be credited
// somewhere reachable from a stable link. We verify three surfaces:
//
//   1. Footer Credits link is present site-wide.
//   2. /credits lists at least one player with creator + license + source.
//   3. The relevant player detail page renders the same caption inline.

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

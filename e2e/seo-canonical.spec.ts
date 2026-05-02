import { test, expect } from "@playwright/test";

// TT-137. Every indexable route must render an absolute, env-driven
// canonical URL. The asserts below pin one example per content type:
// home, equipment listing, equipment detail, players listing, player
// detail. The detail-page slug must be a seeded fixture so the route
// returns a 200 (otherwise the meta() returns the not-found branch
// and skips canonical).

const HOME = "/";
const EQUIPMENT_LISTING = "/equipment";
const EQUIPMENT_DETAIL = "/equipment/butterfly-viscaria"; // seeded
const PLAYERS_LISTING = "/players";
const PLAYER_DETAIL = "/players/lin-shidong"; // seeded

async function getCanonical(page: import("@playwright/test").Page) {
  return page.locator('link[rel="canonical"]').getAttribute("href");
}

for (const path of [
  HOME,
  EQUIPMENT_LISTING,
  EQUIPMENT_DETAIL,
  PLAYERS_LISTING,
  PLAYER_DETAIL,
]) {
  test(`seo: canonical on ${path} is absolute and includes the path`, async ({
    page,
  }) => {
    const response = await page.goto(path);
    expect(response?.status()).toBe(200);

    const canonical = await getCanonical(page);
    expect(
      canonical,
      `${path} must render <link rel="canonical">`
    ).not.toBeNull();
    expect(
      canonical,
      `${path} canonical must be absolute (scheme + host)`
    ).toMatch(/^https?:\/\/[^/]+/);
    expect(
      canonical,
      `${path} canonical must end with the route path`
    ).toContain(path);
  });
}

test("seo: canonical on /equipment drops non-allowlisted query params", async ({
  page,
}) => {
  // Tracking junk + a real filter — the allowlist should keep category
  // and drop utm_*. This is the whole point of buildCanonicalUrl: every
  // utm-tagged shared link still maps to one canonical.
  await page.goto(
    "/equipment?utm_source=twitter&utm_campaign=spring&category=blade"
  );
  const canonical = await getCanonical(page);
  expect(canonical).toMatch(/^https?:\/\/[^/]+\/equipment\?category=blade$/);
});

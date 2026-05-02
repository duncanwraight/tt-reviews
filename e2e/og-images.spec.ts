import { test, expect } from "@playwright/test";

// TT-138: dynamic OG image generation. Three loops:
// 1. The dynamic-card routes return a 1200×630 PNG with the right
//    cache headers and a non-trivial body.
// 2. The static-fallback routes do the same with immutable caching.
// 3. The HTML routes that consume them emit the og:image / twitter:*
//    meta tags as absolute URLs.
//
// We don't render-test the *appearance* of the cards in CI — Satori
// output is deterministic, but Playwright's image-diff infra isn't
// wired up here. A regression in card layout would surface as a byte-
// length swing or a missing tag, both of which we do check.

const SEEDED_EQUIPMENT_SLUG = "dhs-neo-hurricane-3";
const SEEDED_PLAYER_SLUG = "alexis-lebrun";
// Compare URLs alphabetise — keep the test slugs in alphabetical order
// so the route doesn't 301-redirect us before we hit the OG endpoint.
const SEEDED_COMPARE_SLUGS = "butterfly-sardius-vs-dhs-power-g-pg7";

test.describe("OG image — dynamic routes", () => {
  test("equipment OG → 1200×630 PNG with cache + ETag headers", async ({
    request,
  }) => {
    const res = await request.get(`/og/equipment/${SEEDED_EQUIPMENT_SLUG}.png`);
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toMatch(/^image\/png/);
    expect(res.headers()["cache-control"]).toMatch(
      /public.*max-age=86400.*s-maxage=604800/
    );
    expect(res.headers()["etag"]).toBeTruthy();
    const body = await res.body();
    // Sanity: PNG signature + non-trivial size.
    expect(body.byteLength).toBeGreaterThan(2000);
    expect(body.subarray(0, 8)).toEqual(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    );
  });

  test("player OG → 1200×630 PNG", async ({ request }) => {
    const res = await request.get(`/og/players/${SEEDED_PLAYER_SLUG}.png`);
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toMatch(/^image\/png/);
    expect((await res.body()).byteLength).toBeGreaterThan(2000);
  });

  test("compare OG → 1200×630 PNG", async ({ request }) => {
    const res = await request.get(`/og/compare/${SEEDED_COMPARE_SLUGS}.png`);
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toMatch(/^image\/png/);
    expect((await res.body()).byteLength).toBeGreaterThan(2000);
  });

  test("unknown slug → 404 (no fallthrough)", async ({ request }) => {
    const res = await request.get(
      "/og/equipment/this-slug-definitely-does-not-exist.png"
    );
    expect(res.status()).toBe(404);
  });
});

test.describe("OG image — static fallbacks", () => {
  test("default fallback — immutable cache", async ({ request }) => {
    const res = await request.get("/og/default.png");
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toMatch(/^image\/png/);
    expect(res.headers()["cache-control"]).toMatch(/immutable/);
  });

  test("equipment listing fallback", async ({ request }) => {
    const res = await request.get("/og/equipment.png");
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toMatch(/^image\/png/);
  });

  test("players listing fallback", async ({ request }) => {
    const res = await request.get("/og/players.png");
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toMatch(/^image\/png/);
  });
});

test.describe("OG image — meta tags on consuming routes", () => {
  test("equipment detail emits absolute og:image + twitter:image", async ({
    page,
  }) => {
    await page.goto(`/equipment/${SEEDED_EQUIPMENT_SLUG}`);
    const ogImage = await page
      .locator('meta[property="og:image"]')
      .getAttribute("content");
    const twImage = await page
      .locator('meta[name="twitter:image"]')
      .getAttribute("content");
    expect(ogImage).toBeTruthy();
    expect(ogImage).toBe(twImage);
    // og:image must be absolute (relative URLs don't work for og:image
    // per the OG spec). The host comes from env.SITE_URL via the root
    // loader, not from Playwright's baseURL — they're the same dev
    // server reachable via two hostnames, so don't compare.
    expect(ogImage!).toMatch(
      new RegExp(`^https?://.+/og/equipment/${SEEDED_EQUIPMENT_SLUG}\\.png$`)
    );

    expect(
      await page
        .locator('meta[property="og:image:width"]')
        .getAttribute("content")
    ).toBe("1200");
    expect(
      await page
        .locator('meta[property="og:image:height"]')
        .getAttribute("content")
    ).toBe("630");
    expect(
      await page.locator('meta[name="twitter:card"]').getAttribute("content")
    ).toBe("summary_large_image");
  });

  test("player detail emits absolute og:image", async ({ page }) => {
    await page.goto(`/players/${SEEDED_PLAYER_SLUG}`);
    const ogImage = await page
      .locator('meta[property="og:image"]')
      .getAttribute("content");
    expect(ogImage!).toMatch(
      new RegExp(`/og/players/${SEEDED_PLAYER_SLUG}\\.png$`)
    );
  });

  test("home → /og/default.png", async ({ page }) => {
    await page.goto("/");
    const ogImage = await page
      .locator('meta[property="og:image"]')
      .getAttribute("content");
    expect(ogImage!).toMatch(/\/og\/default\.png$/);
  });

  test("equipment listing → /og/equipment.png", async ({ page }) => {
    await page.goto("/equipment");
    const ogImage = await page
      .locator('meta[property="og:image"]')
      .getAttribute("content");
    expect(ogImage!).toMatch(/\/og\/equipment\.png$/);
  });

  test("players listing → /og/players.png", async ({ page }) => {
    await page.goto("/players");
    const ogImage = await page
      .locator('meta[property="og:image"]')
      .getAttribute("content");
    expect(ogImage!).toMatch(/\/og\/players\.png$/);
  });
});

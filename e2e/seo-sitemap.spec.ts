import { test, expect } from "@playwright/test";
import { createUser, deleteUser, generateTestEmail } from "./utils/auth";
import {
  deleteEquipmentReview,
  deletePlayerFootage,
  getFirstActivePlayer,
  getFirstEquipment,
  insertActivePlayerFootage,
  insertApprovedEquipmentReview,
} from "./utils/data";

// TT-139. The sitemap-index advertises three per-type sitemaps and is
// the only sitemap robots.txt now references. Each per-type sitemap
// must return 200 application/xml with absolute URLs. /sitemap.xml is
// kept for back-compat (legacy crawlers); not advertised but must
// still respond.

const SITEMAPS = [
  "/sitemap-index.xml",
  "/sitemap-static.xml",
  "/sitemap-players.xml",
  "/sitemap-equipment.xml",
  "/sitemap.xml",
];

for (const path of SITEMAPS) {
  test(`seo: ${path} returns 200 application/xml`, async ({ request }) => {
    const response = await request.get(path);
    expect(response.status()).toBe(200);
    const ct = response.headers()["content-type"] ?? "";
    expect(ct).toContain("application/xml");

    const body = await response.text();
    expect(body).toContain("<?xml");
    // Either an urlset (per-type + legacy combined) or a sitemapindex
    // (the index itself). Both roots are valid.
    expect(body).toMatch(/<(urlset|sitemapindex)\b/);

    // Every <loc> must be an absolute URL (the env-driven SITE_URL
    // pipeline TT-137 fixed). Pull each <loc>...</loc> and check.
    const locs = [...body.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]);
    expect(
      locs.length,
      `${path} must contain at least one <loc>`
    ).toBeGreaterThan(0);
    for (const loc of locs) {
      expect(loc, `${path} <loc> must be absolute (scheme + host)`).toMatch(
        /^https?:\/\/[^/]+/
      );
    }
  });
}

test("seo: robots.txt advertises sitemap-index and not the legacy sitemap.xml", async ({
  request,
}) => {
  const response = await request.get("/robots.txt");
  expect(response.status()).toBe(200);
  const body = await response.text();

  expect(body).toMatch(/^Sitemap: https?:\/\/[^/]+\/sitemap-index\.xml$/m);
  // Legacy /sitemap.xml stays as a fallback route but must not appear
  // in robots.txt. The combined feed would duplicate URLs vs the
  // per-type splits and confuse Search Console.
  expect(body).not.toMatch(/^Sitemap: https?:\/\/[^/]+\/sitemap\.xml$/m);
});

// TT-155 — lastmod must be content-aware: when a fresh approved review
// or active footage row lands, the parent's sitemap entry's lastmod
// must advance. Without this, Google's binary lastmod-trust system
// flags us as inaccurate and ignores lastmod across the whole site.
//
// Pulls a <loc>/<lastmod> pair from a sitemap body. Returns undefined
// if the URL isn't present so the test can fail loudly with context.
function findLastmod(xml: string, urlSuffix: string): string | undefined {
  // Match <url>...<loc>...urlSuffix</loc>...<lastmod>VALUE</lastmod>...</url>
  const pattern = new RegExp(
    `<url>[\\s\\S]*?<loc>[^<]*${urlSuffix.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\$&")}</loc>[\\s\\S]*?<lastmod>([^<]+)</lastmod>[\\s\\S]*?</url>`
  );
  return xml.match(pattern)?.[1];
}

test("seo: equipment sitemap lastmod advances when a new approved review lands", async ({
  request,
}) => {
  const equipment = await getFirstEquipment();

  const beforeRes = await request.get("/sitemap-equipment.xml");
  expect(beforeRes.status()).toBe(200);
  const beforeXml = await beforeRes.text();
  const beforeLastmod = findLastmod(beforeXml, `/equipment/${equipment.slug}`);
  expect(
    beforeLastmod,
    `equipment ${equipment.slug} must appear in /sitemap-equipment.xml`
  ).toBeDefined();

  const reviewerEmail = generateTestEmail("seo-lastmod");
  const { userId: reviewerId } = await createUser(reviewerEmail);

  let reviewId: string | undefined;
  try {
    const review = await insertApprovedEquipmentReview({
      userId: reviewerId,
      equipmentId: equipment.id,
      reviewText: `TT-155 lastmod advance ${Date.now()}`,
      overallRating: 8,
    });
    reviewId = review.id;

    const afterRes = await request.get("/sitemap-equipment.xml");
    expect(afterRes.status()).toBe(200);
    const afterXml = await afterRes.text();
    const afterLastmod = findLastmod(afterXml, `/equipment/${equipment.slug}`);
    expect(afterLastmod).toBeDefined();
    expect(
      afterLastmod! > beforeLastmod!,
      `lastmod must advance after a new approved review (before=${beforeLastmod}, after=${afterLastmod})`
    ).toBe(true);
  } finally {
    if (reviewId) await deleteEquipmentReview(reviewId);
    await deleteUser(reviewerId);
  }
});

test("seo: player sitemap lastmod advances when a new active footage row lands", async ({
  request,
}) => {
  const player = await getFirstActivePlayer();

  const beforeRes = await request.get("/sitemap-players.xml");
  expect(beforeRes.status()).toBe(200);
  const beforeXml = await beforeRes.text();
  const beforeLastmod = findLastmod(beforeXml, `/players/${player.slug}`);
  expect(
    beforeLastmod,
    `player ${player.slug} must appear in /sitemap-players.xml`
  ).toBeDefined();

  let footageId: string | undefined;
  try {
    const footage = await insertActivePlayerFootage({
      playerId: player.id,
      url: `https://example.com/seo-lastmod-${Date.now()}`,
      title: `TT-155 lastmod advance ${Date.now()}`,
    });
    footageId = footage.id;

    const afterRes = await request.get("/sitemap-players.xml");
    expect(afterRes.status()).toBe(200);
    const afterXml = await afterRes.text();
    const afterLastmod = findLastmod(afterXml, `/players/${player.slug}`);
    expect(afterLastmod).toBeDefined();
    expect(
      afterLastmod! > beforeLastmod!,
      `lastmod must advance after new active footage (before=${beforeLastmod}, after=${afterLastmod})`
    ).toBe(true);
  } finally {
    if (footageId) await deletePlayerFootage(footageId);
  }
});

test("seo: sitemap XML drops priority and changefreq (Google ignores them)", async ({
  request,
}) => {
  for (const path of [
    "/sitemap-static.xml",
    "/sitemap-players.xml",
    "/sitemap-equipment.xml",
    "/sitemap.xml",
  ]) {
    const res = await request.get(path);
    expect(res.status()).toBe(200);
    const body = await res.text();
    expect(body, `${path} should not contain <priority>`).not.toContain(
      "<priority>"
    );
    expect(body, `${path} should not contain <changefreq>`).not.toContain(
      "<changefreq>"
    );
  }
});

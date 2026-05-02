import { test, expect } from "@playwright/test";

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

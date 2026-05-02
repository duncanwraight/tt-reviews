import { test, expect } from "@playwright/test";

// TT-143. Two structured-data / indexability cleanups:
//   - thin SERPs (empty / single-token / zero results) ship
//     `<meta name="robots" content="noindex, follow">`. Productive
//     multi-term SERPs with results stay indexable.
//   - /equipment and /players listings emit a BreadcrumbList
//     JSON-LD blob (Home → category) so Google can render the
//     breadcrumb pill in SERP listings.

async function getRobotsMeta(page: import("@playwright/test").Page) {
  return page.locator('meta[name="robots"]').getAttribute("content");
}

test("seo: empty /search renders noindex meta", async ({ page }) => {
  await page.goto("/search");
  expect(await getRobotsMeta(page)).toBe("noindex, follow");
});

test("seo: single-token /search?q=tenergy renders noindex meta", async ({
  page,
}) => {
  await page.goto("/search?q=tenergy");
  expect(await getRobotsMeta(page)).toBe("noindex, follow");
});

test("seo: zero-result multi-term /search renders noindex meta", async ({
  page,
}) => {
  // Random gibberish that won't match any seeded equipment or player.
  await page.goto("/search?q=zzzqq+nonsensical+query+xxx");
  expect(await getRobotsMeta(page)).toBe("noindex, follow");
});

// The "productive multi-term SERP stays indexable" branch can't be
// reached today: db.search uses textSearch("name", query) which
// passes the raw query as a tsquery, so any multi-word query throws
// 42601 ("syntax error in tsquery") and the .catch swallows it into
// zero results. That makes every multi-term query thin-by-zero-
// results. TT-144 tracks the underlying search bug; once fixed, add
// a test that asserts /search?q=butterfly+viscaria has no robots
// meta tag.

async function findBreadcrumbJsonLd(
  page: import("@playwright/test").Page
): Promise<Array<Record<string, unknown>>> {
  // Pull every <script type="application/ld+json"> block, parse, and
  // extract entries with @type "BreadcrumbList". The page emits
  // multiple JSON-LD blobs (Organization + WebSite from root.tsx,
  // plus per-route schemas) so we need to scan them all.
  const blobs = await page.locator('script[type="application/ld+json"]').all();
  const breadcrumbs: Array<Record<string, unknown>> = [];
  for (const blob of blobs) {
    const text = await blob.textContent();
    if (!text) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      continue;
    }
    const arr = Array.isArray(parsed) ? parsed : [parsed];
    for (const entry of arr) {
      if (
        entry &&
        typeof entry === "object" &&
        (entry as Record<string, unknown>)["@type"] === "BreadcrumbList"
      ) {
        breadcrumbs.push(entry as Record<string, unknown>);
      }
    }
  }
  return breadcrumbs;
}

test("seo: /equipment listing emits BreadcrumbList JSON-LD", async ({
  page,
}) => {
  await page.goto("/equipment");
  const crumbs = await findBreadcrumbJsonLd(page);
  expect(crumbs.length).toBeGreaterThan(0);
  // Crumb path should at least include Home and Equipment.
  const items = crumbs[0].itemListElement as Array<{ name: string }>;
  const names = items.map(i => i.name);
  expect(names).toContain("Home");
  expect(names).toContain("Equipment");
});

test("seo: /players listing emits BreadcrumbList JSON-LD", async ({ page }) => {
  await page.goto("/players");
  const crumbs = await findBreadcrumbJsonLd(page);
  expect(crumbs.length).toBeGreaterThan(0);
  const items = crumbs[0].itemListElement as Array<{ name: string }>;
  const names = items.map(i => i.name);
  expect(names).toContain("Home");
  expect(names).toContain("Players");
});

import { test, expect, type Page } from "@playwright/test";

// All comparison flows live here so they run sequentially in a single
// worker. Two reasons:
//   1. They share the `tt-compare-selection` localStorage key. Splitting
//      them across files meant parallel workers contended for the same
//      origin's listing pages and a stale selection from one worker could
//      leak into another's first click — observed as 30s timeouts on
//      `comparison-toggle` waiting for an element that was never rendered
//      in the expected enabled state.
//   2. The dev server is single-process; clicking the toggle on the
//      listing page triggers a loader fetch that, under heavy parallel
//      load, occasionally never resolved within the test timeout.
// Serial mode keeps the dev server uncontended and per-test localStorage
// clearing deterministic.
test.describe.configure({ mode: "serial" });

const INVERTED_A = "dhs-neo-hurricane-3";
const INVERTED_B = "yasaka-mark-v";
const INVERTED_C = "yasaka-rakza-7";
const INVERTED_D = "butterfly-tenergy-05-fx";
const LONG_PIPS_SLUG = "tsp-curl-p1r";

const CANONICAL_PAIR = `/equipment/compare/${INVERTED_A}-vs-${INVERTED_B}`;
const REVERSED_PAIR = `/equipment/compare/${INVERTED_B}-vs-${INVERTED_A}`;
const SORTED_TRIPLE = [INVERTED_A, INVERTED_B, INVERTED_C].sort();
const TRIPLE_QUERY_URL = `/equipment/compare?ids=${SORTED_TRIPLE.join(",")}`;

const VIEWPORTS = [
  { label: "mobile", width: 375, height: 667 },
  { label: "tablet", width: 768, height: 1024 },
  { label: "desktop", width: 1440, height: 900 },
] as const;

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => {
    try {
      window.localStorage.removeItem("tt-compare-selection");
    } catch {
      /* noop */
    }
  });
});

async function expectNoHorizontalOverflow(page: Page) {
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  // Allow sub-pixel rounding.
  expect(scrollWidth - clientWidth).toBeLessThanOrEqual(1);
}

async function equipmentNameOrder(page: Page): Promise<string[]> {
  return page
    .getByTestId("specs-table-equipment-header")
    .allTextContents()
    .then(names => names.map(n => n.trim()));
}

test.describe("Equipment comparison — 2-item flow (TT-29)", () => {
  test("tick two same-subcategory items → tray → canonical compare URL", async ({
    page,
  }) => {
    await page.goto("/equipment?subcategory=inverted");

    const cardA = page.locator(
      `[data-testid="equipment-card"][data-slug="${INVERTED_A}"]`
    );
    const cardB = page.locator(
      `[data-testid="equipment-card"][data-slug="${INVERTED_B}"]`
    );

    await cardA.getByTestId("comparison-toggle").click();
    await cardB.getByTestId("comparison-toggle").click();

    const tray = page.getByTestId("comparison-tray");
    await expect(tray).toBeVisible();
    await tray.getByTestId("comparison-tray-compare").click();

    await expect(page).toHaveURL(CANONICAL_PAIR);
    await expect(page.getByTestId("comparison-header")).toBeVisible();
    await expect(page.getByTestId("ratings-table")).toBeVisible();
  });

  test("reversed-order URL redirects (301) to canonical", async ({ page }) => {
    await page.goto(REVERSED_PAIR);
    await expect(page).toHaveURL(CANONICAL_PAIR);
  });

  test("mismatched-subcategory URL redirects to /equipment", async ({
    page,
  }) => {
    await page.goto(`/equipment/compare/${INVERTED_A}-vs-${LONG_PIPS_SLUG}`);
    await expect(page).toHaveURL(/\/equipment\/?($|\?)/);
  });

  test("compare badge is disabled for an item in a different subcategory", async ({
    page,
  }) => {
    await page.goto("/equipment?subcategory=inverted");
    await page
      .locator(`[data-testid="equipment-card"][data-slug="${INVERTED_A}"]`)
      .getByTestId("comparison-toggle")
      .click();

    // Move to the long_pips list — the inverted selection persists via
    // localStorage, so every long_pips card's badge should be disabled.
    await page.goto("/equipment?subcategory=long_pips");
    const blockedToggle = page
      .locator(`[data-testid="equipment-card"][data-slug="${LONG_PIPS_SLUG}"]`)
      .getByTestId("comparison-toggle");
    await expect(blockedToggle).toBeDisabled();
    await expect(blockedToggle).toHaveAttribute("title", /same-subcategory/i);
  });

  test("selection persists across page reload via localStorage", async ({
    page,
  }) => {
    await page.goto("/equipment?subcategory=inverted");

    const card = page.locator(
      `[data-testid="equipment-card"][data-slug="${INVERTED_A}"]`
    );
    await card.getByTestId("comparison-toggle").click();
    await expect(page.getByTestId("comparison-tray")).toBeVisible();

    await page.reload();

    await expect(page.getByTestId("comparison-tray")).toBeVisible();
    await expect(
      page
        .locator(`[data-testid="equipment-card"][data-slug="${INVERTED_A}"]`)
        .getByTestId("comparison-toggle")
    ).toHaveAttribute("data-selected", "true");
  });
});

test.describe("Equipment comparison — 3-item flow (TT-30)", () => {
  test("tick three same-subcategory items → tray '3 of 3' → query-param URL with noindex", async ({
    page,
  }) => {
    await page.goto("/equipment?subcategory=inverted");

    for (const slug of [INVERTED_A, INVERTED_B, INVERTED_C]) {
      await page
        .locator(`[data-testid="equipment-card"][data-slug="${slug}"]`)
        .getByTestId("comparison-toggle")
        .click();
    }

    const tray = page.getByTestId("comparison-tray");
    await expect(tray).toBeVisible();
    await expect(tray).toContainText("3 of 3");

    await tray.getByTestId("comparison-tray-compare").click();
    await expect(page).toHaveURL(TRIPLE_QUERY_URL);

    await expect(page.getByTestId("comparison-header")).toBeVisible();
    await expect(page.getByTestId("ratings-table")).toBeVisible();

    const robots = await page
      .locator('meta[name="robots"]')
      .first()
      .getAttribute("content");
    expect(robots).toMatch(/noindex/);
  });

  test("ticking a 4th item replaces the oldest selection", async ({ page }) => {
    await page.goto("/equipment?subcategory=inverted");

    for (const slug of [INVERTED_A, INVERTED_B, INVERTED_C]) {
      await page
        .locator(`[data-testid="equipment-card"][data-slug="${slug}"]`)
        .getByTestId("comparison-toggle")
        .click();
    }

    const tray = page.getByTestId("comparison-tray");
    await expect(tray).toContainText("3 of 3");

    // Adding D should drop A (oldest) and keep B, C, D.
    await page
      .locator(`[data-testid="equipment-card"][data-slug="${INVERTED_D}"]`)
      .getByTestId("comparison-toggle")
      .click();

    await expect(tray).toContainText("3 of 3");
    await expect(
      page
        .locator(`[data-testid="equipment-card"][data-slug="${INVERTED_A}"]`)
        .getByTestId("comparison-toggle")
    ).toHaveAttribute("data-selected", "false");
    await expect(
      page
        .locator(`[data-testid="equipment-card"][data-slug="${INVERTED_D}"]`)
        .getByTestId("comparison-toggle")
    ).toHaveAttribute("data-selected", "true");
  });

  test("?ids=a,b (2 ids) redirects to the canonical slug-pair route", async ({
    page,
  }) => {
    const [a, b] = [INVERTED_A, INVERTED_B].sort();
    await page.goto(`/equipment/compare?ids=${a},${b}`);
    await expect(page).toHaveURL(`/equipment/compare/${a}-vs-${b}`);
  });

  test("?ids=... with mismatched subcategory redirects to /equipment", async ({
    page,
  }) => {
    await page.goto(
      `/equipment/compare?ids=${INVERTED_A},${INVERTED_B},${LONG_PIPS_SLUG}`
    );
    await expect(page).toHaveURL(/\/equipment\/?($|\?)/);
  });
});

test.describe("Equipment comparison — layout (TT-29)", () => {
  for (const viewport of VIEWPORTS) {
    test(`no horizontal overflow at ${viewport.label} (${viewport.width}px)`, async ({
      page,
    }) => {
      await page.setViewportSize({
        width: viewport.width,
        height: viewport.height,
      });
      await page.goto(CANONICAL_PAIR);
      await expect(page.getByTestId("comparison-header")).toBeVisible();

      await expectNoHorizontalOverflow(page);

      // Only assert on specs-table width if it rendered (requires seed data).
      const specsTable = page.getByTestId("specs-table");
      if (await specsTable.isVisible().catch(() => false)) {
        const box = await specsTable.boundingBox();
        expect(box).not.toBeNull();
        if (box) {
          expect(box.width).toBeLessThanOrEqual(viewport.width + 1);
        }
      }

      const ratingsTable = page.getByTestId("ratings-table");
      if (await ratingsTable.isVisible().catch(() => false)) {
        const box = await ratingsTable.boundingBox();
        expect(box).not.toBeNull();
        if (box) {
          expect(box.width).toBeLessThanOrEqual(viewport.width + 1);
        }
      }
    });
  }

  test("comparison header is 2 columns on desktop", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(CANONICAL_PAIR);

    const header = page.getByTestId("comparison-header");
    await expect(header).toBeVisible();

    const boxes = await header.evaluate(el =>
      Array.from(el.children).map(child => {
        const rect = (child as HTMLElement).getBoundingClientRect();
        return { top: rect.top, left: rect.left };
      })
    );
    expect(boxes).toHaveLength(2);
    expect(Math.abs(boxes[0].top - boxes[1].top)).toBeLessThanOrEqual(2);
    expect(boxes[1].left).toBeGreaterThan(boxes[0].left);
  });

  test("tray stays at bottom of viewport with Compare CTA clickable", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto("/equipment?subcategory=inverted");

    await page
      .locator(`[data-testid="equipment-card"][data-slug="${INVERTED_A}"]`)
      .getByTestId("comparison-toggle")
      .click();
    await page
      .locator(`[data-testid="equipment-card"][data-slug="${INVERTED_B}"]`)
      .getByTestId("comparison-toggle")
      .click();

    const tray = page.getByTestId("comparison-tray");
    await expect(tray).toBeVisible();

    const trayBox = await tray.boundingBox();
    expect(trayBox).not.toBeNull();
    if (trayBox) {
      const bottomEdge = trayBox.y + trayBox.height;
      expect(Math.abs(bottomEdge - 667)).toBeLessThanOrEqual(2);
    }

    const cta = tray.getByTestId("comparison-tray-compare");
    await expect(cta).toBeVisible();
    await expect(cta).toBeEnabled();
  });
});

test.describe("Equipment comparison — SpecsTable sortable columns (TT-77)", () => {
  // Seed pairing: DHS NEO Hurricane 3 vs Yasaka Mark V.
  //   speed:    DHS 8.5,  Yasaka 8.0  → asc reorders, desc reverses
  //   spin:     DHS 9.9,  Yasaka 8.5  → ascends with Yasaka first
  //   hardness: DHS {40,40}, Yasaka {40,42} → tie on min, max tiebreak
  // SpecsTable is only rendered when the category has equipment_spec_field
  // rows seeded — assert visibility up front so a seed-data drift fails the
  // test loudly rather than silently no-op-ing.
  test("clicking a numeric spec header sorts ascending, then descending", async ({
    page,
  }) => {
    await page.goto(CANONICAL_PAIR);
    await expect(page.getByTestId("specs-table")).toBeVisible();

    expect(await equipmentNameOrder(page)).toEqual([
      "DHS NEO Hurricane 3",
      "Yasaka Mark V",
    ]);

    const specsTable = page.getByTestId("specs-table");

    await page.getByTestId("specs-table-sort-speed").click();
    expect(await equipmentNameOrder(page)).toEqual([
      "Yasaka Mark V",
      "DHS NEO Hurricane 3",
    ]);
    await expect(
      specsTable.getByRole("rowheader", { name: /Speed/ })
    ).toHaveAttribute("aria-sort", "ascending");

    await page.getByTestId("specs-table-sort-speed").click();
    expect(await equipmentNameOrder(page)).toEqual([
      "DHS NEO Hurricane 3",
      "Yasaka Mark V",
    ]);
    await expect(
      specsTable.getByRole("rowheader", { name: /Speed/ })
    ).toHaveAttribute("aria-sort", "descending");
  });

  test("text spec rows have no sort affordance", async ({ page }) => {
    await page.goto(CANONICAL_PAIR);
    await expect(page.getByTestId("specs-table")).toBeVisible();
    await expect(page.getByTestId("specs-table-sort-topsheet")).toHaveCount(0);
    await expect(page.getByTestId("specs-table-sort-sponge")).toHaveCount(0);
  });

  test("range spec sorts by min with max as tiebreaker", async ({ page }) => {
    await page.goto(CANONICAL_PAIR);
    await expect(page.getByTestId("specs-table")).toBeVisible();

    // Hardness — DHS {40,40}, Yasaka {40,42}. Tie on min, max tiebreak puts
    // DHS first ascending, Yasaka first descending.
    await page.getByTestId("specs-table-sort-hardness").click();
    expect(await equipmentNameOrder(page)).toEqual([
      "DHS NEO Hurricane 3",
      "Yasaka Mark V",
    ]);

    await page.getByTestId("specs-table-sort-hardness").click();
    expect(await equipmentNameOrder(page)).toEqual([
      "Yasaka Mark V",
      "DHS NEO Hurricane 3",
    ]);
  });
});

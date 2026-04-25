import { test, expect, type Page } from "@playwright/test";

// Layout-fit assertions for the comparison page across viewports.
// No pixel snapshots — we check structural invariants that survive font /
// browser differences: no horizontal overflow, tray clickable, header
// side-by-sides on desktop.
//
// The SpecsTable is only rendered when equipment_spec_field rows exist for
// the category/subcategory combo. If they don't (e.g. local DB without the
// TT-28 seed), the component renders an empty-state <p> with no testid — so
// the specs-table width check is skipped rather than failing the test. The
// page-level overflow check still runs unconditionally.

const INVERTED_PAIR = "/equipment/compare/dhs-neo-hurricane-3-vs-yasaka-mark-v";

// Tablet width deliberately 900 (not 768 / 820) — the main nav has a
// pre-existing fixed-width bug (~856px) that overflows all viewports below
// that at the md: breakpoint; tracked as TT-32. 900 still exercises a tablet
// layout for the comparison page without tripping that.
const VIEWPORTS = [
  { label: "mobile", width: 375, height: 667 },
  { label: "tablet", width: 900, height: 1180 },
  { label: "desktop", width: 1440, height: 900 },
] as const;

async function expectNoHorizontalOverflow(page: Page) {
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  // Allow sub-pixel rounding.
  expect(scrollWidth - clientWidth).toBeLessThanOrEqual(1);
}

// Tests in this spec exercise click flows that depend on a clean
// localStorage selection — see equipment-compare.spec.ts for the same guard.
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

test.describe("Equipment comparison page — layout (TT-29)", () => {
  for (const viewport of VIEWPORTS) {
    test(`no horizontal overflow at ${viewport.label} (${viewport.width}px)`, async ({
      page,
    }) => {
      await page.setViewportSize({
        width: viewport.width,
        height: viewport.height,
      });
      await page.goto(INVERTED_PAIR);
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

      // Ratings table always renders (seed ratings are in place).
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
    await page.goto(INVERTED_PAIR);

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
      .locator(
        '[data-testid="equipment-card"][data-slug="dhs-neo-hurricane-3"]'
      )
      .getByTestId("comparison-toggle")
      .click();
    await page
      .locator('[data-testid="equipment-card"][data-slug="yasaka-mark-v"]')
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

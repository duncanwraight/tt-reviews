import { describe, it, expect } from "vitest";
import { SitemapService } from "../sitemap.server";

const SVC = new SitemapService("https://example.com");

const equipmentRow = (
  overrides: Partial<{
    id: string;
    slug: string;
    category: string;
    subcategory: string | null;
    manufacturer: string;
    name: string;
    updated_at: string;
  }> = {}
) => ({
  id: "eq-1",
  slug: "tenergy-05",
  category: "rubber",
  subcategory: "inverted",
  manufacturer: "Butterfly",
  name: "Tenergy 05",
  updated_at: "2026-01-01T00:00:00.000Z",
  ...overrides,
});

const playerRow = (
  overrides: Partial<{
    id: string;
    slug: string;
    active: boolean;
    updated_at: string;
  }> = {}
) => ({
  id: "p-1",
  slug: "ma-long",
  active: true,
  updated_at: "2026-01-01T00:00:00.000Z",
  ...overrides,
});

describe("SitemapService.generateEquipmentPages", () => {
  it("uses parent updated_at when no review map entry exists", () => {
    const eq = equipmentRow({ updated_at: "2026-04-01T12:00:00.000Z" });
    const out = SVC.generateEquipmentPages([eq], {});
    expect(out[0].lastmod).toBe("2026-04-01T12:00:00.000Z");
  });

  it("advances lastmod to the latest approved review when newer", () => {
    const eq = equipmentRow({
      id: "eq-1",
      updated_at: "2026-01-01T00:00:00.000Z",
    });
    const out = SVC.generateEquipmentPages([eq], {
      "eq-1": "2026-05-01T08:00:00.000Z",
    });
    expect(out[0].lastmod).toBe("2026-05-01T08:00:00.000Z");
  });

  it("keeps parent updated_at when it's newer than the review", () => {
    const eq = equipmentRow({
      id: "eq-1",
      updated_at: "2026-06-01T00:00:00.000Z",
    });
    const out = SVC.generateEquipmentPages([eq], {
      "eq-1": "2026-05-01T08:00:00.000Z",
    });
    expect(out[0].lastmod).toBe("2026-06-01T00:00:00.000Z");
  });

  it("emits absolute URLs scoped to baseUrl", () => {
    const out = SVC.generateEquipmentPages(
      [equipmentRow({ slug: "viscaria" })],
      {}
    );
    expect(out[0].url).toBe("https://example.com/equipment/viscaria");
  });
});

describe("SitemapService.generatePlayerPages", () => {
  it("filters out inactive players", () => {
    const players = [
      playerRow({ id: "p-1", slug: "active-pro", active: true }),
      playerRow({ id: "p-2", slug: "retired-pro", active: false }),
    ];
    const out = SVC.generatePlayerPages(players, {});
    expect(out).toHaveLength(1);
    expect(out[0].url).toBe("https://example.com/players/active-pro");
  });

  it("uses latest activity timestamp when newer than the player row", () => {
    const player = playerRow({
      id: "p-1",
      updated_at: "2026-01-01T00:00:00.000Z",
    });
    const out = SVC.generatePlayerPages([player], {
      "p-1": "2026-05-01T08:00:00.000Z",
    });
    expect(out[0].lastmod).toBe("2026-05-01T08:00:00.000Z");
  });

  it("falls back to player.updated_at when activity map is empty", () => {
    const player = playerRow({
      id: "p-1",
      updated_at: "2026-03-15T12:00:00.000Z",
    });
    const out = SVC.generatePlayerPages([player], {});
    expect(out[0].lastmod).toBe("2026-03-15T12:00:00.000Z");
  });
});

describe("SitemapService.generateCategoryPages", () => {
  it("emits one URL per category with max(updated_at) over the slice", () => {
    const equipment = [
      equipmentRow({
        id: "a",
        category: "rubber",
        updated_at: "2026-01-01T00:00:00.000Z",
      }),
      equipmentRow({
        id: "b",
        category: "rubber",
        updated_at: "2026-05-01T00:00:00.000Z",
      }),
      equipmentRow({
        id: "c",
        category: "blade",
        updated_at: "2026-03-01T00:00:00.000Z",
      }),
    ];
    const out = SVC.generateCategoryPages(equipment);
    const byUrl = Object.fromEntries(out.map(u => [u.url, u.lastmod]));
    expect(byUrl["https://example.com/equipment?category=rubber"]).toBe(
      "2026-05-01T00:00:00.000Z"
    );
    expect(byUrl["https://example.com/equipment?category=blade"]).toBe(
      "2026-03-01T00:00:00.000Z"
    );
  });
});

describe("SitemapService.generateSubcategoryPages", () => {
  it("ignores equipment with no subcategory", () => {
    const equipment = [
      equipmentRow({ id: "a", category: "rubber", subcategory: null }),
      equipmentRow({ id: "b", category: "rubber", subcategory: "inverted" }),
    ];
    const out = SVC.generateSubcategoryPages(equipment);
    expect(out).toHaveLength(1);
    expect(out[0].url).toContain("subcategory=inverted");
  });

  it("emits max(updated_at) per (category, subcategory) pair", () => {
    const equipment = [
      equipmentRow({
        id: "a",
        category: "rubber",
        subcategory: "inverted",
        updated_at: "2026-01-01T00:00:00.000Z",
      }),
      equipmentRow({
        id: "b",
        category: "rubber",
        subcategory: "inverted",
        updated_at: "2026-04-01T00:00:00.000Z",
      }),
    ];
    const out = SVC.generateSubcategoryPages(equipment);
    expect(out[0].lastmod).toBe("2026-04-01T00:00:00.000Z");
  });
});

describe("SitemapService.generateManufacturerPages", () => {
  it("includes only the curated allow-list of manufacturers", () => {
    const equipment = [
      equipmentRow({ id: "a", manufacturer: "Butterfly" }),
      equipmentRow({ id: "b", manufacturer: "DHS" }),
      equipmentRow({ id: "c", manufacturer: "ObscureBrand" }),
    ];
    const out = SVC.generateManufacturerPages(equipment);
    const manufacturers = out.map(u =>
      decodeURIComponent(u.url.split("manufacturer=")[1])
    );
    expect(manufacturers).toContain("Butterfly");
    expect(manufacturers).toContain("DHS");
    expect(manufacturers).not.toContain("ObscureBrand");
  });

  it("uses max(updated_at) across each allowed manufacturer's slice", () => {
    const equipment = [
      equipmentRow({
        id: "a",
        manufacturer: "Butterfly",
        updated_at: "2026-01-01T00:00:00.000Z",
      }),
      equipmentRow({
        id: "b",
        manufacturer: "Butterfly",
        updated_at: "2026-06-01T00:00:00.000Z",
      }),
    ];
    const out = SVC.generateManufacturerPages(equipment);
    expect(out[0].lastmod).toBe("2026-06-01T00:00:00.000Z");
  });
});

describe("SitemapService.generatePopularComparisonPages", () => {
  it("emits the curated pair only when both equipment slugs exist", () => {
    const equipment = [
      equipmentRow({
        id: "a",
        slug: "tenergy-05",
        manufacturer: "Butterfly",
      }),
      // Missing dignics-09c — first curated pair should be skipped.
      equipmentRow({ id: "b", slug: "hurricane-3", manufacturer: "DHS" }),
    ];
    const out = SVC.generatePopularComparisonPages(equipment, {});
    const urls = out.map(u => u.url);
    // tenergy-05 vs hurricane-3 IS in the curated list and both exist.
    expect(
      urls.some(u => u.endsWith("/equipment/compare/tenergy-05-vs-hurricane-3"))
    ).toBe(true);
    // tenergy-05 vs dignics-09c is curated but dignics-09c is missing.
    expect(
      urls.some(u => u.endsWith("/equipment/compare/tenergy-05-vs-dignics-09c"))
    ).toBe(false);
  });

  it("comparison lastmod folds in both products' review timestamps", () => {
    const equipment = [
      equipmentRow({
        id: "a",
        slug: "tenergy-05",
        manufacturer: "Butterfly",
        updated_at: "2026-01-01T00:00:00.000Z",
      }),
      equipmentRow({
        id: "b",
        slug: "hurricane-3",
        manufacturer: "DHS",
        updated_at: "2026-01-01T00:00:00.000Z",
      }),
    ];
    const out = SVC.generatePopularComparisonPages(equipment, {
      a: "2026-04-15T00:00:00.000Z",
      b: "2026-08-20T00:00:00.000Z",
    });
    const pair = out.find(u =>
      u.url.endsWith("/equipment/compare/tenergy-05-vs-hurricane-3")
    );
    expect(pair?.lastmod).toBe("2026-08-20T00:00:00.000Z");
  });
});

describe("SitemapService.generateStaticPages", () => {
  it("uses the sitewide lastmod for all dynamic landing pages", () => {
    const out = SVC.generateStaticPages("2026-04-01T12:00:00.000Z");
    const home = out.find(u => u.url === "https://example.com/");
    const players = out.find(u => u.url === "https://example.com/players");
    const equipment = out.find(u => u.url === "https://example.com/equipment");
    expect(home?.lastmod).toBe("2026-04-01T12:00:00.000Z");
    expect(players?.lastmod).toBe("2026-04-01T12:00:00.000Z");
    expect(equipment?.lastmod).toBe("2026-04-01T12:00:00.000Z");
  });

  it("emits a hardcoded /credits lastmod independent of sitewide", () => {
    const out = SVC.generateStaticPages("2050-12-31T00:00:00.000Z");
    const credits = out.find(u => u.url === "https://example.com/credits");
    expect(credits?.lastmod).not.toBe("2050-12-31T00:00:00.000Z");
    // Whatever the constant is, it must be a valid ISO string.
    expect(credits?.lastmod).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });
});

describe("SitemapService.computeSiteWideLastmod", () => {
  it("picks the latest across equipment, players, and both child maps", () => {
    const result = SVC.computeSiteWideLastmod(
      [{ updated_at: "2026-01-01T00:00:00.000Z" }],
      [{ updated_at: "2026-02-01T00:00:00.000Z" }],
      { eq1: "2026-09-01T00:00:00.000Z" },
      { p1: "2026-03-01T00:00:00.000Z" }
    );
    expect(result).toBe("2026-09-01T00:00:00.000Z");
  });

  it("falls back to a hardcoded value when all inputs are empty", () => {
    const result = SVC.computeSiteWideLastmod([], [], {}, {});
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});

describe("SitemapService.generateSitemapXml", () => {
  it("emits only loc and lastmod — no changefreq or priority", () => {
    const xml = SVC.generateSitemapXml([
      { url: "https://example.com/foo", lastmod: "2026-01-01T00:00:00.000Z" },
    ]);
    expect(xml).toContain("<loc>https://example.com/foo</loc>");
    expect(xml).toContain("<lastmod>2026-01-01T00:00:00.000Z</lastmod>");
    expect(xml).not.toContain("<changefreq>");
    expect(xml).not.toContain("<priority>");
  });

  it("escapes XML-significant characters in URLs", () => {
    const xml = SVC.generateSitemapXml([
      {
        url: "https://example.com/equipment?category=rubber&manufacturer=Brand",
        lastmod: "2026-01-01T00:00:00.000Z",
      },
    ]);
    expect(xml).toContain("&amp;manufacturer=");
    expect(xml).not.toMatch(/[?]category=rubber&[^a]/);
  });
});

describe("SitemapService.computeMaxLastmod", () => {
  it("returns the most recent ISO timestamp from a slice", () => {
    const max = SVC.computeMaxLastmod([
      { url: "u1", lastmod: "2026-01-01T00:00:00.000Z" },
      { url: "u2", lastmod: "2026-05-01T00:00:00.000Z" },
      { url: "u3", lastmod: "2026-03-01T00:00:00.000Z" },
    ]);
    expect(max).toBe("2026-05-01T00:00:00.000Z");
  });
});

describe("SitemapService.generateSitemapIndexXml", () => {
  it("emits one <sitemap> entry per input with loc and lastmod", () => {
    const xml = SVC.generateSitemapIndexXml([
      {
        url: "https://example.com/sitemap-static.xml",
        lastmod: "2026-01-01T00:00:00.000Z",
      },
      {
        url: "https://example.com/sitemap-equipment.xml",
        lastmod: "2026-05-01T00:00:00.000Z",
      },
    ]);
    expect(xml).toContain("<sitemapindex");
    expect(xml.match(/<sitemap>/g)?.length).toBe(2);
    expect(xml).toContain("https://example.com/sitemap-static.xml");
    expect(xml).toContain("https://example.com/sitemap-equipment.xml");
  });
});

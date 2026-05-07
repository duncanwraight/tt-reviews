import { readFileSync } from "node:fs";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { _resetSpecSourcingThrottle } from "../http";
import {
  makeStigaSource,
  parseStigaProductSitemap,
  parseStigaSitemapIndex,
} from "../stiga";

const FIXTURES_DIR = join(__dirname, "fixtures");
const SITEMAP_INDEX_XML = readFileSync(
  join(FIXTURES_DIR, "stiga-sitemap-index.xml"),
  "utf8"
);
const SITEMAP_PRODUCTS_XML = readFileSync(
  join(FIXTURES_DIR, "stiga-sitemap-products.xml"),
  "utf8"
);
const PRODUCT_HTML = `<!doctype html><html><head><title>Carbonado 45</title></head>
<body><h1>STIGA Carbonado 45</h1><div class="specs">7.4mm carbon blade</div></body></html>`;

function makeFetch(
  responder: (url: string) => {
    body: string;
    status?: number;
    finalUrl?: string;
    contentType?: string;
  }
): typeof fetch {
  return (async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input.toString();
    const r = responder(url);
    const response = new Response(r.body, {
      status: r.status ?? 200,
      headers: { "content-type": r.contentType ?? "application/xml" },
    });
    if (r.finalUrl) {
      Object.defineProperty(response, "url", {
        value: r.finalUrl,
        configurable: true,
      });
    }
    return response;
  }) as unknown as typeof fetch;
}

afterEach(() => _resetSpecSourcingThrottle());

describe("stigaSource", () => {
  it("identifies as the Stiga tier-1 manufacturer source", () => {
    const src = makeStigaSource();
    expect(src.id).toBe("stiga");
    expect(src.kind).toBe("manufacturer");
    expect(src.tier).toBe(1);
    expect(src.brand).toBe("Stiga");
  });

  it("returns the matching /en/product URL when searching by name", async () => {
    const fetchImpl = makeFetch(url => {
      if (url === "https://www.stigasports.com/sitemap.xml")
        return { body: SITEMAP_INDEX_XML };
      if (url === "https://www.stigasports.com/sitemap-0.xml")
        return { body: SITEMAP_PRODUCTS_XML };
      throw new Error(`unexpected url ${url}`);
    });
    const src = makeStigaSource({ fetchImpl });

    const candidates = await src.search({
      brand: "Stiga",
      name: "Carbonado 45",
      category: "blade",
    });

    expect(candidates).toEqual([
      {
        url: "https://www.stigasports.com/en/product/carbonado-45",
        title: "Carbonado 45",
      },
    ]);
  });

  it("ignores non-EN locales and non-product paths in the sitemap", async () => {
    // The fixture intentionally includes a /de/product/carbonado-45,
    // a /en/category/... page, and /robots.txt. None should appear in
    // results, even when their slug tokens match the query.
    const fetchImpl = makeFetch(url => {
      if (url === "https://www.stigasports.com/sitemap.xml")
        return { body: SITEMAP_INDEX_XML };
      return { body: SITEMAP_PRODUCTS_XML };
    });
    const src = makeStigaSource({ fetchImpl });

    const candidates = await src.search({
      brand: "Stiga",
      name: "Carbonado 45",
      category: "blade",
    });

    for (const c of candidates) {
      expect(c.url.startsWith("https://www.stigasports.com/en/product/")).toBe(
        true
      );
    }
  });

  it("token-filters out cousin products that carry extra qualifiers", async () => {
    // Searching for plain "Mantra Pro" should keep "Mantra Pro H",
    // "Mantra Pro M", "Mantra Pro Xh" — every one carries all query
    // tokens. Searching for "Mantra Pro M" should drop the H and Xh
    // variants.
    const fetchImpl = makeFetch(url => {
      if (url === "https://www.stigasports.com/sitemap.xml")
        return { body: SITEMAP_INDEX_XML };
      return { body: SITEMAP_PRODUCTS_XML };
    });
    const src = makeStigaSource({ fetchImpl });

    const broad = await src.search({
      brand: "Stiga",
      name: "Mantra Pro",
      category: "rubber",
    });
    expect(broad.map(c => c.url).sort()).toEqual([
      "https://www.stigasports.com/en/product/mantra-pro-h",
      "https://www.stigasports.com/en/product/mantra-pro-m",
      "https://www.stigasports.com/en/product/mantra-pro-xh",
    ]);

    const narrow = await src.search({
      brand: "Stiga",
      name: "Mantra Pro M",
      category: "rubber",
    });
    expect(narrow.map(c => c.url)).toEqual([
      "https://www.stigasports.com/en/product/mantra-pro-m",
    ]);
  });

  it("caches the catalog across searches in the same source instance", async () => {
    let calls = 0;
    const fetchImpl = makeFetch(url => {
      calls++;
      if (url === "https://www.stigasports.com/sitemap.xml")
        return { body: SITEMAP_INDEX_XML };
      return { body: SITEMAP_PRODUCTS_XML };
    });
    const src = makeStigaSource({ fetchImpl });

    await src.search({
      brand: "Stiga",
      name: "Carbonado 45",
      category: "blade",
    });
    await src.search({
      brand: "Stiga",
      name: "Destiny Carbon",
      category: "blade",
    });

    // index + 1 urlset, only fetched once total.
    expect(calls).toBe(2);
  });

  it("re-fetches after a transient error so the cache isn't poisoned", async () => {
    // First search-attempt's fetch chain fails (5xx on the sitemap
    // index, retry also fails, throws). A second search() must build
    // the catalog from scratch rather than reuse the rejected promise.
    let calls = 0;
    const fetchImpl = makeFetch(url => {
      calls++;
      if (calls <= 2) return { body: "", status: 503 };
      if (url === "https://www.stigasports.com/sitemap.xml")
        return { body: SITEMAP_INDEX_XML };
      return { body: SITEMAP_PRODUCTS_XML };
    });
    const src = makeStigaSource({ fetchImpl });

    await expect(
      src.search({ brand: "Stiga", name: "Carbonado 45", category: "blade" })
    ).rejects.toThrow(/HTTP 503/);
    const second = await src.search({
      brand: "Stiga",
      name: "Carbonado 45",
      category: "blade",
    });
    expect(second.map(c => c.url)).toEqual([
      "https://www.stigasports.com/en/product/carbonado-45",
    ]);
  });

  it("returns at most 5 candidates per search", async () => {
    const fetchImpl = makeFetch(url => {
      if (url === "https://www.stigasports.com/sitemap.xml")
        return { body: SITEMAP_INDEX_XML };
      return { body: SITEMAP_PRODUCTS_XML };
    });
    const src = makeStigaSource({ fetchImpl });

    const candidates = await src.search({
      brand: "Stiga",
      name: "Mantra",
      category: "rubber",
    });

    expect(candidates.length).toBeLessThanOrEqual(5);
  });

  it("throws when the sitemap index returns a non-OK status (TT-162: no silent failures)", async () => {
    const fetchImpl = makeFetch(() => ({ body: "", status: 503 }));
    const src = makeStigaSource({ fetchImpl });

    await expect(
      src.search({ brand: "Stiga", name: "Carbonado 45", category: "blade" })
    ).rejects.toThrow(/HTTP 503/);
  });

  it("throws when the sitemap index lists no urlsets (Stiga changed the sitemap shape)", async () => {
    const fetchImpl = makeFetch(url => {
      if (url === "https://www.stigasports.com/sitemap.xml")
        return {
          body: '<?xml version="1.0"?><sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></sitemapindex>',
        };
      throw new Error(`unexpected url ${url}`);
    });
    const src = makeStigaSource({ fetchImpl });

    await expect(
      src.search({ brand: "Stiga", name: "Carbonado 45", category: "blade" })
    ).rejects.toThrow(/listed no urlsets/);
  });

  it("fetch returns the HTML and final URL of a candidate", async () => {
    const fetchImpl = makeFetch(() => ({
      body: PRODUCT_HTML,
      contentType: "text/html",
    }));
    const src = makeStigaSource({ fetchImpl });

    const result = await src.fetch(
      "https://www.stigasports.com/en/product/carbonado-45"
    );
    expect(result.html).toContain("Carbonado 45");
    expect(result.html).toContain("7.4mm carbon blade");
    expect(result.finalUrl).toBeTruthy();
  });

  describe("parseStigaSitemapIndex", () => {
    it("extracts every <sitemap> entry's <loc>", () => {
      const urls = parseStigaSitemapIndex(SITEMAP_INDEX_XML);
      expect(urls).toEqual(["https://www.stigasports.com/sitemap-0.xml"]);
    });
  });

  describe("parseStigaProductSitemap", () => {
    it("returns only /en/product/<slug> entries with slug-derived titles", () => {
      const candidates = parseStigaProductSitemap(SITEMAP_PRODUCTS_XML);
      expect(candidates).toEqual([
        {
          url: "https://www.stigasports.com/en/product/carbonado-45",
          title: "Carbonado 45",
        },
        {
          url: "https://www.stigasports.com/en/product/destiny-carbon",
          title: "Destiny Carbon",
        },
        {
          url: "https://www.stigasports.com/en/product/mantra-pro-h",
          title: "Mantra Pro H",
        },
        {
          url: "https://www.stigasports.com/en/product/mantra-pro-m",
          title: "Mantra Pro M",
        },
        {
          url: "https://www.stigasports.com/en/product/mantra-pro-xh",
          title: "Mantra Pro Xh",
        },
      ]);
    });
  });
});

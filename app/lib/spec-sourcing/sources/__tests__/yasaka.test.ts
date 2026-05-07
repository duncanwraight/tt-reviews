import { readFileSync } from "node:fs";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { _resetSpecSourcingThrottle } from "../http";
import { makeYasakaSource, parseYasakaSitemap } from "../yasaka";

const FIXTURES_DIR = join(__dirname, "fixtures");
const SITEMAP_XML = readFileSync(
  join(FIXTURES_DIR, "yasaka-sitemap.xml"),
  "utf8"
);
const PRODUCT_HTML = `<!doctype html><html><head><title>Rakza 7</title></head>
<body><h1>YASAKA Rakza 7</h1><div class="specs">Speed 9.7, Spin 10.0</div></body></html>`;

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

describe("yasakaSource", () => {
  it("identifies as the Yasaka tier-1 manufacturer source", () => {
    const src = makeYasakaSource();
    expect(src.id).toBe("yasaka");
    expect(src.kind).toBe("manufacturer");
    expect(src.tier).toBe(1);
    expect(src.brand).toBe("Yasaka");
  });

  it("returns the matching /product URL when searching by name", async () => {
    const fetchImpl = makeFetch(url => {
      if (url === "https://yasakatabletennis.com/sitemap.xml")
        return { body: SITEMAP_XML };
      throw new Error(`unexpected url ${url}`);
    });
    const src = makeYasakaSource({ fetchImpl });

    const candidates = await src.search({
      brand: "Yasaka",
      name: "Rakza 9",
      category: "rubber",
    });

    expect(candidates).toEqual([
      {
        url: "https://yasakatabletennis.com/product/rakza-9",
        title: "Rakza 9",
      },
    ]);
  });

  it("ignores category and CMS pages in the sitemap", async () => {
    // The fixture contains /product-category/blades, /categories, and
    // /products. None should appear in results — only /product/<slug>.
    const fetchImpl = makeFetch(() => ({ body: SITEMAP_XML }));
    const src = makeYasakaSource({ fetchImpl });

    const candidates = await src.search({
      brand: "Yasaka",
      name: "Rakza",
      category: "rubber",
    });

    for (const c of candidates) {
      expect(c.url.startsWith("https://yasakatabletennis.com/product/")).toBe(
        true
      );
      expect(c.url).not.toContain("/product-category/");
    }
  });

  it("token-filters out cousin products that carry extra qualifiers", async () => {
    // Searching for plain "Rakza 7" should keep both "rakza-7" and
    // "rakza-7-soft" (both contain every seed token). Searching for
    // "Ma Lin Extra Offensive" should only return the offensive
    // variant, not the special.
    const fetchImpl = makeFetch(() => ({ body: SITEMAP_XML }));
    const src = makeYasakaSource({ fetchImpl });

    const broad = await src.search({
      brand: "Yasaka",
      name: "Rakza 7",
      category: "rubber",
    });
    expect(broad.map(c => c.url).sort()).toEqual([
      "https://yasakatabletennis.com/product/rakza-7",
      "https://yasakatabletennis.com/product/rakza-7-soft",
    ]);

    const narrow = await src.search({
      brand: "Yasaka",
      name: "Ma Lin Extra Offensive",
      category: "blade",
    });
    expect(narrow.map(c => c.url)).toEqual([
      "https://yasakatabletennis.com/product/ma-lin-extra-offensive",
    ]);
  });

  it("caches the catalog across searches in the same source instance", async () => {
    let calls = 0;
    const fetchImpl = makeFetch(() => {
      calls++;
      return { body: SITEMAP_XML };
    });
    const src = makeYasakaSource({ fetchImpl });

    await src.search({ brand: "Yasaka", name: "Mark V", category: "rubber" });
    await src.search({ brand: "Yasaka", name: "Rakza 9", category: "rubber" });

    expect(calls).toBe(1);
  });

  it("re-fetches after a transient error so the cache isn't poisoned", async () => {
    let calls = 0;
    const fetchImpl = makeFetch(() => {
      calls++;
      if (calls <= 2) return { body: "", status: 503 };
      return { body: SITEMAP_XML };
    });
    const src = makeYasakaSource({ fetchImpl });

    await expect(
      src.search({ brand: "Yasaka", name: "Rakza 9", category: "rubber" })
    ).rejects.toThrow(/HTTP 503/);
    const second = await src.search({
      brand: "Yasaka",
      name: "Rakza 9",
      category: "rubber",
    });
    expect(second.map(c => c.url)).toEqual([
      "https://yasakatabletennis.com/product/rakza-9",
    ]);
  });

  it("returns at most 5 candidates per search", async () => {
    const fetchImpl = makeFetch(() => ({ body: SITEMAP_XML }));
    const src = makeYasakaSource({ fetchImpl });

    const candidates = await src.search({
      brand: "Yasaka",
      name: "Rakza",
      category: "rubber",
    });

    expect(candidates.length).toBeLessThanOrEqual(5);
  });

  it("throws when the sitemap returns a non-OK status (TT-162: no silent failures)", async () => {
    const fetchImpl = makeFetch(() => ({ body: "", status: 503 }));
    const src = makeYasakaSource({ fetchImpl });

    await expect(
      src.search({ brand: "Yasaka", name: "Rakza 9", category: "rubber" })
    ).rejects.toThrow(/HTTP 503/);
  });

  it("fetch returns the HTML and final URL of a candidate", async () => {
    const fetchImpl = makeFetch(() => ({
      body: PRODUCT_HTML,
      contentType: "text/html",
    }));
    const src = makeYasakaSource({ fetchImpl });

    const result = await src.fetch(
      "https://yasakatabletennis.com/product/rakza-7"
    );
    expect(result.html).toContain("Rakza 7");
    expect(result.html).toContain("Speed 9.7");
    expect(result.finalUrl).toBeTruthy();
  });

  describe("parseYasakaSitemap", () => {
    it("returns only /product/<slug> entries with slug-derived titles", () => {
      const candidates = parseYasakaSitemap(SITEMAP_XML);
      expect(candidates).toEqual([
        {
          url: "https://yasakatabletennis.com/product/ma-lin-extra-offensive",
          title: "Ma Lin Extra Offensive",
        },
        {
          url: "https://yasakatabletennis.com/product/ma-lin-extra-special",
          title: "Ma Lin Extra Special",
        },
        {
          url: "https://yasakatabletennis.com/product/rakza-7",
          title: "Rakza 7",
        },
        {
          url: "https://yasakatabletennis.com/product/rakza-7-soft",
          title: "Rakza 7 Soft",
        },
        {
          url: "https://yasakatabletennis.com/product/rakza-9",
          title: "Rakza 9",
        },
        {
          url: "https://yasakatabletennis.com/product/mark-v",
          title: "Mark V",
        },
        {
          url: "https://yasakatabletennis.com/product/sweden-extra",
          title: "Sweden Extra",
        },
      ]);
    });
  });
});

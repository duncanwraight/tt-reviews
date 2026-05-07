import { readFileSync } from "node:fs";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { _resetSpecSourcingThrottle } from "../http";
import { makeXiomSource, parseXiomCategoryIndex } from "../xiom";

const FIXTURES_DIR = join(__dirname, "fixtures");
const RUBBER_INDEX_HTML = readFileSync(
  join(FIXTURES_DIR, "xiom-rubber-index.html"),
  "utf8"
);
const PRODUCT_HTML = `<!doctype html><html><head><title>OMEGA 8 PRO</title></head>
<body><h1>OMEGA 8 PRO</h1><div class="specs">Speed: 9.6</div></body></html>`;

function makeFetch(
  responder: (url: string) => {
    html: string;
    status?: number;
    finalUrl?: string;
  }
): typeof fetch {
  return (async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input.toString();
    const r = responder(url);
    const response = new Response(r.html, {
      status: r.status ?? 200,
      headers: { "content-type": "text/html" },
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

describe("xiomSource", () => {
  it("identifies as the Xiom tier-1 manufacturer source", () => {
    const src = makeXiomSource();
    expect(src.id).toBe("xiom");
    expect(src.kind).toBe("manufacturer");
    expect(src.tier).toBe(1);
    expect(src.brand).toBe("Xiom");
  });

  it("returns the matching product URL when searching a rubber by name", async () => {
    const fetchImpl = makeFetch(url => {
      if (url === "https://www.xiom.eu/rubber")
        return { html: RUBBER_INDEX_HTML };
      throw new Error(`unexpected url ${url}`);
    });
    const src = makeXiomSource({ fetchImpl });

    const candidates = await src.search({
      brand: "Xiom",
      name: "Omega 8 Pro",
      category: "rubber",
    });

    expect(candidates).toEqual([
      { url: "https://www.xiom.eu/omega8-pro", title: "OMEGA 8 PRO" },
    ]);
  });

  it("token-filters out cousin products that carry extra qualifiers", async () => {
    // Searching for plain "Vega Pro" should drop "Vega Pro Hybrid" (the
    // adapter-level filter requires every seed token be present, and
    // returns matches before the disambiguate.ts no-extra-tokens check
    // — which would also drop it). Confirm we don't return Vega Asia or
    // Vega Pro Hybrid alongside Vega Pro.
    const fetchImpl = makeFetch(() => ({ html: RUBBER_INDEX_HTML }));
    const src = makeXiomSource({ fetchImpl });

    const candidates = await src.search({
      brand: "Xiom",
      name: "Vega Pro",
      category: "rubber",
    });

    expect(candidates.map(c => c.url)).toEqual([
      "https://www.xiom.eu/vega-pro",
      "https://www.xiom.eu/vega-pro-hybrid",
    ]);
  });

  it("returns no candidates when equipment.category is neither blade nor rubber", async () => {
    // Xiom's catalogue is fully covered by /rubber and /blade; there's
    // no useful index page for ball/glue/clothing/etc. Returning [] keeps
    // the worker's cost low — no fetch on an unroutable category.
    let fetchCount = 0;
    const fetchImpl = makeFetch(() => {
      fetchCount++;
      return { html: RUBBER_INDEX_HTML };
    });
    const src = makeXiomSource({ fetchImpl });

    const candidates = await src.search({
      brand: "Xiom",
      name: "Some Ball",
      category: "ball",
    });

    expect(candidates).toEqual([]);
    expect(fetchCount).toBe(0);
  });

  it("caches the category page across searches in the same source instance", async () => {
    let fetchCount = 0;
    const fetchImpl = makeFetch(url => {
      fetchCount++;
      if (url === "https://www.xiom.eu/rubber")
        return { html: RUBBER_INDEX_HTML };
      throw new Error(`unexpected url ${url}`);
    });
    const src = makeXiomSource({ fetchImpl });

    await src.search({ brand: "Xiom", name: "Vega Asia", category: "rubber" });
    await src.search({
      brand: "Xiom",
      name: "Omega 8 China",
      category: "rubber",
    });

    expect(fetchCount).toBe(1);
  });

  it("re-fetches after a transient error so the cache isn't poisoned", async () => {
    // A search that throws should evict the in-flight promise from the
    // cache; the next search must retry from scratch. Otherwise a
    // single upstream blip would silence Xiom for the rest of the
    // worker isolate's lifetime. httpFetch retries 5xx once before
    // giving up, so attempts 1+2 burn through the retry budget and
    // attempt 3 (the second search() call) sees a fresh fetch.
    let calls = 0;
    const fetchImpl = makeFetch(() => {
      calls++;
      if (calls <= 2) return { html: "", status: 503 };
      return { html: RUBBER_INDEX_HTML };
    });
    const src = makeXiomSource({ fetchImpl });

    await expect(
      src.search({ brand: "Xiom", name: "Vega Asia", category: "rubber" })
    ).rejects.toThrow(/HTTP 503/);
    const second = await src.search({
      brand: "Xiom",
      name: "Vega Asia",
      category: "rubber",
    });
    expect(second.map(c => c.url)).toContain("https://www.xiom.eu/vega-asia");
  });

  it("returns at most 5 candidates per search", async () => {
    const fetchImpl = makeFetch(() => ({ html: RUBBER_INDEX_HTML }));
    const src = makeXiomSource({ fetchImpl });

    const candidates = await src.search({
      brand: "Xiom",
      name: "Vega",
      category: "rubber",
    });

    expect(candidates.length).toBeLessThanOrEqual(5);
  });

  it("throws when the category index returns a non-OK status (TT-162: no silent failures)", async () => {
    const fetchImpl = makeFetch(() => ({ html: "", status: 503 }));
    const src = makeXiomSource({ fetchImpl });

    await expect(
      src.search({ brand: "Xiom", name: "Vega Asia", category: "rubber" })
    ).rejects.toThrow(/HTTP 503/);
  });

  it("fetch returns the HTML and final URL of a candidate", async () => {
    const fetchImpl = makeFetch(() => ({ html: PRODUCT_HTML }));
    const src = makeXiomSource({ fetchImpl });

    const result = await src.fetch("https://www.xiom.eu/omega8-pro");
    expect(result.html).toContain("OMEGA 8 PRO");
    expect(result.html).toContain("Speed: 9.6");
    expect(result.finalUrl).toBeTruthy();
  });

  describe("parseXiomCategoryIndex", () => {
    it("extracts every product anchor's URL and displayed title", () => {
      const candidates = parseXiomCategoryIndex(RUBBER_INDEX_HTML);
      expect(candidates).toHaveLength(6);
      expect(candidates[0]).toEqual({
        url: "https://www.xiom.eu/omega8-pro",
        title: "OMEGA 8 PRO",
      });
    });

    it("decodes HTML entities in the title (Wix renders & as &amp;)", () => {
      const candidates = parseXiomCategoryIndex(RUBBER_INDEX_HTML);
      const jh = candidates.find(c => c.url.endsWith("jekyll-hyde-c52-5"));
      expect(jh?.title).toBe("JEKYLL & HYDE C52.5");
    });
  });
});

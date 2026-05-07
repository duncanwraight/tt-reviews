import { readFileSync } from "node:fs";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { _resetSpecSourcingThrottle } from "../http";
import { makeNittakuSource, parseNittakuSearchResults } from "../nittaku";

const FIXTURES_DIR = join(__dirname, "fixtures");
const SEARCH_HTML = readFileSync(
  join(FIXTURES_DIR, "nittaku-search-acoustic.html"),
  "utf8"
);
const PRODUCT_HTML = `<!doctype html><html><head><title>Nittaku Acoustic</title></head>
<body><h1>Nittaku Acoustic Carbon Inner G-Revision</h1><div class="specs">5+2 carbon, 86g</div></body></html>`;

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

describe("nittakuSource", () => {
  it("identifies as the Nittaku tier-1 manufacturer source", () => {
    const src = makeNittakuSource();
    expect(src.id).toBe("nittaku");
    expect(src.kind).toBe("manufacturer");
    expect(src.tier).toBe(1);
    expect(src.brand).toBe("Nittaku");
  });

  it("targets nittaku.tt (Shopify) — not nittaku.com (Japanese-only)", async () => {
    let observedUrl = "";
    const fetchImpl = makeFetch(url => {
      observedUrl = url;
      return { html: SEARCH_HTML };
    });
    const src = makeNittakuSource({ fetchImpl });

    await src.search({ brand: "Nittaku", name: "Acoustic" });

    expect(observedUrl).toBe("https://nittaku.tt/en/search?q=Acoustic");
  });

  it("returns absolute Acoustic product URLs when searching for Acoustic", async () => {
    const fetchImpl = makeFetch(url => {
      if (url.includes("/en/search?q=")) return { html: SEARCH_HTML };
      throw new Error(`unexpected url ${url}`);
    });
    const src = makeNittakuSource({ fetchImpl });

    const candidates = await src.search({ brand: "Nittaku", name: "Acoustic" });

    expect(candidates.map(c => c.url)).toContain(
      "https://nittaku.tt/en/products/nittaku-acoustic-carbon-inner-g-revision"
    );
  });

  it("strips Shopify session-tracking query params from candidate URLs", async () => {
    // The fixture's hrefs all carry `?_pos=&_sid=&_ss=`. Stripping keeps
    // the proposal-row URL canonical and independent of search session.
    // Mirrors the Joola adapter's sanitation (TT-152).
    const fetchImpl = makeFetch(() => ({ html: SEARCH_HTML }));
    const src = makeNittakuSource({ fetchImpl });

    const candidates = await src.search({ brand: "Nittaku", name: "Acoustic" });

    for (const c of candidates) {
      expect(c.url).not.toContain("_pos");
      expect(c.url).not.toContain("_sid");
      expect(c.url).not.toContain("_ss");
    }
  });

  it("dedupes the per-card image / reviews-badge / Choose-options anchors that share the href", async () => {
    // Shopify Dawn renders 4 anchors per card at the same href; only
    // the product-item__title one carries the display name. The parser
    // keys on that class so the duplicates are skipped.
    const fetchImpl = makeFetch(() => ({ html: SEARCH_HTML }));
    const src = makeNittakuSource({ fetchImpl });

    const candidates = await src.search({ brand: "Nittaku", name: "Acoustic" });

    const uniqueUrls = new Set(candidates.map(c => c.url));
    expect(uniqueUrls.size).toBe(candidates.length);
  });

  it("returns at most 5 candidates per search", async () => {
    const fetchImpl = makeFetch(() => ({ html: SEARCH_HTML }));
    const src = makeNittakuSource({ fetchImpl });

    const candidates = await src.search({ brand: "Nittaku", name: "Acoustic" });

    expect(candidates.length).toBeLessThanOrEqual(5);
  });

  it("throws when search returns a non-OK status (TT-162: no silent failures)", async () => {
    const fetchImpl = makeFetch(() => ({ html: "", status: 503 }));
    const src = makeNittakuSource({ fetchImpl });

    await expect(
      src.search({ brand: "Nittaku", name: "Acoustic" })
    ).rejects.toThrow(/HTTP 503/);
  });

  it("fetch returns the HTML and final URL of a candidate", async () => {
    const fetchImpl = makeFetch(() => ({ html: PRODUCT_HTML }));
    const src = makeNittakuSource({ fetchImpl });

    const result = await src.fetch(
      "https://nittaku.tt/en/products/nittaku-acoustic-carbon-inner-g-revision"
    );
    expect(result.html).toContain("Nittaku Acoustic");
    expect(result.html).toContain("5+2 carbon");
    expect(result.finalUrl).toBeTruthy();
  });

  describe("parseNittakuSearchResults", () => {
    it("extracts each product-item__title anchor with prepended host", () => {
      const candidates = parseNittakuSearchResults(SEARCH_HTML);
      expect(candidates).toHaveLength(5);
      expect(candidates[0]).toEqual({
        url: "https://nittaku.tt/en/products/nittaku-acoustic-carbon-inner-g-revision",
        title: "Nittaku Acoustic Carbon Inner G-Revision",
      });
    });
  });
});

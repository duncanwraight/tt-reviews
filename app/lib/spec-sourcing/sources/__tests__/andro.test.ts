import { readFileSync } from "node:fs";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { makeAndroSource, parseAndroSearchResults } from "../andro";
import { _resetSpecSourcingThrottle } from "../http";

const FIXTURES_DIR = join(__dirname, "fixtures");
const SEARCH_HTML = readFileSync(
  join(FIXTURES_DIR, "andro-search-hexer.html"),
  "utf8"
);
const PRODUCT_HTML = `<!doctype html><html><head><title>Hexer Powergrip</title></head>
<body><h1>Hexer Powergrip</h1><div class="specs">Speed 121, Spin 116</div></body></html>`;

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

describe("androSource", () => {
  it("identifies as the Andro tier-1 manufacturer source", () => {
    const src = makeAndroSource();
    expect(src.id).toBe("andro");
    expect(src.kind).toBe("manufacturer");
    expect(src.tier).toBe(1);
    expect(src.brand).toBe("Andro");
  });

  it("uses Drupal's search_api_fulltext param (not q) when querying", async () => {
    // The brief flagged that ?q= returned 0 results. Andro's search is
    // driven by Drupal Search API, which expects search_api_fulltext.
    // Verify the constructed query URL carries the right param.
    let observedUrl = "";
    const fetchImpl = makeFetch(url => {
      observedUrl = url;
      return { html: SEARCH_HTML };
    });
    const src = makeAndroSource({ fetchImpl });

    await src.search({ brand: "Andro", name: "Hexer" });

    expect(observedUrl).toBe(
      "https://www.andro.de/en/search?search_api_fulltext=Hexer"
    );
  });

  it("returns the canonical Hexer Powergrip URL when searching for Hexer", async () => {
    const fetchImpl = makeFetch(url => {
      if (url.includes("/en/search?search_api_fulltext="))
        return { html: SEARCH_HTML };
      throw new Error(`unexpected url ${url}`);
    });
    const src = makeAndroSource({ fetchImpl });

    const candidates = await src.search({ brand: "Andro", name: "Hexer" });

    expect(candidates.map(c => c.url)).toContain(
      "https://www.andro.de/en/hexer-powergrip"
    );
  });

  it("ignores stretched-link anchors outside the search-result__title wrapper", async () => {
    // The fixture includes a marketing-banner <a class="stretched-link">
    // that's not nested inside a search-result__title div. The parser
    // must skip it — `stretched-link` is generic Bootstrap and shows up
    // in unrelated blocks across the site.
    const fetchImpl = makeFetch(() => ({ html: SEARCH_HTML }));
    const src = makeAndroSource({ fetchImpl });

    const candidates = await src.search({ brand: "Andro", name: "Hexer" });

    for (const c of candidates) {
      expect(c.url).not.toContain("/en/marketing-page");
    }
  });

  it("returns at most 5 candidates per search", async () => {
    const fetchImpl = makeFetch(() => ({ html: SEARCH_HTML }));
    const src = makeAndroSource({ fetchImpl });

    const candidates = await src.search({ brand: "Andro", name: "Hexer" });

    expect(candidates.length).toBeLessThanOrEqual(5);
  });

  it("throws when search returns a non-OK status (TT-162: no silent failures)", async () => {
    const fetchImpl = makeFetch(() => ({ html: "", status: 503 }));
    const src = makeAndroSource({ fetchImpl });

    await expect(src.search({ brand: "Andro", name: "Hexer" })).rejects.toThrow(
      /HTTP 503/
    );
  });

  it("fetch returns the HTML and final URL of a candidate", async () => {
    const fetchImpl = makeFetch(() => ({ html: PRODUCT_HTML }));
    const src = makeAndroSource({ fetchImpl });

    const result = await src.fetch("https://www.andro.de/en/hexer-powergrip");
    expect(result.html).toContain("Hexer Powergrip");
    expect(result.html).toContain("Speed 121");
    expect(result.finalUrl).toBeTruthy();
  });

  describe("parseAndroSearchResults", () => {
    it("extracts each search-result__title anchor with prepended host", () => {
      const candidates = parseAndroSearchResults(SEARCH_HTML);
      expect(candidates).toHaveLength(5); // default limit
      expect(candidates[0]).toEqual({
        url: "https://www.andro.de/en/hexer-powergrip",
        title: "Hexer Powergrip",
      });
    });

    it("respects an override limit", () => {
      const candidates = parseAndroSearchResults(SEARCH_HTML, 99);
      expect(candidates.length).toBe(7);
    });
  });
});

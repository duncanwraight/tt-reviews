import { readFileSync } from "node:fs";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { makeDonicSource } from "../donic";
import { _resetSpecSourcingThrottle } from "../http";

const FIXTURES_DIR = join(__dirname, "fixtures");
const SEARCH_HTML = readFileSync(
  join(FIXTURES_DIR, "donic-search-waldner.html"),
  "utf8"
);
const PRODUCT_HTML = `<!doctype html><html><head><title>Waldner Senso Carbon</title></head>
<body><h1>Waldner Senso Carbon</h1><div class="specs">Speed: 9.0</div></body></html>`;

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

describe("donicSource", () => {
  it("identifies as the Donic tier-1 manufacturer source", () => {
    const src = makeDonicSource();
    expect(src.id).toBe("donic");
    expect(src.kind).toBe("manufacturer");
    expect(src.tier).toBe(1);
    expect(src.brand).toBe("Donic");
  });

  it("returns the canonical Waldner product URL when searching for Waldner", async () => {
    const fetchImpl = makeFetch(url => {
      if (url.includes("/search?search=")) return { html: SEARCH_HTML };
      throw new Error(`unexpected url ${url}`);
    });
    const src = makeDonicSource({ fetchImpl });

    const candidates = await src.search({ brand: "Donic", name: "Waldner" });

    expect(candidates.length).toBeGreaterThanOrEqual(2);
    expect(candidates.map(c => c.url)).toContain(
      "https://www.donic.com/DONIC-WALDNER-OFFENSIV/100220010"
    );
  });

  it("dedupes the per-card 'Details' button anchor that shares the product href", async () => {
    // Donic's product cards include both a primary product-name anchor
    // and a duplicate Details button pointing at the same URL. The
    // parser only matches the title-bearing primary anchor so the
    // duplicate is skipped — verify by counting unique URLs vs total
    // matches.
    const fetchImpl = makeFetch(() => ({ html: SEARCH_HTML }));
    const src = makeDonicSource({ fetchImpl });

    const candidates = await src.search({ brand: "Donic", name: "Waldner" });

    const uniqueUrls = new Set(candidates.map(c => c.url));
    expect(uniqueUrls.size).toBe(candidates.length);
  });

  it("returns at most 5 candidates per search", async () => {
    const fetchImpl = makeFetch(() => ({ html: SEARCH_HTML }));
    const src = makeDonicSource({ fetchImpl });

    const candidates = await src.search({ brand: "Donic", name: "Waldner" });

    expect(candidates.length).toBeLessThanOrEqual(5);
  });

  it("throws when search returns a non-OK status (TT-162: no silent failures)", async () => {
    const fetchImpl = makeFetch(() => ({ html: "", status: 503 }));
    const src = makeDonicSource({ fetchImpl });

    await expect(
      src.search({ brand: "Donic", name: "Waldner" })
    ).rejects.toThrow(/HTTP 503/);
  });

  it("fetch returns the HTML and final URL of a candidate", async () => {
    const fetchImpl = makeFetch(() => ({ html: PRODUCT_HTML }));
    const src = makeDonicSource({ fetchImpl });

    const result = await src.fetch(
      "https://www.donic.com/DONIC-WALDNER-SENSO-CARBON/100219010"
    );
    expect(result.html).toContain("Waldner Senso Carbon");
    expect(result.html).toContain("Speed: 9.0");
    expect(result.finalUrl).toBeTruthy();
  });
});

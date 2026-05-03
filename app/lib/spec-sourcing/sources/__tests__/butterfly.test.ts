import { readFileSync } from "node:fs";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { makeButterflySource } from "../butterfly";
import { _resetSpecSourcingThrottle } from "../http";

const FIXTURES_DIR = join(__dirname, "fixtures");
const SEARCH_HTML = readFileSync(
  join(FIXTURES_DIR, "butterfly-search-viscaria.html"),
  "utf8"
);
const PRODUCT_HTML = `<!doctype html><html><head><title>Viscaria</title></head>
<body><h1>Viscaria</h1><div class="specs">Speed: 9.0</div></body></html>`;

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
    return new Response(r.html, {
      status: r.status ?? 200,
      headers: { "content-type": "text/html" },
    });
  }) as unknown as typeof fetch;
}

afterEach(() => _resetSpecSourcingThrottle());

describe("butterflySource", () => {
  it("identifies as the Butterfly tier-1 manufacturer source", () => {
    const src = makeButterflySource();
    expect(src.id).toBe("butterfly");
    expect(src.kind).toBe("manufacturer");
    expect(src.tier).toBe(1);
    expect(src.brand).toBe("Butterfly");
  });

  it("returns the canonical Viscaria product URL when searching for Viscaria", async () => {
    const fetchImpl = makeFetch(url => {
      if (url.includes("/catalogsearch/result/")) return { html: SEARCH_HTML };
      throw new Error(`unexpected url ${url}`);
    });
    const src = makeButterflySource({ fetchImpl });

    const candidates = await src.search({
      brand: "Butterfly",
      name: "Viscaria",
    });

    expect(candidates.length).toBeGreaterThanOrEqual(2);
    expect(candidates.map(c => c.url)).toContain(
      "https://en.butterfly.tt/viscaria.html"
    );
  });

  it("returns at most 5 candidates per search", async () => {
    const fetchImpl = makeFetch(() => ({ html: SEARCH_HTML }));
    const src = makeButterflySource({ fetchImpl });

    const candidates = await src.search({
      brand: "Butterfly",
      name: "Viscaria",
    });

    expect(candidates.length).toBeLessThanOrEqual(5);
  });

  it("returns empty array when search returns a non-OK status", async () => {
    const fetchImpl = makeFetch(() => ({ html: "", status: 503 }));
    const src = makeButterflySource({ fetchImpl });

    const candidates = await src.search({
      brand: "Butterfly",
      name: "Viscaria",
    });
    expect(candidates).toEqual([]);
  });

  it("fetch returns the HTML and final URL of a candidate", async () => {
    const fetchImpl = makeFetch(() => ({ html: PRODUCT_HTML }));
    const src = makeButterflySource({ fetchImpl });

    const result = await src.fetch("https://en.butterfly.tt/viscaria.html");
    expect(result.html).toContain("Viscaria");
    expect(result.html).toContain("Speed: 9.0");
    expect(result.finalUrl).toBeTruthy();
  });
});

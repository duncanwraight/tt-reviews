import { readFileSync } from "node:fs";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { _resetSpecSourcingThrottle } from "../http";
import { makeVictasSource } from "../victas";

const FIXTURES_DIR = join(__dirname, "fixtures");
const SEARCH_HTML = readFileSync(
  join(FIXTURES_DIR, "victas-search-v15.html"),
  "utf8"
);
const PRODUCT_HTML = `<!doctype html><html><head><title>V>15 Extra</title></head>
<body><h1>V>15 エキストラ</h1><div class="specs">Speed: 12.5</div></body></html>`;

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

describe("victasSource", () => {
  it("identifies as the Victas tier-1 manufacturer source", () => {
    const src = makeVictasSource();
    expect(src.id).toBe("victas");
    expect(src.kind).toBe("manufacturer");
    expect(src.tier).toBe(1);
    expect(src.brand).toBe("Victas");
  });

  it("returns absolute V>15 product URLs when searching for V15", async () => {
    const fetchImpl = makeFetch(url => {
      if (url.includes("/products/?keyword=")) return { html: SEARCH_HTML };
      throw new Error(`unexpected url ${url}`);
    });
    const src = makeVictasSource({ fetchImpl });

    const candidates = await src.search({ brand: "Victas", name: "V15" });

    expect(candidates.length).toBeGreaterThanOrEqual(2);
    expect(candidates.map(c => c.url)).toContain(
      "https://www.victas.com/products/detail.html?id=781"
    );
  });

  it("includes Roman alt text in the title so the prefilter can match seed tokens", async () => {
    // Without the alt-text concatenation, V>15 products would expose
    // only Japanese-script titles like 'V>15 エキストラ', which
    // tokenize to ['v', '15'] — missing 'extra'. The seed for "V>15
    // Extra" carries 'extra' as a required token, so prefilter would
    // drop the candidate. Including the alt text "V>15 Extra" in the
    // title rescues the match.
    const fetchImpl = makeFetch(() => ({ html: SEARCH_HTML }));
    const src = makeVictasSource({ fetchImpl });

    const candidates = await src.search({ brand: "Victas", name: "V15 Extra" });
    const extra = candidates.find(c =>
      c.url.endsWith("/products/detail.html?id=781")
    );

    expect(extra).toBeDefined();
    expect(extra!.title.toLowerCase()).toContain("extra");
  });

  it("strips the generic '製品画像' alt so it doesn't clutter the title", async () => {
    // id=728 is a Zegna entry whose alt is '製品画像' ("product image")
    // — the parser should fall back to just the visible name, not
    // append the meaningless alt.
    const fetchImpl = makeFetch(() => ({ html: SEARCH_HTML }));
    const src = makeVictasSource({ fetchImpl });

    const candidates = await src.search({ brand: "Victas", name: "Zegna" });
    const zegna = candidates.find(c =>
      c.url.endsWith("/products/detail.html?id=728")
    );

    expect(zegna).toBeDefined();
    expect(zegna!.title).not.toContain("製品画像");
  });

  it("returns at most 5 candidates per search", async () => {
    const fetchImpl = makeFetch(() => ({ html: SEARCH_HTML }));
    const src = makeVictasSource({ fetchImpl });

    const candidates = await src.search({ brand: "Victas", name: "V15" });

    expect(candidates.length).toBeLessThanOrEqual(5);
  });

  it("throws when search returns a non-OK status (TT-162: no silent failures)", async () => {
    const fetchImpl = makeFetch(() => ({ html: "", status: 503 }));
    const src = makeVictasSource({ fetchImpl });

    await expect(src.search({ brand: "Victas", name: "V15" })).rejects.toThrow(
      /HTTP 503/
    );
  });

  it("fetch returns the HTML and final URL of a candidate", async () => {
    const fetchImpl = makeFetch(() => ({ html: PRODUCT_HTML }));
    const src = makeVictasSource({ fetchImpl });

    const result = await src.fetch(
      "https://www.victas.com/products/detail.html?id=781"
    );
    expect(result.html).toContain("V>15");
    expect(result.html).toContain("Speed: 12.5");
    expect(result.finalUrl).toBeTruthy();
  });
});

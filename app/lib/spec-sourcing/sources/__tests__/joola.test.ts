import { readFileSync } from "node:fs";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { _resetSpecSourcingThrottle } from "../http";
import { makeJoolaSource } from "../joola";

const FIXTURES_DIR = join(__dirname, "fixtures");
const SEARCH_HTML = readFileSync(
  join(FIXTURES_DIR, "joola-search-carbon.html"),
  "utf8"
);
const PRODUCT_HTML = `<!doctype html><html><head><title>JOOLA Carbon X</title></head>
<body><h1>JOOLA Carbon X Table Tennis Racket</h1><div class="specs">Speed: 8.0</div></body></html>`;

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

describe("joolaSource", () => {
  it("identifies as the Joola tier-1 manufacturer source", () => {
    const src = makeJoolaSource();
    expect(src.id).toBe("joola");
    expect(src.kind).toBe("manufacturer");
    expect(src.tier).toBe(1);
    expect(src.brand).toBe("Joola");
  });

  it("returns absolute Carbon X product URLs when searching for Carbon", async () => {
    const fetchImpl = makeFetch(url => {
      if (url.includes("/search?q=")) return { html: SEARCH_HTML };
      throw new Error(`unexpected url ${url}`);
    });
    const src = makeJoolaSource({ fetchImpl });

    const candidates = await src.search({ brand: "Joola", name: "Carbon" });

    expect(candidates.length).toBeGreaterThanOrEqual(2);
    expect(candidates.map(c => c.url)).toContain(
      "https://www.joola.com/products/joola-carbon-x-table-tennis-racket"
    );
  });

  it("strips Shopify session-tracking query params from candidate URLs", async () => {
    // The fixture's hrefs all carry `?_pos=&_sid=&_ss=` — those are
    // Shopify per-request tracking, not part of the canonical product
    // URL. Stripping keeps the proposal row's source URL clean and
    // independent of the search-time session.
    const fetchImpl = makeFetch(() => ({ html: SEARCH_HTML }));
    const src = makeJoolaSource({ fetchImpl });

    const candidates = await src.search({ brand: "Joola", name: "Carbon" });

    for (const c of candidates) {
      expect(c.url).not.toContain("_pos");
      expect(c.url).not.toContain("_sid");
      expect(c.url).not.toContain("_ss");
    }
  });

  it("returns at most 5 candidates per search", async () => {
    const fetchImpl = makeFetch(() => ({ html: SEARCH_HTML }));
    const src = makeJoolaSource({ fetchImpl });

    const candidates = await src.search({ brand: "Joola", name: "Carbon" });

    expect(candidates.length).toBeLessThanOrEqual(5);
  });

  it("throws when search returns a non-OK status (TT-162: no silent failures)", async () => {
    const fetchImpl = makeFetch(() => ({ html: "", status: 503 }));
    const src = makeJoolaSource({ fetchImpl });

    await expect(
      src.search({ brand: "Joola", name: "Carbon" })
    ).rejects.toThrow(/HTTP 503/);
  });

  it("fetch returns the HTML and final URL of a candidate", async () => {
    const fetchImpl = makeFetch(() => ({ html: PRODUCT_HTML }));
    const src = makeJoolaSource({ fetchImpl });

    const result = await src.fetch(
      "https://www.joola.com/products/joola-carbon-x-table-tennis-racket"
    );
    expect(result.html).toContain("JOOLA Carbon X");
    expect(result.html).toContain("Speed: 8.0");
    expect(result.finalUrl).toBeTruthy();
  });
});

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { _resetSpecSourcingThrottle } from "../http";
import { makeTibharSource } from "../tibhar";

const FIXTURES_DIR = join(__dirname, "fixtures");
const SEARCH_HTML = readFileSync(
  join(FIXTURES_DIR, "tibhar-search-evolution.html"),
  "utf8"
);
const PRODUCT_HTML = `<!doctype html><html><head><title>Evolution FX-S</title></head>
<body><h1>Evolution FX-S</h1><div class="specs">Speed: 9.5</div></body></html>`;

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

describe("tibharSource", () => {
  it("identifies as the Tibhar tier-1 manufacturer source", () => {
    const src = makeTibharSource();
    expect(src.id).toBe("tibhar");
    expect(src.kind).toBe("manufacturer");
    expect(src.tier).toBe(1);
    expect(src.brand).toBe("Tibhar");
  });

  it("returns the canonical Evolution product URLs when searching for Evolution", async () => {
    const fetchImpl = makeFetch(url => {
      if (url.includes("/?s=")) return { html: SEARCH_HTML };
      throw new Error(`unexpected url ${url}`);
    });
    const src = makeTibharSource({ fetchImpl });

    const candidates = await src.search({ brand: "Tibhar", name: "Evolution" });

    expect(candidates.length).toBeGreaterThanOrEqual(2);
    expect(candidates.map(c => c.url)).toContain(
      "https://tibhar.info/shop/evolution-fx-s/"
    );
  });

  it("returns at most 5 candidates per search", async () => {
    const fetchImpl = makeFetch(() => ({ html: SEARCH_HTML }));
    const src = makeTibharSource({ fetchImpl });

    const candidates = await src.search({ brand: "Tibhar", name: "Evolution" });

    expect(candidates.length).toBeLessThanOrEqual(5);
  });

  it("throws when search returns a non-OK status (TT-162: no silent failures)", async () => {
    const fetchImpl = makeFetch(() => ({ html: "", status: 503 }));
    const src = makeTibharSource({ fetchImpl });

    await expect(
      src.search({ brand: "Tibhar", name: "Evolution" })
    ).rejects.toThrow(/HTTP 503/);
  });

  it("fetch returns the HTML and final URL of a candidate", async () => {
    const fetchImpl = makeFetch(() => ({ html: PRODUCT_HTML }));
    const src = makeTibharSource({ fetchImpl });

    const result = await src.fetch("https://tibhar.info/shop/evolution-fx-s/");
    expect(result.html).toContain("Evolution FX-S");
    expect(result.html).toContain("Speed: 9.5");
    expect(result.finalUrl).toBeTruthy();
  });
});

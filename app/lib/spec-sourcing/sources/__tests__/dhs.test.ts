import { readFileSync } from "node:fs";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { makeDhsSource } from "../dhs";
import { _resetSpecSourcingThrottle } from "../http";

const FIXTURES_DIR = join(__dirname, "fixtures");
const SEARCH_HTML = readFileSync(
  join(FIXTURES_DIR, "dhs-search-hurricane.html"),
  "utf8"
);
const PRODUCT_HTML = `<!doctype html><html><head><title>DHS Hurricane 3</title></head>
<body><h1>DHS Hurricane 3</h1><div class="specs">Speed 11.5, Spin 12.0</div></body></html>`;

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

describe("dhsSource", () => {
  it("identifies as the DHS tier-1 manufacturer source", () => {
    const src = makeDhsSource();
    expect(src.id).toBe("dhs");
    expect(src.kind).toBe("manufacturer");
    expect(src.tier).toBe(1);
    expect(src.brand).toBe("DHS");
  });

  it("queries the /dhs_en/catalogsearch endpoint with q=", async () => {
    let observedUrl = "";
    const fetchImpl = makeFetch(url => {
      observedUrl = url;
      return { html: SEARCH_HTML };
    });
    const src = makeDhsSource({ fetchImpl });

    await src.search({ brand: "DHS", name: "Hurricane 3" });

    expect(observedUrl).toBe(
      "https://dhs-tt.com/dhs_en/catalogsearch/result/?q=Hurricane%203"
    );
  });

  it("returns the canonical Hurricane 3 product URL when searching for Hurricane 3", async () => {
    const fetchImpl = makeFetch(url => {
      if (url.includes("/dhs_en/catalogsearch/")) return { html: SEARCH_HTML };
      throw new Error(`unexpected url ${url}`);
    });
    const src = makeDhsSource({ fetchImpl });

    const candidates = await src.search({ brand: "DHS", name: "Hurricane 3" });

    expect(candidates.map(c => c.url)).toContain(
      "https://dhs-tt.com/dhs_en/dhs-hurricane-3"
    );
  });

  it("synthesises a single candidate when the search auto-redirects to a product page (TT-176)", async () => {
    // Magento's catalogsearch 302s to the canonical product page when
    // exactly one product matches. The shared parseMagentoSearchResponse
    // helper handles this by reading the HTML <title>; verify DHS gets
    // the same behaviour.
    const fetchImpl = makeFetch(url => {
      if (url.includes("/dhs_en/catalogsearch/")) {
        return {
          html: PRODUCT_HTML,
          finalUrl: "https://dhs-tt.com/dhs_en/dhs-hurricane-3",
        };
      }
      throw new Error(`unexpected url ${url}`);
    });
    const src = makeDhsSource({ fetchImpl });

    const candidates = await src.search({ brand: "DHS", name: "Hurricane 3" });

    expect(candidates).toEqual([
      {
        url: "https://dhs-tt.com/dhs_en/dhs-hurricane-3",
        title: "DHS Hurricane 3",
      },
    ]);
  });

  it("returns at most 5 candidates per search", async () => {
    const fetchImpl = makeFetch(() => ({ html: SEARCH_HTML }));
    const src = makeDhsSource({ fetchImpl });

    const candidates = await src.search({ brand: "DHS", name: "Hurricane" });

    expect(candidates.length).toBeLessThanOrEqual(5);
  });

  it("throws when search returns a non-OK status (TT-162: no silent failures)", async () => {
    const fetchImpl = makeFetch(() => ({ html: "", status: 503 }));
    const src = makeDhsSource({ fetchImpl });

    await expect(
      src.search({ brand: "DHS", name: "Hurricane 3" })
    ).rejects.toThrow(/HTTP 503/);
  });

  it("fetch returns the HTML and final URL of a candidate", async () => {
    const fetchImpl = makeFetch(() => ({ html: PRODUCT_HTML }));
    const src = makeDhsSource({ fetchImpl });

    const result = await src.fetch("https://dhs-tt.com/dhs_en/dhs-hurricane-3");
    expect(result.html).toContain("DHS Hurricane 3");
    expect(result.html).toContain("Speed 11.5");
    expect(result.finalUrl).toBeTruthy();
  });
});

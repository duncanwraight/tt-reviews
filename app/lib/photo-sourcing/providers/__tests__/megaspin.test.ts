import { describe, it, expect, vi } from "vitest";
import { makeMegaspinProvider, parseMegaspinSearch } from "../megaspin";

const ENV = { BRAVE_SEARCH_API_KEY: "k" };

const SAMPLE_HTML = `
<html><body>
<div class="results">
  <a href="/store/default.asp?pid=s-airoc-m"><img src="https://cdn.megaspin.net/store/images/products/zoom_s-airoc-m.jpg" alt="Stiga Airoc M" ></a>
  <a class="productname" href="/store/default.asp?pid=s-airoc-m">Stiga Airoc M</a>
  <a href="/store/default.asp?pid=s-airoc-s"><img src="https://cdn.megaspin.net/store/images/products/zoom_s-airoc-s.jpg" alt="Stiga Airoc S" ></a>
  <a href="/store/default.asp?pid=b-test"><img src="https://cdn.megaspin.net/store/images/products/zoom_b-test.jpg" alt="Butterfly Test Blade" ></a>
</div>
</body></html>
`;

describe("parseMegaspinSearch", () => {
  it("extracts each product anchor with image + alt", () => {
    const hits = parseMegaspinSearch(SAMPLE_HTML);
    expect(hits).toHaveLength(3);
    expect(hits[0]).toEqual({
      name: "Stiga Airoc M",
      imageUrl:
        "https://cdn.megaspin.net/store/images/products/zoom_s-airoc-m.jpg",
      pageUrl: "https://www.megaspin.net/store/default.asp?pid=s-airoc-m",
    });
  });

  it("dedupes by pageUrl", () => {
    const dup = SAMPLE_HTML + SAMPLE_HTML;
    const hits = parseMegaspinSearch(dup);
    expect(hits).toHaveLength(3);
  });

  it("decodes HTML entities in product names", () => {
    const html = `<a href="/store/default.asp?pid=x"><img src="https://x/y.jpg" alt="Sauer &amp; Tr&#246;ger Test"></a>`;
    const hits = parseMegaspinSearch(html);
    expect(hits[0]?.name).toBe("Sauer & Tröger Test");
  });

  it("returns empty for HTML with no product cards", () => {
    expect(parseMegaspinSearch("<html><body>nothing</body></html>")).toEqual(
      []
    );
  });
});

function makeFetch(html: string, status = 200): typeof fetch {
  return (async () =>
    new Response(html, {
      status,
      headers: { "content-type": "text/html" },
    })) as unknown as typeof fetch;
}

describe("megaspinProvider.resolveCandidates", () => {
  it("returns tier-1 trailing candidate when search has an exact name match", async () => {
    const fetchImpl = makeFetch(SAMPLE_HTML);
    const provider = makeMegaspinProvider({ fetchImpl });

    const result = await provider.resolveCandidates(
      {
        slug: "stiga-airoc-m",
        name: "Stiga Airoc M",
        manufacturer: "Stiga",
        category: "rubber",
      },
      ENV
    );

    expect(result.status).toBe("ok");
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]).toMatchObject({
      match: "trailing",
      tier: 1,
      tierLabel: "megaspin",
      host: "megaspin.net",
      imageUrl:
        "https://cdn.megaspin.net/store/images/products/zoom_s-airoc-m.jpg",
      pageUrl: "https://www.megaspin.net/store/default.asp?pid=s-airoc-m",
    });
  });

  it("returns no candidates when no result matches the seed name", async () => {
    const fetchImpl = makeFetch(SAMPLE_HTML);
    const provider = makeMegaspinProvider({ fetchImpl });

    const result = await provider.resolveCandidates(
      {
        slug: "nonexistent",
        name: "Nonexistent Product",
        manufacturer: "Nobody",
        category: "rubber",
      },
      ENV
    );

    expect(result.candidates).toEqual([]);
  });

  it("returns no candidates when megaspin returns a non-200 response", async () => {
    const fetchImpl = makeFetch("", 500);
    const provider = makeMegaspinProvider({ fetchImpl });

    const result = await provider.resolveCandidates(
      {
        slug: "stiga-airoc-m",
        name: "Stiga Airoc M",
        manufacturer: "Stiga",
        category: "rubber",
      },
      ENV
    );

    expect(result.candidates).toEqual([]);
  });

  it("returns no candidates when fetch throws (network error)", async () => {
    const fetchImpl = (async () => {
      throw new Error("ECONNRESET");
    }) as unknown as typeof fetch;
    const provider = makeMegaspinProvider({ fetchImpl });

    const result = await provider.resolveCandidates(
      {
        slug: "stiga-airoc-m",
        name: "Stiga Airoc M",
        manufacturer: "Stiga",
        category: "rubber",
      },
      ENV
    );

    expect(result.candidates).toEqual([]);
  });

  it("URL-encodes the search query", async () => {
    const seen: string[] = [];
    const fetchImpl = (async (url: string) => {
      seen.push(url);
      return new Response(SAMPLE_HTML, { status: 200 });
    }) as unknown as typeof fetch;
    const provider = makeMegaspinProvider({ fetchImpl });

    await provider.resolveCandidates(
      {
        slug: "tibhar-grass-d-tecs",
        name: "Tibhar Grass D.Tecs",
        manufacturer: "Tibhar",
        category: "rubber",
      },
      ENV
    );

    expect(seen[0]).toContain("product_search=Tibhar%20Grass%20D.Tecs");
  });
});

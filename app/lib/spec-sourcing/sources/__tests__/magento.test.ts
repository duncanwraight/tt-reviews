import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  parseMagentoSearchResponse,
  parseMagentoSearchResults,
} from "../magento";

const FIXTURES_DIR = join(__dirname, "fixtures");

function fixture(name: string): string {
  return readFileSync(join(FIXTURES_DIR, name), "utf8");
}

describe("parseMagentoSearchResults", () => {
  it("extracts every product-item-link from a real Butterfly search page", () => {
    const html = fixture("butterfly-search-viscaria.html");
    const candidates = parseMagentoSearchResults(html, 10);

    expect(candidates).toHaveLength(6);
    expect(candidates[0]).toEqual({
      url: "https://en.butterfly.tt/viscaria.html",
      title: "Viscaria",
    });
    expect(candidates.map(c => c.url)).toContain(
      "https://en.butterfly.tt/viscaria-super-alc.html"
    );
    expect(
      candidates.find(c => c.title === "Viscaria Super ALC")
    ).toBeDefined();
  });

  it("extracts every product-item-link from a real TT11 search page", () => {
    const html = fixture("tt11-search-cybershape.html");
    const candidates = parseMagentoSearchResults(html, 10);

    expect(candidates.length).toBeGreaterThanOrEqual(7);
    expect(candidates[0]).toEqual({
      url: "https://tabletennis11.com/en/stiga-cybershape-carbon",
      title: "Stiga Cybershape Carbon",
    });
  });

  it("respects the limit parameter", () => {
    const html = fixture("tt11-search-cybershape.html");
    expect(parseMagentoSearchResults(html, 3)).toHaveLength(3);
  });

  it("dedupes by href when the same anchor appears twice", () => {
    const html = `<a class="product-item-link" href="/x.html">X</a>
                  <a class="product-item-link" href="/x.html">X</a>`;
    expect(parseMagentoSearchResults(html, 10)).toHaveLength(1);
  });

  it("decodes HTML entities in the displayed name", () => {
    const html = `<a class="product-item-link" href="/y.html">Sauer &amp; Tr&#246;ger</a>`;
    expect(parseMagentoSearchResults(html, 10)[0].title).toBe("Sauer & Tröger");
  });

  it("returns no results when the page has no product-item-link anchors", () => {
    expect(
      parseMagentoSearchResults("<html><body>nope</body></html>", 5)
    ).toEqual([]);
  });
});

describe("parseMagentoSearchResponse", () => {
  const SEARCH_URL = "https://en.butterfly.tt/catalogsearch/result/?q=Viscaria";
  const RESULT_LIST_HTML = fixture("butterfly-search-viscaria.html");

  it("delegates to the result-list parser when no redirect occurred", () => {
    const candidates = parseMagentoSearchResponse(
      RESULT_LIST_HTML,
      SEARCH_URL,
      SEARCH_URL,
      10
    );
    expect(candidates.length).toBeGreaterThan(1);
    expect(candidates[0]).toEqual({
      url: "https://en.butterfly.tt/viscaria.html",
      title: "Viscaria",
    });
  });

  it("synthesises a single candidate from <title> when Magento single-result-redirected (TT-176)", () => {
    // Reproduces the Impartial XS bug: search 302s to the product page,
    // whose only `product-item-link` is the "Weight selection (rubber)"
    // sidebar. Without this branch we'd return that sidebar link and
    // prefilter would drop it.
    const productPageHtml = `
      <html>
        <head><title>Butterfly Impartial XS</title></head>
        <body>
          <a class="product-item-link"
             href="https://en.butterfly.tt/weight-selection-rubber.html">
             Weight selection (rubber)</a>
          <h1>Impartial XS</h1>
        </body>
      </html>`;
    const candidates = parseMagentoSearchResponse(
      productPageHtml,
      "https://en.butterfly.tt/impartial-xs.html",
      "https://en.butterfly.tt/catalogsearch/result/?q=Impartial%20XS",
      5
    );
    expect(candidates).toEqual([
      {
        url: "https://en.butterfly.tt/impartial-xs.html",
        title: "Butterfly Impartial XS",
      },
    ]);
  });

  it("decodes entities in the synthesised <title>", () => {
    const candidates = parseMagentoSearchResponse(
      "<html><head><title>Sauer &amp; Tr&#246;ger Quattro</title></head></html>",
      "https://example.com/sauer-quattro.html",
      "https://example.com/catalogsearch/result/?q=Quattro",
      5
    );
    expect(candidates[0].title).toBe("Sauer & Tröger Quattro");
  });

  it("returns no candidates when the redirected page has no <title>", () => {
    const candidates = parseMagentoSearchResponse(
      "<html><body>untitled</body></html>",
      "https://example.com/untitled.html",
      "https://example.com/catalogsearch/result/?q=Anything",
      5
    );
    expect(candidates).toEqual([]);
  });

  it("does not trigger the redirect branch when the final URL is still on /catalogsearch/", () => {
    // E.g. pagination redirect ?q=...&p=2 — still a result list.
    const candidates = parseMagentoSearchResponse(
      RESULT_LIST_HTML,
      "https://en.butterfly.tt/catalogsearch/result/?q=Viscaria&p=2",
      SEARCH_URL,
      10
    );
    expect(candidates.length).toBeGreaterThan(1);
  });
});

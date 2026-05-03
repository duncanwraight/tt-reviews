import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { parseMagentoSearchResults } from "../magento";

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

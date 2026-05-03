import { readFileSync } from "node:fs";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { _resetSpecSourcingThrottle } from "../http";
import { makeTt11Source } from "../tt11";

const SEARCH_HTML = readFileSync(
  join(__dirname, "fixtures", "tt11-search-cybershape.html"),
  "utf8"
);

function makeFetch(html: string, status = 200): typeof fetch {
  return (async () =>
    new Response(html, {
      status,
      headers: { "content-type": "text/html" },
    })) as unknown as typeof fetch;
}

afterEach(() => _resetSpecSourcingThrottle());

describe("tt11Source", () => {
  it("identifies as the TT11 tier-2 retailer source with no brand restriction", () => {
    const src = makeTt11Source();
    expect(src.id).toBe("tt11");
    expect(src.kind).toBe("retailer");
    expect(src.tier).toBe(2);
    expect(src.brand).toBeUndefined();
  });

  it("returns candidates from a TT11 search page", async () => {
    const fetchImpl = makeFetch(SEARCH_HTML);
    const src = makeTt11Source({ fetchImpl });

    const candidates = await src.search({
      brand: "Stiga",
      name: "Cybershape Carbon",
    });

    expect(candidates.length).toBeGreaterThanOrEqual(2);
    expect(candidates[0].url).toContain("tabletennis11.com");
    expect(candidates[0].title).toMatch(/Stiga/i);
  });

  it("caps the candidate list at 5", async () => {
    const fetchImpl = makeFetch(SEARCH_HTML);
    const src = makeTt11Source({ fetchImpl });

    const candidates = await src.search({
      brand: "Stiga",
      name: "Cybershape",
    });
    expect(candidates.length).toBeLessThanOrEqual(5);
  });

  it("returns empty when search yields non-OK", async () => {
    const fetchImpl = makeFetch("", 500);
    const src = makeTt11Source({ fetchImpl });

    const candidates = await src.search({ brand: "Stiga", name: "X" });
    expect(candidates).toEqual([]);
  });

  it("fetch returns the HTML for a candidate URL", async () => {
    const fetchImpl = makeFetch("<html><body>product page</body></html>");
    const src = makeTt11Source({ fetchImpl });

    const result = await src.fetch(
      "https://tabletennis11.com/en/stiga-cybershape-carbon"
    );
    expect(result.html).toContain("product page");
  });
});

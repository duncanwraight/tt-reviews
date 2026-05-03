import { afterEach, describe, expect, it } from "vitest";

import { _resetSpecSourcingThrottle } from "../http";
import { _clearRevspinListCache, makeRevspinSource } from "../revspin";

import type { RevspinCategory, RevspinListItem } from "../../../revspin.server";

function listFixture(): RevspinListItem[] {
  return [
    {
      name: "Butterfly Viscaria",
      slug: "butterfly-viscaria",
      url: "https://revspin.net/blade/butterfly-viscaria.html",
    },
    {
      name: "Butterfly Viscaria Super ALC",
      slug: "butterfly-viscaria-super-alc",
      url: "https://revspin.net/blade/butterfly-viscaria-super-alc.html",
    },
    {
      name: "Stiga Allround Classic",
      slug: "stiga-allround-classic",
      url: "https://revspin.net/blade/stiga-allround-classic.html",
    },
  ];
}

afterEach(() => {
  _clearRevspinListCache();
  _resetSpecSourcingThrottle();
});

describe("revspinSource", () => {
  it("identifies as the RevSpin tier-3 review source", () => {
    const src = makeRevspinSource();
    expect(src.id).toBe("revspin");
    expect(src.kind).toBe("review");
    expect(src.tier).toBe(3);
    expect(src.brand).toBeUndefined();
  });

  it("returns plausible candidates for { brand: 'Butterfly', name: 'Viscaria' }", async () => {
    const fetchListFn = (async () => listFixture()) as unknown as (
      category: RevspinCategory
    ) => Promise<RevspinListItem[]>;
    const src = makeRevspinSource({ fetchListFn });

    const candidates = await src.search({
      brand: "Butterfly",
      name: "Viscaria",
      category: "blade",
    });

    expect(candidates.length).toBeGreaterThanOrEqual(1);
    expect(candidates[0].url).toBe(
      "https://revspin.net/blade/butterfly-viscaria.html"
    );
    expect(candidates[0].title).toBe("Butterfly Viscaria");
  });

  it("returns empty when the equipment category isn't indexed by RevSpin", async () => {
    const fetchListFn = (async () => listFixture()) as unknown as (
      category: RevspinCategory
    ) => Promise<RevspinListItem[]>;
    const src = makeRevspinSource({ fetchListFn });

    const candidates = await src.search({
      brand: "Butterfly",
      name: "Whatever",
      category: "ball",
    });
    expect(candidates).toEqual([]);
  });

  it("memoises the per-category list within the TTL window", async () => {
    let calls = 0;
    const fetchListFn = (async () => {
      calls++;
      return listFixture();
    }) as unknown as (category: RevspinCategory) => Promise<RevspinListItem[]>;
    const src = makeRevspinSource({ fetchListFn });

    await src.search({
      brand: "Butterfly",
      name: "Viscaria",
      category: "blade",
    });
    await src.search({
      brand: "Stiga",
      name: "Allround Classic",
      category: "blade",
    });
    expect(calls).toBe(1);
  });

  it("re-fetches the list after the cache TTL expires", async () => {
    let calls = 0;
    const fetchListFn = (async () => {
      calls++;
      return listFixture();
    }) as unknown as (category: RevspinCategory) => Promise<RevspinListItem[]>;
    let now = 1_000_000;
    const src = makeRevspinSource({ fetchListFn, now: () => now });

    await src.search({
      brand: "Butterfly",
      name: "Viscaria",
      category: "blade",
    });
    now += 30 * 60 * 1000 + 1;
    await src.search({
      brand: "Butterfly",
      name: "Viscaria",
      category: "blade",
    });
    expect(calls).toBe(2);
  });

  it("fetch returns the product detail HTML via the injected fetch", async () => {
    const fetchListFn = (async () => listFixture()) as unknown as (
      category: RevspinCategory
    ) => Promise<RevspinListItem[]>;
    const fetchImpl = (async () =>
      new Response("<html><body>detail</body></html>", {
        headers: { "content-type": "text/html" },
      })) as unknown as typeof fetch;
    const src = makeRevspinSource({ fetchListFn, fetchImpl });

    const result = await src.fetch(
      "https://revspin.net/blade/butterfly-viscaria.html"
    );
    expect(result.html).toContain("detail");
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeRevspinProvider, _clearListCache } from "../revspin";
import type { RevspinListItem } from "../../../revspin.server";

const ENV = { BRAVE_SEARCH_API_KEY: "k" };

const SAMPLE_LIST: RevspinListItem[] = [
  {
    name: "Stiga Airoc M",
    slug: "stiga-airoc-m",
    url: "https://revspin.net/rubber/stiga-airoc-m.html",
  },
  {
    name: "Butterfly Zhang Jike ZLC",
    slug: "butterfly-zhang-jike-zlc",
    url: "https://revspin.net/blade/butterfly-zhang-jike-zlc.html",
  },
];

beforeEach(() => {
  _clearListCache();
});

describe("revspinProvider.resolveCandidates", () => {
  it("returns a tier-1 trailing candidate when slug matches", async () => {
    const fetchListFn = vi.fn().mockResolvedValue(SAMPLE_LIST);
    const fetchImageFn = vi
      .fn()
      .mockResolvedValue(
        "https://revspin.net/assets/table-tennis-images/rubbers/stiga-airoc-m.jpg"
      );
    const provider = makeRevspinProvider({ fetchListFn, fetchImageFn });

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
      tierLabel: "revspin",
      host: "revspin.net",
      imageUrl:
        "https://revspin.net/assets/table-tennis-images/rubbers/stiga-airoc-m.jpg",
      pageUrl: "https://revspin.net/rubber/stiga-airoc-m.html",
    });
    expect(fetchListFn).toHaveBeenCalledWith("rubber");
    expect(fetchImageFn).toHaveBeenCalledWith(
      "https://revspin.net/rubber/stiga-airoc-m.html"
    );
  });

  it("falls back to normalized name match when slug doesn't match", async () => {
    const fetchListFn = vi.fn().mockResolvedValue(SAMPLE_LIST);
    const fetchImageFn = vi.fn().mockResolvedValue("https://example/x.jpg");
    const provider = makeRevspinProvider({ fetchListFn, fetchImageFn });

    const result = await provider.resolveCandidates(
      {
        slug: "stiga_airoc_m_v2", // different shape
        name: "Stiga Airoc M",
        manufacturer: "Stiga",
        category: "rubber",
      },
      ENV
    );

    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0].pageUrl).toBe(
      "https://revspin.net/rubber/stiga-airoc-m.html"
    );
  });

  it("maps long_pips subcategory to revspin's pips_long category", async () => {
    const fetchListFn = vi.fn().mockResolvedValue([]);
    const provider = makeRevspinProvider({ fetchListFn });

    await provider.resolveCandidates(
      {
        slug: "tibhar-grass-d-tecs",
        name: "Tibhar Grass D.Tecs",
        manufacturer: "Tibhar",
        category: "rubber",
        // EquipmentSeed in current types doesn't include subcategory
        // but the provider downcasts and reads it.
        subcategory: "long_pips",
         
      } as any,
      ENV
    );

    expect(fetchListFn).toHaveBeenCalledWith("pips_long");
  });

  it("returns no candidates when category isn't indexed by revspin", async () => {
    const fetchListFn = vi.fn();
    const provider = makeRevspinProvider({ fetchListFn });

    const result = await provider.resolveCandidates(
      {
        slug: "butterfly-three-star",
        name: "Butterfly Three Star",
        manufacturer: "Butterfly",
        category: "ball",
      },
      ENV
    );

    expect(result.candidates).toEqual([]);
    expect(fetchListFn).not.toHaveBeenCalled();
  });

  it("returns no candidates when no product matches", async () => {
    const fetchListFn = vi.fn().mockResolvedValue(SAMPLE_LIST);
    const fetchImageFn = vi.fn();
    const provider = makeRevspinProvider({ fetchListFn, fetchImageFn });

    const result = await provider.resolveCandidates(
      {
        slug: "nonexistent-product",
        name: "Nonexistent Product",
        manufacturer: "Nobody",
        category: "blade",
      },
      ENV
    );

    expect(result.candidates).toEqual([]);
    expect(fetchImageFn).not.toHaveBeenCalled();
  });

  it("returns no candidates when image extraction fails", async () => {
    const fetchListFn = vi.fn().mockResolvedValue(SAMPLE_LIST);
    const fetchImageFn = vi.fn().mockResolvedValue(null);
    const provider = makeRevspinProvider({ fetchListFn, fetchImageFn });

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

  it("memoises the category list within the TTL window", async () => {
    const fetchListFn = vi.fn().mockResolvedValue(SAMPLE_LIST);
    const fetchImageFn = vi.fn().mockResolvedValue("https://example/x.jpg");
    let nowMs = 0;
    const provider = makeRevspinProvider({
      fetchListFn,
      fetchImageFn,
      now: () => nowMs,
    });

    await provider.resolveCandidates(
      {
        slug: "stiga-airoc-m",
        name: "Stiga Airoc M",
        manufacturer: "Stiga",
        category: "rubber",
      },
      ENV
    );
    nowMs += 5 * 60 * 1000; // +5 min, well within TTL
    await provider.resolveCandidates(
      {
        slug: "stiga-airoc-m",
        name: "Stiga Airoc M",
        manufacturer: "Stiga",
        category: "rubber",
      },
      ENV
    );

    expect(fetchListFn).toHaveBeenCalledTimes(1);
  });

  it("re-fetches the list after TTL expiry", async () => {
    const fetchListFn = vi.fn().mockResolvedValue(SAMPLE_LIST);
    const fetchImageFn = vi.fn().mockResolvedValue("https://example/x.jpg");
    let nowMs = 0;
    const provider = makeRevspinProvider({
      fetchListFn,
      fetchImageFn,
      now: () => nowMs,
    });

    await provider.resolveCandidates(
      {
        slug: "stiga-airoc-m",
        name: "Stiga Airoc M",
        manufacturer: "Stiga",
        category: "rubber",
      },
      ENV
    );
    nowMs += 31 * 60 * 1000; // past 30-min TTL
    await provider.resolveCandidates(
      {
        slug: "stiga-airoc-m",
        name: "Stiga Airoc M",
        manufacturer: "Stiga",
        category: "rubber",
      },
      ENV
    );

    expect(fetchListFn).toHaveBeenCalledTimes(2);
  });
});

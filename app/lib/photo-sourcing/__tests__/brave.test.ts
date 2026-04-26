import { describe, it, expect } from "vitest";
import {
  manufacturerKeys,
  productKey,
  buildBraveQuery,
  classifyHost,
  evalCandidate,
  rankCandidates,
  pickBest,
  resolveBraveCandidates,
  braveImageSearchRaw,
  type EquipmentSeed,
  type BraveImageResult,
} from "../brave.server";

const STIGA_AIROC_M: EquipmentSeed = {
  slug: "stiga-airoc-m",
  name: "Stiga Airoc M",
  manufacturer: "Stiga",
  category: "rubber",
};

const YINHE: EquipmentSeed = {
  slug: "yinhe-mercury",
  name: "Yinhe Mercury 2",
  manufacturer: "Yinhe (Galaxy/Milkyway)",
  category: "rubber",
};

const SAUER: EquipmentSeed = {
  slug: "sauer-troger-hipster",
  name: "Sauer & Troger Hipster",
  manufacturer: "Sauer & Troger",
  category: "rubber",
};

describe("manufacturerKeys", () => {
  it("expands parenthesised aliases", () => {
    const keys = manufacturerKeys("Yinhe (Galaxy/Milkyway)");
    expect(keys).toContain("yinhe");
    expect(keys).toContain("galaxy");
    expect(keys).toContain("milkyway");
  });

  it("keeps multi-word canonical and individual words", () => {
    const keys = manufacturerKeys("Sauer & Troger");
    expect(keys).toContain("sauer troger");
    expect(keys).toContain("sauer");
    expect(keys).toContain("troger");
  });

  it("strips short tokens (length < 2)", () => {
    const keys = manufacturerKeys("X Y");
    expect(keys.every(k => k.replace(/\s+/g, "").length >= 2)).toBe(true);
  });

  it("handles a single-word manufacturer", () => {
    expect(manufacturerKeys("Stiga")).toEqual(["stiga"]);
  });
});

describe("productKey", () => {
  it("strips a duplicated manufacturer prefix from the name", () => {
    expect(productKey(STIGA_AIROC_M)).toBe("airoc m");
  });

  it("strips just the first manufacturer word when full prefix doesn't match", () => {
    const item: EquipmentSeed = {
      slug: "x",
      name: "Stiga Pro Airoc S",
      manufacturer: "Stiga AB",
      category: "rubber",
    };
    expect(productKey(item)).toBe("pro airoc s");
  });

  it("returns the whole normalized name when no prefix overlap", () => {
    const item: EquipmentSeed = {
      slug: "x",
      name: "Mercury 2",
      manufacturer: "Yinhe",
      category: "rubber",
    };
    expect(productKey(item)).toBe("mercury 2");
  });
});

describe("buildBraveQuery", () => {
  it("composes manufacturer + product + category and dedupes whitespace", () => {
    expect(buildBraveQuery(STIGA_AIROC_M)).toBe("Stiga airoc m rubber");
  });
});

describe("classifyHost", () => {
  it("returns tier 1 for revspin/megaspin/tt-shop", () => {
    expect(classifyHost("www.revspin.net")).toEqual({
      tier: 1,
      label: "revspin",
    });
    expect(classifyHost("megaspin.net")).toEqual({
      tier: 1,
      label: "megaspin",
    });
    expect(classifyHost("www.tt-shop.com")).toEqual({
      tier: 1,
      label: "tt-shop",
    });
  });

  it("returns tier 2 for the mid retailer set", () => {
    expect(classifyHost("contra.de").tier).toBe(2);
    expect(classifyHost("vsport-tt.com").tier).toBe(2);
    expect(classifyHost("customtabletennis.co.uk").tier).toBe(2);
  });

  it("returns tier 4 / 'other' for unknown hosts", () => {
    expect(classifyHost("randomshop.example")).toEqual({
      tier: 4,
      label: "other",
    });
  });
});

function makeResult(over: Partial<BraveImageResult>): BraveImageResult {
  return {
    title: null,
    pageUrl: null,
    imageUrl: null,
    source: null,
    ...over,
  };
}

describe("evalCandidate — asymmetric matching", () => {
  it("flags trailing match when filename ends at the product slug", () => {
    const c = evalCandidate(
      STIGA_AIROC_M,
      makeResult({
        imageUrl: "https://www.revspin.net/img/rubber/stiga-airoc-m.jpg",
        pageUrl: "https://www.revspin.net/rubber/stiga-airoc-m",
      })
    );
    expect(c.match).toBe("trailing");
    expect(c.tier).toBe(1);
    expect(c.tierLabel).toBe("revspin");
  });

  it("flags loose match when product appears mid-filename (e.g. variant suffix)", () => {
    const c = evalCandidate(
      STIGA_AIROC_M,
      makeResult({
        imageUrl: "https://contra.de/cdn/stiga-airoc-m-plus-2024.jpg",
        pageUrl: "https://contra.de/products/airoc-m-plus",
      })
    );
    expect(c.match).toBe("loose");
  });

  it("rejects when the product token is missing from the image URL", () => {
    const c = evalCandidate(
      STIGA_AIROC_M,
      makeResult({
        imageUrl: "https://contra.de/cdn/butterfly-tenergy-05.jpg",
        pageUrl: "https://contra.de/airoc-m",
      })
    );
    expect(c.match).toBe("no-product");
    expect(c.rejectReason).toBeNull();
  });

  it("accepts manufacturer in PAGE pathname even if absent from image url (Shopify hash CDN)", () => {
    const c = evalCandidate(
      STIGA_AIROC_M,
      makeResult({
        // image filename has product but no brand
        imageUrl: "https://cdn.shop.example/products/airoc-m-1234.jpg",
        // page pathname carries the brand — algorithm checks
        // pathname (not hostname) for portability
        pageUrl: "https://shop.example/stiga/products/airoc-m",
      })
    );
    expect(c.match).toBe("loose");
  });

  it("returns no-manufacturer when neither url mentions the brand", () => {
    const c = evalCandidate(
      STIGA_AIROC_M,
      makeResult({
        imageUrl: "https://cdn.shop.example/products/airoc-m.jpg",
        pageUrl: "https://shop.example/products/airoc-m",
      })
    );
    expect(c.match).toBe("no-manufacturer");
    expect(c.rejectReason).toBeNull();
  });

  it("rejects ebay/amazon hosts", () => {
    const c = evalCandidate(
      STIGA_AIROC_M,
      makeResult({
        imageUrl: "https://i.ebayimg.com/whatever-stiga-airoc-m.jpg",
        pageUrl: "https://www.ebay.com/itm/stiga-airoc-m",
      })
    );
    expect(c.match).toBe("no-product");
    expect(c.rejectReason).toMatch(/^skip-host:/);
  });

  it("rejects shopify default + AI-placeholder filenames", () => {
    const cases = [
      "https://x.example/stiga-airoc-m/og_image.png",
      "https://x.example/stiga-airoc-m/Gemini_Generated_Image.png",
      "https://x.example/stiga-airoc-m/dalle3.jpg",
      "https://x.example/stiga-airoc-m/social_share.jpg",
      "https://x.example/stiga-airoc-m/placeholder-gray.png",
    ];
    for (const url of cases) {
      const c = evalCandidate(
        STIGA_AIROC_M,
        makeResult({
          imageUrl: url,
          pageUrl: "https://stigashop.example/airoc-m",
        })
      );
      expect(c.match).toBe("no-product");
      expect(c.rejectReason).toMatch(/^filename:/);
    }
  });

  it("rejects a result with no image URL", () => {
    const c = evalCandidate(
      STIGA_AIROC_M,
      makeResult({ pageUrl: "https://x.example" })
    );
    expect(c.rejectReason).toBe("no-image-url");
  });

  it("rejects a result with a malformed image URL", () => {
    const c = evalCandidate(
      STIGA_AIROC_M,
      makeResult({ imageUrl: "not a url" })
    );
    expect(c.rejectReason).toBe("bad-image-url");
  });

  it("matches a parenthesised-alias manufacturer (Yinhe → Galaxy)", () => {
    const c = evalCandidate(
      YINHE,
      makeResult({
        imageUrl: "https://revspin.net/img/galaxy-mercury-2.jpg",
        pageUrl: "https://revspin.net/rubber/galaxy-mercury-2",
      })
    );
    expect(c.match).toBe("trailing");
  });

  it("matches a multi-word manufacturer via individual words (Sauer & Troger)", () => {
    const c = evalCandidate(
      SAUER,
      makeResult({
        imageUrl: "https://tt-shop.com/img/sauer-troger-hipster.jpg",
        pageUrl: "https://tt-shop.com/products/sauer-troger-hipster",
      })
    );
    expect(c.match).toBe("trailing");
  });
});

describe("rankCandidates / pickBest", () => {
  it("orders trailing before loose, then by tier ascending; preserves Brave order within ties", () => {
    const candidates = [
      evalCandidate(
        STIGA_AIROC_M,
        makeResult({
          imageUrl: "https://contra.de/img/stiga-airoc-m.jpg",
          pageUrl: "https://contra.de/airoc-m",
        })
      ),
      evalCandidate(
        STIGA_AIROC_M,
        makeResult({
          imageUrl: "https://www.revspin.net/img/stiga-airoc-m.jpg",
          pageUrl: "https://www.revspin.net/airoc-m",
        })
      ),
      evalCandidate(
        STIGA_AIROC_M,
        makeResult({
          imageUrl: "https://www.megaspin.net/img/stiga-airoc-m-plus.jpg",
          pageUrl: "https://www.megaspin.net/airoc-m-plus",
        })
      ),
    ];
    const ranked = rankCandidates(candidates);
    expect(ranked).toHaveLength(3);
    expect(ranked[0].tierLabel).toBe("revspin");
    expect(ranked[0].match).toBe("trailing");
    expect(ranked[1].tierLabel).toBe("contra");
    expect(ranked[1].match).toBe("trailing");
    expect(ranked[2].match).toBe("loose");
  });

  it("returns null from pickBest when nothing matches", () => {
    const candidates = [
      evalCandidate(
        STIGA_AIROC_M,
        makeResult({
          imageUrl: "https://example.com/butterfly-tenergy.jpg",
          pageUrl: "https://example.com",
        })
      ),
    ];
    expect(pickBest(candidates)).toBeNull();
  });
});

function fakeBrave(results: Array<Partial<BraveImageResult>>): typeof fetch {
  return (async () =>
    new Response(
      JSON.stringify({
        results: results.map(r => ({
          title: r.title ?? null,
          url: r.pageUrl ?? null,
          source: r.source ?? null,
          properties: r.imageUrl ? { url: r.imageUrl } : undefined,
        })),
      }),
      { status: 200 }
    )) as unknown as typeof fetch;
}

describe("braveImageSearchRaw", () => {
  it("posts the query/count/safesearch params and X-Subscription-Token header", async () => {
    let captured: { url: string; headers: Headers } | null = null;
    const fetchImpl = (async (input: string, init: RequestInit) => {
      captured = {
        url: input,
        headers: new Headers(init.headers as HeadersInit),
      };
      return new Response(JSON.stringify({ results: [] }), { status: 200 });
    }) as unknown as typeof fetch;

    await braveImageSearchRaw("stiga airoc m rubber", "key-abc", {
      fetchImpl,
      count: 5,
    });

    expect(captured!.url).toContain(
      "https://api.search.brave.com/res/v1/images/search"
    );
    expect(captured!.url).toContain("count=5");
    expect(captured!.url).toContain("safesearch=strict");
    expect(captured!.headers.get("X-Subscription-Token")).toBe("key-abc");
  });

  it("throws on non-OK responses", async () => {
    const fetchImpl = (async () =>
      new Response("rate limited", { status: 429 })) as unknown as typeof fetch;
    await expect(braveImageSearchRaw("q", "k", { fetchImpl })).rejects.toThrow(
      /Brave 429/
    );
  });
});

describe("resolveBraveCandidates — end-to-end", () => {
  it("returns ranked DTOs limited by `limit`", async () => {
    const fetchImpl = fakeBrave([
      // mid-tier loose
      {
        imageUrl: "https://contra.de/img/stiga-airoc-m-plus.jpg",
        pageUrl: "https://contra.de/airoc-m-plus",
      },
      // tier-1 trailing
      {
        imageUrl: "https://www.revspin.net/img/stiga-airoc-m.jpg",
        pageUrl: "https://www.revspin.net/rubber/stiga-airoc-m",
      },
      // skipped — ebay
      {
        imageUrl: "https://i.ebayimg.com/stiga-airoc-m.jpg",
        pageUrl: "https://www.ebay.com/itm/stiga-airoc-m",
      },
      // mid-tier trailing
      {
        imageUrl: "https://contra.de/img/stiga-airoc-m.jpg",
        pageUrl: "https://contra.de/airoc-m",
      },
    ]);

    const out = await resolveBraveCandidates(STIGA_AIROC_M, "k", {
      fetchImpl,
      limit: 3,
    });

    expect(out).toHaveLength(3);
    expect(out[0].tierLabel).toBe("revspin");
    expect(out[0].match).toBe("trailing");
    expect(out[1].tierLabel).toBe("contra");
    expect(out[1].match).toBe("trailing");
    expect(out[2].match).toBe("loose");
    expect(out.every(c => c.imageUrl.length > 0)).toBe(true);
  });

  it("returns [] when Brave returns no results", async () => {
    const fetchImpl = fakeBrave([]);
    const out = await resolveBraveCandidates(STIGA_AIROC_M, "k", { fetchImpl });
    expect(out).toEqual([]);
  });

  it("returns [] when nothing passes the asymmetric filter", async () => {
    const fetchImpl = fakeBrave([
      {
        imageUrl: "https://example.com/butterfly-tenergy-05.jpg",
        pageUrl: "https://example.com/tenergy",
      },
    ]);
    const out = await resolveBraveCandidates(STIGA_AIROC_M, "k", { fetchImpl });
    expect(out).toEqual([]);
  });

  it("defaults limit to 6", async () => {
    const many = Array.from({ length: 10 }, (_, i) => ({
      imageUrl: `https://www.revspin.net/img/stiga-airoc-m-${i}.jpg`,
      pageUrl: `https://www.revspin.net/${i}`,
    }));
    // All are loose (suffix), so all accepted.
    const out = await resolveBraveCandidates(STIGA_AIROC_M, "k", {
      fetchImpl: fakeBrave(many),
    });
    expect(out).toHaveLength(6);
  });
});

import { describe, expect, it } from "vitest";

import { mergeContributions, type SourceContribution } from "../merge";
import type { ExtractedSpec } from "../extract/types";
import type { SpecSource } from "../sources/types";

function makeSource(id: string, tier: 1 | 2 | 3): SpecSource {
  return {
    id,
    kind: tier === 1 ? "manufacturer" : tier === 2 ? "retailer" : "review",
    tier,
    async search() {
      return [];
    },
    async fetch() {
      return { html: "", finalUrl: "" };
    },
  };
}

function contribution(
  source: SpecSource,
  url: string,
  extracted: ExtractedSpec
): SourceContribution {
  return {
    source,
    candidateUrl: url,
    finalUrl: url,
    extracted,
    fetchedAt: "2026-05-03T08:00:00.000Z",
  };
}

describe("mergeContributions", () => {
  it("uses the only contribution when there's one source", () => {
    const tier1 = makeSource("butterfly", 1);
    const merged = mergeContributions([
      contribution(tier1, "https://en.butterfly.tt/viscaria.html", {
        specs: { weight: 89, plies_wood: 5, plies_composite: 2 },
        description: "Legendary all-round blade.",
        perFieldConfidence: {},
        rawHtmlExcerpt: "<excerpt>",
      }),
    ]);

    expect(merged.merged.specs).toEqual({
      weight: 89,
      plies_wood: 5,
      plies_composite: 2,
    });
    expect(merged.merged.description).toBe("Legendary all-round blade.");
    expect(merged.merged.per_field_source).toEqual({
      weight: "https://en.butterfly.tt/viscaria.html",
      plies_wood: "https://en.butterfly.tt/viscaria.html",
      plies_composite: "https://en.butterfly.tt/viscaria.html",
      description: "https://en.butterfly.tt/viscaria.html",
    });
    expect(merged.mergedFieldCount).toBe(4);
  });

  it("picks the higher-confidence value when sources disagree", () => {
    const manuf = makeSource("butterfly", 1);
    const retail = makeSource("tt11", 2);
    const merged = mergeContributions([
      contribution(retail, "https://tabletennis11.com/x", {
        specs: { weight: 100 },
        description: null,
        perFieldConfidence: { weight: 0.4 },
        rawHtmlExcerpt: "",
      }),
      contribution(manuf, "https://en.butterfly.tt/x.html", {
        specs: { weight: 89 },
        description: null,
        perFieldConfidence: {},
        rawHtmlExcerpt: "",
      }),
    ]);

    expect(merged.merged.specs.weight).toBe(89);
    expect(merged.merged.per_field_source.weight).toBe(
      "https://en.butterfly.tt/x.html"
    );
  });

  it("breaks confidence ties in favour of the lowest-tier source", () => {
    const tier1 = makeSource("butterfly", 1);
    const tier2 = makeSource("tt11", 2);
    const merged = mergeContributions([
      contribution(tier2, "https://tabletennis11.com/x", {
        specs: { weight: 100 },
        description: null,
        perFieldConfidence: {},
        rawHtmlExcerpt: "",
      }),
      contribution(tier1, "https://en.butterfly.tt/x.html", {
        specs: { weight: 89 },
        description: null,
        perFieldConfidence: {},
        rawHtmlExcerpt: "",
      }),
    ]);

    expect(merged.merged.specs.weight).toBe(89);
    expect(merged.merged.per_field_source.weight).toBe(
      "https://en.butterfly.tt/x.html"
    );
  });

  it("merges per-field across sources (manufacturer for plies, retailer for weight)", () => {
    const manuf = makeSource("butterfly", 1);
    const retail = makeSource("tt11", 2);
    const merged = mergeContributions([
      contribution(manuf, "https://en.butterfly.tt/x.html", {
        specs: { plies_wood: 5, plies_composite: 2 },
        description: "Manufacturer description.",
        perFieldConfidence: {},
        rawHtmlExcerpt: "",
      }),
      contribution(retail, "https://tabletennis11.com/x", {
        specs: { weight: 89 },
        description: "Retailer blurb.",
        perFieldConfidence: {},
        rawHtmlExcerpt: "",
      }),
    ]);

    expect(merged.merged.specs).toEqual({
      plies_wood: 5,
      plies_composite: 2,
      weight: 89,
    });
    expect(merged.merged.per_field_source.plies_wood).toContain("butterfly.tt");
    expect(merged.merged.per_field_source.weight).toContain("tabletennis11");
  });

  it("prefers the tier-1 description even when its confidence is lower", () => {
    const tier1 = makeSource("butterfly", 1);
    const tier2 = makeSource("tt11", 2);
    const merged = mergeContributions([
      contribution(tier2, "https://tabletennis11.com/x", {
        specs: {},
        description: "Retailer description.",
        perFieldConfidence: {},
        rawHtmlExcerpt: "",
      }),
      contribution(tier1, "https://en.butterfly.tt/x.html", {
        specs: {},
        description: "Manufacturer description.",
        perFieldConfidence: {},
        rawHtmlExcerpt: "",
      }),
    ]);

    expect(merged.merged.description).toBe("Manufacturer description.");
    expect(merged.merged.per_field_source.description).toContain(
      "butterfly.tt"
    );
  });

  it("falls back to non-tier-1 description when no tier-1 source produced one", () => {
    const tier2 = makeSource("tt11", 2);
    const merged = mergeContributions([
      contribution(tier2, "https://tabletennis11.com/x", {
        specs: { weight: 89 },
        description: "Retailer description.",
        perFieldConfidence: {},
        rawHtmlExcerpt: "",
      }),
    ]);

    expect(merged.merged.description).toBe("Retailer description.");
  });

  it("skips null spec values entirely", () => {
    const tier1 = makeSource("butterfly", 1);
    const merged = mergeContributions([
      contribution(tier1, "https://en.butterfly.tt/x.html", {
        specs: { weight: null, plies_wood: 5 },
        description: null,
        perFieldConfidence: {},
        rawHtmlExcerpt: "",
      }),
    ]);

    expect(merged.merged.specs).toEqual({ plies_wood: 5 });
    expect("weight" in merged.merged.per_field_source).toBe(false);
  });

  it("returns the candidates payload keyed by candidate URL", () => {
    const tier1 = makeSource("butterfly", 1);
    const tier3 = makeSource("revspin", 3);
    const merged = mergeContributions([
      contribution(tier1, "https://en.butterfly.tt/x.html", {
        specs: { weight: 89 },
        description: null,
        perFieldConfidence: {},
        rawHtmlExcerpt: "<a>",
      }),
      contribution(tier3, "https://revspin.net/x.html", {
        specs: {},
        description: null,
        perFieldConfidence: {},
        rawHtmlExcerpt: "<b>",
      }),
    ]);

    expect(Object.keys(merged.candidates).sort()).toEqual([
      "https://en.butterfly.tt/x.html",
      "https://revspin.net/x.html",
    ]);
    expect(merged.candidates["https://en.butterfly.tt/x.html"].source_id).toBe(
      "butterfly"
    );
    expect(merged.candidates["https://revspin.net/x.html"].source_tier).toBe(3);
  });

  it("counts mergedFieldCount as fields + 1 if a description landed", () => {
    const tier1 = makeSource("butterfly", 1);
    const merged = mergeContributions([
      contribution(tier1, "https://x", {
        specs: { weight: 89, plies_wood: 5 },
        description: "blurb",
        perFieldConfidence: {},
        rawHtmlExcerpt: "",
      }),
    ]);
    expect(merged.mergedFieldCount).toBe(3);
  });

  it("reports zero mergedFieldCount when extractor returned empty payload", () => {
    const tier1 = makeSource("butterfly", 1);
    const merged = mergeContributions([
      contribution(tier1, "https://x", {
        specs: {},
        description: null,
        perFieldConfidence: {},
        rawHtmlExcerpt: "",
      }),
    ]);
    expect(merged.mergedFieldCount).toBe(0);
  });
});

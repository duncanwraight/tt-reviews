import { describe, expect, it } from "vitest";

import { prefilter } from "../disambiguate";
import type { SpecCandidate } from "../sources/types";

const VISCARIA_CANDIDATES: SpecCandidate[] = [
  { url: "https://en.butterfly.tt/viscaria.html", title: "Viscaria" },
  {
    url: "https://en.butterfly.tt/viscaria-super-alc.html",
    title: "Viscaria Super ALC",
  },
  {
    url: "https://en.butterfly.tt/innerforce-layer-zlc.html",
    title: "Innerforce Layer ZLC",
  },
  {
    url: "https://en.butterfly.tt/fan-zhendong-alc.html",
    title: "Fan Zhendong ALC",
  },
  {
    url: "https://en.butterfly.tt/btybundle5.html",
    title: "Recommended Bundle 5",
  },
];

describe("prefilter", () => {
  it("keeps the canonical match when the seed is plain Viscaria", () => {
    const survivors = prefilter(VISCARIA_CANDIDATES, {
      brand: "Butterfly",
      name: "Viscaria",
    });
    expect(survivors).toHaveLength(1);
    expect(survivors[0].url).toBe("https://en.butterfly.tt/viscaria.html");
  });

  it("rejects Viscaria Super ALC when the seed is plain Viscaria", () => {
    const survivors = prefilter(VISCARIA_CANDIDATES, {
      brand: "Butterfly",
      name: "Viscaria",
    });
    expect(survivors.map(s => s.url)).not.toContain(
      "https://en.butterfly.tt/viscaria-super-alc.html"
    );
  });

  it("keeps brand-prefixed candidate titles (retailer listings)", () => {
    // TT11 returns "Stiga Cybershape Carbon" for queries on Cybershape Carbon.
    const candidates: SpecCandidate[] = [
      {
        url: "https://tabletennis11.com/en/stiga-cybershape-carbon",
        title: "Stiga Cybershape Carbon",
      },
    ];
    const survivors = prefilter(candidates, {
      brand: "Stiga",
      name: "Cybershape Carbon",
    });
    expect(survivors).toHaveLength(1);
  });

  it("rejects a candidate that's missing a seed token entirely", () => {
    const candidates: SpecCandidate[] = [
      { url: "https://x/y.html", title: "Tenergy 05" },
    ];
    const survivors = prefilter(candidates, {
      brand: "Butterfly",
      name: "Viscaria",
    });
    expect(survivors).toEqual([]);
  });

  it("rejects a candidate whose URL slug carries an extra qualifier", () => {
    const candidates: SpecCandidate[] = [
      {
        url: "https://en.butterfly.tt/viscaria-limited.html",
        title: "Viscaria",
      },
    ];
    const survivors = prefilter(candidates, {
      brand: "Butterfly",
      name: "Viscaria",
    });
    expect(survivors).toEqual([]);
  });

  it("returns empty when the seed name is empty", () => {
    expect(
      prefilter(VISCARIA_CANDIDATES, { brand: "Butterfly", name: "" })
    ).toEqual([]);
  });

  it("matches case-insensitively", () => {
    const candidates: SpecCandidate[] = [
      { url: "https://en.butterfly.tt/Viscaria.html", title: "VISCARIA" },
    ];
    const survivors = prefilter(candidates, {
      brand: "Butterfly",
      name: "viscaria",
    });
    expect(survivors).toHaveLength(1);
  });
});

import { describe, expect, it } from "vitest";

import {
  COUNTRY_TO_RATING_LABEL,
  getRatingLabel,
  renderCareerBest,
} from "../rating-systems";

describe("getRatingLabel", () => {
  it("returns TTR for the German-speaking trio", () => {
    expect(getRatingLabel("DE")).toBe("TTR");
    expect(getRatingLabel("AT")).toBe("TTR");
    expect(getRatingLabel("CH")).toBe("TTR");
  });

  it("returns Points for FR", () => {
    expect(getRatingLabel("FR")).toBe("Points");
  });

  it("returns Ranking for GB and the Nordics", () => {
    for (const code of ["GB", "SE", "NO", "DK", "FI"]) {
      expect(getRatingLabel(code)).toBe("Ranking");
    }
  });

  it("returns USATT for US and CA", () => {
    expect(getRatingLabel("US")).toBe("USATT");
    expect(getRatingLabel("CA")).toBe("USATT");
  });

  it("returns the per-federation acronym for the East-Asian trio", () => {
    expect(getRatingLabel("JP")).toBe("JTTA");
    expect(getRatingLabel("KR")).toBe("KTTA");
    expect(getRatingLabel("CN")).toBe("CTTA");
  });

  it("returns descriptive suffixes for IN and AU", () => {
    expect(getRatingLabel("IN")).toBe("TTFI rating");
    expect(getRatingLabel("AU")).toBe("TTA rating");
  });

  it("falls back to 'Rating' for unmapped countries", () => {
    expect(getRatingLabel("BR")).toBe("Rating");
    expect(getRatingLabel("XX")).toBe("Rating");
    expect(getRatingLabel(null)).toBe("Rating");
    expect(getRatingLabel(undefined)).toBe("Rating");
    expect(getRatingLabel("")).toBe("Rating");
  });

  it("accepts ISO-3 codes (the format players.represents uses)", () => {
    expect(getRatingLabel("GER")).toBe("TTR");
    expect(getRatingLabel("DEU")).toBe("TTR");
    expect(getRatingLabel("JPN")).toBe("JTTA");
    expect(getRatingLabel("USA")).toBe("USATT");
    expect(getRatingLabel("CHN")).toBe("CTTA");
    expect(getRatingLabel("GBR")).toBe("Ranking");
  });

  it("is case-insensitive", () => {
    expect(getRatingLabel("de")).toBe("TTR");
    expect(getRatingLabel("Ger")).toBe("TTR");
  });

  it("exposes all 12 mapped countries in the constant", () => {
    // Belt-and-braces: a future PR that drops one of the locked-in 12
    // countries from the map would silently regress the per-country
    // tests above. This assertion catches that.
    const codes = Object.keys(COUNTRY_TO_RATING_LABEL).sort();
    expect(codes).toEqual(
      [
        "AT",
        "AU",
        "CA",
        "CH",
        "CN",
        "DE",
        "DK",
        "FI",
        "FR",
        "GB",
        "IN",
        "JP",
        "KR",
        "NO",
        "SE",
        "US",
      ].sort()
    );
  });
});

describe("renderCareerBest", () => {
  it("renders a professional's career-best ranking", () => {
    const result = renderCareerBest({
      player_kind: "professional",
      peak_world_rank: 1,
      peak_rank_year: 2019,
      represents: "CHN",
    });
    expect(result).toEqual({
      label: "Career-best ranking",
      value: "World #1 (2019)",
    });
  });

  it("treats undefined player_kind as professional (default DB column value)", () => {
    const result = renderCareerBest({
      peak_world_rank: 32,
      peak_rank_year: 2022,
    });
    expect(result).toEqual({
      label: "Career-best ranking",
      value: "World #32 (2022)",
    });
  });

  it("renders an amateur's peak rating with country-derived label", () => {
    const result = renderCareerBest({
      player_kind: "amateur",
      peak_rating_value: 2350,
      peak_rating_year: 2023,
      represents: "GER",
    });
    expect(result).toEqual({
      label: "Peak rating",
      value: "2350 TTR (2023)",
    });
  });

  it("uses represents in preference to birth_country", () => {
    const result = renderCareerBest({
      player_kind: "amateur",
      peak_rating_value: 1800,
      peak_rating_year: 2024,
      represents: "FRA",
      birth_country: "GER",
    });
    expect(result?.value).toBe("1800 Points (2024)");
  });

  it("falls back to birth_country when represents is missing", () => {
    const result = renderCareerBest({
      player_kind: "amateur",
      peak_rating_value: 1750,
      peak_rating_year: 2024,
      birth_country: "USA",
    });
    expect(result?.value).toBe("1750 USATT (2024)");
  });

  it("uses the 'Rating' fallback when amateur country is unmapped", () => {
    const result = renderCareerBest({
      player_kind: "amateur",
      peak_rating_value: 1500,
      peak_rating_year: 2024,
      represents: "BRA",
    });
    expect(result?.value).toBe("1500 Rating (2024)");
  });

  it("renders FR as plain 'Points' — top-1000 N-prefix nuance is out of scope", () => {
    const result = renderCareerBest({
      player_kind: "amateur",
      peak_rating_value: 2200,
      peak_rating_year: 2023,
      represents: "FRA",
    });
    expect(result?.value).toBe("2200 Points (2023)");
  });

  it("returns null when a pro is missing peak data", () => {
    expect(
      renderCareerBest({ player_kind: "professional", peak_rank_year: 2020 })
    ).toBeNull();
    expect(
      renderCareerBest({ player_kind: "professional", peak_world_rank: 5 })
    ).toBeNull();
    expect(renderCareerBest({ player_kind: "professional" })).toBeNull();
  });

  it("returns null when an amateur is missing peak data", () => {
    expect(
      renderCareerBest({
        player_kind: "amateur",
        peak_rating_year: 2024,
        represents: "DE",
      })
    ).toBeNull();
    expect(
      renderCareerBest({
        player_kind: "amateur",
        peak_rating_value: 2000,
        represents: "DE",
      })
    ).toBeNull();
    expect(renderCareerBest({ player_kind: "amateur" })).toBeNull();
  });
});

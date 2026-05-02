import { describe, it, expect } from "vitest";
import { getSiteUrl, buildCanonicalUrl } from "../seo";

describe("getSiteUrl", () => {
  it("reads siteUrl from the root match", () => {
    const matches = [
      { id: "root", data: { siteUrl: "https://preview-123.example.com" } },
      { id: "routes/equipment.$slug", data: { equipment: { slug: "x" } } },
    ];
    expect(getSiteUrl(matches)).toBe("https://preview-123.example.com");
  });

  it("falls back to the production host when root is missing", () => {
    expect(getSiteUrl([])).toBe("https://tabletennis.reviews");
  });

  it("falls back when root data is undefined (error boundary)", () => {
    expect(getSiteUrl([{ id: "root" }])).toBe("https://tabletennis.reviews");
  });
});

describe("buildCanonicalUrl", () => {
  const SITE = "https://tabletennis.reviews";

  it("returns siteUrl + pathname when allowList is empty", () => {
    expect(buildCanonicalUrl(SITE, "/equipment/tenergy-05", "?a=1", [])).toBe(
      "https://tabletennis.reviews/equipment/tenergy-05"
    );
  });

  it("keeps only allow-listed params", () => {
    expect(
      buildCanonicalUrl(
        SITE,
        "/equipment",
        "?category=rubber&utm_source=google&random=junk",
        ["category", "subcategory"]
      )
    ).toBe("https://tabletennis.reviews/equipment?category=rubber");
  });

  it("emits params in allowList order, not querystring order", () => {
    expect(
      buildCanonicalUrl(
        SITE,
        "/equipment",
        "?manufacturer=Butterfly&category=rubber",
        ["category", "manufacturer"]
      )
    ).toBe(
      "https://tabletennis.reviews/equipment?category=rubber&manufacturer=Butterfly"
    );
  });

  it("drops empty-string values", () => {
    expect(
      buildCanonicalUrl(SITE, "/equipment", "?category=&manufacturer=DHS", [
        "category",
        "manufacturer",
      ])
    ).toBe("https://tabletennis.reviews/equipment?manufacturer=DHS");
  });

  it("returns bare path when no allow-listed params are set", () => {
    expect(
      buildCanonicalUrl(SITE, "/equipment", "?utm_source=google&fbclid=abc", [
        "category",
        "manufacturer",
      ])
    ).toBe("https://tabletennis.reviews/equipment");
  });
});

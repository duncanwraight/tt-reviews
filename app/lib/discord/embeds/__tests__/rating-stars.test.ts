import { describe, expect, it } from "vitest";
import { renderRatingStars } from "../rating-stars";

describe("renderRatingStars", () => {
  it("converts the /10 DB scale to /5 stars and includes count", () => {
    // 8.4/10 → 4.2/5 → 4 full + 0 half + 1 empty
    expect(renderRatingStars(8.4, 37)).toBe("★★★★☆ 4.2 (37 reviews)");
  });

  it("renders a half-star at the 0.5 boundary (matches RatingStars.tsx:22)", () => {
    // 9.0/10 → 4.5/5 → 4 full + half + 0 empty
    expect(renderRatingStars(9.0, 12)).toBe("★★★★⯨ 4.5 (12 reviews)");
  });

  it("does not render a half-star below the 0.5 boundary", () => {
    // 8.8/10 → 4.4/5 → 4 full + 0 half + 1 empty
    expect(renderRatingStars(8.8, 5)).toBe("★★★★☆ 4.4 (5 reviews)");
  });

  it("uses singular 'review' for count of 1", () => {
    expect(renderRatingStars(7.0, 1)).toBe("★★★⯨☆ 3.5 (1 review)");
  });

  it("returns null when count is 0 (caller omits field entirely)", () => {
    // Single-character check is enough: only one valid 'no reviews'
    // contract — null. Anything else and the equipment renderer would
    // need to special-case the field, which we explicitly avoid.
    expect(renderRatingStars(0, 0)).toBeNull();
    expect(renderRatingStars(8.0, 0)).toBeNull();
  });

  it("returns null when count is negative (defensive)", () => {
    expect(renderRatingStars(8.0, -1)).toBeNull();
  });

  it("clamps ratings above the 1.0–10.0 storage range", () => {
    // Defensive — DB constraint should prevent this, but the renderer
    // shouldn't blow up if it ever reaches it.
    const result = renderRatingStars(15, 1);
    expect(result).toMatch(/^★★★★★ 5\.0 /);
  });

  it("clamps negative ratings at 0", () => {
    const result = renderRatingStars(-1, 1);
    expect(result).toBe("☆☆☆☆☆ 0.0 (1 review)");
  });
});

// Half-star sanity: above runs exercise 0.5 vs 0.4 boundaries directly,
// but make the half-character contract explicit so a future refactor
// of the glyph (e.g. swapping ⯨ for ½) is caught.
describe("renderRatingStars — half-star glyph contract", () => {
  it("uses ⯨ (U+2BE8 STAR WITH LEFT HALF BLACK) for half-stars", () => {
    expect(renderRatingStars(9.0, 1)).toContain("⯨");
  });

  it("never includes a half glyph when the fractional value is <0.5", () => {
    expect(renderRatingStars(8.8, 1)).not.toContain("⯨");
    expect(renderRatingStars(2.0, 1)).not.toContain("⯨");
  });
});

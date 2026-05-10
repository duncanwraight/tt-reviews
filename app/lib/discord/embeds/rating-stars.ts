// TT-158: pure rating-display string builder for Discord embeds.
//
// Mirrors the visual convention used by app/components/ui/RatingStars.tsx
// (5-star scale, half-star at the 0.5 boundary). The DB stores reviews
// on a 0-10 scale (`equipment_reviews.overall_rating` constrained
// 1.0–10.0); converting to the 5-star value here keeps the embed
// numerically consistent with the equipment page even though Discord
// doesn't render coloured stars.
//
// Returns null when there are no reviews — the caller omits the field
// entirely rather than rendering "★★★★★ 0.0 (0 reviews)" or similar.

const FULL = "★";
// U+2BE8 STAR WITH LEFT HALF BLACK. Renders cleanly on desktop / web /
// modern mobile Discord clients; if a future client misses the glyph
// it'll show a tofu box and we'll switch to "½".
const HALF = "⯨";
const EMPTY = "☆";

export function renderRatingStars(
  rating10: number,
  count: number
): string | null {
  if (count <= 0) return null;

  // Clamp to the storage range and convert /10 → /5.
  const r5 = Math.max(0, Math.min(5, rating10 / 2));
  const fullStars = Math.floor(r5);
  const hasHalf = r5 % 1 >= 0.5;
  const emptyStars = Math.max(0, 5 - fullStars - (hasHalf ? 1 : 0));

  const stars =
    FULL.repeat(fullStars) + (hasHalf ? HALF : "") + EMPTY.repeat(emptyStars);
  const reviewWord = count === 1 ? "review" : "reviews";
  return `${stars} ${r5.toFixed(1)} (${count} ${reviewWord})`;
}

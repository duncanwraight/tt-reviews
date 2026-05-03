// Disambiguation pre-filter (TT-147). Cheap string-match step that
// runs before any LLM disambiguation call. Drops candidates whose
// title/url-slug carries qualifying tokens that the seed equipment
// doesn't (e.g. `viscaria-super-alc.html` when the seed is plain
// `Viscaria`). The brief locks the rule:
//
//   - Every seed-name token must appear in the candidate.
//   - The candidate may carry brand tokens (the seed's brand) for free.
//   - Any other extra token disqualifies the candidate.
//
// Brand tokens are free because retailer listings often prefix the
// brand to the model — e.g. TT11 returns "Stiga Cybershape Carbon"
// even when only "Cybershape Carbon" was queried. Tier-1 manufacturer
// pages are usually un-prefixed.

import type { EquipmentRef, SpecCandidate } from "./sources/types";

function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

// Final-segment-only URL token extractor. Avoids picking up path
// noise like `/en/` (TT11) or `.html` (Butterfly) as tokens.
function urlSlugTokens(url: string): string[] {
  let pathname: string;
  try {
    pathname = new URL(url).pathname;
  } catch {
    return [];
  }
  const slug = pathname.split("/").filter(Boolean).pop() ?? "";
  return tokenize(slug.replace(/\.html?$/i, ""));
}

export function prefilter(
  candidates: SpecCandidate[],
  equipment: EquipmentRef
): SpecCandidate[] {
  const seedTokens = new Set(tokenize(equipment.name));
  if (seedTokens.size === 0) return [];
  const brandTokens = new Set(tokenize(equipment.brand));

  return candidates.filter(c => {
    const candidateTokens = new Set([
      ...tokenize(c.title),
      ...urlSlugTokens(c.url),
    ]);
    for (const t of seedTokens) {
      if (!candidateTokens.has(t)) return false;
    }
    for (const t of candidateTokens) {
      if (seedTokens.has(t) || brandTokens.has(t)) continue;
      return false;
    }
    return true;
  });
}

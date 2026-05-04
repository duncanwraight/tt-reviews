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

export interface PrefilterDecision {
  candidate: SpecCandidate;
  kept: boolean;
  // Set when the candidate was dropped for missing seed tokens. Empty
  // on a kept candidate.
  missingTokens: string[];
  // Set when the candidate was dropped for carrying tokens not in the
  // seed name and not in the brand free-list. Empty on a kept
  // candidate.
  extraTokens: string[];
}

export interface PrefilterResult {
  seedTokens: string[];
  brandTokens: string[];
  decisions: PrefilterDecision[];
}

// Per-candidate prefilter pass. Surfaces the seed/brand token sets
// and the per-candidate verdict + reasons so the run log (TT-162) can
// show *why* each candidate was dropped without re-running the logic.
export function prefilterDecisions(
  candidates: SpecCandidate[],
  equipment: EquipmentRef
): PrefilterResult {
  const seedTokens = tokenize(equipment.name);
  const brandTokens = tokenize(equipment.brand);
  const seedSet = new Set(seedTokens);
  const brandSet = new Set(brandTokens);

  if (seedSet.size === 0) {
    return {
      seedTokens,
      brandTokens,
      decisions: candidates.map(candidate => ({
        candidate,
        kept: false,
        missingTokens: [],
        extraTokens: [],
      })),
    };
  }

  const decisions: PrefilterDecision[] = candidates.map(candidate => {
    const candidateTokens = new Set([
      ...tokenize(candidate.title),
      ...urlSlugTokens(candidate.url),
    ]);
    const missingTokens = [...seedSet].filter(t => !candidateTokens.has(t));
    const extraTokens = [...candidateTokens].filter(
      t => !seedSet.has(t) && !brandSet.has(t)
    );
    const kept = missingTokens.length === 0 && extraTokens.length === 0;
    return { candidate, kept, missingTokens, extraTokens };
  });

  return { seedTokens, brandTokens, decisions };
}

export function prefilter(
  candidates: SpecCandidate[],
  equipment: EquipmentRef
): SpecCandidate[] {
  return prefilterDecisions(candidates, equipment)
    .decisions.filter(d => d.kept)
    .map(d => d.candidate);
}

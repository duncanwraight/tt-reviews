// Source registry for the spec-sourcing pipeline (TT-145 / TT-147).
// The worker (TT-149) iterates the registry by `(tier ASC, brand-match
// first)`, calls `search` to find candidate product pages, runs
// `prefilter` from disambiguate.ts to drop obvious mismatches, then
// passes any survivors to `fetch` and the LLM extractor (TT-148).
//
// Adapters split discovery from retrieval intentionally: most sites
// have a cheap search endpoint that returns a list of candidate URLs +
// titles, and a much heavier per-product page that's only worth
// fetching for survivors. Returning ≤5 from `search` keeps the
// disambiguation surface bounded, and `fetch` returns raw HTML so the
// LLM extractor can decide what to pull (specs, description, image
// caption, etc.) without a per-source parser.

export type SourceTier = 1 | 2 | 3;

export type SourceKind = "manufacturer" | "retailer" | "review";

export interface EquipmentRef {
  brand: string;
  name: string;
  slug?: string;
  category?: "blade" | "rubber" | string;
  subcategory?: string | null;
}

export interface SpecCandidate {
  url: string;
  title: string;
  snippet?: string;
}

export interface SpecSource {
  // Stable identifier used for logging and per-field source URL keys
  // on the proposal row. Lowercase, no spaces. Examples: 'butterfly',
  // 'tt11', 'revspin'.
  id: string;
  kind: SourceKind;
  tier: SourceTier;
  // Tier-1 manufacturer adapters set this so the worker can skip them
  // when the equipment isn't from this brand. Empty/undefined = source
  // applies to all brands.
  brand?: string;
  search(equipment: EquipmentRef): Promise<SpecCandidate[]>;
  fetch(candidateUrl: string): Promise<{ html: string; finalUrl: string }>;
}

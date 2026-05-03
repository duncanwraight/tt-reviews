// Spec extractor interface (TT-148). The extractor is the LLM-backed
// half of the spec-sourcing pipeline: it takes raw HTML from a source
// (TT-147) and pulls structured specs + a description.
//
// Two methods because the worker (TT-149) uses them at different
// points in the pipeline:
//
// - `match` runs only when the disambiguation prefilter (TT-147)
//   leaves more than one plausible candidate. Tiny prompt, ~500
//   tokens in / ~50 out.
// - `extract` runs once per surviving candidate. Larger prompt with
//   the cleaned product-page HTML.
//
// Both can fail soft: `match` returns null on schema-invalid response,
// `extract` returns null. Callers treat null as "this source produced
// nothing" and walk to the next source.

import type { EquipmentRef, SpecCandidate } from "../sources/types";

export interface MatchResult {
  matches: boolean;
  // 0..1 — provider-self-reported confidence. Worker uses this to
  // decide between auto-pick vs. queue-for-disambiguation.
  confidence: number;
}

// Specs values are sparse and follow the typed shapes locked in
// archive/EQUIPMENT-SPECS.md (int / float / range / text). The
// extractor is allowed to omit fields it can't read; the worker
// merges across sources.
export type SpecValue = number | string | { min: number; max: number } | null;

export interface ExtractedSpec {
  specs: Record<string, SpecValue>;
  description: string | null;
  // Per-field self-reported confidence in [0,1]. Fields not listed
  // default to 1.0 in the worker's merge step. Sparse — the model
  // only flags fields it's uncertain about.
  perFieldConfidence: Record<string, number>;
  // ~1KB cleaned snippet shown in the admin review UI. Useful when
  // the proposal looks weird and the moderator wants to see the
  // source paragraph the model read.
  rawHtmlExcerpt: string;
}

export interface SpecExtractor {
  // Stable identifier used for budget-counter keys and per-field
  // source attribution. Use lowercase short strings.
  id: string;
  match(
    html: string,
    equipment: EquipmentRef,
    candidate: SpecCandidate
  ): Promise<MatchResult | null>;
  extract(html: string, equipment: EquipmentRef): Promise<ExtractedSpec | null>;
}

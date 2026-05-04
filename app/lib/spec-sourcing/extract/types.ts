// Spec extractor interface (TT-148, expanded for TT-162).
//
// The extractor is the LLM-backed half of the spec-sourcing pipeline:
// it takes raw HTML from a source (TT-147) and pulls structured specs +
// a description.
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
// Both return an Outcome that carries the result (possibly null) AND
// a diagnostics envelope. Per TT-162 we don't tolerate silent
// failures: every code path inside Gemini populates `diagnostics` with
// a failure_reason ("ok" on success), HTTP status, raw model
// response, and validation detail when applicable. The queue consumer
// reads diagnostics into the run log and Logger.errors any fatal
// reason ("auth_failed", "missing_api_key") so it surfaces as a
// Discord alert.

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

// Why an extractor call ended up where it did. "ok" is the success
// case; everything else is a failure mode the queue consumer surfaces
// in the run log. "auth_failed" and "missing_api_key" are the fatal
// subset that triggers a Discord alert.
export type ExtractorFailureReason =
  | "ok"
  | "missing_api_key"
  | "fetch_failed"
  | "http_non_ok"
  | "auth_failed"
  | "empty_response"
  | "parse_failed"
  | "schema_invalid";

export interface ExtractDiagnostics {
  failureReason: ExtractorFailureReason;
  // HTTP status from the provider, set whenever a response was
  // received (success or failure). Absent on pre-fetch errors.
  httpStatus?: number;
  // Total token count reported by the provider on success. Absent
  // when the call didn't reach a usage report (e.g. fetch failed).
  tokens?: number;
  // Up to ~512 chars of the raw text the model returned. Set on
  // every code path that received a response — gives the moderator
  // a window into what the LLM actually produced when validation
  // failed.
  rawResponse?: string;
  // Human-readable specifics on schema_invalid / parse_failed /
  // http_non_ok. Things like "expected specs object", "expected
  // matches:boolean", "Gemini returned 503: service unavailable".
  validationDetail?: string;
}

export interface MatchOutcome {
  result: MatchResult | null;
  diagnostics: ExtractDiagnostics;
}

export interface ExtractOutcome {
  result: ExtractedSpec | null;
  diagnostics: ExtractDiagnostics;
}

export interface SpecExtractor {
  // Stable identifier used for budget-counter keys and per-field
  // source attribution. Use lowercase short strings.
  id: string;
  match(
    html: string,
    equipment: EquipmentRef,
    candidate: SpecCandidate
  ): Promise<MatchOutcome>;
  extract(html: string, equipment: EquipmentRef): Promise<ExtractOutcome>;
}

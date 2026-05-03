// Per-field merge for the spec-sourcing pipeline (TT-149).
//
// A queue consumer collects ExtractedSpec results from one or more
// sources (TT-147 + TT-148). The merger boils them down to a single
// proposal row whose `merged` blob carries:
//   - specs: per-field winner across sources
//   - description: tier-1 preferred, otherwise highest-confidence
//   - per_field_source: { field_name: url-of-winning-source }
//
// Selection rule per field:
//   1. Skip null values entirely (no signal).
//   2. Among non-null values, pick the one with the highest reported
//      confidence. perFieldConfidence on ExtractedSpec is sparse —
//      missing entries default to 1.0.
//   3. Ties go to the lowest-tier (i.e. most authoritative) source.
//
// Description rule:
//   - Tier 1 source wins outright if it produced one.
//   - Otherwise highest-confidence wins; ties go to lowest tier.
//
// `candidates` JSONB on the proposal row keeps the raw per-source
// payload for the admin diff view (TT-150). Each candidate URL keys
// into its extraction so the moderator can see exactly which source
// claimed which value.

import type { SpecValue } from "../spec-sourcing/extract/types";
import type { ExtractedSpec } from "./extract/types";
import type { SpecSource } from "./sources/types";

const DEFAULT_FIELD_CONFIDENCE = 1.0;

export interface SourceContribution {
  source: SpecSource;
  candidateUrl: string;
  finalUrl: string;
  extracted: ExtractedSpec;
  fetchedAt: string;
}

export interface MergedSpec {
  specs: Record<string, SpecValue>;
  description: string | null;
  per_field_source: Record<string, string>;
}

// Shape that lands in equipment_spec_proposals.candidates JSONB.
export interface CandidatesPayload {
  [sourceUrl: string]: {
    source_id: string;
    source_tier: number;
    final_url: string;
    fetched_at: string;
    specs: Record<string, SpecValue>;
    description: string | null;
    per_field_confidence: Record<string, number>;
    raw_html_excerpt: string;
  };
}

function fieldConfidence(extracted: ExtractedSpec, field: string): number {
  const explicit = extracted.perFieldConfidence[field];
  return typeof explicit === "number" ? explicit : DEFAULT_FIELD_CONFIDENCE;
}

// True when `a` should be preferred over `b` for a given field.
function preferA(
  aConf: number,
  aTier: number,
  bConf: number,
  bTier: number
): boolean {
  if (aConf !== bConf) return aConf > bConf;
  return aTier < bTier;
}

export function mergeContributions(contributions: SourceContribution[]): {
  merged: MergedSpec;
  candidates: CandidatesPayload;
  mergedFieldCount: number;
} {
  const specs: Record<string, SpecValue> = {};
  const perFieldSource: Record<string, string> = {};
  // Track winning (confidence, tier) per field so we know whether to
  // overwrite when a later contribution arrives.
  const fieldWinner: Record<string, { conf: number; tier: number }> = {};

  let descriptionWinner: {
    text: string;
    tier: number;
    conf: number;
    sourceUrl: string;
  } | null = null;

  for (const c of contributions) {
    const tier = c.source.tier;
    for (const [field, value] of Object.entries(c.extracted.specs)) {
      if (value === null) continue;
      const conf = fieldConfidence(c.extracted, field);
      const incumbent = fieldWinner[field];
      if (!incumbent || preferA(conf, tier, incumbent.conf, incumbent.tier)) {
        specs[field] = value;
        fieldWinner[field] = { conf, tier };
        perFieldSource[field] = c.candidateUrl;
      }
    }
    const desc = c.extracted.description;
    if (desc) {
      // Description prefers tier 1 outright; otherwise highest conf.
      // Use a sentinel "tier 1 trump" by treating any tier-1 description
      // as confidence 2.0 internally, so it wins ties.
      const descConf = tier === 1 ? 2.0 : 1.0;
      if (
        !descriptionWinner ||
        preferA(descConf, tier, descriptionWinner.conf, descriptionWinner.tier)
      ) {
        descriptionWinner = {
          text: desc,
          tier,
          conf: descConf,
          sourceUrl: c.candidateUrl,
        };
      }
    }
  }

  const description = descriptionWinner ? descriptionWinner.text : null;
  if (descriptionWinner) {
    perFieldSource.description = descriptionWinner.sourceUrl;
  }

  const candidates: CandidatesPayload = {};
  for (const c of contributions) {
    candidates[c.candidateUrl] = {
      source_id: c.source.id,
      source_tier: c.source.tier,
      final_url: c.finalUrl,
      fetched_at: c.fetchedAt,
      specs: c.extracted.specs,
      description: c.extracted.description,
      per_field_confidence: c.extracted.perFieldConfidence,
      raw_html_excerpt: c.extracted.rawHtmlExcerpt,
    };
  }

  return {
    merged: { specs, description, per_field_source: perFieldSource },
    candidates,
    mergedFieldCount: Object.keys(specs).length + (description ? 1 : 0),
  };
}

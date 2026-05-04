// Append-only diagnostic log for one spec-sourcing run (TT-162).
// Persisted on equipment_spec_proposals.run_log so the admin Review
// page can show why the pipeline made the choices it made — which
// sources were considered, which were skipped for brand mismatch,
// search counts, prefilter decisions, LLM match verdicts, fetch
// outcomes, extract results, merge summary, terminal outcome.
//
// One RunLog per processOneSpecMessage call. Replaced (not appended)
// when the next cron tick re-scans the equipment row.
//
// Transient halts (rate_limited / out_of_budget) re-queue without
// persisting the proposal, so their logs are intentionally discarded
// — the next attempt logs fresh. The log records the transient cause
// up to the point of the halt for any tail consumer (e.g. unit tests
// asserting the short-circuit was logged).

import type { SpecCandidate } from "./sources/types";

interface BaseEntry {
  // ISO timestamp of when the entry was appended. Test seam via the
  // `now` constructor option.
  at: string;
}

export type RunLogEntry =
  | (BaseEntry & {
      step: "source_skipped_brand";
      source_id: string;
      source_brand: string;
      equipment_brand: string;
    })
  | (BaseEntry & {
      step: "source_started";
      source_id: string;
      source_tier: number;
      source_kind: string;
    })
  | (BaseEntry & {
      step: "search";
      source_id: string;
      // The URL the adapter actually hit. Populated when the source
      // exposes a searchUrl() helper; absent for sources that don't
      // have a per-equipment query URL (e.g. revspin's cached list).
      query_url?: string;
      status: "ok" | "failed";
      count?: number;
      candidates?: Array<{ url: string; title: string }>;
      error?: string;
    })
  | (BaseEntry & {
      step: "prefilter";
      source_id: string;
      // Tokens the prefilter required (from equipment.name) and tokens
      // it accepts for free (from equipment.brand). Persisted so you
      // can see exactly what tokenisation produced the kept/dropped
      // verdict — most "why did this candidate get dropped?" questions
      // resolve at this layer.
      seed_tokens: string[];
      brand_tokens: string[];
      kept: Array<{ url: string; title: string }>;
      dropped: Array<{
        url: string;
        title: string;
        missing_tokens: string[];
        extra_tokens: string[];
      }>;
    })
  | (BaseEntry & {
      step: "match";
      source_id: string;
      candidate_url: string;
      status: "ok" | "transient";
      reason?: "rate_limited" | "out_of_budget";
      matches?: boolean;
      confidence?: number;
      result_null?: boolean;
      // Up to ~512 chars of the raw HTML the LLM was given for this
      // disambiguation probe. Useful when match() returned false to
      // see what Gemini was looking at.
      probe_excerpt?: string;
      // LLM-side diagnostics from the inner extractor (TT-162).
      // failure_reason: "ok" on success; otherwise one of
      // missing_api_key / fetch_failed / http_non_ok / auth_failed /
      // empty_response / parse_failed / schema_invalid. raw_response
      // and validation_detail explain *why* a non-ok call failed.
      failure_reason?: string;
      validation_detail?: string;
      raw_response?: string;
      tokens?: number;
      http_status?: number;
    })
  | (BaseEntry & {
      step: "match_summary";
      source_id: string;
      survivors_attempted: number;
      winner_url: string | null;
    })
  | (BaseEntry & {
      step: "fetch";
      source_id: string;
      candidate_url: string;
      status: "ok" | "failed";
      final_url?: string;
      // Length of the raw HTML body. Zero-byte responses and tiny
      // bodies are diagnostic of upstream blocks (Cloudflare bot
      // protection, expired cookies, etc.).
      html_length?: number;
      error?: string;
    })
  | (BaseEntry & {
      step: "extract";
      source_id: string;
      candidate_url: string;
      status: "ok" | "transient" | "null_result";
      reason?: "rate_limited" | "out_of_budget";
      fields_count?: number;
      has_description?: boolean;
      uncertain_fields?: string[];
      // Up to ~1024 chars of the raw HTML body the LLM was given.
      // Persisted on null_result and ok statuses so you can correlate
      // "Gemini saw THIS and returned null" against the source page.
      // Skipped on transient — the LLM was never called.
      excerpt?: string;
      // LLM-side diagnostics from the inner extractor (TT-162). Same
      // shape as on the match step. failure_reason is the discriminator
      // — when this is "schema_invalid" or "parse_failed", the model
      // returned something but we couldn't accept it; raw_response is
      // what to look at to debug.
      failure_reason?: string;
      validation_detail?: string;
      raw_response?: string;
      tokens?: number;
      http_status?: number;
    })
  | (BaseEntry & {
      step: "contribution";
      source_id: string;
      candidate_url: string;
      fields: string[];
      description: boolean;
    })
  | (BaseEntry & {
      step: "source_done";
      source_id: string;
      reason:
        | "no_candidates"
        | "prefilter_empty"
        | "no_match"
        | "extract_null"
        | "fetch_failed"
        | "contributed";
    })
  | (BaseEntry & {
      step: "merge";
      merged_field_count: number;
      per_field_winners: Record<string, string>;
      description_source_id: string | null;
    })
  | (BaseEntry & {
      step: "outcome";
      status: "proposed" | "no-results" | "transient" | "error";
      merged_field_count?: number;
      reason?: string;
    });

export interface RunLogOptions {
  now?: () => Date;
}

// Distributive Omit so the record() argument keeps its discriminated-
// union shape — `Omit<RunLogEntry, "at">` would collapse to a single
// shape and reject branch-specific fields like `source_id`.
type RunLogEntryInput = RunLogEntry extends infer U
  ? U extends RunLogEntry
    ? Omit<U, "at">
    : never
  : never;

export class RunLog {
  private entries: RunLogEntry[] = [];
  private readonly now: () => Date;

  constructor(opts: RunLogOptions = {}) {
    this.now = opts.now ?? (() => new Date());
  }

  record(entry: RunLogEntryInput): void {
    this.entries.push({
      ...entry,
      at: this.now().toISOString(),
    } as RunLogEntry);
  }

  toJSON(): RunLogEntry[] {
    return [...this.entries];
  }
}

// Helper for the queue consumer: shrinks a raw SpecCandidate to the
// shape the run log persists. Keeps URL + title; drops snippet (the
// Gemini-prefilter snippet is too long for the diagnostic view).
export function candidateForLog(c: SpecCandidate): {
  url: string;
  title: string;
} {
  return { url: c.url, title: c.title };
}

// Truncate raw HTML body to a length suitable for storing on the
// proposal row. Strips trailing whitespace and adds an ellipsis when
// truncated so the renderer can show "(N chars truncated)".
export function truncateExcerpt(raw: string, max: number): string {
  if (raw.length <= max) return raw;
  return raw.slice(0, max).trimEnd() + "…";
}

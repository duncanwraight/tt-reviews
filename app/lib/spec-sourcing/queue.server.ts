// Spec-sourcing queue consumer (TT-149). One message per equipment
// row picked by the cron (TT-149's scheduler.server.ts). Pure
// function so unit tests can drive it without spinning up
// Miniflare's queue runtime — same shape as
// app/lib/photo-sourcing/queue.server.ts.
//
// Pipeline for one message:
//   1. Walk sources in (tier ASC, brand-match first) order.
//   2. For each source: search → prefilter to drop obvious mismatches.
//   3. If prefilter leaves >1 candidate, run extractor.match() on each
//      to pick one. Stop at the first match.
//   4. fetch() the picked candidate's HTML and run extractor.extract().
//   5. If non-null, stash as a contribution.
//   6. If any LLM call returns rate_limited / out_of_budget, abandon
//      the whole message with a 'transient' outcome — the queue
//      consumer in workers/app.ts re-queues with backoff.
//   7. After all sources walked: merge contributions.
//   8. >0 fields merged → upsert pending_review proposal + stamp
//      equipment.specs_source_status='pending_review'.
//   9. 0 fields → upsert no_results proposal + stamp specs_source_status='no_results'.
//
// Outcomes the worker maps to ack vs retry:
//   * proposed     → ack (terminal success)
//   * no-results   → ack (genuinely nothing — cooldown stamp prevents re-pick)
//   * transient    → re-queue with exponential backoff
//   * error        → propagate; CF DLQs after max_retries
//
// Diagnostic run log (TT-162): every decision the consumer makes here
// — source ordering, brand skip, search outcome, prefilter verdict
// per candidate, match call, fetch, extract, contribution, merge,
// terminal — is appended to a RunLog and persisted on the proposal
// row's run_log JSONB. The admin Review page reads that to explain
// what happened. Transient halts re-queue without persisting; the
// next attempt logs from scratch.

import type { SupabaseClient } from "@supabase/supabase-js";

import { Logger, type LogContext } from "../logger.server";
import type { BudgetedSpecExtractor } from "./extract/budget";
import type { ExtractDiagnostics, ExtractedSpec } from "./extract/types";
import {
  mergeContributions,
  type CandidatesPayload,
  type MergedSpec,
  type SourceContribution,
} from "./merge";
import type { EquipmentRef, SpecCandidate, SpecSource } from "./sources/types";
import { prefilterDecisions } from "./disambiguate";
import {
  RunLog,
  candidateForLog,
  truncateExcerpt,
  type RunLogEntry,
} from "./run-log";
import type { ProcessOutcome, SpecSourceMessage } from "./types";

const MAX_FETCHES_PER_SOURCE = 3;
const MATCH_PROBE_EXCERPT_CHARS = 512;
const EXTRACT_EXCERPT_CHARS = 1024;

// Failure reasons that mean the pipeline is fundamentally broken and
// a human must act — fires Logger.error which Discord-alerts via the
// installed alerter (workers/app.ts -> installAlerter). Per-page
// validation glitches (parse_failed, schema_invalid, empty_response)
// are noisy and not actionable per occurrence; they show up in the
// run log but don't escalate.
const FATAL_LLM_FAILURE_REASONS = new Set(["auth_failed", "missing_api_key"]);

function llmDiagFields(diag: ExtractDiagnostics | undefined): Partial<{
  failure_reason: string;
  validation_detail: string;
  raw_response: string;
  tokens: number;
  http_status: number;
}> {
  if (!diag) return {};
  const out: Record<string, unknown> = {};
  if (diag.failureReason) out.failure_reason = diag.failureReason;
  if (diag.validationDetail) out.validation_detail = diag.validationDetail;
  if (diag.rawResponse) out.raw_response = diag.rawResponse;
  if (typeof diag.tokens === "number") out.tokens = diag.tokens;
  if (typeof diag.httpStatus === "number") out.http_status = diag.httpStatus;
  return out as ReturnType<typeof llmDiagFields>;
}

function maybeAlertLlmFatal(
  diag: ExtractDiagnostics | undefined,
  ctxLog: LogContext,
  source_id: string,
  call: "match" | "extract"
): void {
  if (!diag) return;
  if (!FATAL_LLM_FAILURE_REASONS.has(diag.failureReason)) return;
  // Stable message tag for Discord-alerter dedup (5-min window). One
  // alert per (failure_reason × call kind) per isolate per window.
  Logger.error(
    `spec-sourcing.llm.${diag.failureReason}.${call}`,
    ctxLog,
    new Error(
      `LLM ${call} call failed fatally: ${diag.failureReason}` +
        (diag.validationDetail ? ` — ${diag.validationDetail}` : "") +
        ` (source=${source_id})`
    )
  );
}

export interface ProcessSpecDeps {
  // Test seam — defaults to wall-clock UTC ISO. Used as the fetched_at
  // timestamp on each candidate, the equipment.specs_sourced_at
  // value, and the run-log entry timestamps so unit tests can pin
  // exact strings.
  now?: () => Date;
}

function equipmentRefFromMessage(msg: SpecSourceMessage): EquipmentRef {
  return {
    brand: msg.brand,
    name: msg.name,
    slug: msg.slug,
    category: msg.category ?? undefined,
    subcategory: msg.subcategory,
  };
}

// Order sources for one equipment row: tier ascending, with
// brand-restricted manufacturer adapters first within their tier when
// they match the equipment's brand. Non-matching brand-restricted
// sources are filtered out entirely (no point search-ing Butterfly's
// catalog for a Stiga blade).
export function orderSourcesForEquipment(
  sources: SpecSource[],
  brand: string
): SpecSource[] {
  const matchingBrand = (s: SpecSource) =>
    !s.brand || s.brand.toLowerCase() === brand.toLowerCase();
  const usable = sources.filter(matchingBrand);
  // Stable sort by (tier, brand-bound first).
  return [...usable].sort((a, b) => {
    if (a.tier !== b.tier) return a.tier - b.tier;
    const aBrand = a.brand ? 0 : 1;
    const bBrand = b.brand ? 0 : 1;
    return aBrand - bBrand;
  });
}

// Same as orderSourcesForEquipment, but reports which brand-bound
// sources were skipped so the caller (the queue consumer) can record
// the skip in the run log. Walks `sources` once and returns both
// lists.
function orderSourcesWithSkipped(
  sources: SpecSource[],
  brand: string
): {
  ordered: SpecSource[];
  skipped: Array<{ id: string; brand: string }>;
} {
  const skipped: Array<{ id: string; brand: string }> = [];
  const usable: SpecSource[] = [];
  for (const s of sources) {
    if (s.brand && s.brand.toLowerCase() !== brand.toLowerCase()) {
      skipped.push({ id: s.id, brand: s.brand });
      continue;
    }
    usable.push(s);
  }
  const ordered = [...usable].sort((a, b) => {
    if (a.tier !== b.tier) return a.tier - b.tier;
    const aBrand = a.brand ? 0 : 1;
    const bBrand = b.brand ? 0 : 1;
    return aBrand - bBrand;
  });
  return { ordered, skipped };
}

// Disambiguate via the LLM when prefilter leaves >1 candidate. Returns
// the first candidate whose match() reports matches=true, or null if
// none. Surfaces 'transient' status from the budget wrapper so the
// caller can short-circuit the whole pipeline.
async function pickCandidateViaMatch(
  source: SpecSource,
  extractor: BudgetedSpecExtractor,
  candidates: SpecCandidate[],
  equipment: EquipmentRef,
  log: RunLog,
  ctxLog: LogContext
): Promise<
  | { status: "ok"; candidate: SpecCandidate | null; attempted: number }
  | { status: "transient"; reason: "rate_limited" | "out_of_budget" }
> {
  if (candidates.length <= 1) {
    return {
      status: "ok",
      candidate: candidates[0] ?? null,
      attempted: candidates.length,
    };
  }
  let attempted = 0;
  for (const c of candidates.slice(0, MAX_FETCHES_PER_SOURCE)) {
    attempted++;
    const probeFetch = await source.fetch(c.url).catch(() => null);
    if (!probeFetch) {
      log.record({
        step: "fetch",
        source_id: source.id,
        candidate_url: c.url,
        status: "failed",
        error: "match probe fetch threw",
      });
      continue;
    }
    log.record({
      step: "fetch",
      source_id: source.id,
      candidate_url: c.url,
      status: "ok",
      final_url: probeFetch.finalUrl,
      html_length: probeFetch.html.length,
    });
    const env = await extractor.match(probeFetch.html, equipment, c);
    if (env.status !== "ok") {
      log.record({
        step: "match",
        source_id: source.id,
        candidate_url: c.url,
        status: "transient",
        reason: env.status,
      });
      return { status: "transient", reason: env.status };
    }
    maybeAlertLlmFatal(env.diagnostics, ctxLog, source.id, "match");
    log.record({
      step: "match",
      source_id: source.id,
      candidate_url: c.url,
      status: "ok",
      matches: env.result?.matches,
      confidence: env.result?.confidence,
      result_null: env.result == null,
      probe_excerpt: truncateExcerpt(
        probeFetch.html,
        MATCH_PROBE_EXCERPT_CHARS
      ),
      ...llmDiagFields(env.diagnostics),
    });
    if (env.result?.matches) {
      return { status: "ok", candidate: c, attempted };
    }
  }
  return { status: "ok", candidate: null, attempted };
}

interface ProposalUpsertInput {
  equipmentId: string;
  merged: MergedSpec;
  candidates: CandidatesPayload;
  status: "pending_review" | "no_results";
  nowIso: string;
  runLog: RunLogEntry[];
}

async function upsertProposal(
  supabase: SupabaseClient,
  input: ProposalUpsertInput
): Promise<void> {
  const { error } = await supabase.from("equipment_spec_proposals").upsert(
    {
      equipment_id: input.equipmentId,
      merged: input.merged,
      candidates: input.candidates,
      status: input.status,
      reviewed_at: null,
      reviewed_by: null,
      run_log: input.runLog,
    },
    { onConflict: "equipment_id" }
  );
  if (error) throw new Error(`upsert proposal: ${error.message}`);

  const newStatus =
    input.status === "no_results" ? "no_results" : "pending_review";
  const { error: equipmentError } = await supabase
    .from("equipment")
    .update({
      specs_sourced_at: input.nowIso,
      specs_source_status: newStatus,
    })
    .eq("id", input.equipmentId);
  if (equipmentError) {
    throw new Error(`update equipment cooldown: ${equipmentError.message}`);
  }
}

export async function processOneSpecMessage(
  supabase: SupabaseClient,
  sources: SpecSource[],
  extractor: BudgetedSpecExtractor,
  message: SpecSourceMessage,
  ctxLog: LogContext,
  deps: ProcessSpecDeps = {}
): Promise<ProcessOutcome> {
  const now = deps.now ?? (() => new Date());
  const equipment = equipmentRefFromMessage(message);
  const { ordered, skipped } = orderSourcesWithSkipped(sources, message.brand);
  const log = new RunLog({ now });

  for (const s of skipped) {
    log.record({
      step: "source_skipped_brand",
      source_id: s.id,
      source_brand: s.brand,
      equipment_brand: message.brand,
    });
  }

  const contributions: SourceContribution[] = [];

  for (const source of ordered) {
    log.record({
      step: "source_started",
      source_id: source.id,
      source_tier: source.tier,
      source_kind: source.kind,
    });

    let candidates: SpecCandidate[];
    const queryUrl = source.searchUrl ? source.searchUrl(equipment) : undefined;
    try {
      candidates = await source.search(equipment);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      Logger.warn(
        `spec-sourcing.search.failed source=${source.id}`,
        ctxLog,
        msg
      );
      log.record({
        step: "search",
        source_id: source.id,
        query_url: queryUrl,
        status: "failed",
        error: msg,
      });
      log.record({
        step: "source_done",
        source_id: source.id,
        reason: "no_candidates",
      });
      continue;
    }
    log.record({
      step: "search",
      source_id: source.id,
      query_url: queryUrl,
      status: "ok",
      count: candidates.length,
      candidates: candidates.map(candidateForLog),
    });

    const prefilter = prefilterDecisions(candidates, equipment);
    log.record({
      step: "prefilter",
      source_id: source.id,
      seed_tokens: prefilter.seedTokens,
      brand_tokens: prefilter.brandTokens,
      kept: prefilter.decisions
        .filter(d => d.kept)
        .map(d => candidateForLog(d.candidate)),
      dropped: prefilter.decisions
        .filter(d => !d.kept)
        .map(d => ({
          ...candidateForLog(d.candidate),
          missing_tokens: d.missingTokens,
          extra_tokens: d.extraTokens,
        })),
    });
    const survivors = prefilter.decisions
      .filter(d => d.kept)
      .map(d => d.candidate);
    if (survivors.length === 0) {
      log.record({
        step: "source_done",
        source_id: source.id,
        reason: candidates.length === 0 ? "no_candidates" : "prefilter_empty",
      });
      continue;
    }

    const pick = await pickCandidateViaMatch(
      source,
      extractor,
      survivors,
      equipment,
      log,
      ctxLog
    );
    if (pick.status === "transient") {
      log.record({ step: "outcome", status: "transient", reason: pick.reason });
      return { status: "transient", reason: pick.reason };
    }
    log.record({
      step: "match_summary",
      source_id: source.id,
      survivors_attempted: pick.attempted,
      winner_url: pick.candidate?.url ?? null,
    });
    const winner = pick.candidate;
    if (!winner) {
      log.record({
        step: "source_done",
        source_id: source.id,
        reason: "no_match",
      });
      continue;
    }

    let html: string;
    let finalUrl: string;
    try {
      const fetched = await source.fetch(winner.url);
      html = fetched.html;
      finalUrl = fetched.finalUrl;
      log.record({
        step: "fetch",
        source_id: source.id,
        candidate_url: winner.url,
        status: "ok",
        final_url: finalUrl,
        html_length: html.length,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      Logger.warn(
        `spec-sourcing.fetch.failed source=${source.id}`,
        ctxLog,
        msg
      );
      log.record({
        step: "fetch",
        source_id: source.id,
        candidate_url: winner.url,
        status: "failed",
        error: msg,
      });
      log.record({
        step: "source_done",
        source_id: source.id,
        reason: "fetch_failed",
      });
      continue;
    }

    const env = await extractor.extract(html, equipment);
    if (env.status !== "ok") {
      log.record({
        step: "extract",
        source_id: source.id,
        candidate_url: winner.url,
        status: "transient",
        reason: env.status,
      });
      log.record({ step: "outcome", status: "transient", reason: env.status });
      return { status: "transient", reason: env.status };
    }
    maybeAlertLlmFatal(env.diagnostics, ctxLog, source.id, "extract");
    const extracted: ExtractedSpec | null | undefined = env.result;
    const extractExcerpt = truncateExcerpt(html, EXTRACT_EXCERPT_CHARS);
    if (!extracted) {
      log.record({
        step: "extract",
        source_id: source.id,
        candidate_url: winner.url,
        status: "null_result",
        excerpt: extractExcerpt,
        ...llmDiagFields(env.diagnostics),
      });
      log.record({
        step: "source_done",
        source_id: source.id,
        reason: "extract_null",
      });
      continue;
    }
    const extractedFields = Object.keys(extracted.specs).filter(
      k => extracted.specs[k] !== null && extracted.specs[k] !== undefined
    );
    log.record({
      step: "extract",
      source_id: source.id,
      candidate_url: winner.url,
      status: "ok",
      fields_count: extractedFields.length,
      has_description: extracted.description != null,
      uncertain_fields: Object.keys(extracted.perFieldConfidence),
      excerpt: extractExcerpt,
      ...llmDiagFields(env.diagnostics),
    });

    contributions.push({
      source,
      candidateUrl: winner.url,
      finalUrl,
      extracted,
      fetchedAt: now().toISOString(),
    });
    log.record({
      step: "contribution",
      source_id: source.id,
      candidate_url: winner.url,
      fields: extractedFields,
      description: extracted.description != null,
    });
    log.record({
      step: "source_done",
      source_id: source.id,
      reason: "contributed",
    });
  }

  const nowIso = now().toISOString();

  if (contributions.length === 0) {
    log.record({ step: "outcome", status: "no-results" });
    try {
      await upsertProposal(supabase, {
        equipmentId: message.equipmentId,
        merged: { specs: {}, description: null, per_field_source: {} },
        candidates: {},
        status: "no_results",
        nowIso,
        runLog: log.toJSON(),
      });
    } catch (err) {
      return {
        status: "error",
        message: err instanceof Error ? err.message : String(err),
      };
    }
    return { status: "no-results" };
  }

  const { merged, candidates, mergedFieldCount } =
    mergeContributions(contributions);

  const perFieldWinners: Record<string, string> = {};
  for (const [field, url] of Object.entries(merged.per_field_source)) {
    if (field === "description") continue;
    const winner = contributions.find(c => c.candidateUrl === url);
    if (winner) perFieldWinners[field] = winner.source.id;
  }
  const descriptionUrl = merged.per_field_source.description;
  const descriptionSourceId = descriptionUrl
    ? (contributions.find(c => c.candidateUrl === descriptionUrl)?.source.id ??
      null)
    : null;
  log.record({
    step: "merge",
    merged_field_count: mergedFieldCount,
    per_field_winners: perFieldWinners,
    description_source_id: descriptionSourceId,
  });

  if (mergedFieldCount === 0) {
    // Edge case: extractor returned non-null with empty specs +
    // null description. Treat as no-results.
    log.record({ step: "outcome", status: "no-results" });
    try {
      await upsertProposal(supabase, {
        equipmentId: message.equipmentId,
        merged,
        candidates,
        status: "no_results",
        nowIso,
        runLog: log.toJSON(),
      });
    } catch (err) {
      return {
        status: "error",
        message: err instanceof Error ? err.message : String(err),
      };
    }
    return { status: "no-results" };
  }

  log.record({
    step: "outcome",
    status: "proposed",
    merged_field_count: mergedFieldCount,
  });

  try {
    await upsertProposal(supabase, {
      equipmentId: message.equipmentId,
      merged,
      candidates,
      status: "pending_review",
      nowIso,
      runLog: log.toJSON(),
    });
  } catch (err) {
    return {
      status: "error",
      message: err instanceof Error ? err.message : String(err),
    };
  }

  return { status: "proposed", mergedFieldCount };
}

// Backoff schedule for transient retries — same shape as photo-
// sourcing's. Out_of_budget waits hours by default; the cap (3600s)
// matches the Cloudflare Queues max delay and lets the wrangler.toml
// max_retries=5 eventually DLQ a stuck message.
export function computeRetryDelaySeconds(attempts: number): number {
  const minutes = Math.min(60, 2 ** attempts);
  return minutes * 60;
}

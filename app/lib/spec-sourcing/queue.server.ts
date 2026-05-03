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

import type { SupabaseClient } from "@supabase/supabase-js";

import { Logger, type LogContext } from "../logger.server";
import type { BudgetedSpecExtractor } from "./extract/budget";
import type { ExtractedSpec } from "./extract/types";
import {
  mergeContributions,
  type CandidatesPayload,
  type MergedSpec,
  type SourceContribution,
} from "./merge";
import type { EquipmentRef, SpecCandidate, SpecSource } from "./sources/types";
import { prefilter } from "./disambiguate";
import type { ProcessOutcome, SpecSourceMessage } from "./types";

const MAX_FETCHES_PER_SOURCE = 3;

export interface ProcessSpecDeps {
  // Test seam — defaults to wall-clock UTC ISO. Used as the fetched_at
  // timestamp on each candidate and as the equipment.specs_sourced_at
  // value so unit tests can pin exact strings.
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

// Disambiguate via the LLM when prefilter leaves >1 candidate. Returns
// the first candidate whose match() reports matches=true, or null if
// none. Surfaces 'transient' status from the budget wrapper so the
// caller can short-circuit the whole pipeline.
async function pickCandidateViaMatch(
  source: SpecSource,
  extractor: BudgetedSpecExtractor,
  candidates: SpecCandidate[],
  equipment: EquipmentRef
): Promise<
  | { status: "ok"; candidate: SpecCandidate | null }
  | { status: "transient"; reason: "rate_limited" | "out_of_budget" }
> {
  if (candidates.length <= 1) {
    return { status: "ok", candidate: candidates[0] ?? null };
  }
  for (const c of candidates.slice(0, MAX_FETCHES_PER_SOURCE)) {
    const probeFetch = await source.fetch(c.url).catch(() => null);
    if (!probeFetch) continue;
    const env = await extractor.match(probeFetch.html, equipment, c);
    if (env.status !== "ok") {
      return { status: "transient", reason: env.status };
    }
    if (env.result?.matches) {
      return { status: "ok", candidate: c };
    }
  }
  return { status: "ok", candidate: null };
}

interface ProposalUpsertInput {
  equipmentId: string;
  merged: MergedSpec;
  candidates: CandidatesPayload;
  status: "pending_review" | "no_results";
  nowIso: string;
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
  const ordered = orderSourcesForEquipment(sources, message.brand);
  const contributions: SourceContribution[] = [];

  for (const source of ordered) {
    let candidates: SpecCandidate[];
    try {
      candidates = await source.search(equipment);
    } catch (err) {
      Logger.warn(
        `spec-sourcing.search.failed source=${source.id}`,
        ctxLog,
        err instanceof Error ? err.message : String(err)
      );
      continue;
    }
    const survivors = prefilter(candidates, equipment);
    if (survivors.length === 0) continue;

    const pick = await pickCandidateViaMatch(
      source,
      extractor,
      survivors,
      equipment
    );
    if (pick.status === "transient") {
      return { status: "transient", reason: pick.reason };
    }
    const winner = pick.candidate;
    if (!winner) continue;

    let html: string;
    let finalUrl: string;
    try {
      const fetched = await source.fetch(winner.url);
      html = fetched.html;
      finalUrl = fetched.finalUrl;
    } catch (err) {
      Logger.warn(
        `spec-sourcing.fetch.failed source=${source.id}`,
        ctxLog,
        err instanceof Error ? err.message : String(err)
      );
      continue;
    }

    const env = await extractor.extract(html, equipment);
    if (env.status !== "ok") {
      return { status: "transient", reason: env.status };
    }
    const extracted: ExtractedSpec | null | undefined = env.result;
    if (!extracted) continue;

    contributions.push({
      source,
      candidateUrl: winner.url,
      finalUrl,
      extracted,
      fetchedAt: now().toISOString(),
    });
  }

  const nowIso = now().toISOString();

  if (contributions.length === 0) {
    try {
      await upsertProposal(supabase, {
        equipmentId: message.equipmentId,
        merged: { specs: {}, description: null, per_field_source: {} },
        candidates: {},
        status: "no_results",
        nowIso,
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

  if (mergedFieldCount === 0) {
    // Edge case: extractor returned non-null with empty specs +
    // null description. Treat as no-results.
    try {
      await upsertProposal(supabase, {
        equipmentId: message.equipmentId,
        merged,
        candidates,
        status: "no_results",
        nowIso,
      });
    } catch (err) {
      return {
        status: "error",
        message: err instanceof Error ? err.message : String(err),
      };
    }
    return { status: "no-results" };
  }

  try {
    await upsertProposal(supabase, {
      equipmentId: message.equipmentId,
      merged,
      candidates,
      status: "pending_review",
      nowIso,
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

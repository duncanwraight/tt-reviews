// Player importer queue consumer (TT-204). One queue message per
// truly-new ittfid, enqueued by the admin "Run import" producer in
// importer.server.ts. The consumer enriches via ITTF, downloads the
// headshot, and either auto-applies (complete data) or leaves the
// proposal in pending_review for admin review.
//
// Each invocation is one Worker call, so each ittfid gets its own
// 50-subrequest budget (Cloudflare Free plan). max_concurrency=1 in
// wrangler.toml keeps invocations serial — the ITTF fetcher's
// in-module rate-limit clock assumes only one isolate at a time.
//
// Pipeline per message:
//   1. Load the producer-created pending_review proposal row by ittfid.
//   2. Append `ittf_fetch` log entry.
//   3. Append `photo_fetch` + `r2_upload` entries.
//   4. mergeCandidates → completeness verdict + `merge` entry.
//   5. Terminal:
//      - complete       → insert players row + update proposal to
//                         status='auto_applied' with applied_player_id.
//      - incomplete     → update proposal with merged data, keep
//                         status='pending_review'. Admin reviews.
//      - ittf transient → return `transient`; consumer (workers/app.ts)
//                         re-queues with backoff, persists the partial
//                         log so the operator can see the retry chain.
//      - hard error     → return `error`; CF retries until max_retries
//                         exhausted then DLQs.

import type { SupabaseClient } from "@supabase/supabase-js";

import { fetchIttfProfile, toIttfCandidate } from "./ittf-profile.server";
import { mergeCandidates, slugForPlayer } from "./importer.server";
import { downloadAndStoreHeadshot, type R2PutBucket } from "./photo.server";
import { wttProfileUrl } from "./roster.server";
import { RunLog, type RunLogEntry } from "./run-log";
import {
  isComplete,
  type IttfProfileCandidate,
  type MergedPlayer,
  type WttRosterCandidate,
} from "./types";

// Producer → consumer payload. Carries enough WTT data to skip the
// ~200KB roster re-fetch per message (the cache in roster.server.ts
// is per-isolate, so it wouldn't survive across queue invocations
// anyway).
export interface PlayerImportMessage {
  ittfid: number;
  // The producer-created proposal row's id, so the consumer can
  // update by primary key without re-resolving by ittfid.
  proposal_id: string;
  // Stripped WTT roster data. Optional headshot_url because not every
  // roster row carries one.
  name: string;
  represents?: string;
  gender?: "M" | "F";
  ranking?: number;
  headshot_url?: string;
  wtt_profile_url: string;
  raw_name: string;
  // Re-queue counter — distinct from Cloudflare's max_retries which
  // resets on every ack. Drives our exponential backoff.
  attempts?: number;
  triggeredBy?: string;
}

export type ProcessOutcome =
  | { status: "auto_applied"; playerId: string; playerSlug: string }
  | { status: "queued_for_review" }
  | { status: "transient"; reason: string }
  | { status: "error"; message: string };

export interface ProcessPlayerImportDeps {
  fetchImpl?: typeof fetch;
  now?: () => Date;
}

// Reconstruct a WTT candidate shape from the queue message so
// mergeCandidates / slugForPlayer can stay agnostic of message shape.
function wttCandidateFromMessage(msg: PlayerImportMessage): WttRosterCandidate {
  return {
    source: "wtt",
    ittfid: msg.ittfid,
    name: msg.name,
    raw_name: msg.raw_name,
    represents: msg.represents,
    gender: msg.gender,
    ranking: msg.ranking,
    headshot_url: msg.headshot_url,
    wtt_profile_url: msg.wtt_profile_url || wttProfileUrl(msg.ittfid),
    fetched_at: new Date().toISOString(),
  };
}

// Which required fields are still missing — drives both the
// completeness gate and the `merge` log entry's `missing_fields`.
function missingRequiredFields(p: MergedPlayer): string[] {
  const missing: string[] = [];
  if (!p.handedness) missing.push("handedness");
  if (!p.grip) missing.push("grip");
  if (!p.birth_year) missing.push("birth_year");
  if (!p.headshot_url) missing.push("headshot_url");
  return missing;
}

interface ProposalRow {
  id: string;
  ittfid: number;
  status: string;
  run_log: RunLogEntry[] | null;
}

interface InsertedPlayer {
  id: string;
  slug: string;
}

async function loadProposal(
  supabase: SupabaseClient,
  proposalId: string
): Promise<ProposalRow | null> {
  const { data, error } = await supabase
    .from("player_proposals")
    .select("id, ittfid, status, run_log")
    .eq("id", proposalId)
    .maybeSingle();
  if (error || !data) return null;
  return data as ProposalRow;
}

async function persistRunLog(
  supabase: SupabaseClient,
  proposalId: string,
  runLog: RunLogEntry[]
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from("player_proposals")
    .update({ run_log: runLog })
    .eq("id", proposalId);
  return { error: error ? error.message : null };
}

// Slug-collision retry on the players insert. Mirrors the per-row
// retry in importer.server.ts so genuine name-clashes between two
// different ITTF profiles materialise as `<slug>-<ittfid>` rather
// than failing the consumer entirely.
async function insertPlayerRow(
  supabase: SupabaseClient,
  merged: MergedPlayer,
  imageKey: string
): Promise<{ inserted: InsertedPlayer | null; error: string | null }> {
  const baseSlug = slugForPlayer(merged);

  for (const slug of [baseSlug, `${baseSlug}-${merged.ittfid}`]) {
    const { data, error } = await supabase
      .from("players")
      .insert({
        name: merged.name,
        slug,
        ittfid: merged.ittfid,
        represents: merged.represents ?? null,
        gender: merged.gender ?? null,
        handedness: merged.handedness ?? null,
        grip: merged.grip ?? null,
        playing_style: merged.playing_style ?? null,
        birth_year: merged.birth_year ?? null,
        highest_rating: merged.highest_rating ?? null,
        image_key: imageKey,
        image_source_url: merged.headshot_url ?? null,
        active: true,
      })
      .select("id, slug")
      .single();

    if (!error && data) {
      return {
        inserted: { id: data.id as string, slug: data.slug as string },
        error: null,
      };
    }

    const code = (error as { code?: string } | null)?.code;
    if (code !== "23505") {
      return {
        inserted: null,
        error: error?.message ?? "insert failed",
      };
    }
  }

  return { inserted: null, error: "slug conflict after suffix retry" };
}

async function finaliseAutoApplied(
  supabase: SupabaseClient,
  proposalId: string,
  merged: MergedPlayer,
  ittf: IttfProfileCandidate,
  wtt: WttRosterCandidate,
  playerId: string,
  runLog: RunLogEntry[]
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from("player_proposals")
    .update({
      merged: merged as unknown as Record<string, unknown>,
      candidates: { wtt, ittf },
      status: "auto_applied",
      applied_player_id: playerId,
      run_log: runLog,
    })
    .eq("id", proposalId);
  return { error: error ? error.message : null };
}

async function finaliseQueuedForReview(
  supabase: SupabaseClient,
  proposalId: string,
  merged: MergedPlayer,
  ittf: IttfProfileCandidate,
  wtt: WttRosterCandidate,
  runLog: RunLogEntry[]
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from("player_proposals")
    .update({
      merged: merged as unknown as Record<string, unknown>,
      candidates: { wtt, ittf },
      status: "pending_review",
      run_log: runLog,
    })
    .eq("id", proposalId);
  return { error: error ? error.message : null };
}

export async function processOnePlayerImport(
  supabase: SupabaseClient,
  bucket: R2PutBucket,
  message: PlayerImportMessage,
  deps: ProcessPlayerImportDeps = {}
): Promise<ProcessOutcome> {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const now = deps.now;

  const proposal = await loadProposal(supabase, message.proposal_id);
  if (!proposal) {
    return {
      status: "error",
      message: `proposal ${message.proposal_id} not found`,
    };
  }

  // Re-running the import while a proposal is already terminal
  // (auto_applied / applied / rejected) means a stale message — ack
  // cleanly without writes.
  if (proposal.status !== "pending_review") {
    return { status: "queued_for_review" };
  }

  const seed = Array.isArray(proposal.run_log) ? proposal.run_log : [];
  const log = new RunLog(now ? { now } : {}, seed);

  const wtt = wttCandidateFromMessage(message);
  const attempts = message.attempts ?? 0;

  // ITTF fetch — the only step that can return a transient error.
  // Network / 5xx / 429 throws from fetchIttfProfile bubble up to this
  // catch; we surface them as `transient` and persist whatever ran
  // before the throw.
  let ittf: IttfProfileCandidate;
  try {
    const profile = await fetchIttfProfile(message.ittfid, fetchImpl);
    ittf = toIttfCandidate(message.ittfid, profile);
    log.record({
      step: "ittf_fetch",
      ittfid: message.ittfid,
      url: ittf.ittf_profile_url,
      status: "ok",
      handedness: ittf.handedness,
      grip: ittf.grip,
      style: ittf.style,
      birth_year: ittf.birth_year,
    });
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    const lower = reason.toLowerCase();
    // Transient: fetchIttfProfile's own "→ 5xx / 429 / exhausted
    // retries" surface, plus raw network/timeout throws from
    // fetchImpl (TypeError "network gone", "fetch failed", etc.)
    // that bypass the inner retry loop. Anything else (parse failure
    // on a 404 body, for instance) is treated as a hard error.
    const transient =
      reason.includes("exhausted retries") ||
      / → 5\d\d/.test(reason) ||
      / → 429/.test(reason) ||
      lower.includes("network") ||
      lower.includes("fetch failed") ||
      lower.includes("timeout") ||
      lower.includes("econnreset");
    log.record({
      step: "ittf_fetch",
      ittfid: message.ittfid,
      url: `ittfid:${message.ittfid}`,
      status: transient ? "transient" : "error",
      reason,
    });
    log.record({
      step: "terminal",
      ittfid: message.ittfid,
      status: transient ? "retry" : "error",
      attempts,
      reason,
    });
    await persistRunLog(supabase, proposal.id, log.toJSON());
    return transient
      ? { status: "transient", reason }
      : { status: "error", message: reason };
  }

  // Headshot fetch + R2 upload. Both swallow upstream errors and
  // return null — the importer treats "no image" as a completeness
  // failure (queued_for_review) rather than a transient retry. The
  // photo helper exposes only "ok | null" via the Promise so we
  // synthesise the log status from what we got back.
  let imageKey: string | null = null;
  if (!wtt.headshot_url) {
    log.record({
      step: "photo_fetch",
      ittfid: message.ittfid,
      url: null,
      status: "skipped",
      reason: "no headshot_url on WTT roster",
    });
    log.record({
      step: "r2_upload",
      ittfid: message.ittfid,
      image_key: null,
      status: "skipped",
      reason: "no source bytes",
    });
  } else {
    let stored: Awaited<ReturnType<typeof downloadAndStoreHeadshot>> = null;
    try {
      stored = await downloadAndStoreHeadshot(
        wtt.headshot_url,
        slugForPlayer({ name: wtt.name, ittfid: wtt.ittfid }),
        bucket,
        wtt.ittfid,
        fetchImpl
      );
    } catch (err) {
      // photo.server.ts already wraps fetch + put in try/catch and
      // returns null on failure, but R2 binding misconfiguration can
      // still throw. Treat as photo step error, not transient — a
      // misconfigured binding never self-heals.
      const reason = err instanceof Error ? err.message : String(err);
      log.record({
        step: "photo_fetch",
        ittfid: message.ittfid,
        url: wtt.headshot_url,
        status: "error",
        reason,
      });
      log.record({
        step: "r2_upload",
        ittfid: message.ittfid,
        image_key: null,
        status: "error",
        reason,
      });
    }

    if (stored) {
      log.record({
        step: "photo_fetch",
        ittfid: message.ittfid,
        url: wtt.headshot_url,
        status: "ok",
        content_type: stored.content_type,
        byte_length: stored.byte_length,
      });
      log.record({
        step: "r2_upload",
        ittfid: message.ittfid,
        image_key: stored.image_key,
        content_type: stored.content_type,
        status: "ok",
      });
      imageKey = stored.image_key;
    } else if (!stored && wtt.headshot_url) {
      // Only emit not_found if we didn't already record an error above.
      const lastTwo = log.toJSON().slice(-2);
      const alreadyLogged = lastTwo.some(
        e => e.step === "photo_fetch" && e.status === "error"
      );
      if (!alreadyLogged) {
        log.record({
          step: "photo_fetch",
          ittfid: message.ittfid,
          url: wtt.headshot_url,
          status: "not_found",
        });
        log.record({
          step: "r2_upload",
          ittfid: message.ittfid,
          image_key: null,
          status: "skipped",
          reason: "no source bytes",
        });
      }
    }
  }

  // Merge + completeness verdict. mergeCandidates is pure; the
  // imageKey from R2 (if present) becomes the proposal's image_key
  // when we materialise the players row.
  const merged = mergeCandidates(wtt, ittf);
  const missing = missingRequiredFields(merged);
  // Treat "no R2 upload" as a missing headshot for completeness even
  // if WTT carried a URL (Cloudflare network blip means we never
  // wrote a usable copy and the players row would 404 on the image).
  if (!imageKey && !missing.includes("headshot_url")) {
    missing.push("headshot_url");
  }
  const complete = isComplete(merged) && imageKey !== null;
  log.record({
    step: "merge",
    ittfid: message.ittfid,
    field_count: Object.keys(merged).filter(
      k => k !== "per_field_source" && merged[k as keyof MergedPlayer] != null
    ).length,
    complete,
    missing_fields: missing,
  });

  if (complete && imageKey) {
    const { inserted, error } = await insertPlayerRow(
      supabase,
      merged,
      imageKey
    );
    if (!inserted) {
      log.record({
        step: "terminal",
        ittfid: message.ittfid,
        status: "error",
        reason: error ?? "insert failed",
      });
      await persistRunLog(supabase, proposal.id, log.toJSON());
      return { status: "error", message: error ?? "insert failed" };
    }
    log.record({
      step: "terminal",
      ittfid: message.ittfid,
      status: "auto_applied",
      player_id: inserted.id,
      player_slug: inserted.slug,
    });
    const { error: finaliseError } = await finaliseAutoApplied(
      supabase,
      proposal.id,
      merged,
      ittf,
      wtt,
      inserted.id,
      log.toJSON()
    );
    if (finaliseError) {
      return { status: "error", message: `finalise auto: ${finaliseError}` };
    }
    return {
      status: "auto_applied",
      playerId: inserted.id,
      playerSlug: inserted.slug,
    };
  }

  log.record({
    step: "terminal",
    ittfid: message.ittfid,
    status: "queued_for_review",
    reason:
      missing.length > 0 ? `missing: ${missing.join(", ")}` : "incomplete",
  });
  const { error: finaliseError } = await finaliseQueuedForReview(
    supabase,
    proposal.id,
    merged,
    ittf,
    wtt,
    log.toJSON()
  );
  if (finaliseError) {
    return { status: "error", message: `finalise queue: ${finaliseError}` };
  }
  return { status: "queued_for_review" };
}

// Backoff schedule for transient retries. Same shape as
// app/lib/spec-sourcing/queue.server.ts — doubles up to a 1-hour cap.
export function computeRetryDelaySeconds(attempts: number): number {
  const minutes = Math.min(60, 2 ** attempts);
  return minutes * 60;
}

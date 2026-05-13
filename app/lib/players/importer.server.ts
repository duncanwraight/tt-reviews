// Importer producer (TT-201, TT-202, TT-203, TT-204, TT-205, TT-206).
//
// Walks the WTT roster, diffs against existing players + open
// proposals, and enqueues one queue message per truly-new ittfid onto
// `player-import-queue`. The queue consumer
// (app/lib/players/queue.server.ts → processOnePlayerImport) does
// the heavy lifting: ITTF enrich, headshot download, R2 upload,
// completeness gate, auto-apply or queue-for-review.
//
// TT-204 moves the per-candidate processing out of the producer
// because each candidate burns ~4 subrequests (ITTF + photo fetch +
// R2 PUT + DB write) and a Worker invocation is capped at 50 (Free
// plan). TT-205 collapsed N per-row proposal-stub inserts into one
// bulk insert. TT-206 added sendBatch chunking (CF caps each call at
// 100 messages) + orphan recovery for stubs whose previous sendBatch
// never landed.
//
// TT-202 dedupe pass stays inline because it's cheap (one PostgREST
// read for all players + one for all proposals + one bulk-backfill
// RPC, regardless of how many candidates are queued). The pass also
// matches by normalised name + sorted-tokens fallback for legacy
// seed rows that pre-date the ittfid column ("LEBRUN Alexis" vs seed
// "Alexis LEBRUN"); a unique name match backfills the existing row's
// ittfid + counts as `skipped_existing`. Ambiguous matches log + skip.
//
// Subrequest budget for one producer run: 2 setup reads (WTT roster
// + existing players+proposals) + 1 bulk-backfill RPC + 1 bulk
// proposal-stub insert + ceil(N/100) sendBatch calls. A 700-
// candidate run is ~12 subrequests total; the cap is no longer the
// gating constraint.

import type { SupabaseClient } from "@supabase/supabase-js";

import type { R2PutBucket } from "./photo.server";
import type { PlayerImportMessage } from "./queue.server";
import {
  deriveSlug,
  loadRosterCandidates,
  normaliseForMatch,
  tokenSorted,
} from "./roster.server";
import { type RunLogEntry } from "./run-log";
import {
  derivePlayingStyle,
  isComplete,
  type ImporterSummary,
  type IttfProfileCandidate,
  type MergedPlayer,
  type WttRosterCandidate,
} from "./types";

// Producer surface for the player-import-queue. Cloudflare's
// Queue<T> binding exposes both `send` and `sendBatch`; we only need
// the batch path so the producer adds one subrequest regardless of
// queue size.
export interface PlayerImportQueueProducer {
  sendBatch(messages: Array<{ body: PlayerImportMessage }>): Promise<unknown>;
}

export interface ImporterDeps {
  fetchImpl?: typeof fetch;
}

export interface RunImportOptions {
  deps?: ImporterDeps;
  // Caller-stamped trigger source for the run_log roster_match entry.
  triggeredBy?: string;
}

export function mergeCandidates(
  wtt: WttRosterCandidate,
  ittf: IttfProfileCandidate
): MergedPlayer {
  const playing_style = derivePlayingStyle(ittf.grip, ittf.style);
  const highest_rating =
    typeof wtt.ranking === "number" ? `WR${wtt.ranking}` : undefined;
  return {
    ittfid: wtt.ittfid,
    name: wtt.name,
    represents: wtt.represents,
    gender: wtt.gender,
    handedness: ittf.handedness,
    grip: ittf.grip,
    playing_style,
    birth_year: ittf.birth_year,
    highest_rating,
    headshot_url: wtt.headshot_url,
    wtt_profile_url: wtt.wtt_profile_url,
    ittf_profile_url: ittf.ittf_profile_url,
    per_field_source: {
      name: "wtt",
      represents: "wtt",
      gender: "wtt",
      handedness: "ittf",
      grip: "ittf",
      playing_style: "ittf",
      birth_year: "ittf",
      highest_rating: "wtt",
      headshot_url: "wtt",
      wtt_profile_url: "wtt",
      ittf_profile_url: "ittf",
    },
  };
}

// Slug derivation. Latin script → kebab-case; on collision or
// non-Latin input fall back to `<base>-<ittfid>` (or `player-<ittfid>`
// if base is empty). ittfid is UNIQUE so the suffixed form can't clash.
export function slugForPlayer(p: { name: string; ittfid: number }): string {
  const base = deriveSlug(p.name);
  return base || `player-${p.ittfid}`;
}

interface ExistingPlayerRow {
  id: string;
  name: string;
  ittfid: number | null;
}

interface PlayerIndex {
  byIttfid: Map<number, string>;
  // ittfid for each player by id — used to skip name-matches against
  // players that already have a *different* ittfid (those are real
  // namesakes, not legacy unlinked seeds).
  ittfidById: Map<string, number | null>;
  // Name keys use the same shape findByName builds: order-preserving
  // normalised name plus a `sorted:` token-sorted fallback for the
  // surname/given-name flip. Multiple existing rows can share a key
  // (e.g. two real "Wang Hao"s) — value is a Set so the dedupe can
  // detect ambiguity and refuse to auto-link.
  byName: Map<string, Set<string>>;
}

function buildPlayerIndex(rows: ExistingPlayerRow[]): PlayerIndex {
  const byIttfid = new Map<number, string>();
  const ittfidById = new Map<string, number | null>();
  const byName = new Map<string, Set<string>>();
  const addName = (key: string, id: string) => {
    const existing = byName.get(key);
    if (existing) existing.add(id);
    else byName.set(key, new Set([id]));
  };
  for (const row of rows) {
    ittfidById.set(row.id, row.ittfid);
    if (row.ittfid != null) byIttfid.set(row.ittfid, row.id);
    addName(normaliseForMatch(row.name), row.id);
    addName(`sorted:${tokenSorted(row.name)}`, row.id);
  }
  return { byIttfid, ittfidById, byName };
}

// Match a WTT candidate against the existing-player index. Returns:
// - ittfid-match: same person already linked, skip.
// - name-match (unique, existing.ittfid IS NULL): legacy seed row, the
//   caller backfills ittfid and skips.
// - ambiguous: multiple unlinked rows share this name, refuse to guess.
// - none: genuine new candidate, proceed to insert.
//
// Name matches against rows that ALREADY carry a different ittfid are
// NOT treated as legacy hits — those are real namesakes (e.g. two
// different "Wang Hao"s), and the genuine-new insert path with slug
// collision retry handles them.
function findExistingMatch(
  wtt: WttRosterCandidate,
  index: PlayerIndex
):
  | { kind: "ittfid"; playerId: string }
  | { kind: "name"; playerId: string }
  | { kind: "ambiguous"; count: number }
  | { kind: "none" } {
  const ittfHit = index.byIttfid.get(wtt.ittfid);
  if (ittfHit) return { kind: "ittfid", playerId: ittfHit };

  const norm = normaliseForMatch(wtt.name);
  const sorted = `sorted:${tokenSorted(wtt.name)}`;
  const candidates = new Set<string>();
  for (const id of index.byName.get(norm) ?? []) candidates.add(id);
  for (const id of index.byName.get(sorted) ?? []) candidates.add(id);

  // Only legacy (NULL-ittfid) rows are candidates for auto-link.
  const linkable = [...candidates].filter(
    id => (index.ittfidById.get(id) ?? null) === null
  );

  if (linkable.length === 0) return { kind: "none" };
  if (linkable.length === 1) {
    return { kind: "name", playerId: linkable[0] };
  }
  return { kind: "ambiguous", count: linkable.length };
}

interface BackfillPair {
  player_id: string;
  ittfid: number;
}

// Single-RPC bulk backfill — collapses N per-row UPDATEs into one
// PostgREST round-trip so the importer stays under Cloudflare's
// 50-subrequest cap (TT-203). Returns null on success, an error
// message on failure. The RPC is idempotent: it skips rows whose
// ittfid is already non-null, so a partial-success retry is safe.
async function bulkBackfillIttfids(
  supabase: SupabaseClient,
  pairs: BackfillPair[]
): Promise<string | null> {
  if (pairs.length === 0) return null;
  const { error } = await supabase.rpc("backfill_player_ittfids", {
    p_pairs: pairs,
  });
  return error ? error.message : null;
}

// Producer-side stub merged blob — the minimum we have at enqueue
// time before ITTF enrichment. The consumer overwrites this on
// success (with the full merged record). We carry enough WTT fields
// to render the proposal row in the admin queue even if the consumer
// never gets to it (e.g. queue stuck, DLQ).
function stubMergedFromWtt(wtt: WttRosterCandidate): MergedPlayer {
  const highest_rating =
    typeof wtt.ranking === "number" ? `WR${wtt.ranking}` : undefined;
  return {
    ittfid: wtt.ittfid,
    name: wtt.name,
    represents: wtt.represents,
    gender: wtt.gender,
    highest_rating,
    headshot_url: wtt.headshot_url,
    wtt_profile_url: wtt.wtt_profile_url,
    per_field_source: {
      name: "wtt",
      represents: "wtt",
      gender: "wtt",
      highest_rating: "wtt",
      headshot_url: "wtt",
      wtt_profile_url: "wtt",
    },
  };
}

function rosterMatchSeed(
  wtt: WttRosterCandidate,
  triggeredBy: string,
  now: () => Date
): RunLogEntry {
  return {
    at: now().toISOString(),
    step: "roster_match",
    outcome: "truly_new",
    ittfid: wtt.ittfid,
    wtt_name: wtt.name,
    wtt_headshot_url: wtt.headshot_url,
    wtt_profile_url: wtt.wtt_profile_url,
    triggered_by: triggeredBy,
  };
}

// Insert one pending_review stub per truly-new ittfid. Each insert
// is its own subrequest — that's deliberate. The alternative
// (server-side bulk insert RPC) would save subrequests but couples
// the producer to a Postgres function that has to evolve with the
// proposal schema. With the producer no longer doing per-candidate
// network work (TT-204), the budget can spare ~45 inserts per click
// before hitting the 50-cap. Beyond that the operator re-clicks.
async function insertProposalStubs(
  supabase: SupabaseClient,
  candidates: WttRosterCandidate[],
  triggeredBy: string,
  now: () => Date
): Promise<{
  inserted: Array<{ id: string; wtt: WttRosterCandidate }>;
  errors: Array<{ ittfid: number; message: string }>;
}> {
  if (candidates.length === 0) return { inserted: [], errors: [] };

  // Single PostgREST bulk insert (TT-205). Collapses N per-row
  // subrequests into one — without this, the Worker hits the 50-
  // subrequest cap at ~45 truly-new candidates per click (4 setup +
  // N inserts + 1 sendBatch) and the operator has to re-click to
  // drain the rest. With the pre-filter (knownProposalIttfids)
  // already excluding existing ittfids, the bulk insert is safe; a
  // concurrent click could still race in a duplicate, so we surface
  // the whole-batch error rather than silently dropping rows. The
  // caller (the /admin action) can re-trigger and the pre-filter
  // catches the now-existing rows on the next pass.
  const rows = candidates.map(wtt => ({
    ittfid: wtt.ittfid,
    merged: stubMergedFromWtt(wtt) as unknown as Record<string, unknown>,
    candidates: { wtt },
    status: "pending_review",
    run_log: [rosterMatchSeed(wtt, triggeredBy, now)],
  }));

  const { data, error } = await supabase
    .from("player_proposals")
    .insert(rows)
    .select("id, ittfid");

  if (error || !data) {
    return {
      inserted: [],
      errors: [
        {
          ittfid: 0,
          message: `bulk proposal insert (${rows.length} rows): ${error?.message ?? "no data returned"}`,
        },
      ],
    };
  }

  // PostgREST preserves insert order in the returned select, so we
  // can pair returned rows with the source candidate by index. Match
  // by ittfid as a safety belt in case the server reorders.
  const byIttfid = new Map(
    (data as Array<{ id: string; ittfid: number }>).map(r => [r.ittfid, r.id])
  );
  const inserted: Array<{ id: string; wtt: WttRosterCandidate }> = [];
  const errors: Array<{ ittfid: number; message: string }> = [];
  for (const wtt of candidates) {
    const id = byIttfid.get(wtt.ittfid);
    if (id) {
      inserted.push({ id, wtt });
    } else {
      errors.push({
        ittfid: wtt.ittfid,
        message: "proposal insert returned no id",
      });
    }
  }
  return { inserted, errors };
}

function buildQueueMessage(
  proposalId: string,
  wtt: WttRosterCandidate,
  triggeredBy: string
): PlayerImportMessage {
  return {
    ittfid: wtt.ittfid,
    proposal_id: proposalId,
    name: wtt.name,
    raw_name: wtt.raw_name,
    represents: wtt.represents,
    gender: wtt.gender,
    ranking: wtt.ranking,
    headshot_url: wtt.headshot_url,
    wtt_profile_url: wtt.wtt_profile_url,
    triggeredBy,
    attempts: 0,
  };
}

// One existing-proposal row as it lands from the dedupe pre-load.
// `merged` is the producer's stub blob — enough fields to reconstruct
// a queue message for orphan recovery when the original sendBatch
// never reached the queue.
interface ProposalIndexRow {
  id: string;
  ittfid: number;
  status: string;
  run_log: RunLogEntry[] | null;
  merged: Record<string, unknown> | null;
}

// Cloudflare Queues caps `sendBatch` at 100 messages per call
// (https://developers.cloudflare.com/queues/platform/limits/). We
// chunk producer payloads below this to avoid the "Payload Too
// Large" failure mode that TT-206 traced: a 697-candidate run
// inserted all 697 stubs successfully but couldn't ship the single
// big sendBatch.
const SEND_BATCH_MAX = 100;

function chunkMessages<T>(messages: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < messages.length; i += size) {
    out.push(messages.slice(i, i + size));
  }
  return out;
}

// Did the consumer touch this proposal? True when run_log ends with
// the producer's `roster_match` seed (no consumer-side step appended
// yet). Used for orphan recovery — these are stubs that were
// inserted by some previous Run import click but never made it to
// the queue, so the consumer will never see them without help.
function isOrphanedStub(row: ProposalIndexRow): boolean {
  if (row.status !== "pending_review") return false;
  const log = row.run_log ?? [];
  const last = log[log.length - 1];
  return last?.step === "roster_match";
}

// Synthesize a queue message from a proposal row's stored merged
// blob + the WTT side of the original candidates JSON. We seed the
// producer's stub at insert time with enough WTT fields to do this
// without re-fetching the roster.
function messageForOrphan(
  row: ProposalIndexRow,
  triggeredBy: string
): PlayerImportMessage | null {
  const merged = row.merged ?? {};
  const name = typeof merged.name === "string" ? merged.name : "";
  const wtt_profile_url =
    typeof merged.wtt_profile_url === "string" ? merged.wtt_profile_url : "";
  if (!name || !wtt_profile_url) return null;
  return {
    ittfid: row.ittfid,
    proposal_id: row.id,
    name,
    raw_name: typeof merged.raw_name === "string" ? merged.raw_name : name,
    represents:
      typeof merged.represents === "string" ? merged.represents : undefined,
    gender:
      merged.gender === "M" || merged.gender === "F"
        ? merged.gender
        : undefined,
    headshot_url:
      typeof merged.headshot_url === "string" ? merged.headshot_url : undefined,
    wtt_profile_url,
    triggeredBy,
    attempts: 0,
  };
}

export async function runImport(
  supabase: SupabaseClient,
  // The R2 bucket binding is retained on the signature because the
  // caller (the /admin/import-players action) still passes it for
  // future direct-apply flows. The producer no longer uses it — kept
  // here as a typed seam so the action doesn't need a second code
  // path for the queue migration.
  _bucket: R2PutBucket,
  queue: PlayerImportQueueProducer,
  options: RunImportOptions = {}
): Promise<ImporterSummary> {
  const fetchImpl = options.deps?.fetchImpl ?? fetch;
  const triggeredBy = options.triggeredBy ?? "admin";
  const now = () => new Date();

  const rosterCandidates = await loadRosterCandidates(fetchImpl);

  // Load every player (including those with NULL ittfid) so the
  // legacy-name dedupe path catches seed rows that pre-date TT-196.
  const { data: existingPlayers } = await supabase
    .from("players")
    .select("id, name, ittfid");
  const playerRows = (existingPlayers ?? []) as ExistingPlayerRow[];
  const index = buildPlayerIndex(playerRows);

  // Skip ittfids that already have any proposal row — pending_review,
  // applied, auto_applied, rejected, no_results. Re-running shouldn't
  // create a second proposal for the same upstream entry. We also
  // pull `id` + `run_log` + `merged` here so the orphan-recovery
  // pass below can synthesize queue messages for stubs that the
  // producer inserted but never enqueued (TT-206 — sendBatch
  // failed before reaching the queue).
  const { data: existingProposals } = await supabase
    .from("player_proposals")
    .select("id, ittfid, status, run_log, merged");
  const knownProposalRows = (existingProposals ?? []) as ProposalIndexRow[];
  const knownProposalIttfids = new Set(knownProposalRows.map(p => p.ittfid));

  const summary: ImporterSummary = {
    skipped_existing: 0,
    queued_for_processing: 0,
    errors: [],
  };

  // Dedupe pass: classify every candidate against the in-memory
  // index. No DB writes here — backfill pairs are flushed in one
  // batched RPC call after the loop, then truly-new candidates feed
  // the queue-enqueue pass below.
  const trulyNew: WttRosterCandidate[] = [];
  const backfillPairs: BackfillPair[] = [];
  for (const wtt of rosterCandidates) {
    if (knownProposalIttfids.has(wtt.ittfid)) {
      summary.skipped_existing += 1;
      continue;
    }
    const match = findExistingMatch(wtt, index);
    if (match.kind === "ittfid") {
      summary.skipped_existing += 1;
      continue;
    }
    if (match.kind === "name") {
      backfillPairs.push({ player_id: match.playerId, ittfid: wtt.ittfid });
      index.byIttfid.set(wtt.ittfid, match.playerId);
      summary.skipped_existing += 1;
      continue;
    }
    if (match.kind === "ambiguous") {
      summary.errors.push({
        ittfid: wtt.ittfid,
        message: `name "${wtt.name}" ambiguous against ${match.count} existing players — link manually`,
      });
      continue;
    }
    trulyNew.push(wtt);
  }

  // Flush all backfills in one RPC call. On failure we roll back the
  // skipped_existing increment for those pairs (so the next run will
  // retry them) and surface a single summary error rather than N.
  const backfillError = await bulkBackfillIttfids(supabase, backfillPairs);
  if (backfillError) {
    summary.skipped_existing -= backfillPairs.length;
    for (const pair of backfillPairs) {
      if (index.byIttfid.get(pair.ittfid) === pair.player_id) {
        index.byIttfid.delete(pair.ittfid);
      }
    }
    summary.errors.push({
      ittfid: 0,
      message: `bulk ittfid backfill (${backfillPairs.length} pairs): ${backfillError}`,
    });
  }

  // Insert one pending_review stub per truly-new candidate (bulk
  // insert per TT-205). Returned ids feed the per-message
  // proposal_id; we don't enqueue for a candidate whose stub insert
  // failed because there'd be no proposal row for the consumer to
  // update.
  const { inserted, errors: insertErrors } = await insertProposalStubs(
    supabase,
    trulyNew,
    triggeredBy,
    now
  );
  for (const e of insertErrors) summary.errors.push(e);

  // Build messages from the freshly-inserted stubs.
  const messages: Array<{ body: PlayerImportMessage }> = inserted.map(
    ({ id, wtt }) => ({ body: buildQueueMessage(id, wtt, triggeredBy) })
  );

  // Orphan recovery (TT-206): include queue messages for any earlier
  // stub that landed in pending_review but never reached the queue
  // (e.g. a previous Run import click that sent a too-large
  // sendBatch). Filter to roster_match-only rows so we don't re-
  // enqueue proposals the consumer is already partway through.
  // Skip any orphan whose ittfid we just inserted in this same run
  // (defensive — the dedupe pre-filter should already exclude
  // those, but a concurrent click race could double up).
  const freshIttfids = new Set(inserted.map(i => i.wtt.ittfid));
  let recoveredOrphanCount = 0;
  for (const row of knownProposalRows) {
    if (freshIttfids.has(row.ittfid)) continue;
    if (!isOrphanedStub(row)) continue;
    const msg = messageForOrphan(row, triggeredBy);
    if (!msg) continue;
    messages.push({ body: msg });
    recoveredOrphanCount += 1;
  }

  if (messages.length === 0) return summary;

  // Chunk sendBatch (TT-206). Cloudflare Queues caps a single
  // sendBatch call at 100 messages — 697-message payload threw
  // "Payload Too Large" in prod. Each chunk is its own subrequest;
  // even a 697-candidate run is ~7 chunks + ~5 setup subrequests,
  // well under the 50 cap. We track per-chunk failures so the
  // operator's next click can pick up only what didn't ship (the
  // orphan-recovery pass above is the same retry hook).
  const chunks = chunkMessages(messages, SEND_BATCH_MAX);
  let successfullySent = 0;
  for (let i = 0; i < chunks.length; i += 1) {
    const chunk = chunks[i];
    try {
      await queue.sendBatch(chunk);
      successfullySent += chunk.length;
    } catch (err) {
      summary.errors.push({
        ittfid: 0,
        message: `queue sendBatch chunk ${i + 1}/${chunks.length} (${chunk.length} messages): ${err instanceof Error ? err.message : String(err)}`,
      });
      // Don't break — try the remaining chunks. A "Payload Too
      // Large" on chunk K shouldn't force chunks K+1.. to wait for
      // another click.
    }
  }
  summary.queued_for_processing = successfullySent;
  if (recoveredOrphanCount > 0) {
    summary.recovered_orphans = recoveredOrphanCount;
  }

  return summary;
}

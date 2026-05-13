// Importer orchestrator (TT-201, TT-202).
//
// Walks the WTT roster, diffs against existing players + open proposals,
// enriches each new candidate via ITTF, downloads the headshot, and
// decides per-candidate: auto-apply straight into `players`, or queue
// to `player_proposals` for admin review.
//
// TT-202 fixes a dedupe regression: seed rows pre-date the `ittfid`
// column so legacy players carry NULL there. Matching ittfid-only let
// every seeded player look "new" to the importer, and slug-collision
// retry happily materialised `<slug>-<ittfid>` duplicates next to the
// seeds. The dedupe now also matches by normalised name + a sorted-
// tokens fallback (for the WTT "LEBRUN Alexis" vs seed "Alexis LEBRUN"
// flip). A unique name match backfills the existing row's ittfid +
// counts as `skipped_existing`. Ambiguous matches log + skip.
//
// Subrequest budget (Cloudflare Workers Free plan: 50/req): 2 setup
// reads (WTT roster + existing players+proposals) + 4 per candidate
// (ITTF profile, photo fetch, R2 PUT, DB write). MAX_PER_RUN_DEFAULT=8
// caps us at ~34 subrequests. Excess candidates → summary.remaining.

import type { SupabaseClient } from "@supabase/supabase-js";

import { fetchIttfProfile, toIttfCandidate } from "./ittf-profile.server";
import { downloadAndStoreHeadshot, type R2PutBucket } from "./photo.server";
import {
  deriveSlug,
  loadRosterCandidates,
  normaliseForMatch,
  tokenSorted,
} from "./roster.server";
import {
  derivePlayingStyle,
  isComplete,
  type ImporterSummary,
  type IttfProfileCandidate,
  type MergedPlayer,
  type WttRosterCandidate,
} from "./types";

export const MAX_PER_RUN_DEFAULT = 8;

export interface ImporterDeps {
  fetchImpl?: typeof fetch;
}

export interface RunImportOptions {
  maxPerRun?: number;
  deps?: ImporterDeps;
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

function fallbackSlug(p: { ittfid: number }): string {
  return `player-${p.ittfid}`;
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

async function backfillIttfid(
  supabase: SupabaseClient,
  playerId: string,
  ittfid: number
): Promise<string | null> {
  const { error } = await supabase
    .from("players")
    .update({ ittfid })
    .eq("id", playerId)
    .is("ittfid", null);
  return error ? error.message : null;
}

async function insertPlayerRow(
  supabase: SupabaseClient,
  merged: MergedPlayer,
  image_key: string
): Promise<{ id: string; slug: string; error: string | null }> {
  const baseSlug = slugForPlayer(merged);

  // Slug-collision retry is now scoped to genuine same-name-different-
  // people cases — the legacy-dedupe pass in runImport short-circuits
  // before we get here when the seeded row is the same person.
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
        image_key,
        image_source_url: merged.headshot_url ?? null,
        active: true,
      })
      .select("id, slug")
      .single();

    if (!error && data) {
      return { id: data.id as string, slug: data.slug as string, error: null };
    }

    const code = (error as { code?: string } | null)?.code;
    if (code !== "23505") {
      return {
        id: "",
        slug: "",
        error: error?.message ?? "insert failed",
      };
    }
  }

  return { id: "", slug: "", error: "slug conflict after suffix retry" };
}

export async function runImport(
  supabase: SupabaseClient,
  bucket: R2PutBucket,
  options: RunImportOptions = {}
): Promise<ImporterSummary> {
  const maxPerRun = options.maxPerRun ?? MAX_PER_RUN_DEFAULT;
  const fetchImpl = options.deps?.fetchImpl ?? fetch;

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
  // create a second proposal for the same upstream entry.
  const { data: existingProposals } = await supabase
    .from("player_proposals")
    .select("ittfid");
  const knownProposalIttfids = new Set(
    ((existingProposals ?? []) as Array<{ ittfid: number }>).map(p => p.ittfid)
  );

  const summary: ImporterSummary = {
    auto_applied: 0,
    queued: 0,
    skipped_existing: 0,
    remaining: 0,
    errors: [],
  };

  // First pass: handle every candidate that matches an existing row
  // (by ittfid or by name). These are free — no upstream fetches —
  // so we don't count them against maxPerRun.
  const trulyNew: WttRosterCandidate[] = [];
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
      const err = await backfillIttfid(supabase, match.playerId, wtt.ittfid);
      if (err) {
        summary.errors.push({
          ittfid: wtt.ittfid,
          message: `ittfid backfill: ${err}`,
        });
      } else {
        // Update our in-memory index so a re-run within the same
        // request short-circuits via ittfid match.
        index.byIttfid.set(wtt.ittfid, match.playerId);
      }
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

  // Second pass: process the genuinely-new candidates up to maxPerRun.
  // Each one costs ITTF fetch + photo fetch + R2 PUT + DB write.
  const toProcess = trulyNew.slice(0, maxPerRun);
  summary.remaining = Math.max(0, trulyNew.length - toProcess.length);

  for (const wtt of toProcess) {
    try {
      const profile = await fetchIttfProfile(wtt.ittfid, fetchImpl);
      const ittf = toIttfCandidate(wtt.ittfid, profile);
      const merged = mergeCandidates(wtt, ittf);

      let image_key: string | null = null;
      if (wtt.headshot_url) {
        const stored = await downloadAndStoreHeadshot(
          wtt.headshot_url,
          slugForPlayer(merged) || fallbackSlug(wtt),
          bucket,
          wtt.ittfid,
          fetchImpl
        );
        if (stored) image_key = stored.image_key;
      }

      const complete = isComplete(merged) && image_key !== null;

      if (complete && image_key) {
        const inserted = await insertPlayerRow(supabase, merged, image_key);
        if (inserted.error) {
          summary.errors.push({
            ittfid: wtt.ittfid,
            message: inserted.error,
          });
          continue;
        }

        const { error: auditError } = await supabase
          .from("player_proposals")
          .insert({
            ittfid: wtt.ittfid,
            merged: merged as unknown as Record<string, unknown>,
            candidates: { wtt, ittf },
            status: "auto_applied",
            applied_player_id: inserted.id,
          });
        if (auditError) {
          summary.errors.push({
            ittfid: wtt.ittfid,
            message: `audit insert: ${auditError.message}`,
          });
        }
        summary.auto_applied += 1;
        continue;
      }

      const { error: queueError } = await supabase
        .from("player_proposals")
        .insert({
          ittfid: wtt.ittfid,
          merged: merged as unknown as Record<string, unknown>,
          candidates: { wtt, ittf },
          status: "pending_review",
        });
      if (queueError) {
        summary.errors.push({
          ittfid: wtt.ittfid,
          message: queueError.message,
        });
        continue;
      }
      summary.queued += 1;
    } catch (err) {
      summary.errors.push({
        ittfid: wtt.ittfid,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return summary;
}

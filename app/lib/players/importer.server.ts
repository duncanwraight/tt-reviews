// Importer orchestrator (TT-201).
//
// Walks the WTT roster, diffs against existing players + open proposals,
// enriches each new candidate via ITTF, downloads the headshot, and
// decides per-candidate: auto-apply straight into `players`, or queue
// to `player_proposals` for admin review.
//
// Subrequest budget (Cloudflare Workers Free plan: 50/req): 2 setup
// reads (WTT roster + existing players) + 4 per candidate (ITTF profile,
// photo fetch, R2 PUT, DB write). MAX_PER_RUN_DEFAULT=8 caps us at 34
// subrequests. Excess candidates are reflected in summary.remaining;
// admin clicks "Run import" again to drain the rest.

import type { SupabaseClient } from "@supabase/supabase-js";

import { fetchIttfProfile, toIttfCandidate } from "./ittf-profile.server";
import { downloadAndStoreHeadshot, type R2PutBucket } from "./photo.server";
import { deriveSlug, loadRosterCandidates } from "./roster.server";
import {
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
  return {
    ittfid: wtt.ittfid,
    name: wtt.name,
    represents: wtt.represents,
    gender: wtt.gender,
    handedness: ittf.handedness,
    grip: ittf.grip,
    birth_year: ittf.birth_year,
    headshot_url: wtt.headshot_url,
    wtt_profile_url: wtt.wtt_profile_url,
    ittf_profile_url: ittf.ittf_profile_url,
    per_field_source: {
      name: "wtt",
      represents: "wtt",
      gender: "wtt",
      handedness: "ittf",
      grip: "ittf",
      birth_year: "ittf",
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

async function insertPlayerRow(
  supabase: SupabaseClient,
  merged: MergedPlayer,
  image_key: string
): Promise<{ id: string; slug: string; error: string | null }> {
  const baseSlug = slugForPlayer(merged);

  // Try the natural slug first; on UNIQUE violation (collision against
  // an existing player whose slug we'd reuse, e.g. two "WANG Hao"s)
  // retry once with the ittfid suffix — guaranteed unique.
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
    // Fall through to the suffixed slug attempt.
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

  const { data: existingPlayers } = await supabase
    .from("players")
    .select("ittfid")
    .not("ittfid", "is", null);
  const knownPlayerIttfids = new Set(
    ((existingPlayers ?? []) as Array<{ ittfid: number }>).map(p => p.ittfid)
  );

  // Skip ittfids that already have an open or resolved proposal. A
  // 'rejected' proposal stays skipped — admin's call. A 'no_results'
  // proposal stays skipped to avoid re-fetching ITTF on every run.
  const { data: existingProposals } = await supabase
    .from("player_proposals")
    .select("ittfid");
  const knownProposalIttfids = new Set(
    ((existingProposals ?? []) as Array<{ ittfid: number }>).map(p => p.ittfid)
  );

  const newCandidates = rosterCandidates.filter(
    c =>
      !knownPlayerIttfids.has(c.ittfid) && !knownProposalIttfids.has(c.ittfid)
  );

  const toProcess = newCandidates.slice(0, maxPerRun);

  const summary: ImporterSummary = {
    auto_applied: 0,
    queued: 0,
    skipped_existing: rosterCandidates.length - newCandidates.length,
    remaining: Math.max(0, newCandidates.length - toProcess.length),
    errors: [],
  };

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
          // Audit-row failure is non-fatal: the player row landed; we
          // just lost the per-source breakdown. Surface as a non-fatal
          // error so the admin sees it in the run summary.
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

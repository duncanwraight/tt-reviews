// Apply / reject orchestration for player proposals (TT-201).
//
// Approve: materialise a row in `players` (downloading the headshot
// into R2 if the proposal queued without one), then mark the proposal
// `applied` with reviewed_at/by + applied_player_id. Reject: just stamp
// status='rejected' + reviewed_at/by. Lives outside the route so unit
// tests can drive it with mocked Supabase + R2.

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  downloadAndStoreHeadshot,
  type R2PutBucket,
} from "~/lib/players/photo.server";
import { slugForPlayer } from "~/lib/players/importer.server";
import type { MergedPlayer } from "~/lib/players/types";

export interface ApplyResult {
  ok: boolean;
  error?: string;
  playerId?: string;
  playerSlug?: string;
}

interface ProposalRow {
  id: string;
  ittfid: number;
  merged: MergedPlayer;
  status: string;
}

async function loadProposal(
  supabase: SupabaseClient,
  proposalId: string
): Promise<ProposalRow | { error: string }> {
  const { data, error } = await supabase
    .from("player_proposals")
    .select("id, ittfid, merged, status")
    .eq("id", proposalId)
    .maybeSingle();
  if (error) return { error: error.message };
  if (!data) return { error: "proposal not found" };
  return data as ProposalRow;
}

async function insertPlayer(
  supabase: SupabaseClient,
  merged: MergedPlayer,
  image_key: string | null
): Promise<{ id: string; slug: string; error: string | null }> {
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
        image_key: image_key ?? null,
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

export async function applyPlayerProposal(
  supabase: SupabaseClient,
  bucket: R2PutBucket,
  proposalId: string,
  reviewerId: string,
  fetchImpl: typeof fetch = fetch
): Promise<ApplyResult> {
  const proposal = await loadProposal(supabase, proposalId);
  if ("error" in proposal) {
    return { ok: false, error: proposal.error };
  }
  if (proposal.status !== "pending_review") {
    return {
      ok: false,
      error: `proposal is not pending_review (status=${proposal.status})`,
    };
  }

  const merged = proposal.merged;

  // Re-attempt the headshot download. The proposal may have queued
  // specifically *because* the original fetch failed, so a retry here
  // (e.g. WTT CDN flake) is worth it. If it still fails, fall through
  // with image_key=null — admin chose to apply anyway, so don't block.
  let image_key: string | null = null;
  if (merged.headshot_url) {
    const stored = await downloadAndStoreHeadshot(
      merged.headshot_url,
      slugForPlayer(merged),
      bucket,
      merged.ittfid,
      fetchImpl
    );
    if (stored) image_key = stored.image_key;
  }

  const inserted = await insertPlayer(supabase, merged, image_key);
  if (inserted.error) {
    return { ok: false, error: inserted.error };
  }

  const { error: updateError } = await supabase
    .from("player_proposals")
    .update({
      status: "applied",
      reviewed_at: new Date().toISOString(),
      reviewed_by: reviewerId,
      applied_player_id: inserted.id,
    })
    .eq("id", proposalId);

  if (updateError) {
    // Player row landed but we couldn't mark the proposal. Surface the
    // error; the admin can re-check the queue and find the proposal
    // remains pending_review while the player exists — rare race.
    return {
      ok: false,
      error: `player created but proposal update failed: ${updateError.message}`,
      playerId: inserted.id,
      playerSlug: inserted.slug,
    };
  }

  return {
    ok: true,
    playerId: inserted.id,
    playerSlug: inserted.slug,
  };
}

export async function rejectPlayerProposal(
  supabase: SupabaseClient,
  proposalId: string,
  reviewerId: string
): Promise<ApplyResult> {
  const { error } = await supabase
    .from("player_proposals")
    .update({
      status: "rejected",
      reviewed_at: new Date().toISOString(),
      reviewed_by: reviewerId,
    })
    .eq("id", proposalId)
    .eq("status", "pending_review");

  if (error) {
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

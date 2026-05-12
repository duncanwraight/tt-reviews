// Player proposal applier / rejecter (TT-168 / TT-199). Materialises a
// `players` row from an approved proposal, or stamps a rejected status.
//
// Lives outside the route so unit tests can drive it with a mocked
// Supabase client and (future) Discord moderation hooks can reuse it.
//
// Slug collision handling: the player names from WTT include both
// transliterated CJK names and Latin-script names; collisions across
// the existing seed catalog are rare but possible (e.g., multiple
// "Wang Hao" generations). On `players_slug_key` violation we suffix
// `-2`, `-3`, … until we land a free slug.

import type { SupabaseClient } from "@supabase/supabase-js";

import { generateSlug } from "../revspin.server";

export interface ApplyResult {
  ok: boolean;
  error?: string;
  player_id?: string;
  slug?: string;
}

interface ProposalRow {
  id: string;
  ittfid: number;
  status: string;
  merged: {
    name?: string;
    represents?: string;
    birth_country?: string;
    gender?: "M" | "F";
    handedness?: "left" | "right";
    grip?: "shakehand" | "penhold";
    highest_rating?: string;
    active_years?: string;
  };
}

interface MaybeError {
  code?: string;
  message?: string;
}

const MAX_SLUG_RETRIES = 25;

export async function applyPlayerProposal(
  supabaseAdmin: SupabaseClient,
  proposalId: string,
  reviewedBy: string
): Promise<ApplyResult> {
  const { data: proposal, error: readError } = await supabaseAdmin
    .from("player_proposals")
    .select("id, ittfid, status, merged")
    .eq("id", proposalId)
    .single();

  if (readError || !proposal) {
    return {
      ok: false,
      error: readError?.message ?? "proposal not found",
    };
  }

  const row = proposal as ProposalRow;
  if (row.status !== "pending_review") {
    return {
      ok: false,
      error: `proposal is ${row.status}, not pending_review`,
    };
  }

  const name = row.merged.name;
  if (!name) {
    return { ok: false, error: "proposal merged.name is missing" };
  }

  const baseSlug = generateSlug(name);
  let slug = baseSlug;
  let attempt = 1;
  let playerId: string | undefined;

  while (attempt <= MAX_SLUG_RETRIES) {
    const { data: inserted, error: insertError } = await supabaseAdmin
      .from("players")
      .insert({
        name,
        slug,
        ittfid: row.ittfid,
        represents: row.merged.represents ?? null,
        birth_country: row.merged.birth_country ?? null,
        gender: row.merged.gender ?? null,
        handedness: row.merged.handedness ?? null,
        grip: row.merged.grip ?? null,
        highest_rating: row.merged.highest_rating ?? null,
        active_years: row.merged.active_years ?? null,
        active: true,
      })
      .select("id")
      .single();

    if (!insertError && inserted) {
      playerId = (inserted as { id: string }).id;
      break;
    }

    const err = (insertError ?? {}) as MaybeError;
    // 23505 = unique_violation. Could be the slug, could be the
    // ittfid (already imported under a different proposal). We only
    // retry on slug collision; an ittfid collision is a logic error.
    if (
      err.code !== "23505" ||
      !(err.message ?? "").includes("players_slug_key")
    ) {
      return {
        ok: false,
        error: err.message ?? "insert players failed",
      };
    }
    attempt += 1;
    slug = `${baseSlug}-${attempt}`;
  }

  if (!playerId) {
    return {
      ok: false,
      error: `slug collision after ${MAX_SLUG_RETRIES} retries`,
    };
  }

  const { error: updateError } = await supabaseAdmin
    .from("player_proposals")
    .update({
      status: "applied",
      reviewed_at: new Date().toISOString(),
      reviewed_by: reviewedBy,
      applied_player_id: playerId,
    })
    .eq("id", proposalId);

  if (updateError) {
    // We've already created the players row; rolling it back is worse
    // than leaving the proposal flagged. Surface the error so the
    // moderator can fix the proposal status manually.
    return {
      ok: false,
      error: `players inserted but proposal status update failed: ${updateError.message}`,
      player_id: playerId,
      slug,
    };
  }

  return { ok: true, player_id: playerId, slug };
}

export async function rejectPlayerProposal(
  supabaseAdmin: SupabaseClient,
  proposalId: string,
  reviewedBy: string
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabaseAdmin
    .from("player_proposals")
    .update({
      status: "rejected",
      reviewed_at: new Date().toISOString(),
      reviewed_by: reviewedBy,
    })
    .eq("id", proposalId)
    .eq("status", "pending_review");

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

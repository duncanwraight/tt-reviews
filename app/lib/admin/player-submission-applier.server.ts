import type { SupabaseClient } from "@supabase/supabase-js";
import { generateSlug } from "../revspin.server";

/**
 * TT-115: apply an approved player submission by creating the
 * canonical `players` row.
 *
 * Lives outside the route so unit tests can drive it with a mocked
 * Supabase client and the Discord moderation engine can call it on a
 * second-Discord-approval status flip (TT-111 umbrella). Steps, in
 * order:
 *
 *   1. Read the player_submissions row.
 *   2. Generate a slug from the submitted name (single attempt;
 *      collisions surface as the players.slug UNIQUE violation —
 *      preserved from the inline route behavior, improvements out of
 *      scope per TT-115).
 *   3. INSERT into `players` with the submission columns the form
 *      captures (name, slug, highest_rating, active_years,
 *      playing_style, birth_country, represents, image_key, active=true).
 *
 * Out of scope (per TT-115 brief): restoring the equipment_setup +
 * videos cascade behavior the original DB trigger had. The current
 * admin route doesn't carry it forward and the applier preserves
 * parity. If we want it back, file a separate child.
 */
export interface ApplyResult {
  success: boolean;
  error?: string;
}

export async function applyPlayerSubmission(
  supabaseAdmin: SupabaseClient,
  submissionId: string
): Promise<ApplyResult> {
  const { data: submission, error: readError } = await supabaseAdmin
    .from("player_submissions")
    .select("*")
    .eq("id", submissionId)
    .single();
  if (readError || !submission) {
    return {
      success: false,
      error: readError?.message || "Player submission not found",
    };
  }

  const slug = generateSlug(submission.name);

  const { error: insertError } = await supabaseAdmin.from("players").insert({
    name: submission.name,
    slug,
    highest_rating: submission.highest_rating,
    active_years: submission.active_years,
    playing_style: submission.playing_style,
    birth_country: submission.birth_country,
    represents: submission.represents,
    active: true,
    image_key: submission.image_key,
  });

  if (insertError) {
    return { success: false, error: insertError.message };
  }

  return { success: true };
}

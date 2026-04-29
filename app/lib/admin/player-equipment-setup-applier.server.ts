import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * TT-117: apply an approved player_equipment_setup_submissions row by
 * creating the canonical `player_equipment_setups` row.
 *
 * Two related fixes ride on this:
 *
 *   (a) The admin route used to bypass moderationService.recordApproval
 *       entirely and do its own UPDATE on the submission status. That
 *       skipped the two-approval workflow, the moderator_approvals
 *       audit trail, and the trigger-driven status field. Normalising
 *       to recordApproval-then-apply is part of TT-117, not this file
 *       alone.
 *
 *   (b) Discord-approved setups went through recordApproval (via the
 *       generic engine) but no apply ran, so player_equipment_setups
 *       never got a row. This applier closes that.
 *
 * Steps:
 *   1. Read the submission row.
 *   2. Map forehand_side / backhand_side ("forehand" / "backhand") to
 *      the rubber_color enum (red / black). The form represents physical
 *      colour by which side of the bat carries it; "forehand" === red,
 *      "backhand" === black, anything else → null. Preserves the
 *      existing inline mapping behaviour.
 *   3. INSERT into player_equipment_setups with verified=true so the
 *      row appears immediately in EquipmentTimeline (the public read
 *      filters .eq("verified", true)).
 */
export interface ApplyResult {
  success: boolean;
  error?: string;
}

function mapSideToColor(side: unknown): "red" | "black" | null {
  if (side === "forehand") return "red";
  if (side === "backhand") return "black";
  return null;
}

export async function applyPlayerEquipmentSetup(
  supabaseAdmin: SupabaseClient,
  submissionId: string
): Promise<ApplyResult> {
  const { data: submission, error: readError } = await supabaseAdmin
    .from("player_equipment_setup_submissions")
    .select("*")
    .eq("id", submissionId)
    .single();
  if (readError || !submission) {
    return {
      success: false,
      error: readError?.message || "Player equipment setup not found",
    };
  }

  const { error: insertError } = await supabaseAdmin
    .from("player_equipment_setups")
    .insert({
      player_id: submission.player_id,
      year: submission.year,
      blade_id: submission.blade_id,
      forehand_rubber_id: submission.forehand_rubber_id,
      forehand_thickness: submission.forehand_thickness,
      forehand_color: mapSideToColor(submission.forehand_side),
      backhand_rubber_id: submission.backhand_rubber_id,
      backhand_thickness: submission.backhand_thickness,
      backhand_color: mapSideToColor(submission.backhand_side),
      source_url: submission.source_url,
      source_type: submission.source_type,
      verified: true,
    });

  if (insertError) {
    return { success: false, error: insertError.message };
  }

  return { success: true };
}

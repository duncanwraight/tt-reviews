import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * TT-113: apply an approved player_edit to the players row.
 *
 * Lives outside the route so unit tests can drive it with a mocked
 * Supabase client and the Discord moderation engine can call it on a
 * second-Discord-approval status flip (TT-111 umbrella). Steps, in
 * order:
 *
 *   1. Read the edit row.
 *   2. Build the updates object from `edit_data`, dropping `edit_reason`
 *      (a per-edit note that lives on the edit row, not the player row).
 *   3. Promote `image_key` if the submitter staged a replacement image
 *      on the edit row itself (player-edit currently stages the image
 *      directly on the row rather than to R2 — no bucket arg needed).
 *   4. UPDATE the matching `players` row.
 *
 * Returns `{ success: true }` with no UPDATE when there's nothing to
 * apply (empty edit_data, no image_key, only an edit_reason) — a
 * defensible state, not an error.
 */
export interface ApplyResult {
  success: boolean;
  error?: string;
}

export async function applyPlayerEdit(
  supabaseAdmin: SupabaseClient,
  editId: string
): Promise<ApplyResult> {
  const { data: edit, error: editError } = await supabaseAdmin
    .from("player_edits")
    .select("*")
    .eq("id", editId)
    .single();
  if (editError || !edit) {
    return {
      success: false,
      error: editError?.message || "Player edit not found",
    };
  }

  if (!edit.player_id) {
    return { success: false, error: "Player edit has no player_id" };
  }

  const updateData: Record<string, unknown> = {};
  if (edit.edit_data && typeof edit.edit_data === "object") {
    const { edit_reason: _editReason, ...editableFields } =
      edit.edit_data as Record<string, unknown>;
    Object.assign(updateData, editableFields);
  }

  if (edit.image_key) {
    updateData.image_key = edit.image_key;
  }

  if (Object.keys(updateData).length === 0) {
    return { success: true };
  }

  const { error: updateError } = await supabaseAdmin
    .from("players")
    .update(updateData)
    .eq("id", edit.player_id);

  if (updateError) {
    return { success: false, error: updateError.message };
  }

  return { success: true };
}

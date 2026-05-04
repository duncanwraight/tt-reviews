import type { SupabaseClient } from "@supabase/supabase-js";
import { generateSlug } from "../revspin.server";

/**
 * TT-114: apply an approved equipment submission by creating the
 * canonical `equipment` row.
 *
 * Lives outside the route so unit tests can drive it with a mocked
 * Supabase client and the Discord moderation engine can call it on a
 * second-Discord-approval status flip (TT-111 umbrella). Steps, in
 * order:
 *
 *   1. Read the equipment_submissions row.
 *   2. Generate a slug from the submitted name (single attempt;
 *      collisions surface as the equipment.slug UNIQUE violation —
 *      preserved from the inline route behavior, improvements out of
 *      scope per TT-114).
 *   3. INSERT into `equipment` with the manufacturer-spec columns the
 *      submission flow captures (name, slug, manufacturer, category,
 *      subcategory, specifications, description, image_key).
 *
 * Image attribution columns (image_credit_text, image_license_*, etc.)
 * are not set here — the submit flow doesn't capture them, and the
 * admin can fill them in via existing tooling after the row exists.
 */
export interface ApplyResult {
  success: boolean;
  error?: string;
}

export async function applyEquipmentSubmission(
  supabaseAdmin: SupabaseClient,
  submissionId: string
): Promise<ApplyResult> {
  const { data: submission, error: readError } = await supabaseAdmin
    .from("equipment_submissions")
    .select("*")
    .eq("id", submissionId)
    .single();
  if (readError || !submission) {
    return {
      success: false,
      error: readError?.message || "Equipment submission not found",
    };
  }

  // Slug includes the manufacturer (TT-163); submission.name is the bare
  // model post-migration, so concatenate to build the brand-prefixed slug.
  const slug = generateSlug(`${submission.manufacturer} ${submission.name}`);

  const { error: insertError } = await supabaseAdmin.from("equipment").insert({
    name: submission.name,
    slug,
    manufacturer: submission.manufacturer,
    category: submission.category,
    subcategory: submission.subcategory,
    specifications: submission.specifications,
    description: submission.description,
    image_key: submission.image_key,
  });

  if (insertError) {
    return { success: false, error: insertError.message };
  }

  return { success: true };
}

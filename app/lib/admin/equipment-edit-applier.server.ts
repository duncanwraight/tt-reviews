import type { SupabaseClient } from "@supabase/supabase-js";
import { generateSlug } from "../revspin.server";
import { createCategoryService } from "../categories.server";
import { Logger, createLogContext } from "../logger.server";
import { generateImageKey, deleteImageFromR2Native } from "../r2-native.server";
import { recordSlugRedirect } from "../slug-redirects.server";

/**
 * TT-105: apply an approved equipment_edit to the equipment row.
 *
 * Lives outside the route so unit tests can drive it with a mocked
 * Supabase client and R2 bucket. Steps, in order:
 *
 *   1. Read the edit row + the current equipment row.
 *   2. Stage scalar field changes (name, category, subcategory, description).
 *   3. Compute the final specifications JSONB:
 *      - Merge current specs with edit_data.specifications.
 *      - `null` values in the edit signal removal.
 *      - If (category, subcategory) changed, drop any keys that aren't
 *        valid spec fields for the new parent — picks up after the
 *        submitter deliberately re-shaped the spec set on the form.
 *   4. Regenerate the slug if name changed (with -2 / -3 / … suffixing
 *      to avoid collisions). The old slug becomes unreachable; that
 *      tradeoff is documented in TT-74.
 *   5. Promote the staged image (if image_action === "replace" and
 *      image_pending_key is set): copy the bytes to a canonical
 *      `equipment/<slug>/<ts>.<ext>` key, queue the previous image
 *      for cleanup, reset image_credit_* to a community-submitted
 *      default. R2 failure here aborts before any DB write so the
 *      row never lands in a half-updated state.
 *   6. Run the equipment UPDATE.
 *   7. Best-effort delete of the replaced canonical key + the staged
 *      key — failures here are logged at the call site, not surfaced
 *      to the user (the new image already won; orphaned bytes are
 *      sweepable later).
 */
export interface ApplyResult {
  success: boolean;
  error?: string;
}

export async function applyEquipmentEdit(
  supabaseAdmin: SupabaseClient,
  bucket: R2Bucket | undefined,
  editId: string
): Promise<ApplyResult> {
  const { data: edit, error: editError } = await supabaseAdmin
    .from("equipment_edits")
    .select("*")
    .eq("id", editId)
    .single();
  if (editError || !edit) {
    return {
      success: false,
      error: editError?.message || "Equipment edit not found",
    };
  }

  const { data: current, error: currentError } = await supabaseAdmin
    .from("equipment")
    .select("*")
    .eq("id", edit.equipment_id)
    .single();
  if (currentError || !current) {
    return {
      success: false,
      error: currentError?.message || "Equipment row not found",
    };
  }

  const editData = (edit.edit_data || {}) as Record<string, unknown>;
  const updates: Record<string, unknown> = {};

  // Scalar fields the form lets the user edit.
  for (const field of [
    "name",
    "category",
    "subcategory",
    "description",
  ] as const) {
    if (field in editData) {
      updates[field] = editData[field];
    }
  }

  const finalCategory =
    "category" in updates
      ? (updates.category as string)
      : (current.category as string);
  const finalSubcategory =
    "subcategory" in updates
      ? (updates.subcategory as string | null)
      : (current.subcategory as string | null);

  const categoryShifted = "category" in updates || "subcategory" in updates;

  if (editData.specifications || categoryShifted) {
    const merged: Record<string, unknown> = {
      ...((current.specifications as Record<string, unknown>) || {}),
    };

    if (editData.specifications) {
      for (const [key, value] of Object.entries(
        editData.specifications as Record<string, unknown>
      )) {
        if (value === null) {
          delete merged[key];
        } else {
          merged[key] = value;
        }
      }
    }

    if (categoryShifted) {
      const categoryService = createCategoryService(supabaseAdmin);
      const validFields = await categoryService.getEquipmentSpecFields(
        finalCategory,
        finalSubcategory ?? undefined
      );
      const validKeys = new Set(validFields.map(f => f.value));
      for (const key of Object.keys(merged)) {
        if (!validKeys.has(key)) {
          delete merged[key];
        }
      }
    }

    updates.specifications = merged;
  }

  // Slug regeneration on name change. excludeId stops the row's
  // current slug from showing up as a "collision" with itself. The
  // (current.slug → updates.slug) redirect row is recorded after the
  // equipment UPDATE lands so the old URL keeps 301-forwarding to
  // the new one (TT-141). Slugs include the manufacturer (TT-163);
  // since manufacturer is not editable via edits, current.manufacturer
  // is the canonical source.
  if (
    "name" in updates &&
    typeof updates.name === "string" &&
    updates.name &&
    updates.name !== current.name
  ) {
    const baseSlug = generateSlug(`${current.manufacturer} ${updates.name}`);
    updates.slug = await ensureUniqueSlug(
      supabaseAdmin,
      baseSlug,
      edit.equipment_id
    );
  }

  // Image promotion.
  let replacedImageKey: string | null = null;
  if (
    editData.image_action === "replace" &&
    typeof editData.image_pending_key === "string" &&
    bucket
  ) {
    const stagedKey = editData.image_pending_key;
    const slugForImage =
      (updates.slug as string | undefined) || (current.slug as string);
    const ext = stagedKey.split(".").pop() || "jpg";
    const newImageKey = generateImageKey("equipment", slugForImage, ext);

    const stagedObj = await bucket.get(stagedKey);
    if (!stagedObj) {
      return {
        success: false,
        error: `Staged image not found at ${stagedKey}`,
      };
    }
    const buffer = await stagedObj.arrayBuffer();
    const contentType = stagedObj.httpMetadata?.contentType || "image/jpeg";

    await bucket.put(newImageKey, buffer, {
      httpMetadata: { contentType },
      customMetadata: { promotedAt: new Date().toISOString() },
    });

    if (current.image_key) replacedImageKey = current.image_key as string;

    updates.image_key = newImageKey;
    // Replacing the image invalidates any previous attribution / trim
    // — reset to a community-submission default. Admins can refine
    // later via existing tooling.
    updates.image_credit_text = "community submission";
    updates.image_credit_link = null;
    updates.image_source_url = null;
    updates.image_trim_kind = null;
  }

  if (Object.keys(updates).length === 0) {
    return { success: true };
  }

  const { error: updateError } = await supabaseAdmin
    .from("equipment")
    .update(updates)
    .eq("id", edit.equipment_id);

  if (updateError) {
    return { success: false, error: updateError.message };
  }

  // TT-141: record the slug rename so the old URL keeps 301-
  // forwarding. recordSlugRedirect is a no-op when slugs match. The
  // moderator who approved the edit (or null when applied via the
  // Discord 2nd-approval pathway and moderator_id wasn't set) becomes
  // the redirect's audit trail.
  //
  // A failure here is non-fatal — the rename UPDATE has already
  // landed and is correct; only the back-link from the old slug is
  // missing. We log inside the applier (rather than surfacing a
  // success+error result) because both callers gate logging on
  // `!success` — they'd silently drop the warning otherwise. We also
  // deliberately don't early-return: the R2 cleanup blocks below
  // must still run regardless, or every redirect-record failure on a
  // rename+image edit would leak two R2 objects.
  if (
    typeof updates.slug === "string" &&
    updates.slug !== (current.slug as string)
  ) {
    const slugResult = await recordSlugRedirect(
      supabaseAdmin,
      "equipment",
      current.slug as string,
      updates.slug,
      (edit.moderator_id as string | null) ?? null
    );
    if (!slugResult.ok) {
      Logger.error(
        "equipment-edit-applier.slug-redirect.failed",
        createLogContext("equipment-edit-applier", {
          source: "equipment-edit-applier",
          editId,
          equipmentId: edit.equipment_id as string,
          oldSlug: current.slug as string,
          newSlug: updates.slug,
          reason: slugResult.error,
        })
      );
    }
  }

  // Best-effort R2 cleanup once the row update has landed. Failures
  // here are non-fatal — the new state is correct, just leaves orphan
  // bytes that a sweep can pick up.
  if (bucket && replacedImageKey) {
    try {
      await deleteImageFromR2Native(bucket, replacedImageKey);
    } catch {
      // swallowed by design
    }
  }
  if (
    bucket &&
    typeof editData.image_pending_key === "string" &&
    editData.image_action === "replace"
  ) {
    try {
      await deleteImageFromR2Native(bucket, editData.image_pending_key);
    } catch {
      // swallowed
    }
  }

  return { success: true };
}

async function ensureUniqueSlug(
  supabaseAdmin: SupabaseClient,
  baseSlug: string,
  excludeId: string
): Promise<string> {
  let candidate = baseSlug;
  let suffix = 1;
  while (true) {
    const { data } = await supabaseAdmin
      .from("equipment")
      .select("id")
      .eq("slug", candidate)
      .neq("id", excludeId)
      .maybeSingle();
    if (!data) return candidate;
    suffix++;
    candidate = `${baseSlug}-${suffix}`;
  }
}

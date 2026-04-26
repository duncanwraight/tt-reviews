// Admin review-queue actions for equipment photo candidates: pick one,
// reject one, "none of these", re-source. The action route delegates
// here so each action can be unit-tested without spinning up a route.
//
// All four actions share the cleanup primitive `deleteCandidates`:
// remove the staged CF Images blobs AND their DB rows. Orphaning a CF
// image would burn paid storage; orphaning a DB row would leave a
// dangling pointer.

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  deleteImageFromCloudflare,
  type CloudflareImagesEnv,
} from "../images/cloudflare";
import {
  sourcePhotosForEquipment,
  type SourcingEnv,
  type SourcingResult,
} from "./source.server";

export interface ReviewDeps {
  // Defaults to the lib's CF Images delete; overridable for tests.
  deleteCfImage?: (env: CloudflareImagesEnv, imageId: string) => Promise<void>;
  // Defaults to the lib's source helper; overridable for tests.
  resource?: (
    supabase: SupabaseClient,
    env: SourcingEnv,
    slug: string,
    options?: { limit?: number }
  ) => Promise<SourcingResult>;
}

export interface PickArgs {
  equipmentId: string;
  candidateId: string;
  pickedBy: string;
}

export interface PickResult {
  equipmentId: string;
  pickedCfImageId: string;
}

interface CandidateRow {
  id: string;
  equipment_id: string;
  cf_image_id: string;
  source_url: string | null;
  image_source_host: string | null;
  source_label: string | null;
  picked_at: string | null;
}

async function loadCandidatesForEquipment(
  supabase: SupabaseClient,
  equipmentId: string
): Promise<CandidateRow[]> {
  const { data, error } = await supabase
    .from("equipment_photo_candidates")
    .select(
      "id, equipment_id, cf_image_id, source_url, image_source_host, source_label, picked_at"
    )
    .eq("equipment_id", equipmentId);
  if (error) {
    throw new Error(`load candidates failed: ${error.message}`);
  }
  return (data ?? []) as CandidateRow[];
}

// Delete an array of candidate rows from the DB and their associated
// CF Images. CF deletes are best-effort — a 404 from CF is silently
// fine (helper handles), other failures bubble up so the caller can
// surface them. DB delete runs first so a partial CF failure leaves
// the queue in a consistent state (no rows pointing at orphaned IDs).
async function deleteCandidates(
  supabase: SupabaseClient,
  env: CloudflareImagesEnv,
  candidates: CandidateRow[],
  deleteCfImage: ReviewDeps["deleteCfImage"] = deleteImageFromCloudflare
): Promise<void> {
  if (candidates.length === 0) return;
  const ids = candidates.map(c => c.id);
  const { error } = await supabase
    .from("equipment_photo_candidates")
    .delete()
    .in("id", ids);
  if (error) {
    throw new Error(`candidate delete failed: ${error.message}`);
  }
  await Promise.all(
    candidates.map(c =>
      deleteCfImage(env, c.cf_image_id).catch(() => undefined)
    )
  );
}

// Pick a candidate as the equipment's image. Promotes its CF Image ID
// onto equipment.image_key with the `cf/` prefix the api.images route
// understands, copies attribution fields, marks the candidate
// picked_at/picked_by, and deletes the rest.
export async function pickCandidate(
  supabase: SupabaseClient,
  env: CloudflareImagesEnv,
  args: PickArgs,
  deps: ReviewDeps = {}
): Promise<PickResult> {
  const candidates = await loadCandidatesForEquipment(
    supabase,
    args.equipmentId
  );
  const picked = candidates.find(c => c.id === args.candidateId);
  if (!picked) {
    throw new Error("candidate not found for this equipment");
  }
  if (picked.picked_at) {
    throw new Error("candidate already picked");
  }

  const imageKey = `cf/${picked.cf_image_id}`;
  const imageEtag = picked.cf_image_id.slice(0, 8);

  const updates: Record<string, unknown> = {
    image_key: imageKey,
    image_etag: imageEtag,
    image_source_url: picked.source_url,
  };
  if (picked.image_source_host) {
    updates.image_credit_text = picked.image_source_host;
    updates.image_credit_link = picked.source_url ?? null;
  }

  const { error: equipmentError } = await supabase
    .from("equipment")
    .update(updates)
    .eq("id", args.equipmentId);
  if (equipmentError) {
    throw new Error(`equipment update failed: ${equipmentError.message}`);
  }

  const { error: pickError } = await supabase
    .from("equipment_photo_candidates")
    .update({
      picked_at: new Date().toISOString(),
      picked_by: args.pickedBy,
    })
    .eq("id", picked.id);
  if (pickError) {
    throw new Error(`pick mark failed: ${pickError.message}`);
  }

  // Drop the runners-up — their CF Images blobs and rows.
  const losers = candidates.filter(c => c.id !== picked.id);
  await deleteCandidates(supabase, env, losers, deps.deleteCfImage);

  return { equipmentId: args.equipmentId, pickedCfImageId: picked.cf_image_id };
}

// Reject a single candidate: delete its CF Images blob + DB row. Other
// candidates for the same equipment row stay; admin can pick another
// or re-source.
export async function rejectCandidate(
  supabase: SupabaseClient,
  env: CloudflareImagesEnv,
  candidateId: string,
  deps: ReviewDeps = {}
): Promise<void> {
  const { data, error } = await supabase
    .from("equipment_photo_candidates")
    .select(
      "id, cf_image_id, equipment_id, source_url, image_source_host, source_label, picked_at"
    )
    .eq("id", candidateId)
    .maybeSingle();
  if (error) throw new Error(`reject lookup failed: ${error.message}`);
  if (!data) throw new Error("candidate not found");
  const row = data as CandidateRow;
  if (row.picked_at) {
    throw new Error("cannot reject a picked candidate");
  }
  await deleteCandidates(supabase, env, [row], deps.deleteCfImage);
}

// "None of these": skip the equipment row permanently (until an admin
// manually clears image_skipped_at) and clean up all its candidates.
export async function skipEquipment(
  supabase: SupabaseClient,
  env: CloudflareImagesEnv,
  equipmentId: string,
  deps: ReviewDeps = {}
): Promise<void> {
  const candidates = await loadCandidatesForEquipment(supabase, equipmentId);
  const pending = candidates.filter(c => !c.picked_at);
  await deleteCandidates(supabase, env, pending, deps.deleteCfImage);
  const { error } = await supabase
    .from("equipment")
    .update({ image_skipped_at: new Date().toISOString() })
    .eq("id", equipmentId);
  if (error) throw new Error(`skip update failed: ${error.message}`);
}

// Re-source: throw away existing pending candidates and run the
// sourcing pipeline again. Useful when Brave's index has updated since
// the last attempt or the original candidates were all bad.
export async function resourceEquipment(
  supabase: SupabaseClient,
  env: SourcingEnv,
  equipmentId: string,
  slug: string,
  deps: ReviewDeps = {}
): Promise<SourcingResult> {
  const candidates = await loadCandidatesForEquipment(supabase, equipmentId);
  const pending = candidates.filter(c => !c.picked_at);
  await deleteCandidates(supabase, env, pending, deps.deleteCfImage);
  const sourceFn = deps.resource ?? sourcePhotosForEquipment;
  return sourceFn(supabase, env, slug);
}

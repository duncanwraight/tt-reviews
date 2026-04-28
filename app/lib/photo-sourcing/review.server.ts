// Admin review-queue actions for equipment photo candidates: pick one,
// reject one, "none of these", re-source. The action route delegates
// here so each action can be unit-tested without spinning up a route.
//
// Cleanup primitive `deleteCandidates`: remove the staged R2 objects
// AND their DB rows. Orphaning an R2 object would burn storage;
// orphaning a DB row would leave a dangling pointer. R2 deletes are
// best-effort — the delete is wrapped in .catch so a transient
// failure doesn't break the DB-side consistency.

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  sourcePhotosForEquipment,
  type R2PutBucket,
  type SourcingEnv,
  type SourcingResult,
} from "./source.server";
import { detectTransparentEdges, type TrimDetectDeps } from "./trim-detect";

// R2 surface used by review actions: put (proxied for re-source) +
// delete + get (so pickCandidate can read the picked bytes for
// transparent-edge detection). We extend `R2PutBucket` rather than
// redeclare to keep the shape consistent.
export interface R2BucketSurface extends R2PutBucket {
  delete(key: string): Promise<unknown>;
  get(key: string): Promise<R2GetResult | null>;
}

// Minimal R2 GetObject surface — enough for pickCandidate's trim
// detection without dragging the @cloudflare/workers-types dependency
// into the test surface.
export interface R2GetResult {
  arrayBuffer(): Promise<ArrayBuffer>;
  httpMetadata?: { contentType?: string | null } | null;
}

export interface ReviewDeps {
  // Defaults to the lib's source helper; overridable for tests.
  resource?: (
    supabase: SupabaseClient,
    bucket: R2PutBucket,
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
  pickedR2Key: string;
}

interface CandidateRow {
  id: string;
  equipment_id: string;
  r2_key: string;
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
      "id, equipment_id, r2_key, source_url, image_source_host, source_label, picked_at"
    )
    .eq("equipment_id", equipmentId);
  if (error) {
    throw new Error(`load candidates failed: ${error.message}`);
  }
  return (data ?? []) as CandidateRow[];
}

// Delete an array of candidate rows from the DB and their R2 objects.
// DB delete runs first so a partial R2 failure leaves the queue in a
// consistent state (no rows pointing at orphaned objects). R2 deletes
// are wrapped in .catch — orphaned bytes are recoverable later, and a
// transient R2 failure shouldn't abort the action.
async function deleteCandidates(
  supabase: SupabaseClient,
  bucket: R2BucketSurface,
  candidates: CandidateRow[]
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
    candidates.map(c => bucket.delete(c.r2_key).catch(() => undefined))
  );
}

// Pick a candidate as the equipment's image. Promotes its R2 key onto
// equipment.image_key, copies attribution fields, marks the candidate
// picked_at/picked_by, and deletes the rest. Runs transparent-edge
// detection (TT-88) on the picked bytes and sets image_trim_kind='auto'
// when corners are alpha=0; failure to detect leaves the column null
// (manual button still works).
export async function pickCandidate(
  supabase: SupabaseClient,
  bucket: R2BucketSurface,
  args: PickArgs,
  trimDeps: TrimDetectDeps = {}
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

  const updates: Record<string, unknown> = {
    image_key: picked.r2_key,
    image_etag: picked.r2_key.slice(-12),
    image_source_url: picked.source_url,
  };
  if (picked.image_source_host) {
    updates.image_credit_text = picked.image_source_host;
    updates.image_credit_link = picked.source_url ?? null;
  }

  // Auto-trim detection: only PNG/WebP carry alpha. We infer format
  // from the R2 key extension because the picked candidate doesn't
  // store a content-type column. Fetching the GetObject + decoding is
  // wrapped in a try/catch in detectTransparentEdges, so this code
  // path can never block the pick on a transient R2 / decode failure.
  const ext = picked.r2_key.split(".").pop()?.toLowerCase() ?? "";
  const inferredContentType =
    ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";

  if (ext === "png" || ext === "webp") {
    try {
      const obj = await bucket.get(picked.r2_key);
      if (obj) {
        const bytes = await obj.arrayBuffer();
        const isTransparent = await detectTransparentEdges(
          bytes,
          inferredContentType,
          trimDeps
        );
        if (isTransparent) {
          updates.image_trim_kind = "auto";
        }
      }
    } catch {
      // Detection is best-effort; the manual button covers the gap.
    }
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

  // Drop the runners-up — their R2 objects and rows.
  const losers = candidates.filter(c => c.id !== picked.id);
  await deleteCandidates(supabase, bucket, losers);

  return { equipmentId: args.equipmentId, pickedR2Key: picked.r2_key };
}

// Toggle equipment.image_trim_kind between 'border' and NULL. Used by
// the admin "Trim white edges" button on the public equipment detail
// page. The 'auto' state set by pickCandidate is also cleared by this —
// admin override wins.
export async function toggleEquipmentTrim(
  supabase: SupabaseClient,
  equipmentId: string
): Promise<{ next: "border" | null }> {
  const { data, error: readError } = await supabase
    .from("equipment")
    .select("image_trim_kind")
    .eq("id", equipmentId)
    .maybeSingle();
  if (readError) {
    throw new Error(`trim read failed: ${readError.message}`);
  }
  if (!data) {
    throw new Error("equipment not found");
  }
  const current = (data as { image_trim_kind: string | null }).image_trim_kind;
  const next: "border" | null = current ? null : "border";
  const { error: writeError } = await supabase
    .from("equipment")
    .update({ image_trim_kind: next })
    .eq("id", equipmentId);
  if (writeError) {
    throw new Error(`trim write failed: ${writeError.message}`);
  }
  return { next };
}

// Reject a single candidate: delete its R2 object + DB row. Other
// candidates for the same equipment row stay; admin can pick another
// or re-source.
export async function rejectCandidate(
  supabase: SupabaseClient,
  bucket: R2BucketSurface,
  candidateId: string
): Promise<void> {
  const { data, error } = await supabase
    .from("equipment_photo_candidates")
    .select(
      "id, r2_key, equipment_id, source_url, image_source_host, source_label, picked_at"
    )
    .eq("id", candidateId)
    .maybeSingle();
  if (error) throw new Error(`reject lookup failed: ${error.message}`);
  if (!data) throw new Error("candidate not found");
  const row = data as CandidateRow;
  if (row.picked_at) {
    throw new Error("cannot reject a picked candidate");
  }
  await deleteCandidates(supabase, bucket, [row]);
}

// "None of these": skip the equipment row permanently (until an admin
// manually clears image_skipped_at) and clean up all its candidates.
export async function skipEquipment(
  supabase: SupabaseClient,
  bucket: R2BucketSurface,
  equipmentId: string
): Promise<void> {
  const candidates = await loadCandidatesForEquipment(supabase, equipmentId);
  const pending = candidates.filter(c => !c.picked_at);
  await deleteCandidates(supabase, bucket, pending);
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
  bucket: R2BucketSurface,
  env: SourcingEnv,
  equipmentId: string,
  slug: string,
  deps: ReviewDeps = {}
): Promise<SourcingResult> {
  const candidates = await loadCandidatesForEquipment(supabase, equipmentId);
  const pending = candidates.filter(c => !c.picked_at);
  await deleteCandidates(supabase, bucket, pending);
  const sourceFn = deps.resource ?? sourcePhotosForEquipment;
  return sourceFn(supabase, bucket, env, slug);
}

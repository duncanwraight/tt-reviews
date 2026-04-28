// Admin-only direct upload of an equipment image (TT-99). Bridges the
// gap when Brave / retailer providers find nothing usable: the admin
// picks a file from disk on /equipment/:slug, the action route below
// delegates here, and the bytes land at
// equipment/<slug>/manual/<uuid>.<ext> with image_credit_text='manual
// upload'. Re-uploading replaces the previous image_key and best-
// effort deletes the old R2 object.
//
// Pure-function shape (Supabase + R2 surfaces injected) so the
// validation + replace-vs-fresh logic is unit-testable without React
// Router or Cloudflare bindings.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { R2BucketSurface } from "./review.server";
import {
  ALLOWED_UPLOAD_MIMES,
  MAX_UPLOAD_BYTES,
  type AllowedUploadMime,
} from "./upload-constants";

export {
  ALLOWED_UPLOAD_MIMES,
  MAX_UPLOAD_BYTES,
  type AllowedUploadMime,
} from "./upload-constants";

// Thrown when the submitted file fails MIME or size checks. Caught in
// the route action and turned into a 400 response; everything else
// surfaces as a 500.
export class UploadValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UploadValidationError";
  }
}

export interface UploadArgs {
  equipmentId: string;
  slug: string;
  file: { type: string; size: number; arrayBuffer(): Promise<ArrayBuffer> };
}

export interface UploadDeps {
  randomId?: () => string;
}

export interface UploadResult {
  image_key: string;
  replacedKey: string | null;
}

export async function uploadEquipmentImage(
  supabase: SupabaseClient,
  bucket: R2BucketSurface,
  args: UploadArgs,
  deps: UploadDeps = {}
): Promise<UploadResult> {
  const { file, slug, equipmentId } = args;

  if (!isAllowedMime(file.type)) {
    throw new UploadValidationError(
      `unsupported file type: ${file.type || "unknown"}`
    );
  }
  if (file.size === 0) {
    throw new UploadValidationError("empty file");
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new UploadValidationError(
      `file exceeds ${MAX_UPLOAD_BYTES} byte limit`
    );
  }

  // Snapshot the existing image_key first so we know what to delete
  // from R2 after the DB update succeeds. Doing this before the put
  // means a concurrent re-upload can't lose the previous key.
  const { data: existing, error: lookupErr } = await supabase
    .from("equipment")
    .select("image_key")
    .eq("id", equipmentId)
    .maybeSingle();
  if (lookupErr) {
    throw new Error(`equipment lookup failed: ${lookupErr.message}`);
  }
  if (!existing) {
    throw new Error("equipment not found");
  }
  const previousKey =
    (existing as { image_key: string | null }).image_key ?? null;

  const ext = extFromMime(file.type as AllowedUploadMime);
  const randomId = deps.randomId ?? (() => crypto.randomUUID());
  const key = `equipment/${slug}/manual/${randomId()}.${ext}`;

  const bytes = new Uint8Array(await file.arrayBuffer());
  await bucket.put(key, bytes, {
    httpMetadata: { contentType: file.type },
    customMetadata: {
      equipment_id: equipmentId,
      equipment_slug: slug,
      source_label: "manual_upload",
      uploadedAt: new Date().toISOString(),
    },
  });

  const { error: updateErr } = await supabase
    .from("equipment")
    .update({
      image_key: key,
      image_etag: key.slice(-12),
      image_credit_text: "manual upload",
      image_credit_link: null,
      image_source_url: null,
      image_license_short: null,
      image_license_url: null,
      image_skipped_at: null,
      image_trim_kind: null,
    })
    .eq("id", equipmentId);

  if (updateErr) {
    // Roll back the just-PUT object so a failed DB update doesn't
    // leave an orphan in R2. Best effort — we still surface the DB
    // error to the caller either way.
    await bucket.delete(key).catch(() => undefined);
    throw new Error(`equipment update failed: ${updateErr.message}`);
  }

  // Best-effort R2 cleanup of the previous image. A transient R2
  // failure leaves the old object orphaned in storage but the DB row
  // already points at the new key — the user-visible side is correct.
  if (previousKey && previousKey !== key) {
    await bucket.delete(previousKey).catch(() => undefined);
  }

  return { image_key: key, replacedKey: previousKey };
}

function isAllowedMime(mime: string): mime is AllowedUploadMime {
  return (ALLOWED_UPLOAD_MIMES as readonly string[]).includes(mime);
}

function extFromMime(mime: AllowedUploadMime): string {
  switch (mime) {
    case "image/jpeg":
      return "jpg";
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
  }
}

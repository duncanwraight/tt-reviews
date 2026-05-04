// TT-166: per-equipment photo-sourcing re-queue. The admin button on
// /equipment/:slug calls this — drop existing un-picked candidate rows
// (otherwise source.server.ts's source_url dedupe will skip every URL
// it already saw), clear the photo cooldown stamps, then enqueue.
//
// We do NOT delete equipment_photo_candidates with picked_at IS NOT
// NULL — that's the row backing the live equipment.image_key. We also
// do NOT clear equipment.image_key here, so the page keeps its current
// image until an admin picks a new candidate from the next sourcing
// run. R2 objects for the deleted un-picked candidates aren't cleaned
// up — tracked separately as the orphaned-image cleanup ticket.

import type { SupabaseClient } from "@supabase/supabase-js";

import type { PhotoSourceMessage } from "./queue.server";

export interface PhotoSourceQueue {
  send(message: PhotoSourceMessage): Promise<unknown>;
}

export interface RequeuePhotosRow {
  id: string;
  slug: string;
}

export async function requeueOneEquipmentPhotos(
  supabase: SupabaseClient,
  queue: PhotoSourceQueue,
  row: RequeuePhotosRow
): Promise<void> {
  const { error: delError } = await supabase
    .from("equipment_photo_candidates")
    .delete()
    .eq("equipment_id", row.id)
    .is("picked_at", null);
  if (delError) {
    throw new Error(`delete candidates: ${delError.message}`);
  }

  const { error: updError } = await supabase
    .from("equipment")
    .update({ image_sourcing_attempted_at: null, image_skipped_at: null })
    .eq("id", row.id);
  if (updError) {
    throw new Error(`reset cooldown: ${updError.message}`);
  }

  await queue.send({ slug: row.slug });
}

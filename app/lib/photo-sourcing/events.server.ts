// Photo-pipeline activity log (TT-174). Append-only inserts into
// equipment_photo_events for every meaningful pipeline transition.
// The loader for /admin/equipment-photos reads this table directly.
//
// Helper logs and swallows insert failures rather than throwing — an
// audit-log write failure must never abort the underlying pipeline
// step (admin click, queue consumer, cron run). Every emit site lives
// inside a path that's already touching the DB, so a write failure
// here implies the rest of the path is also failing; no value in
// adding a new failure mode at every call site to surface it twice.

import type { SupabaseClient } from "@supabase/supabase-js";

import { Logger, createLogContext } from "../logger.server";

export type PhotoEventKind =
  | "sourcing_attempted"
  | "candidates_found"
  | "no_candidates"
  | "provider_transient"
  | "auto_picked"
  | "routed_to_review"
  | "requeued"
  | "picked"
  | "skipped"
  | "candidate_rejected"
  | "resourced";

export interface RecordPhotoEventArgs {
  equipmentId: string;
  eventKind: PhotoEventKind;
  actorId?: string | null;
  metadata?: Record<string, unknown>;
}

export async function recordPhotoEvent(
  supabase: SupabaseClient,
  args: RecordPhotoEventArgs
): Promise<void> {
  const { error } = await supabase.from("equipment_photo_events").insert({
    equipment_id: args.equipmentId,
    event_kind: args.eventKind,
    actor_id: args.actorId ?? null,
    metadata: args.metadata ?? {},
  });

  if (error) {
    Logger.error(
      "photo.event.insert_failed",
      createLogContext("photo-events", {
        equipmentId: args.equipmentId,
        eventKind: args.eventKind,
      }),
      new Error(error.message)
    );
  }
}

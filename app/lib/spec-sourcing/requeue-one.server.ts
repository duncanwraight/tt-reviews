// TT-166: per-equipment spec-sourcing re-queue. The admin button on
// /equipment/:slug calls this — wipe the proposal row, clear the
// cooldown stamps, and enqueue a single spec-source message so the
// queue consumer (workers/app.ts) picks it up immediately rather than
// waiting for the next 6-hour cron tick.
//
// Mirrors scheduler.server.ts's enqueue payload exactly so the consumer
// path is identical to a normal cron-driven message.

import type { SupabaseClient } from "@supabase/supabase-js";

import type { SpecSourceMessage } from "./types";

export interface SpecSourceQueue {
  send(message: SpecSourceMessage): Promise<unknown>;
}

export interface RequeueSpecsRow {
  id: string;
  slug: string;
  manufacturer: string;
  name: string;
  category: string | null;
  subcategory: string | null;
}

export async function requeueOneEquipmentSpecs(
  supabase: SupabaseClient,
  queue: SpecSourceQueue,
  row: RequeueSpecsRow
): Promise<void> {
  // Drop any prior proposal (pending_review / no_results / applied).
  // The seed exporter's join through `applied` proposals breaks for
  // this row until it's re-applied — same trade-off as the bulk
  // wipe-and-requeue script (TT-165). Acceptable per ticket scope.
  const { error: delError } = await supabase
    .from("equipment_spec_proposals")
    .delete()
    .eq("equipment_id", row.id);
  if (delError) {
    throw new Error(`delete proposal: ${delError.message}`);
  }

  const { error: updError } = await supabase
    .from("equipment")
    .update({ specs_sourced_at: null, specs_source_status: null })
    .eq("id", row.id);
  if (updError) {
    throw new Error(`reset cooldown: ${updError.message}`);
  }

  await queue.send({
    equipmentId: row.id,
    slug: row.slug,
    brand: row.manufacturer,
    name: row.name,
    category: row.category,
    subcategory: row.subcategory,
    attempts: 0,
  });
}

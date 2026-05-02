import type { SupabaseClient } from "@supabase/supabase-js";
import { OLDEST_PENDING_PARAM, OLDEST_PENDING_VALUE } from "./queue-focus";

export interface OldestPendingTarget {
  /** /admin/<queue> route to navigate to. */
  route: string;
  /** ISO timestamp of the oldest pending row. */
  waitingSince: string;
}

const QUEUE_ROUTES: Record<string, string> = {
  equipment_submissions: "/admin/equipment-submissions",
  equipment_edits: "/admin/equipment-edits",
  player_submissions: "/admin/player-submissions",
  player_edits: "/admin/player-edits",
  equipment_reviews: "/admin/equipment-reviews",
  video_submissions: "/admin/video-submissions",
  player_equipment_setup_submissions: "/admin/player-equipment-setups",
};

interface OldestPendingRow {
  table_name?: string;
  waiting_since?: string;
}

/**
 * Across every moderation queue, find the queue holding the globally oldest
 * pending row (status `pending` or `awaiting_second_approval`). Returns null
 * when there are no pending items anywhere — in which case the dashboard
 * hides the "Open next pending" quick-action.
 *
 * Backed by the `get_admin_oldest_pending` RPC — one round-trip across all 7
 * queue tables instead of one PostgREST probe per table.
 */
export async function findOldestPendingTarget(
  supabase: SupabaseClient
): Promise<OldestPendingTarget | null> {
  const { data, error } = await supabase.rpc("get_admin_oldest_pending");
  if (error) throw new Error(error.message);

  const rows = (data ?? []) as OldestPendingRow[];
  const winner = rows[0];
  if (!winner || !winner.table_name || !winner.waiting_since) return null;

  const route = QUEUE_ROUTES[winner.table_name];
  if (!route) return null;
  return {
    route: `${route}?${OLDEST_PENDING_PARAM}=${OLDEST_PENDING_VALUE}`,
    waitingSince: winner.waiting_since,
  };
}

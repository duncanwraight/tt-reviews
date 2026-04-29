import type { SupabaseClient } from "@supabase/supabase-js";
import { OLDEST_PENDING_PARAM, OLDEST_PENDING_VALUE } from "./queue-focus";

const PENDING_STATUSES = ["pending", "awaiting_second_approval"] as const;

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

async function oldestPendingRow(
  supabase: SupabaseClient,
  table: string
): Promise<string | null> {
  const { data, error } = await supabase
    .from(table)
    .select("created_at")
    .in("status", PENDING_STATUSES as unknown as string[])
    .order("created_at", { ascending: true })
    .limit(1);
  if (error || !data || data.length === 0) return null;
  const row = data[0] as { created_at?: string | null };
  return row.created_at ?? null;
}

/**
 * Across every moderation queue, find the queue holding the globally oldest
 * pending row (status `pending` or `awaiting_second_approval`). Returns null
 * when there are no pending items anywhere — in which case the dashboard
 * hides the "Open next pending" quick-action.
 */
export async function findOldestPendingTarget(
  supabase: SupabaseClient
): Promise<OldestPendingTarget | null> {
  const tables = Object.keys(QUEUE_ROUTES);
  const oldestPerTable = await Promise.all(
    tables.map(async table => ({
      table,
      waitingSince: await oldestPendingRow(supabase, table),
    }))
  );

  let winner: { table: string; waitingSince: string } | null = null;
  for (const entry of oldestPerTable) {
    if (entry.waitingSince === null) continue;
    if (winner === null || entry.waitingSince < winner.waitingSince) {
      winner = { table: entry.table, waitingSince: entry.waitingSince };
    }
  }

  if (!winner) return null;
  const route = QUEUE_ROUTES[winner.table];
  if (!route) return null;
  return {
    route: `${route}?${OLDEST_PENDING_PARAM}=${OLDEST_PENDING_VALUE}`,
    waitingSince: winner.waitingSince,
  };
}

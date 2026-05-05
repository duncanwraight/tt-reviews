// Equipment-photo coverage + queue stats (TT-98). Two entry points so
// callers only pay for what they render:
//
//   loadCoverageCounts(supabase)      — 5 cumulative buckets only.
//                                       Cheap (5 parallel head-counts).
//                                       Used by the admin dashboard.
//   loadFullPhotoStats(supabase, env) — coverage + last-hour throughput
//                                       + recent-event log + per-provider
//                                       quota usage. Used by the
//                                       /admin/equipment-photos page.
//
// Recent activity reads from the equipment_photo_events append-only log
// (TT-174) — the canonical record of every pipeline transition. The
// previous shape derived activity from equipment columns + a per-row
// candidate lookup, which only reflected what providers did and missed
// admin-driven actions like requeue / skip / reject.
//
// Provider quota stats read directly from the same KV namespace the
// budget wrapper writes. KV missing or absent keys → zeros, never
// throws.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { PhotoEventKind } from "./events.server";
import { dailyKey, monthlyKey, type BudgetKV } from "./providers/budget";
import {
  DEFAULT_BRAVE_DAILY_CAP,
  DEFAULT_BRAVE_MONTHLY_CAP,
} from "./providers/factory";

export const RECENT_EVENTS_LIMIT = 50;

export interface CoverageCounts {
  picked: number;
  unsourced: number;
  attemptedNoImage: number;
  skipped: number;
  total: number;
}

export interface PhotoEvent {
  id: string;
  equipmentId: string;
  slug: string;
  name: string;
  eventKind: PhotoEventKind;
  actorId: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface ProviderQuotaStats {
  name: string;
  dailyUsed: number;
  dailyCap: number;
  monthlyUsed: number;
  monthlyCap: number;
}

export interface FullPhotoStats {
  counts: CoverageCounts;
  processedLastHour: number;
  recentEvents: PhotoEvent[];
  providerStats: ProviderQuotaStats[];
}

interface FullStatsEnv {
  kv?: BudgetKV;
  braveDailyCap?: number;
  braveMonthlyCap?: number;
  // Test seam — defaults to wall-clock UTC.
  now?: () => Date;
}

async function readKVCount(kv: BudgetKV, key: string): Promise<number> {
  const v = await kv.get(key);
  if (!v) return 0;
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : 0;
}

// Backed by the `get_admin_photo_coverage` RPC — one round-trip with FILTER
// aggregates instead of five head-counts. Combined with the dashboard's other
// RPCs, this keeps the /admin loader well under Cloudflare Workers' 50
// subrequest-per-invocation cap on the Free plan.
export async function loadCoverageCounts(
  supabase: SupabaseClient
): Promise<CoverageCounts> {
  const { data, error } = await supabase.rpc("get_admin_photo_coverage");
  if (error) throw new Error(error.message);
  const row = (data ?? {}) as Partial<CoverageCounts>;
  return {
    picked: row.picked ?? 0,
    unsourced: row.unsourced ?? 0,
    attemptedNoImage: row.attemptedNoImage ?? 0,
    skipped: row.skipped ?? 0,
    total: row.total ?? 0,
  };
}

export async function loadFullPhotoStats(
  supabase: SupabaseClient,
  env: FullStatsEnv = {}
): Promise<FullPhotoStats> {
  const now = env.now ?? (() => new Date());
  const oneHourAgoISO = new Date(
    now().getTime() - 60 * 60 * 1000
  ).toISOString();

  const [counts, lastHour, events] = await Promise.all([
    loadCoverageCounts(supabase),
    supabase
      .from("equipment")
      .select("id", { count: "exact", head: true })
      .gte("image_sourcing_attempted_at", oneHourAgoISO),
    supabase
      .from("equipment_photo_events")
      .select(
        "id, equipment_id, event_kind, actor_id, metadata, created_at, equipment(slug, name)"
      )
      .order("created_at", { ascending: false })
      .limit(RECENT_EVENTS_LIMIT),
  ]);

  type EventRow = {
    id: string;
    equipment_id: string;
    event_kind: PhotoEventKind;
    actor_id: string | null;
    metadata: Record<string, unknown> | null;
    created_at: string;
    equipment: { slug: string; name: string } | null;
  };
  const eventRows = (events.data ?? []) as unknown as EventRow[];

  const recentEvents: PhotoEvent[] = eventRows.map(r => ({
    id: r.id,
    equipmentId: r.equipment_id,
    slug: r.equipment?.slug ?? "",
    name: r.equipment?.name ?? "",
    eventKind: r.event_kind,
    actorId: r.actor_id,
    metadata: r.metadata ?? {},
    createdAt: r.created_at,
  }));

  const providerStats: ProviderQuotaStats[] = [];
  if (env.kv) {
    const today = now();
    const dailyCap = env.braveDailyCap ?? DEFAULT_BRAVE_DAILY_CAP;
    const monthlyCap = env.braveMonthlyCap ?? DEFAULT_BRAVE_MONTHLY_CAP;
    const [dailyUsed, monthlyUsed] = await Promise.all([
      readKVCount(env.kv, dailyKey("brave", today)),
      readKVCount(env.kv, monthlyKey("brave", today)),
    ]);
    providerStats.push({
      name: "brave",
      dailyUsed,
      dailyCap,
      monthlyUsed,
      monthlyCap,
    });
  }

  return {
    counts,
    processedLastHour: lastHour.count ?? 0,
    recentEvents,
    providerStats,
  };
}

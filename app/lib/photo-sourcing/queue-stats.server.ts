// Equipment-photo coverage + queue stats (TT-98). Two entry points so
// callers only pay for what they render:
//
//   loadCoverageCounts(supabase)      — 5 cumulative buckets only.
//                                       Cheap (5 parallel head-counts).
//                                       Used by the admin dashboard.
//   loadFullPhotoStats(supabase, env) — coverage + last-hour throughput
//                                       + recent-activity + per-provider
//                                       quota usage. Used by the
//                                       /admin/equipment-photos page.
//
// Provider quota stats read directly from the same KV namespace the
// budget wrapper writes. KV missing or absent keys → zeros, never
// throws.

import type { SupabaseClient } from "@supabase/supabase-js";
import { dailyKey, monthlyKey, type BudgetKV } from "./providers/budget";
import {
  DEFAULT_BRAVE_DAILY_CAP,
  DEFAULT_BRAVE_MONTHLY_CAP,
} from "./providers/factory";

export interface CoverageCounts {
  picked: number;
  unsourced: number;
  attemptedNoImage: number;
  skipped: number;
  total: number;
}

export type RecentAttemptOutcome =
  | "picked"
  | "in-review"
  | "skipped"
  | "no-image";

export interface RecentAttempt {
  slug: string;
  name: string;
  attemptedAt: string;
  outcome: RecentAttemptOutcome;
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
  recentAttempts: RecentAttempt[];
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

  const [counts, lastHour, recent] = await Promise.all([
    loadCoverageCounts(supabase),
    supabase
      .from("equipment")
      .select("id", { count: "exact", head: true })
      .gte("image_sourcing_attempted_at", oneHourAgoISO),
    supabase
      .from("equipment")
      .select(
        "id, slug, name, image_key, image_skipped_at, image_sourcing_attempted_at"
      )
      .not("image_sourcing_attempted_at", "is", null)
      .order("image_sourcing_attempted_at", { ascending: false })
      .limit(20),
  ]);

  type RecentRow = {
    id: string;
    slug: string;
    name: string;
    image_key: string | null;
    image_skipped_at: string | null;
    image_sourcing_attempted_at: string;
  };
  const recentRows = (recent.data ?? []) as RecentRow[];

  // Look up which of the recent equipment ids have un-picked candidates
  // pending — those rows are "in review" regardless of image_key state
  // (admin re-queue leaves the live image in place while new candidates
  // wait for approval). One bounded query keeps us inside the
  // 50-subrequest cap on /admin loaders.
  const recentIds = recentRows.map(r => r.id);
  const inReview = new Set<string>();
  if (recentIds.length > 0) {
    const { data: pendingRows } = await supabase
      .from("equipment_photo_candidates")
      .select("equipment_id")
      .in("equipment_id", recentIds)
      .is("picked_at", null);
    for (const row of (pendingRows ?? []) as Array<{ equipment_id: string }>) {
      inReview.add(row.equipment_id);
    }
  }

  const recentAttempts: RecentAttempt[] = recentRows.map(r => ({
    slug: r.slug,
    name: r.name,
    attemptedAt: r.image_sourcing_attempted_at,
    outcome: classifyOutcome(r, inReview.has(r.id)),
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
    recentAttempts,
    providerStats,
  };
}

// `pendingReview` wins over `picked` so a re-queued row (image_key
// still set, new candidates waiting for admin approval) renders as
// "in-review" rather than misleadingly as "picked".
function classifyOutcome(
  row: {
    image_key: string | null;
    image_skipped_at: string | null;
  },
  pendingReview: boolean
): RecentAttemptOutcome {
  if (pendingReview) return "in-review";
  if (row.image_key) return "picked";
  if (row.image_skipped_at) return "skipped";
  return "no-image";
}

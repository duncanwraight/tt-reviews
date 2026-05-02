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

export type RecentAttemptOutcome = "picked" | "skipped" | "no-image";

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
        "slug, name, image_key, image_skipped_at, image_sourcing_attempted_at"
      )
      .not("image_sourcing_attempted_at", "is", null)
      .order("image_sourcing_attempted_at", { ascending: false })
      .limit(20),
  ]);

  const recentAttempts: RecentAttempt[] = (
    (recent.data ?? []) as Array<{
      slug: string;
      name: string;
      image_key: string | null;
      image_skipped_at: string | null;
      image_sourcing_attempted_at: string;
    }>
  ).map(r => ({
    slug: r.slug,
    name: r.name,
    attemptedAt: r.image_sourcing_attempted_at,
    outcome: classifyOutcome(r),
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

function classifyOutcome(row: {
  image_key: string | null;
  image_skipped_at: string | null;
}): RecentAttemptOutcome {
  if (row.image_key) return "picked";
  if (row.image_skipped_at) return "skipped";
  return "no-image";
}

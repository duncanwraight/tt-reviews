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

// Run five PostgREST head-counts in parallel. PostgREST doesn't expose
// FILTER aggregates via .select, but the cost of 5 small head-counts
// is negligible (each is microseconds at our equipment-row scale).
export async function loadCoverageCounts(
  supabase: SupabaseClient
): Promise<CoverageCounts> {
  const head = (q: ReturnType<SupabaseClient["from"]>) =>
    q.select("id", { count: "exact", head: true });

  const [picked, unsourced, attemptedNoImage, skipped, total] =
    await Promise.all([
      head(supabase.from("equipment")).not("image_key", "is", null),
      head(supabase.from("equipment"))
        .is("image_key", null)
        .is("image_skipped_at", null)
        .is("image_sourcing_attempted_at", null),
      head(supabase.from("equipment"))
        .is("image_key", null)
        .is("image_skipped_at", null)
        .not("image_sourcing_attempted_at", "is", null),
      head(supabase.from("equipment")).not("image_skipped_at", "is", null),
      head(supabase.from("equipment")),
    ]);

  return {
    picked: picked.count ?? 0,
    unsourced: unsourced.count ?? 0,
    attemptedNoImage: attemptedNoImage.count ?? 0,
    skipped: skipped.count ?? 0,
    total: total.count ?? 0,
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

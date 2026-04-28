// Construct the default sourcing-provider list from a Worker env.
// Routes call this at action time; tests bypass it and pass mock
// providers directly to sourcePhotosForEquipment.
//
// Brave's free tier: 1 query/sec, 2,000 queries/month. We layer the
// QPS cap via the BRAVE_RATE_LIMITER binding (configured in
// wrangler.toml) and the monthly cap via PROVIDER_QUOTA KV. Both
// bindings are provisioned in wrangler.toml; the missing-KV warning
// path remains as a defensive fallback for ad-hoc local runs that
// haven't picked up the latest config.

import { braveProvider } from "./brave";
import { withBudget, type BudgetKV, type BudgetRateLimit } from "./budget";
import type { Provider } from "./types";
import { Logger, createLogContext } from "../../logger.server";

// Default monthly cap for Brave free tier. Override via env var
// BRAVE_MONTHLY_CAP if you upgrade the plan.
export const DEFAULT_BRAVE_MONTHLY_CAP = 1900;
// Daily safety net so a runaway can't burn the entire monthly budget
// in a single afternoon. ~63/day average for 1900/month → 200 leaves
// burst headroom.
export const DEFAULT_BRAVE_DAILY_CAP = 200;

interface ProviderEnv {
  BRAVE_RATE_LIMITER?: BudgetRateLimit;
  PROVIDER_QUOTA?: BudgetKV;
  BRAVE_MONTHLY_CAP?: string;
  BRAVE_DAILY_CAP?: string;
}

function parseCapOrDefault(raw: string | undefined, fallback: number): number {
  if (!raw) return fallback;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export function buildProvidersFromEnv(env: ProviderEnv): Provider[] {
  if (!env.PROVIDER_QUOTA) {
    Logger.warn(
      "PROVIDER_QUOTA KV binding missing — sourcing will run without daily/monthly cap enforcement",
      createLogContext("photo-sourcing-budget"),
      undefined
    );
  }
  const monthlyCap = parseCapOrDefault(
    env.BRAVE_MONTHLY_CAP,
    DEFAULT_BRAVE_MONTHLY_CAP
  );
  const dailyCap = parseCapOrDefault(
    env.BRAVE_DAILY_CAP,
    DEFAULT_BRAVE_DAILY_CAP
  );
  return [
    withBudget(braveProvider, {
      rateLimiter: env.BRAVE_RATE_LIMITER,
      kv: env.PROVIDER_QUOTA,
      dailyCap,
      monthlyCap,
    }),
  ];
}

// Photo-sourcing budget wrapper (TT-90). Layers two caps on top of any
// Provider:
//
//   1. QPS rate-limit (via a Workers ratelimit binding) — fine-grain,
//      edge-distributed. Returning 'rate_limited' lets the queue
//      consumer skip this attempt without delaying.
//   2. Daily / monthly quota (via a KV namespace counter) — protects
//      paid usage caps. Returning 'out_of_budget' lets the queue
//      consumer re-queue with delay until the next reset window.
//
// Both checks are independently optional — pass undefined to disable
// either side. If both are undefined, the wrapper is a pass-through
// (used by tests and by deployments where bindings haven't been
// provisioned yet).
//
// Shared primitives (key construction, KV read/increment, binding
// shapes) live in app/lib/providers/budget.ts so the spec-sourcing
// extractor can layer the same cap shape on a different inner
// callable. This wrapper is photo-Provider-shaped — the SpecExtractor
// equivalent is in app/lib/spec-sourcing/extract/budget.ts.

import {
  type BudgetKV,
  type BudgetRateLimit,
  DAILY_TTL_SECONDS,
  MONTHLY_TTL_SECONDS,
  dailyKey,
  increment,
  monthlyKey,
  readCount,
} from "../../providers/budget";
import type { Provider } from "./types";

// Re-export shared primitives so existing photo-sourcing imports keep
// working without churn. New consumers should import from
// app/lib/providers/budget directly.
export {
  type BudgetKV,
  type BudgetRateLimit,
  dailyKey,
  monthlyKey,
} from "../../providers/budget";

export interface BudgetOptions {
  rateLimiter?: BudgetRateLimit;
  kv?: BudgetKV;
  // Per-day cap. Undefined = no daily cap.
  dailyCap?: number;
  // Per-calendar-month cap. Undefined = no monthly cap.
  monthlyCap?: number;
  // Test seam — defaults to wall-clock UTC.
  now?: () => Date;
}

// Wrap a Provider with rate-limit + quota checks. Returns 'rate_limited'
// when the QPS binding denies the call; 'out_of_budget' when daily or
// monthly KV counter is at cap; otherwise delegates to the inner
// provider and increments counters on a successful 'ok' response.
export function withBudget(
  inner: Provider,
  opts: BudgetOptions = {}
): Provider {
  const now = opts.now ?? (() => new Date());
  return {
    name: inner.name,
    async resolveCandidates(item, env, options) {
      if (opts.rateLimiter) {
        const rl = await opts.rateLimiter.limit({ key: inner.name });
        if (!rl.success) {
          return { status: "rate_limited", candidates: [] };
        }
      }
      if (opts.kv) {
        const today = now();
        if (opts.dailyCap !== undefined) {
          const used = await readCount(opts.kv, dailyKey(inner.name, today));
          if (used >= opts.dailyCap) {
            return { status: "out_of_budget", candidates: [] };
          }
        }
        if (opts.monthlyCap !== undefined) {
          const used = await readCount(opts.kv, monthlyKey(inner.name, today));
          if (used >= opts.monthlyCap) {
            return { status: "out_of_budget", candidates: [] };
          }
        }
      }

      const result = await inner.resolveCandidates(item, env, options);

      // Only count actual API calls. rate_limited / out_of_budget
      // bouncebacks aren't recorded — the inner call wasn't made.
      if (result.status === "ok" && opts.kv) {
        const today = now();
        if (opts.dailyCap !== undefined) {
          await increment(
            opts.kv,
            dailyKey(inner.name, today),
            DAILY_TTL_SECONDS
          );
        }
        if (opts.monthlyCap !== undefined) {
          await increment(
            opts.kv,
            monthlyKey(inner.name, today),
            MONTHLY_TTL_SECONDS
          );
        }
      }

      return result;
    },
  };
}

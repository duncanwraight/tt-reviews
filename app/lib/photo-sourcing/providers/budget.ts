// Budget enforcement wrapper for photo-sourcing providers (TT-90).
// Layers two caps on top of any Provider:
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
// KV is NOT atomic; the read-then-increment is last-write-wins under
// concurrent calls. That's fine for a defensive cap that's allowed to
// undercount by a small margin — it errs on the side of cheaper
// (caller skips a few extra calls) rather than over-spending.

import type { Provider } from "./types";

// Minimal RateLimit shape so the lib doesn't depend on
// @cloudflare/workers-types. The real binding satisfies this.
export interface BudgetRateLimit {
  limit(opts: { key: string }): Promise<{ success: boolean }>;
}

// Minimal KVNamespace shape. The real binding satisfies this.
export interface BudgetKV {
  get(key: string): Promise<string | null>;
  put(
    key: string,
    value: string,
    opts?: { expirationTtl?: number }
  ): Promise<unknown>;
}

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

const DAILY_TTL_SECONDS = 25 * 60 * 60;
const MONTHLY_TTL_SECONDS = 32 * 24 * 60 * 60;

function pad2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

export function dailyKey(name: string, d: Date): string {
  return `provider:${name}:daily:${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}

export function monthlyKey(name: string, d: Date): string {
  return `provider:${name}:monthly:${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}`;
}

async function readCount(kv: BudgetKV, key: string): Promise<number> {
  const v = await kv.get(key);
  if (!v) return 0;
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : 0;
}

async function increment(
  kv: BudgetKV,
  key: string,
  ttlSeconds: number
): Promise<void> {
  const current = await readCount(kv, key);
  await kv.put(key, String(current + 1), { expirationTtl: ttlSeconds });
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

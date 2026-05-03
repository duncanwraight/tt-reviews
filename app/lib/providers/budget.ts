// Shared budget primitives — KV/RateLimit binding shapes, daily/monthly
// counter keys and the read/increment helpers. Both the photo-sourcing
// `withBudget(provider, opts)` wrapper (TT-90) and the spec-sourcing
// `withSpecExtractorBudget(extractor, opts)` wrapper (TT-148) layer
// their consumer-specific shapes on top of this. The wrappers live
// alongside their consumers — only the shared primitives live here.
//
// KV is NOT atomic; the read-then-increment is last-write-wins under
// concurrent calls. That's fine for a defensive cap that's allowed to
// undercount by a small margin — it errs on the side of cheaper
// (caller skips a few extra calls) rather than over-spending.

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

export const DAILY_TTL_SECONDS = 25 * 60 * 60;
export const MONTHLY_TTL_SECONDS = 32 * 24 * 60 * 60;

function pad2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

export function dailyKey(name: string, d: Date): string {
  return `provider:${name}:daily:${d.getUTCFullYear()}-${pad2(
    d.getUTCMonth() + 1
  )}-${pad2(d.getUTCDate())}`;
}

export function monthlyKey(name: string, d: Date): string {
  return `provider:${name}:monthly:${d.getUTCFullYear()}-${pad2(
    d.getUTCMonth() + 1
  )}`;
}

export async function readCount(kv: BudgetKV, key: string): Promise<number> {
  const v = await kv.get(key);
  if (!v) return 0;
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : 0;
}

export async function increment(
  kv: BudgetKV,
  key: string,
  ttlSeconds: number
): Promise<void> {
  const current = await readCount(kv, key);
  await kv.put(key, String(current + 1), { expirationTtl: ttlSeconds });
}

import { describe, it, expect, vi } from "vitest";
import {
  withBudget,
  dailyKey,
  monthlyKey,
  type BudgetKV,
  type BudgetRateLimit,
} from "../budget";
import type { Provider } from "../types";

const SEED = {
  slug: "stiga-airoc-m",
  name: "Stiga Airoc M",
  manufacturer: "Stiga",
  category: "rubber",
};

const ENV = { BRAVE_SEARCH_API_KEY: "k" };

function fakeKV(): BudgetKV & { store: Map<string, string> } {
  const store = new Map<string, string>();
  return {
    store,
    async get(k) {
      return store.get(k) ?? null;
    },
    async put(k, v) {
      store.set(k, v);
    },
  };
}

function fakeRateLimiter(success: boolean): BudgetRateLimit {
  return {
    limit: vi.fn().mockResolvedValue({ success }),
  };
}

function okProvider(): Provider {
  return {
    name: "brave",
    resolveCandidates: vi
      .fn()
      .mockResolvedValue({ status: "ok", candidates: [] }),
  };
}

const FROZEN_NOW = new Date(Date.UTC(2026, 3, 28, 12, 0, 0));
const now = () => FROZEN_NOW;

describe("withBudget", () => {
  it("passes through when no rate-limiter or KV is provided", async () => {
    const inner = okProvider();
    const wrapped = withBudget(inner);
    const result = await wrapped.resolveCandidates(SEED, ENV);
    expect(result.status).toBe("ok");
    expect(inner.resolveCandidates).toHaveBeenCalled();
  });

  it("returns 'rate_limited' when QPS binding denies (and skips inner call)", async () => {
    const inner = okProvider();
    const wrapped = withBudget(inner, { rateLimiter: fakeRateLimiter(false) });
    const result = await wrapped.resolveCandidates(SEED, ENV);
    expect(result.status).toBe("rate_limited");
    expect(inner.resolveCandidates).not.toHaveBeenCalled();
  });

  it("returns 'out_of_budget' when daily counter is at cap", async () => {
    const inner = okProvider();
    const kv = fakeKV();
    kv.store.set(dailyKey("brave", FROZEN_NOW), "5");
    const wrapped = withBudget(inner, {
      kv,
      dailyCap: 5,
      now,
    });
    const result = await wrapped.resolveCandidates(SEED, ENV);
    expect(result.status).toBe("out_of_budget");
    expect(inner.resolveCandidates).not.toHaveBeenCalled();
  });

  it("returns 'out_of_budget' when monthly counter is at cap", async () => {
    const inner = okProvider();
    const kv = fakeKV();
    kv.store.set(monthlyKey("brave", FROZEN_NOW), "2000");
    const wrapped = withBudget(inner, {
      kv,
      monthlyCap: 2000,
      now,
    });
    const result = await wrapped.resolveCandidates(SEED, ENV);
    expect(result.status).toBe("out_of_budget");
  });

  it("increments both counters on successful inner call", async () => {
    const inner = okProvider();
    const kv = fakeKV();
    const wrapped = withBudget(inner, {
      kv,
      dailyCap: 100,
      monthlyCap: 2000,
      now,
    });

    await wrapped.resolveCandidates(SEED, ENV);
    expect(kv.store.get(dailyKey("brave", FROZEN_NOW))).toBe("1");
    expect(kv.store.get(monthlyKey("brave", FROZEN_NOW))).toBe("1");

    await wrapped.resolveCandidates(SEED, ENV);
    expect(kv.store.get(dailyKey("brave", FROZEN_NOW))).toBe("2");
    expect(kv.store.get(monthlyKey("brave", FROZEN_NOW))).toBe("2");
  });

  it("does NOT increment counters when rate-limited", async () => {
    const inner = okProvider();
    const kv = fakeKV();
    const wrapped = withBudget(inner, {
      kv,
      rateLimiter: fakeRateLimiter(false),
      dailyCap: 100,
      monthlyCap: 2000,
      now,
    });
    await wrapped.resolveCandidates(SEED, ENV);
    expect(kv.store.get(dailyKey("brave", FROZEN_NOW))).toBeUndefined();
    expect(kv.store.get(monthlyKey("brave", FROZEN_NOW))).toBeUndefined();
  });

  it("does NOT increment counters when out_of_budget", async () => {
    const inner = okProvider();
    const kv = fakeKV();
    kv.store.set(dailyKey("brave", FROZEN_NOW), "10");
    const wrapped = withBudget(inner, {
      kv,
      dailyCap: 10,
      now,
    });
    await wrapped.resolveCandidates(SEED, ENV);
    // Stored value unchanged.
    expect(kv.store.get(dailyKey("brave", FROZEN_NOW))).toBe("10");
  });

  it("checks rate-limit before quota (cheaper path first)", async () => {
    const inner = okProvider();
    const kv = fakeKV();
    const kvGet = vi.spyOn(kv, "get");
    const wrapped = withBudget(inner, {
      kv,
      rateLimiter: fakeRateLimiter(false),
      dailyCap: 1,
      now,
    });
    await wrapped.resolveCandidates(SEED, ENV);
    // Rate-limit denied → KV never consulted.
    expect(kvGet).not.toHaveBeenCalled();
  });

  it("preserves the inner provider's name", () => {
    const inner: Provider = { ...okProvider(), name: "revspin" };
    const wrapped = withBudget(inner);
    expect(wrapped.name).toBe("revspin");
  });

  it("daily and monthly key shapes match the documented format", () => {
    const d = new Date(Date.UTC(2026, 3, 5));
    expect(dailyKey("brave", d)).toBe("provider:brave:daily:2026-04-05");
    expect(monthlyKey("brave", d)).toBe("provider:brave:monthly:2026-04");
  });
});

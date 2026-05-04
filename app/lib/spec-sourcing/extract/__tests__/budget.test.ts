import { describe, expect, it, vi } from "vitest";

import {
  type BudgetKV,
  type BudgetRateLimit,
  dailyKey,
  monthlyKey,
} from "../../../providers/budget";
import { withSpecExtractorBudget } from "../budget";
import type { SpecExtractor } from "../types";

const FROZEN_NOW = new Date(Date.UTC(2026, 4, 3, 12, 0, 0));
const now = () => FROZEN_NOW;

const REF = { brand: "Butterfly", name: "Viscaria", category: "blade" };
const CANDIDATE = {
  url: "https://en.butterfly.tt/viscaria.html",
  title: "Viscaria",
};

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

function okExtractor(): SpecExtractor {
  return {
    id: "gemini-2.5-flash",
    match: vi.fn().mockResolvedValue({
      result: { matches: true, confidence: 0.9 },
      diagnostics: { failureReason: "ok", httpStatus: 200, tokens: 100 },
    }),
    extract: vi.fn().mockResolvedValue({
      result: {
        specs: { weight: 89 },
        description: null,
        perFieldConfidence: {},
        rawHtmlExcerpt: "",
      },
      diagnostics: { failureReason: "ok", httpStatus: 200, tokens: 1234 },
    }),
  };
}

describe("withSpecExtractorBudget", () => {
  it("passes through when no rate-limiter or KV is provided", async () => {
    const inner = okExtractor();
    const wrapped = withSpecExtractorBudget(inner);
    const result = await wrapped.extract("<html></html>", REF);
    expect(result.status).toBe("ok");
    expect(result.result).not.toBeNull();
    expect(inner.extract).toHaveBeenCalled();
  });

  it("returns 'rate_limited' when QPS binding denies (and skips inner call)", async () => {
    const inner = okExtractor();
    const wrapped = withSpecExtractorBudget(inner, {
      rateLimiter: fakeRateLimiter(false),
    });
    const result = await wrapped.extract("<html></html>", REF);
    expect(result.status).toBe("rate_limited");
    expect(result.result).toBeUndefined();
    expect(inner.extract).not.toHaveBeenCalled();
  });

  it("returns 'out_of_budget' when daily counter is at cap", async () => {
    const inner = okExtractor();
    const kv = fakeKV();
    kv.store.set(dailyKey("gemini-2.5-flash", FROZEN_NOW), "1000");
    const wrapped = withSpecExtractorBudget(inner, {
      kv,
      dailyCap: 1000,
      now,
    });
    const result = await wrapped.extract("<html></html>", REF);
    expect(result.status).toBe("out_of_budget");
    expect(inner.extract).not.toHaveBeenCalled();
  });

  it("returns 'out_of_budget' when monthly counter is at cap", async () => {
    const inner = okExtractor();
    const kv = fakeKV();
    kv.store.set(monthlyKey("gemini-2.5-flash", FROZEN_NOW), "30000");
    const wrapped = withSpecExtractorBudget(inner, {
      kv,
      monthlyCap: 30000,
      now,
    });
    const result = await wrapped.extract("<html></html>", REF);
    expect(result.status).toBe("out_of_budget");
    expect(inner.extract).not.toHaveBeenCalled();
  });

  it("increments the daily counter after a successful extract call", async () => {
    const inner = okExtractor();
    const kv = fakeKV();
    const wrapped = withSpecExtractorBudget(inner, {
      kv,
      dailyCap: 5,
      now,
    });
    await wrapped.extract("<html></html>", REF);
    expect(kv.store.get(dailyKey("gemini-2.5-flash", FROZEN_NOW))).toBe("1");
  });

  it("counts match() calls against the same budget as extract()", async () => {
    const inner = okExtractor();
    const kv = fakeKV();
    const wrapped = withSpecExtractorBudget(inner, {
      kv,
      dailyCap: 5,
      now,
    });
    await wrapped.match("<html></html>", REF, CANDIDATE);
    await wrapped.extract("<html></html>", REF);
    expect(kv.store.get(dailyKey("gemini-2.5-flash", FROZEN_NOW))).toBe("2");
  });

  it("does not record a call when the inner extractor returned null", async () => {
    // Wrapper still increments because the API call was made — null
    // here means Gemini returned a response we couldn't parse, not
    // that the call was skipped. Cap behaviour mirrors photo-sourcing.
    const inner: SpecExtractor = {
      id: "gemini-2.5-flash",
      match: vi.fn().mockResolvedValue({
        result: null,
        diagnostics: { failureReason: "schema_invalid", httpStatus: 200 },
      }),
      extract: vi.fn().mockResolvedValue({
        result: null,
        diagnostics: { failureReason: "schema_invalid", httpStatus: 200 },
      }),
    };
    const kv = fakeKV();
    const wrapped = withSpecExtractorBudget(inner, {
      kv,
      dailyCap: 5,
      now,
    });
    const result = await wrapped.extract("<html></html>", REF);
    expect(result.status).toBe("ok");
    expect(result.result).toBeNull();
    // Call was made and counted — that matches photo-sourcing's
    // semantics where the inner provider failure still consumes quota.
    expect(kv.store.get(dailyKey("gemini-2.5-flash", FROZEN_NOW))).toBe("1");
  });
});

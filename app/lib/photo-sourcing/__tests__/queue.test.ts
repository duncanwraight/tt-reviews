import { describe, it, expect, vi } from "vitest";
import {
  processOneSourceMessage,
  computeRetryDelaySeconds,
} from "../queue.server";
import type { SourcingResult } from "../source.server";
import type { Provider } from "../providers/types";
import type { R2BucketSurface } from "../review.server";
import type { SupabaseClient } from "@supabase/supabase-js";

const ENV = { BRAVE_SEARCH_API_KEY: "k" };
const FAKE_SUPABASE = {} as SupabaseClient;
const FAKE_BUCKET: R2BucketSurface = {
  put: async () => undefined,
  delete: async () => undefined,
  get: async () => null,
};
const PROVIDERS: Provider[] = [];

function fakeResult(over: Partial<SourcingResult>): SourcingResult {
  return {
    status: "sourced",
    equipment: { id: "eq-1", slug: "stiga-airoc-m", name: "Stiga Airoc M" },
    candidates: [],
    insertedCount: 0,
    providerStatuses: [{ name: "brave", status: "ok" }],
    ...over,
  };
}

describe("processOneSourceMessage", () => {
  it("returns 'auto-picked' when sourcing yields one trailing tier-1 candidate", async () => {
    const sourceFn = vi.fn().mockResolvedValue(
      fakeResult({
        status: "sourced",
        candidates: [
          {
            id: "c1",
            r2_key: "equipment/x/cand/uuid.png",
            source_url: null,
            image_source_host: null,
            source_label: null,
            match_kind: "trailing",
            tier: 1,
            width: null,
            height: null,
          },
        ],
        insertedCount: 1,
      })
    );
    const pickFn = vi.fn().mockResolvedValue({
      equipmentId: "eq-1",
      pickedR2Key: "equipment/x/cand/uuid.png",
    });

    const result = await processOneSourceMessage(
      FAKE_SUPABASE,
      FAKE_BUCKET,
      ENV,
      PROVIDERS,
      "u",
      { slug: "stiga-airoc-m" },
      { sourceFn, pickFn }
    );

    expect(result).toEqual({
      status: "auto-picked",
      r2Key: "equipment/x/cand/uuid.png",
    });
    expect(pickFn).toHaveBeenCalledWith(FAKE_SUPABASE, FAKE_BUCKET, {
      equipmentId: "eq-1",
      candidateId: "c1",
      pickedBy: "u",
    });
  });

  it("returns 'sourced' (not auto-picked) when 2+ trailing tier-1 candidates", async () => {
    const sourceFn = vi.fn().mockResolvedValue(
      fakeResult({
        candidates: [
          {
            id: "c1",
            r2_key: "a.png",
            source_url: null,
            image_source_host: null,
            source_label: null,
            match_kind: "trailing",
            tier: 1,
            width: null,
            height: null,
          },
          {
            id: "c2",
            r2_key: "b.png",
            source_url: null,
            image_source_host: null,
            source_label: null,
            match_kind: "trailing",
            tier: 1,
            width: null,
            height: null,
          },
        ],
        insertedCount: 2,
      })
    );
    const pickFn = vi.fn();

    const result = await processOneSourceMessage(
      FAKE_SUPABASE,
      FAKE_BUCKET,
      ENV,
      PROVIDERS,
      "u",
      { slug: "stiga-airoc-m" },
      { sourceFn, pickFn }
    );

    expect(result).toEqual({ status: "sourced", insertedCount: 2 });
    expect(pickFn).not.toHaveBeenCalled();
  });

  it("returns 'transient' when no candidates AND a provider is out_of_budget", async () => {
    const sourceFn = vi.fn().mockResolvedValue(
      fakeResult({
        status: "no-candidates",
        candidates: [],
        insertedCount: 0,
        providerStatuses: [{ name: "brave", status: "out_of_budget" }],
      })
    );

    const result = await processOneSourceMessage(
      FAKE_SUPABASE,
      FAKE_BUCKET,
      ENV,
      PROVIDERS,
      "u",
      { slug: "x" },
      { sourceFn, pickFn: vi.fn() }
    );

    expect(result).toEqual({ status: "transient", reason: "out_of_budget" });
  });

  it("returns 'transient' when no candidates AND a provider is rate_limited", async () => {
    const sourceFn = vi.fn().mockResolvedValue(
      fakeResult({
        status: "no-candidates",
        candidates: [],
        insertedCount: 0,
        providerStatuses: [{ name: "brave", status: "rate_limited" }],
      })
    );

    const result = await processOneSourceMessage(
      FAKE_SUPABASE,
      FAKE_BUCKET,
      ENV,
      PROVIDERS,
      "u",
      { slug: "x" },
      { sourceFn, pickFn: vi.fn() }
    );

    expect(result).toEqual({ status: "transient", reason: "rate_limited" });
  });

  it("returns 'no-candidates' (genuine empty) when all providers were 'ok'", async () => {
    const sourceFn = vi.fn().mockResolvedValue(
      fakeResult({
        status: "no-candidates",
        candidates: [],
        insertedCount: 0,
        providerStatuses: [{ name: "brave", status: "ok" }],
      })
    );

    const result = await processOneSourceMessage(
      FAKE_SUPABASE,
      FAKE_BUCKET,
      ENV,
      PROVIDERS,
      "u",
      { slug: "x" },
      { sourceFn, pickFn: vi.fn() }
    );

    expect(result).toEqual({ status: "no-candidates" });
  });

  it("returns 'already-imaged' when sourcing short-circuits", async () => {
    const sourceFn = vi.fn().mockResolvedValue(
      fakeResult({
        status: "already-imaged",
        candidates: [],
        insertedCount: 0,
        providerStatuses: [],
      })
    );

    const result = await processOneSourceMessage(
      FAKE_SUPABASE,
      FAKE_BUCKET,
      ENV,
      PROVIDERS,
      "u",
      { slug: "x" },
      { sourceFn, pickFn: vi.fn() }
    );

    expect(result).toEqual({ status: "already-imaged" });
  });

  it("returns 'error' when sourceFn throws", async () => {
    const sourceFn = vi.fn().mockRejectedValue(new Error("boom"));

    const result = await processOneSourceMessage(
      FAKE_SUPABASE,
      FAKE_BUCKET,
      ENV,
      PROVIDERS,
      "u",
      { slug: "x" },
      { sourceFn, pickFn: vi.fn() }
    );

    expect(result).toEqual({ status: "error", message: "boom" });
  });

  // TT-171: per-row admin re-queue sets `force: true` on the message so
  // the consumer skips sourcePhotosForEquipment's image_key short-circuit.
  // The button left image_key in place on purpose so the live page keeps
  // its photo — without this thread-through the message would silently
  // ack as "already-imaged".
  it("threads message.force through to sourceFn", async () => {
    const sourceFn = vi.fn().mockResolvedValue(
      fakeResult({
        status: "no-candidates",
        candidates: [],
        insertedCount: 0,
        providerStatuses: [{ name: "brave", status: "ok" }],
      })
    );

    await processOneSourceMessage(
      FAKE_SUPABASE,
      FAKE_BUCKET,
      ENV,
      PROVIDERS,
      "u",
      { slug: "stiga-airoc-m", force: true },
      { sourceFn, pickFn: vi.fn() }
    );

    expect(sourceFn).toHaveBeenCalledWith(
      FAKE_SUPABASE,
      FAKE_BUCKET,
      ENV,
      "stiga-airoc-m",
      expect.objectContaining({ force: true })
    );
  });

  it("falls back to 'sourced' when auto-pick throws", async () => {
    const sourceFn = vi.fn().mockResolvedValue(
      fakeResult({
        status: "sourced",
        candidates: [
          {
            id: "c1",
            r2_key: "a.png",
            source_url: null,
            image_source_host: null,
            source_label: null,
            match_kind: "trailing",
            tier: 1,
            width: null,
            height: null,
          },
        ],
        insertedCount: 1,
      })
    );
    const pickFn = vi.fn().mockRejectedValue(new Error("DB blip"));

    const result = await processOneSourceMessage(
      FAKE_SUPABASE,
      FAKE_BUCKET,
      ENV,
      PROVIDERS,
      "u",
      { slug: "x" },
      { sourceFn, pickFn }
    );

    expect(result).toEqual({ status: "sourced", insertedCount: 1 });
  });
});

describe("computeRetryDelaySeconds", () => {
  it("doubles minutes up to a 60-minute cap", () => {
    expect(computeRetryDelaySeconds(0)).toBe(60); // 1 min
    expect(computeRetryDelaySeconds(1)).toBe(120); // 2 min
    expect(computeRetryDelaySeconds(2)).toBe(240); // 4 min
    expect(computeRetryDelaySeconds(3)).toBe(480); // 8 min
    expect(computeRetryDelaySeconds(4)).toBe(960); // 16 min
    expect(computeRetryDelaySeconds(5)).toBe(1920); // 32 min
    expect(computeRetryDelaySeconds(6)).toBe(3600); // 60 min (capped)
    expect(computeRetryDelaySeconds(10)).toBe(3600); // capped
  });
});

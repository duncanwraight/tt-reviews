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
    equipment: {
      id: "eq-1",
      slug: "stiga-airoc-m",
      name: "Stiga Airoc M",
      image_key: null,
    },
    candidates: [],
    insertedCount: 0,
    providerStatuses: [{ name: "brave", status: "ok" }],
    ...over,
  };
}

describe("processOneSourceMessage", () => {
  it("returns 'auto-picked' and emits auto_picked event when sourcing yields one trailing tier-1 candidate", async () => {
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
    const recordEvent = vi.fn().mockResolvedValue(undefined);

    const result = await processOneSourceMessage(
      FAKE_SUPABASE,
      FAKE_BUCKET,
      ENV,
      PROVIDERS,
      { slug: "stiga-airoc-m" },
      { sourceFn, pickFn, recordEvent }
    );

    expect(result).toEqual({
      status: "auto-picked",
      r2Key: "equipment/x/cand/uuid.png",
    });
    expect(pickFn).toHaveBeenCalledWith(FAKE_SUPABASE, FAKE_BUCKET, {
      equipmentId: "eq-1",
      candidateId: "c1",
      pickedBy: null,
    });
    expect(recordEvent).toHaveBeenCalledWith(FAKE_SUPABASE, {
      equipmentId: "eq-1",
      eventKind: "auto_picked",
      metadata: {
        candidate_id: "c1",
        r2_key: "equipment/x/cand/uuid.png",
        tier: 1,
      },
    });
  });

  it("emits routed_to_review when 2+ trailing tier-1 candidates land", async () => {
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
    const recordEvent = vi.fn().mockResolvedValue(undefined);

    const result = await processOneSourceMessage(
      FAKE_SUPABASE,
      FAKE_BUCKET,
      ENV,
      PROVIDERS,
      { slug: "stiga-airoc-m" },
      { sourceFn, pickFn, recordEvent }
    );

    expect(result).toEqual({ status: "sourced", insertedCount: 2 });
    expect(pickFn).not.toHaveBeenCalled();
    expect(recordEvent).toHaveBeenCalledWith(FAKE_SUPABASE, {
      equipmentId: "eq-1",
      eventKind: "routed_to_review",
      metadata: { candidate_count: 2 },
    });
  });

  it("emits one provider_transient per non-ok provider with attempts metadata", async () => {
    const sourceFn = vi.fn().mockResolvedValue(
      fakeResult({
        status: "no-candidates",
        candidates: [],
        insertedCount: 0,
        providerStatuses: [
          { name: "brave", status: "out_of_budget" },
          { name: "google", status: "rate_limited" },
        ],
      })
    );
    const recordEvent = vi.fn().mockResolvedValue(undefined);

    const result = await processOneSourceMessage(
      FAKE_SUPABASE,
      FAKE_BUCKET,
      ENV,
      PROVIDERS,
      { slug: "x", attempts: 3 },
      { sourceFn, pickFn: vi.fn(), recordEvent }
    );

    // One transient event per non-ok provider; outcome reflects the
    // first one for queue retry classification.
    expect(result).toEqual({ status: "transient", reason: "out_of_budget" });
    const transientCalls = recordEvent.mock.calls.filter(
      ([, args]) => args.eventKind === "provider_transient"
    );
    expect(transientCalls).toHaveLength(2);
    expect(transientCalls[0][1]).toMatchObject({
      eventKind: "provider_transient",
      metadata: { provider: "brave", reason: "out_of_budget", attempts: 3 },
    });
    expect(transientCalls[1][1]).toMatchObject({
      eventKind: "provider_transient",
      metadata: { provider: "google", reason: "rate_limited", attempts: 3 },
    });
  });

  it("returns 'transient' and emits provider_transient when a provider is rate_limited", async () => {
    const sourceFn = vi.fn().mockResolvedValue(
      fakeResult({
        status: "no-candidates",
        candidates: [],
        insertedCount: 0,
        providerStatuses: [{ name: "brave", status: "rate_limited" }],
      })
    );
    const recordEvent = vi.fn().mockResolvedValue(undefined);

    const result = await processOneSourceMessage(
      FAKE_SUPABASE,
      FAKE_BUCKET,
      ENV,
      PROVIDERS,
      { slug: "x" },
      { sourceFn, pickFn: vi.fn(), recordEvent }
    );

    expect(result).toEqual({ status: "transient", reason: "rate_limited" });
    expect(recordEvent).toHaveBeenCalledWith(FAKE_SUPABASE, {
      equipmentId: "eq-1",
      eventKind: "provider_transient",
      metadata: { provider: "brave", reason: "rate_limited", attempts: 0 },
    });
  });

  it("returns 'no-candidates' and does not emit provider_transient when all providers were 'ok'", async () => {
    const sourceFn = vi.fn().mockResolvedValue(
      fakeResult({
        status: "no-candidates",
        candidates: [],
        insertedCount: 0,
        providerStatuses: [{ name: "brave", status: "ok" }],
      })
    );
    const recordEvent = vi.fn().mockResolvedValue(undefined);

    const result = await processOneSourceMessage(
      FAKE_SUPABASE,
      FAKE_BUCKET,
      ENV,
      PROVIDERS,
      { slug: "x" },
      { sourceFn, pickFn: vi.fn(), recordEvent }
    );

    expect(result).toEqual({ status: "no-candidates" });
    const transientCalls = recordEvent.mock.calls.filter(
      ([, args]) => args.eventKind === "provider_transient"
    );
    expect(transientCalls).toHaveLength(0);
  });

  it("returns 'error' when sourceFn throws", async () => {
    const sourceFn = vi.fn().mockRejectedValue(new Error("boom"));

    const result = await processOneSourceMessage(
      FAKE_SUPABASE,
      FAKE_BUCKET,
      ENV,
      PROVIDERS,
      { slug: "x" },
      { sourceFn, pickFn: vi.fn(), recordEvent: vi.fn() }
    );

    expect(result).toEqual({ status: "error", message: "boom" });
  });

  // TT-173: a row with image_key already set (admin re-queued the
  // photo and the live image was deliberately preserved) must not
  // auto-pick. Auto-promoting would route through pickCandidate's
  // losers cleanup and delete the previous picked row + R2 object,
  // leaving no fallback if the new pick is also wrong. New candidates
  // must land in the review queue. Replaces the TT-171/TT-172 force
  // flag tests — gating on row state instead of a message flag means
  // every re-queue trigger inherits this behaviour for free.
  it("does not auto-pick when equipment.image_key is already set; emits routed_to_review", async () => {
    const sourceFn = vi.fn().mockResolvedValue(
      fakeResult({
        status: "sourced",
        equipment: {
          id: "eq-1",
          slug: "stiga-airoc-m",
          name: "Stiga Airoc M",
          image_key: "equipment/stiga-airoc-m/picked.webp",
        },
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
    const pickFn = vi.fn();
    const recordEvent = vi.fn().mockResolvedValue(undefined);

    const result = await processOneSourceMessage(
      FAKE_SUPABASE,
      FAKE_BUCKET,
      ENV,
      PROVIDERS,
      { slug: "stiga-airoc-m" },
      { sourceFn, pickFn, recordEvent }
    );

    expect(result).toEqual({ status: "sourced", insertedCount: 1 });
    expect(pickFn).not.toHaveBeenCalled();
    expect(recordEvent).toHaveBeenCalledWith(FAKE_SUPABASE, {
      equipmentId: "eq-1",
      eventKind: "routed_to_review",
      metadata: { candidate_count: 1 },
    });
  });

  it("falls back to 'sourced' and emits routed_to_review when auto-pick throws", async () => {
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
    const recordEvent = vi.fn().mockResolvedValue(undefined);

    const result = await processOneSourceMessage(
      FAKE_SUPABASE,
      FAKE_BUCKET,
      ENV,
      PROVIDERS,
      { slug: "x" },
      { sourceFn, pickFn, recordEvent }
    );

    expect(result).toEqual({ status: "sourced", insertedCount: 1 });
    expect(recordEvent).toHaveBeenCalledWith(FAKE_SUPABASE, {
      equipmentId: "eq-1",
      eventKind: "routed_to_review",
      metadata: { candidate_count: 1 },
    });
    // No auto_picked event on the failure path.
    const autoPickedCalls = recordEvent.mock.calls.filter(
      ([, args]) => args.eventKind === "auto_picked"
    );
    expect(autoPickedCalls).toHaveLength(0);
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

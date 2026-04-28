import { describe, it, expect, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { bulkSourcePhotos } from "../bulk.server";
import type { SourcingResult, SourcedCandidate } from "../source.server";
import type { R2BucketSurface } from "../review.server";

const ENV = {
  BRAVE_SEARCH_API_KEY: "brave-key",
};

const BUCKET: R2BucketSurface = {
  put: async () => undefined,
  delete: async () => undefined,
  get: async () => null,
};

interface FakeRow {
  id: string;
  slug: string;
  category: string;
  manufacturer: string;
  name: string;
}

function makeSupabase(unimaged: FakeRow[]) {
  const supabase = {
    from() {
      return new Builder(unimaged);
    },
  } as unknown as SupabaseClient;
  return supabase;
}

class Builder {
  private filters: Array<{ col: string; val: unknown }> = [];
  private headOnly = false;
  private limitN: number | null = null;
  constructor(private rows: FakeRow[]) {}
  select(_cols: string, opts?: { count?: string; head?: boolean }) {
    if (opts?.head) this.headOnly = true;
    return this;
  }
  is(col: string, _val: unknown) {
    this.filters.push({ col, val: _val });
    return this;
  }
  order(_col: string, _opts: { ascending: boolean }) {
    return this;
  }
  limit(n: number) {
    this.limitN = n;
    return Promise.resolve({
      data: this.applyLimit(),
      error: null,
      count: this.rows.length,
    });
  }
  then<T>(
    resolve: (v: {
      data: FakeRow[] | null;
      error: null;
      count: number | null;
    }) => T
  ) {
    if (this.headOnly) {
      return Promise.resolve(
        resolve({ data: null, error: null, count: this.rows.length })
      );
    }
    return Promise.resolve(
      resolve({ data: this.applyLimit(), error: null, count: this.rows.length })
    );
  }
  private applyLimit(): FakeRow[] {
    return this.limitN === null ? this.rows : this.rows.slice(0, this.limitN);
  }
}

function fakeSourcing(over: Partial<SourcingResult>): SourcingResult {
  return {
    status: "sourced",
    equipment: { id: "eq-1", slug: "eq-1-slug", name: "x" },
    candidates: [],
    insertedCount: 0,
    providerStatuses: [],
    ...over,
  };
}

function fakeCandidate(over: Partial<SourcedCandidate> = {}): SourcedCandidate {
  return {
    id: "cand",
    r2_key: "equipment/x/cand/uuid.png",
    source_url: null,
    image_source_host: null,
    source_label: null,
    match_kind: "trailing",
    tier: 1,
    width: null,
    height: null,
    ...over,
  };
}

describe("bulkSourcePhotos", () => {
  it("processes chunkSize rows, throttling between them", async () => {
    const rows: FakeRow[] = Array.from({ length: 10 }, (_, i) => ({
      id: `eq-${i}`,
      slug: `slug-${i}`,
      category: "rubber",
      manufacturer: "X",
      name: `${i}`,
    }));
    const supabase = makeSupabase(rows);
    const sourceFn = vi
      .fn()
      .mockResolvedValue(fakeSourcing({ status: "no-candidates" }));
    const sleep = vi.fn().mockResolvedValue(undefined);

    const result = await bulkSourcePhotos(supabase, BUCKET, ENV, "admin-1", {
      chunkSize: 3,
      sourceFn,
      sleep,
      pickFn: vi.fn(),
    });

    expect(result.scanned).toBe(3);
    expect(result.unresolved).toBe(3);
    expect(result.remaining).toBe(7);
    expect(sourceFn).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenCalledTimes(2);
  });

  it("auto-picks when exactly 1 trailing candidate at tier ≤ 2", async () => {
    const rows: FakeRow[] = [
      {
        id: "eq-1",
        slug: "s1",
        category: "rubber",
        manufacturer: "X",
        name: "x",
      },
    ];
    const supabase = makeSupabase(rows);
    const sourceFn = vi.fn().mockResolvedValue(
      fakeSourcing({
        equipment: { id: "eq-1", slug: "s1", name: "x" },
        candidates: [
          fakeCandidate({ id: "winner", match_kind: "trailing", tier: 1 }),
        ],
        insertedCount: 1,
      })
    );
    const pickFn = vi.fn().mockResolvedValue({
      equipmentId: "eq-1",
      pickedR2Key: "equipment/s1/cand/uuid.png",
    });

    const result = await bulkSourcePhotos(supabase, BUCKET, ENV, "admin-1", {
      chunkSize: 1,
      sourceFn,
      pickFn,
      sleep: vi.fn(),
    });

    expect(result.autoPicked).toBe(1);
    expect(result.candidatesCreated).toBe(0);
    expect(pickFn).toHaveBeenCalledWith(supabase, BUCKET, {
      equipmentId: "eq-1",
      candidateId: "winner",
      pickedBy: "admin-1",
    });
  });

  it("does not auto-pick when there are 2+ trailing top-tier candidates", async () => {
    const rows: FakeRow[] = [
      {
        id: "eq-1",
        slug: "s1",
        category: "rubber",
        manufacturer: "X",
        name: "x",
      },
    ];
    const supabase = makeSupabase(rows);
    const sourceFn = vi.fn().mockResolvedValue(
      fakeSourcing({
        equipment: { id: "eq-1", slug: "s1", name: "x" },
        candidates: [
          fakeCandidate({ id: "a", match_kind: "trailing", tier: 1 }),
          fakeCandidate({ id: "b", match_kind: "trailing", tier: 2 }),
        ],
        insertedCount: 2,
      })
    );
    const pickFn = vi.fn();

    const result = await bulkSourcePhotos(supabase, BUCKET, ENV, "admin-1", {
      chunkSize: 1,
      sourceFn,
      pickFn,
      sleep: vi.fn(),
    });

    expect(result.autoPicked).toBe(0);
    expect(result.candidatesCreated).toBe(2);
    expect(pickFn).not.toHaveBeenCalled();
  });

  it("does not auto-pick a single loose candidate", async () => {
    const rows: FakeRow[] = [
      {
        id: "eq-1",
        slug: "s1",
        category: "rubber",
        manufacturer: "X",
        name: "x",
      },
    ];
    const supabase = makeSupabase(rows);
    const sourceFn = vi.fn().mockResolvedValue(
      fakeSourcing({
        equipment: { id: "eq-1", slug: "s1", name: "x" },
        candidates: [fakeCandidate({ id: "a", match_kind: "loose", tier: 1 })],
        insertedCount: 1,
      })
    );
    const pickFn = vi.fn();

    const result = await bulkSourcePhotos(supabase, BUCKET, ENV, "admin-1", {
      chunkSize: 1,
      sourceFn,
      pickFn,
      sleep: vi.fn(),
    });

    expect(result.autoPicked).toBe(0);
    expect(result.candidatesCreated).toBe(1);
    expect(pickFn).not.toHaveBeenCalled();
  });

  it("does not auto-pick when the single trailing candidate is tier 3+", async () => {
    const rows: FakeRow[] = [
      {
        id: "eq-1",
        slug: "s1",
        category: "rubber",
        manufacturer: "X",
        name: "x",
      },
    ];
    const supabase = makeSupabase(rows);
    const sourceFn = vi.fn().mockResolvedValue(
      fakeSourcing({
        equipment: { id: "eq-1", slug: "s1", name: "x" },
        candidates: [
          fakeCandidate({ id: "a", match_kind: "trailing", tier: 3 }),
        ],
        insertedCount: 1,
      })
    );
    const pickFn = vi.fn();

    const result = await bulkSourcePhotos(supabase, BUCKET, ENV, "admin-1", {
      chunkSize: 1,
      sourceFn,
      pickFn,
      sleep: vi.fn(),
    });

    expect(result.autoPicked).toBe(0);
    expect(result.candidatesCreated).toBe(1);
    expect(pickFn).not.toHaveBeenCalled();
  });

  it("collects per-row errors without aborting the chunk", async () => {
    const rows: FakeRow[] = [
      {
        id: "eq-1",
        slug: "s1",
        category: "rubber",
        manufacturer: "X",
        name: "x",
      },
      {
        id: "eq-2",
        slug: "s2",
        category: "rubber",
        manufacturer: "X",
        name: "y",
      },
    ];
    const supabase = makeSupabase(rows);
    const sourceFn = vi
      .fn()
      .mockRejectedValueOnce(new Error("brave 429"))
      .mockResolvedValueOnce(fakeSourcing({ status: "no-candidates" }));

    const result = await bulkSourcePhotos(supabase, BUCKET, ENV, "admin-1", {
      chunkSize: 2,
      sourceFn,
      pickFn: vi.fn(),
      sleep: vi.fn(),
    });

    expect(result.errors).toEqual([{ slug: "s1", message: "brave 429" }]);
    expect(result.scanned).toBe(2);
    expect(result.unresolved).toBe(1);
  });

  it("returns zero counts when nothing is left", async () => {
    const supabase = makeSupabase([]);
    const result = await bulkSourcePhotos(supabase, BUCKET, ENV, "admin-1", {
      sourceFn: vi.fn(),
      pickFn: vi.fn(),
      sleep: vi.fn(),
    });
    expect(result).toEqual({
      scanned: 0,
      autoPicked: 0,
      candidatesCreated: 0,
      unresolved: 0,
      remaining: 0,
      errors: [],
    });
  });
});

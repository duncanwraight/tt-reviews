import { describe, it, expect, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { sourcePhotosForEquipment, type R2PutBucket } from "../source.server";
import type { ResolvedCandidate } from "../brave.server";

const ENV = {
  BRAVE_SEARCH_API_KEY: "brave-key",
};

interface FakeRow {
  id: string;
  slug: string;
  name: string;
  manufacturer: string;
  category: string;
  image_key: string | null;
  image_sourcing_attempted_at?: string;
}

interface FakeCandidateRow {
  id: string;
  equipment_id: string;
  r2_key: string;
  source_url: string | null;
  image_source_host: string | null;
  source_label: string | null;
  match_kind: "trailing" | "loose";
  tier: number;
  width: number | null;
  height: number | null;
  picked_at: string | null;
}

function makeSupabase(
  initial: { equipment: FakeRow[]; candidates?: FakeCandidateRow[] } = {
    equipment: [],
  }
) {
  const equipment = [...initial.equipment];
  const candidates = [...(initial.candidates ?? [])];
  const equipmentUpdates: Array<Record<string, unknown>> = [];

  const supabase = {
    from(table: string) {
      if (table === "equipment") {
        return new EquipmentBuilder(equipment, equipmentUpdates);
      }
      if (table === "equipment_photo_candidates") {
        return new CandidatesBuilder(candidates);
      }
      throw new Error(`unexpected table: ${table}`);
    },
  } as unknown as SupabaseClient;

  return { supabase, equipment, candidates, equipmentUpdates };
}

class EquipmentBuilder {
  private filters: Record<string, unknown> = {};
  private mode: "select" | "update" = "select";
  private updateData: Record<string, unknown> | null = null;
  private columns: string[] = [];
  constructor(
    private equipment: FakeRow[],
    private updates: Array<Record<string, unknown>>
  ) {}
  select(cols: string) {
    this.columns = cols.split(",").map(s => s.trim());
    this.mode = "select";
    return this;
  }
  update(data: Record<string, unknown>) {
    this.mode = "update";
    this.updateData = data;
    return this;
  }
  eq(col: string, val: unknown) {
    this.filters[col] = val;
    if (this.mode === "update") {
      this.applyUpdate();
      return Promise.resolve({ error: null });
    }
    return this;
  }
  private applyUpdate() {
    if (!this.updateData) return;
    for (const row of this.equipment) {
      const match = Object.entries(this.filters).every(
        ([k, v]) => (row as unknown as Record<string, unknown>)[k] === v
      );
      if (match) {
        Object.assign(row, this.updateData);
        this.updates.push({ ...this.filters, ...this.updateData });
      }
    }
  }
  maybeSingle() {
    const row = this.equipment.find(r =>
      Object.entries(this.filters).every(
        ([k, v]) => (r as unknown as Record<string, unknown>)[k] === v
      )
    );
    return Promise.resolve({
      data: row
        ? Object.fromEntries(
            this.columns.map(c => [
              c,
              (row as unknown as Record<string, unknown>)[c],
            ])
          )
        : null,
      error: null,
    });
  }
}

class CandidatesBuilder {
  private filters: Array<{ kind: "eq" | "is"; col: string; val: unknown }> = [];
  private mode: "select" | "insert" = "select";
  private insertRows: Array<Omit<FakeCandidateRow, "id" | "picked_at">> = [];
  private selectAfterInsert = false;
  constructor(private candidates: FakeCandidateRow[]) {}
  select(_cols: string) {
    if (this.mode === "insert") {
      this.selectAfterInsert = true;
      return this.runInsert();
    }
    this.mode = "select";
    return this;
  }
  insert(rows: Array<Omit<FakeCandidateRow, "id" | "picked_at">>) {
    this.mode = "insert";
    this.insertRows = rows;
    return this;
  }
  eq(col: string, val: unknown) {
    this.filters.push({ kind: "eq", col, val });
    if (this.mode === "select" && !this.selectAfterInsert) return this;
    return this;
  }
  is(col: string, val: unknown) {
    this.filters.push({ kind: "is", col, val });
    return Promise.resolve({ data: this.runSelect(), error: null });
  }
  private runSelect(): FakeCandidateRow[] {
    return this.candidates.filter(r =>
      this.filters.every(f => {
        const v = (r as unknown as Record<string, unknown>)[f.col];
        if (f.kind === "is" && f.val === null) return v === null;
        return v === f.val;
      })
    );
  }
  private runInsert() {
    const inserted: FakeCandidateRow[] = this.insertRows.map((r, i) => ({
      ...r,
      id: `cand-${this.candidates.length + i + 1}`,
      picked_at: null,
    }));
    this.candidates.push(...inserted);
    return Promise.resolve({ data: inserted, error: null });
  }
}

function makeBucket(): {
  bucket: R2PutBucket;
  puts: Array<{ key: string; bytes: ArrayBuffer | Uint8Array }>;
} {
  const puts: Array<{ key: string; bytes: ArrayBuffer | Uint8Array }> = [];
  const bucket: R2PutBucket = {
    put: async (key, bytes) => {
      puts.push({ key, bytes });
      return undefined;
    },
  };
  return { bucket, puts };
}

const STIGA_ROW: FakeRow = {
  id: "eq-1",
  slug: "stiga-airoc-m",
  name: "Stiga Airoc M",
  manufacturer: "Stiga",
  category: "rubber",
  image_key: null,
};

function fakeResolved(over: Partial<ResolvedCandidate>): ResolvedCandidate {
  return {
    match: "trailing",
    tier: 1,
    tierLabel: "revspin",
    host: "www.revspin.net",
    imageUrl: "https://www.revspin.net/img/x.jpg",
    pageUrl: "https://www.revspin.net/x",
    source: null,
    title: null,
    ...over,
  };
}

const PNG = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x00,
]);

function fakeFetch(): typeof fetch {
  return (async () =>
    new Response(PNG.slice(), {
      status: 200,
      headers: { "content-type": "image/png" },
    })) as unknown as typeof fetch;
}

function deterministicIds(prefix: string): () => string {
  let i = 0;
  return () => `${prefix}-${++i}`;
}

describe("sourcePhotosForEquipment", () => {
  it("short-circuits when equipment.image_key is already set", async () => {
    const { supabase } = makeSupabase({
      equipment: [{ ...STIGA_ROW, image_key: "equipment/x/y.webp" }],
    });
    const { bucket, puts } = makeBucket();
    const resolve = vi.fn();
    const result = await sourcePhotosForEquipment(
      supabase,
      bucket,
      ENV,
      "stiga-airoc-m",
      { deps: { resolve, fetchImpl: fakeFetch() } }
    );
    expect(result.status).toBe("already-imaged");
    expect(resolve).not.toHaveBeenCalled();
    expect(puts).toHaveLength(0);
  });

  it("inserts candidate rows for each resolver hit and stamps attempted_at", async () => {
    const { supabase, candidates, equipment } = makeSupabase({
      equipment: [STIGA_ROW],
    });
    const { bucket, puts } = makeBucket();
    const randomId = deterministicIds("uuid");

    const resolve = vi.fn().mockResolvedValue([
      fakeResolved({
        imageUrl: "https://www.revspin.net/img/stiga-airoc-m.jpg",
        pageUrl: "https://www.revspin.net/stiga-airoc-m",
      }),
      fakeResolved({
        match: "loose",
        tier: 2,
        tierLabel: "contra",
        host: "contra.de",
        imageUrl: "https://contra.de/img/stiga-airoc-m-plus.jpg",
        pageUrl: "https://contra.de/airoc-m-plus",
      }),
    ]);

    const result = await sourcePhotosForEquipment(
      supabase,
      bucket,
      ENV,
      "stiga-airoc-m",
      { deps: { resolve, fetchImpl: fakeFetch(), randomId } }
    );

    expect(result.status).toBe("sourced");
    expect(result.insertedCount).toBe(2);
    expect(puts.map(p => p.key)).toEqual([
      "equipment/stiga-airoc-m/cand/uuid-1.png",
      "equipment/stiga-airoc-m/cand/uuid-2.png",
    ]);
    expect(candidates).toHaveLength(2);
    expect(candidates[0].r2_key).toBe(
      "equipment/stiga-airoc-m/cand/uuid-1.png"
    );
    expect(candidates[0].match_kind).toBe("trailing");
    expect(candidates[1].match_kind).toBe("loose");
    expect(equipment[0].image_sourcing_attempted_at).toBeTruthy();
  });

  it("dedupes against existing pending candidates by source_url", async () => {
    const existing: FakeCandidateRow = {
      id: "cand-existing",
      equipment_id: "eq-1",
      r2_key: "equipment/stiga-airoc-m/cand/old.png",
      source_url: "https://www.revspin.net/stiga-airoc-m",
      image_source_host: "www.revspin.net",
      source_label: "revspin",
      match_kind: "trailing",
      tier: 1,
      width: null,
      height: null,
      picked_at: null,
    };
    const { supabase, candidates } = makeSupabase({
      equipment: [STIGA_ROW],
      candidates: [existing],
    });
    const { bucket, puts } = makeBucket();
    const randomId = deterministicIds("uuid");

    const resolve = vi.fn().mockResolvedValue([
      // Should be skipped — same pageUrl as existing.
      fakeResolved({
        imageUrl: "https://www.revspin.net/img/stiga-airoc-m.jpg",
        pageUrl: "https://www.revspin.net/stiga-airoc-m",
      }),
      // Should be inserted — different page URL.
      fakeResolved({
        imageUrl: "https://www.megaspin.net/img/stiga-airoc-m.jpg",
        pageUrl: "https://www.megaspin.net/stiga-airoc-m",
        host: "www.megaspin.net",
        tierLabel: "megaspin",
      }),
    ]);

    const result = await sourcePhotosForEquipment(
      supabase,
      bucket,
      ENV,
      "stiga-airoc-m",
      { deps: { resolve, fetchImpl: fakeFetch(), randomId } }
    );

    expect(result.insertedCount).toBe(1);
    // Only one R2 put because the dedup bailed out before download.
    expect(puts).toHaveLength(1);
    expect(candidates).toHaveLength(2);
    expect(candidates[1].r2_key).toBe(
      "equipment/stiga-airoc-m/cand/uuid-1.png"
    );
  });

  it("returns no-candidates and stamps attempted_at when resolver finds nothing", async () => {
    const { supabase, equipment } = makeSupabase({ equipment: [STIGA_ROW] });
    const { bucket, puts } = makeBucket();
    const resolve = vi.fn().mockResolvedValue([]);

    const result = await sourcePhotosForEquipment(
      supabase,
      bucket,
      ENV,
      "stiga-airoc-m",
      { deps: { resolve, fetchImpl: fakeFetch() } }
    );

    expect(result.status).toBe("no-candidates");
    expect(result.insertedCount).toBe(0);
    expect(puts).toHaveLength(0);
    expect(equipment[0].image_sourcing_attempted_at).toBeTruthy();
  });

  it("skips a candidate whose image download fails (and continues with the next)", async () => {
    const { supabase, candidates } = makeSupabase({ equipment: [STIGA_ROW] });
    const { bucket, puts } = makeBucket();
    const randomId = deterministicIds("uuid");

    const resolve = vi.fn().mockResolvedValue([
      fakeResolved({
        imageUrl: "https://broken.example/x.jpg",
        pageUrl: "https://broken.example/x",
      }),
      fakeResolved({
        imageUrl: "https://www.revspin.net/img/x.jpg",
        pageUrl: "https://www.revspin.net/x",
      }),
    ]);

    let call = 0;
    const fetchImpl = (async () => {
      call += 1;
      if (call === 1) return new Response("nope", { status: 500 });
      return new Response(PNG.slice(), {
        status: 200,
        headers: { "content-type": "image/png" },
      });
    }) as unknown as typeof fetch;

    const result = await sourcePhotosForEquipment(
      supabase,
      bucket,
      ENV,
      "stiga-airoc-m",
      { deps: { resolve, fetchImpl, randomId } }
    );

    expect(result.insertedCount).toBe(1);
    expect(puts).toHaveLength(1);
    expect(candidates[0].r2_key).toBe(
      "equipment/stiga-airoc-m/cand/uuid-1.png"
    );
  });

  it("downloads candidates in parallel rather than serially", async () => {
    const { supabase } = makeSupabase({ equipment: [STIGA_ROW] });
    const { bucket } = makeBucket();
    const randomId = deterministicIds("uuid");

    const resolve = vi.fn().mockResolvedValue([
      fakeResolved({
        imageUrl: "https://r.example/a.png",
        pageUrl: "https://r.example/a",
      }),
      fakeResolved({
        imageUrl: "https://r.example/b.png",
        pageUrl: "https://r.example/b",
      }),
      fakeResolved({
        imageUrl: "https://r.example/c.png",
        pageUrl: "https://r.example/c",
      }),
    ]);

    let active = 0;
    let maxActive = 0;
    const fetchImpl = (async () => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      // 20ms is enough to ensure the next task's fetch starts before
      // this one resolves (event loop ticks are sub-ms).
      await new Promise<void>(r => setTimeout(r, 20));
      active -= 1;
      return new Response(PNG.slice(), {
        status: 200,
        headers: { "content-type": "image/png" },
      });
    }) as unknown as typeof fetch;

    const result = await sourcePhotosForEquipment(
      supabase,
      bucket,
      ENV,
      "stiga-airoc-m",
      { deps: { resolve, fetchImpl, randomId } }
    );

    expect(result.insertedCount).toBe(3);
    // Serial would mean maxActive === 1. Parallel means maxActive > 1.
    expect(maxActive).toBeGreaterThan(1);
  });

  it("throws when the equipment slug doesn't exist", async () => {
    const { supabase } = makeSupabase({ equipment: [] });
    const { bucket } = makeBucket();
    await expect(
      sourcePhotosForEquipment(supabase, bucket, ENV, "nope", {
        deps: { resolve: vi.fn(), fetchImpl: fakeFetch() },
      })
    ).rejects.toThrow(/equipment not found: nope/);
  });
});

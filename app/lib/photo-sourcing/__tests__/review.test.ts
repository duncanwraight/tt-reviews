import { describe, it, expect, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  pickCandidate,
  rejectCandidate,
  skipEquipment,
  resourceEquipment,
  toggleEquipmentTrim,
  type R2BucketSurface,
} from "../review.server";
import type { SourcingResult } from "../source.server";

const ENV = {
  BRAVE_SEARCH_API_KEY: "brave-key",
};

interface FakeEquipment {
  id: string;
  slug: string;
  name: string;
  image_key: string | null;
  image_etag: string | null;
  image_credit_text: string | null;
  image_credit_link: string | null;
  image_source_url: string | null;
  image_skipped_at: string | null;
  image_trim_kind?: string | null;
}

interface FakeCandidate {
  id: string;
  equipment_id: string;
  r2_key: string;
  source_url: string | null;
  image_source_host: string | null;
  source_label: string | null;
  picked_at: string | null;
  picked_by?: string | null;
}

function makeSupabase(state: {
  equipment: FakeEquipment[];
  candidates: FakeCandidate[];
}) {
  const supabase = {
    from(table: string) {
      if (table === "equipment") return new EqBuilder(state.equipment);
      if (table === "equipment_photo_candidates")
        return new CandBuilder(state.candidates);
      throw new Error(`unexpected table: ${table}`);
    },
  } as unknown as SupabaseClient;
  return { supabase, state };
}

function makeBucket(): {
  bucket: R2BucketSurface;
  deletes: string[];
  puts: string[];
} {
  const deletes: string[] = [];
  const puts: string[] = [];
  const bucket: R2BucketSurface = {
    put: async key => {
      puts.push(key);
      return undefined;
    },
    delete: async key => {
      deletes.push(key);
      return undefined;
    },
    get: async () => null,
  };
  return { bucket, deletes, puts };
}

// Bucket that returns canned bytes for any get(). Used by trim-detect
// tests to feed pickCandidate a real ArrayBuffer.
function makeBucketWithBytes(bytes: ArrayBuffer): R2BucketSurface {
  return {
    put: async () => undefined,
    delete: async () => undefined,
    get: async () => ({
      arrayBuffer: async () => bytes,
      httpMetadata: { contentType: "image/png" },
    }),
  };
}

class EqBuilder {
  private mode: "select" | "update" = "select";
  private filters: Array<{ col: string; val: unknown }> = [];
  private payload: Record<string, unknown> = {};
  constructor(private rows: FakeEquipment[]) {}
  select(_cols: string) {
    this.mode = "select";
    return this;
  }
  update(p: Record<string, unknown>) {
    this.mode = "update";
    this.payload = p;
    return this;
  }
  eq(col: string, val: unknown) {
    this.filters.push({ col, val });
    if (this.mode === "update") {
      for (const r of this.rows) {
        if (
          this.filters.every(
            f => (r as unknown as Record<string, unknown>)[f.col] === f.val
          )
        ) {
          Object.assign(r, this.payload);
        }
      }
      return Promise.resolve({ error: null });
    }
    return this;
  }
  maybeSingle() {
    const row = this.rows.find(r =>
      this.filters.every(
        f => (r as unknown as Record<string, unknown>)[f.col] === f.val
      )
    );
    return Promise.resolve({ data: row ?? null, error: null });
  }
}

class CandBuilder {
  private mode: "select" | "update" | "delete" = "select";
  private filters: Array<{ col: string; val: unknown }> = [];
  private inFilter: { col: string; vals: unknown[] } | null = null;
  private payload: Record<string, unknown> = {};
  constructor(private rows: FakeCandidate[]) {}
  select(_cols: string) {
    this.mode = "select";
    return this;
  }
  update(p: Record<string, unknown>) {
    this.mode = "update";
    this.payload = p;
    return this;
  }
  delete() {
    this.mode = "delete";
    return this;
  }
  eq(col: string, val: unknown) {
    this.filters.push({ col, val });
    if (this.mode === "update") {
      for (const r of this.rows) {
        if (
          this.filters.every(
            f => (r as unknown as Record<string, unknown>)[f.col] === f.val
          )
        ) {
          Object.assign(r, this.payload);
        }
      }
      return Promise.resolve({ error: null });
    }
    if (this.mode === "select") return this;
    if (this.mode === "delete") {
      const remaining = this.rows.filter(r => {
        return !this.filters.every(
          f => (r as unknown as Record<string, unknown>)[f.col] === f.val
        );
      });
      this.rows.length = 0;
      this.rows.push(...remaining);
      return Promise.resolve({ error: null });
    }
    return this;
  }
  in(col: string, vals: unknown[]) {
    this.inFilter = { col, vals };
    if (this.mode === "delete") {
      const remaining = this.rows.filter(r => {
        const v = (r as unknown as Record<string, unknown>)[col];
        return !vals.includes(v);
      });
      this.rows.length = 0;
      this.rows.push(...remaining);
      return Promise.resolve({ error: null });
    }
    return this;
  }
  maybeSingle() {
    const row = this.rows.find(r =>
      this.filters.every(
        f => (r as unknown as Record<string, unknown>)[f.col] === f.val
      )
    );
    return Promise.resolve({ data: row ?? null, error: null });
  }
  then<T>(resolve: (v: { data: FakeCandidate[]; error: null }) => T) {
    const out = this.rows.filter(r =>
      this.filters.every(
        f => (r as unknown as Record<string, unknown>)[f.col] === f.val
      )
    );
    return Promise.resolve(resolve({ data: out, error: null }));
  }
}

const EQ: FakeEquipment = {
  id: "eq-1",
  slug: "stiga-airoc-m",
  name: "Stiga Airoc M",
  image_key: null,
  image_etag: null,
  image_credit_text: null,
  image_credit_link: null,
  image_source_url: null,
  image_skipped_at: null,
};

const C1: FakeCandidate = {
  id: "c1",
  equipment_id: "eq-1",
  r2_key: "equipment/stiga-airoc-m/cand/uuid-1.png",
  source_url: "https://www.revspin.net/x",
  image_source_host: "www.revspin.net",
  source_label: "revspin",
  picked_at: null,
};
const C2: FakeCandidate = {
  id: "c2",
  equipment_id: "eq-1",
  r2_key: "equipment/stiga-airoc-m/cand/uuid-2.png",
  source_url: "https://contra.de/x",
  image_source_host: "contra.de",
  source_label: "contra",
  picked_at: null,
};

describe("pickCandidate", () => {
  it("promotes a candidate, marks it picked, and deletes runners-up", async () => {
    const { supabase, state } = makeSupabase({
      equipment: [{ ...EQ }],
      candidates: [{ ...C1 }, { ...C2 }],
    });
    const { bucket, deletes } = makeBucket();

    const result = await pickCandidate(supabase, bucket, {
      equipmentId: "eq-1",
      candidateId: "c1",
      pickedBy: "user-1",
    });

    expect(result.pickedR2Key).toBe(C1.r2_key);
    expect(state.equipment[0].image_key).toBe(C1.r2_key);
    expect(state.equipment[0].image_etag).toBe(C1.r2_key.slice(-12));
    expect(state.equipment[0].image_source_url).toBe(
      "https://www.revspin.net/x"
    );
    expect(state.equipment[0].image_credit_text).toBe("www.revspin.net");

    expect(state.candidates).toHaveLength(1);
    expect(state.candidates[0].id).toBe("c1");
    expect(state.candidates[0].picked_at).toBeTruthy();
    expect(state.candidates[0].picked_by).toBe("user-1");

    // R2 delete called once with the loser's key.
    expect(deletes).toEqual([C2.r2_key]);
  });

  it("throws when the candidate doesn't belong to the given equipment", async () => {
    const { supabase } = makeSupabase({
      equipment: [{ ...EQ }],
      candidates: [{ ...C1 }],
    });
    const { bucket } = makeBucket();
    await expect(
      pickCandidate(supabase, bucket, {
        equipmentId: "eq-1",
        candidateId: "ghost",
        pickedBy: "u",
      })
    ).rejects.toThrow(/candidate not found/);
  });

  it("throws when the candidate was already picked", async () => {
    const { supabase } = makeSupabase({
      equipment: [{ ...EQ }],
      candidates: [{ ...C1, picked_at: "2026-04-26T00:00:00Z" }],
    });
    const { bucket } = makeBucket();
    await expect(
      pickCandidate(supabase, bucket, {
        equipmentId: "eq-1",
        candidateId: "c1",
        pickedBy: "u",
      })
    ).rejects.toThrow(/already picked/);
  });

  it("sets image_trim_kind='auto' when picked PNG has transparent corners (TT-88)", async () => {
    const { supabase, state } = makeSupabase({
      equipment: [{ ...EQ }],
      candidates: [{ ...C1 }],
    });
    // Stub decoder returns a 2x2 RGBA buffer with all corners alpha=0.
    const decodePng = async () => ({
      data: new Uint8ClampedArray([
        0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      ]),
      width: 2,
      height: 2,
    });
    const bucket = makeBucketWithBytes(new ArrayBuffer(8));

    await pickCandidate(
      supabase,
      bucket,
      { equipmentId: "eq-1", candidateId: "c1", pickedBy: "u" },
      { decodePng }
    );

    expect(state.equipment[0].image_trim_kind).toBe("auto");
  });

  it("leaves image_trim_kind null when picked PNG has opaque corners", async () => {
    const { supabase, state } = makeSupabase({
      equipment: [{ ...EQ }],
      candidates: [{ ...C1 }],
    });
    const decodePng = async () => ({
      // alpha = 255 in every corner
      data: new Uint8ClampedArray([
        0, 0, 0, 255, 0, 0, 0, 255, 0, 0, 0, 255, 0, 0, 0, 255,
      ]),
      width: 2,
      height: 2,
    });
    const bucket = makeBucketWithBytes(new ArrayBuffer(8));

    await pickCandidate(
      supabase,
      bucket,
      { equipmentId: "eq-1", candidateId: "c1", pickedBy: "u" },
      { decodePng }
    );

    expect(state.equipment[0].image_trim_kind).toBeUndefined();
  });

  it("skips trim detection for JPEG candidates", async () => {
    const jpegCandidate: FakeCandidate = {
      ...C1,
      r2_key: "equipment/stiga-airoc-m/cand/uuid-1.jpg",
    };
    const { supabase, state } = makeSupabase({
      equipment: [{ ...EQ }],
      candidates: [jpegCandidate],
    });
    const decodePng = vi.fn();
    const decodeWebp = vi.fn();
    const bucket = makeBucketWithBytes(new ArrayBuffer(8));

    await pickCandidate(
      supabase,
      bucket,
      { equipmentId: "eq-1", candidateId: "c1", pickedBy: "u" },
      { decodePng, decodeWebp }
    );

    expect(decodePng).not.toHaveBeenCalled();
    expect(decodeWebp).not.toHaveBeenCalled();
    expect(state.equipment[0].image_trim_kind).toBeUndefined();
  });
});

describe("toggleEquipmentTrim", () => {
  it("sets image_trim_kind='border' when null", async () => {
    const { supabase, state } = makeSupabase({
      equipment: [{ ...EQ, image_trim_kind: null }],
      candidates: [],
    });
    const result = await toggleEquipmentTrim(supabase, "eq-1");
    expect(result.next).toBe("border");
    expect(state.equipment[0].image_trim_kind).toBe("border");
  });

  it("clears image_trim_kind when 'border'", async () => {
    const { supabase, state } = makeSupabase({
      equipment: [{ ...EQ, image_trim_kind: "border" }],
      candidates: [],
    });
    const result = await toggleEquipmentTrim(supabase, "eq-1");
    expect(result.next).toBeNull();
    expect(state.equipment[0].image_trim_kind).toBeNull();
  });

  it("clears 'auto' to null on toggle (admin override wins)", async () => {
    const { supabase, state } = makeSupabase({
      equipment: [{ ...EQ, image_trim_kind: "auto" }],
      candidates: [],
    });
    const result = await toggleEquipmentTrim(supabase, "eq-1");
    expect(result.next).toBeNull();
    expect(state.equipment[0].image_trim_kind).toBeNull();
  });

  it("throws when the equipment row doesn't exist", async () => {
    const { supabase } = makeSupabase({ equipment: [], candidates: [] });
    await expect(toggleEquipmentTrim(supabase, "ghost")).rejects.toThrow(
      /equipment not found/
    );
  });
});

describe("rejectCandidate", () => {
  it("deletes a single pending candidate", async () => {
    const { supabase, state } = makeSupabase({
      equipment: [{ ...EQ }],
      candidates: [{ ...C1 }, { ...C2 }],
    });
    const { bucket, deletes } = makeBucket();
    await rejectCandidate(supabase, bucket, "c1");
    expect(state.candidates.map(c => c.id)).toEqual(["c2"]);
    expect(deletes).toEqual([C1.r2_key]);
  });

  it("refuses to reject a picked candidate", async () => {
    const { supabase } = makeSupabase({
      equipment: [{ ...EQ }],
      candidates: [{ ...C1, picked_at: "2026-04-26T00:00:00Z" }],
    });
    const { bucket } = makeBucket();
    await expect(rejectCandidate(supabase, bucket, "c1")).rejects.toThrow(
      /cannot reject a picked candidate/
    );
  });

  it("throws when the candidate doesn't exist", async () => {
    const { supabase } = makeSupabase({
      equipment: [{ ...EQ }],
      candidates: [],
    });
    const { bucket } = makeBucket();
    await expect(rejectCandidate(supabase, bucket, "ghost")).rejects.toThrow(
      /candidate not found/
    );
  });
});

describe("skipEquipment", () => {
  it("clears all pending candidates and stamps image_skipped_at", async () => {
    const { supabase, state } = makeSupabase({
      equipment: [{ ...EQ }],
      candidates: [{ ...C1 }, { ...C2 }],
    });
    const { bucket, deletes } = makeBucket();
    await skipEquipment(supabase, bucket, "eq-1");
    expect(state.candidates).toHaveLength(0);
    expect(state.equipment[0].image_skipped_at).toBeTruthy();
    expect(deletes).toHaveLength(2);
  });

  it("keeps already-picked candidates intact", async () => {
    const { supabase, state } = makeSupabase({
      equipment: [{ ...EQ }],
      candidates: [{ ...C1, picked_at: "2026-04-26T00:00:00Z" }, { ...C2 }],
    });
    const { bucket } = makeBucket();
    await skipEquipment(supabase, bucket, "eq-1");
    expect(state.candidates.map(c => c.id)).toEqual(["c1"]);
    expect(state.equipment[0].image_skipped_at).toBeTruthy();
  });
});

describe("resourceEquipment", () => {
  it("clears pending candidates then re-runs the sourcing pipeline", async () => {
    const { supabase, state } = makeSupabase({
      equipment: [{ ...EQ }],
      candidates: [{ ...C1 }, { ...C2 }],
    });
    const { bucket, deletes } = makeBucket();
    const resource = vi.fn<() => Promise<SourcingResult>>().mockResolvedValue({
      status: "sourced",
      equipment: { id: "eq-1", slug: "stiga-airoc-m", name: "Stiga Airoc M" },
      candidates: [],
      insertedCount: 0,
    });

    const result = await resourceEquipment(
      supabase,
      bucket,
      ENV,
      "eq-1",
      "stiga-airoc-m",
      { resource }
    );

    expect(state.candidates).toHaveLength(0);
    expect(deletes).toHaveLength(2);
    expect(resource).toHaveBeenCalledTimes(1);
    expect(result.status).toBe("sourced");
  });
});

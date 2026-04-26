import { describe, it, expect, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  pickCandidate,
  rejectCandidate,
  skipEquipment,
  resourceEquipment,
} from "../review.server";
import type { SourcingResult } from "../source.server";

const ENV = {
  IMAGES_ACCOUNT_ID: "acct",
  IMAGES_ACCOUNT_HASH: "hash",
  IMAGES_API_TOKEN: "tok",
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
}

interface FakeCandidate {
  id: string;
  equipment_id: string;
  cf_image_id: string;
  source_url: string | null;
  image_source_host: string | null;
  source_label: string | null;
  picked_at: string | null;
  picked_by?: string | null;
}

// Tiny chained-builder mock that handles only the operations the
// review.server module actually performs. Tries to fail loudly if any
// untested call shape is used so silent miscoverage is hard.
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

class EqBuilder {
  private mode: "select" | "update" = "select";
  private filters: Array<{ col: string; val: unknown }> = [];
  private payload: Record<string, unknown> = {};
  constructor(private rows: FakeEquipment[]) {}
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
    if (this.mode === "select") {
      // Terminal eq() on select returns directly when used without
      // .maybeSingle() in the source code? — review code always uses
      // .maybeSingle() so this path stays as a chainable.
      return this;
    }
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
    // Used by `await supabase.from(...).select(...).eq(...)` pattern.
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
  cf_image_id: "cf-uuid-1",
  source_url: "https://www.revspin.net/x",
  image_source_host: "www.revspin.net",
  source_label: "revspin",
  picked_at: null,
};
const C2: FakeCandidate = {
  id: "c2",
  equipment_id: "eq-1",
  cf_image_id: "cf-uuid-2",
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
    const deleteCfImage = vi.fn().mockResolvedValue(undefined);

    const result = await pickCandidate(
      supabase,
      ENV,
      { equipmentId: "eq-1", candidateId: "c1", pickedBy: "user-1" },
      { deleteCfImage }
    );

    expect(result.pickedCfImageId).toBe("cf-uuid-1");
    expect(state.equipment[0].image_key).toBe("cf/cf-uuid-1");
    expect(state.equipment[0].image_etag).toBe("cf-uuid-1".slice(0, 8));
    expect(state.equipment[0].image_source_url).toBe(
      "https://www.revspin.net/x"
    );
    expect(state.equipment[0].image_credit_text).toBe("www.revspin.net");

    // C1 was marked picked + retained; C2 was deleted.
    expect(state.candidates).toHaveLength(1);
    expect(state.candidates[0].id).toBe("c1");
    expect(state.candidates[0].picked_at).toBeTruthy();
    expect(state.candidates[0].picked_by).toBe("user-1");

    // CF Images delete was called once with the loser's ID.
    expect(deleteCfImage).toHaveBeenCalledTimes(1);
    expect(deleteCfImage).toHaveBeenCalledWith(ENV, "cf-uuid-2");
  });

  it("throws when the candidate doesn't belong to the given equipment", async () => {
    const { supabase } = makeSupabase({
      equipment: [{ ...EQ }],
      candidates: [{ ...C1 }],
    });
    await expect(
      pickCandidate(
        supabase,
        ENV,
        { equipmentId: "eq-1", candidateId: "ghost", pickedBy: "u" },
        { deleteCfImage: vi.fn() }
      )
    ).rejects.toThrow(/candidate not found/);
  });

  it("throws when the candidate was already picked", async () => {
    const { supabase } = makeSupabase({
      equipment: [{ ...EQ }],
      candidates: [{ ...C1, picked_at: "2026-04-26T00:00:00Z" }],
    });
    await expect(
      pickCandidate(
        supabase,
        ENV,
        { equipmentId: "eq-1", candidateId: "c1", pickedBy: "u" },
        { deleteCfImage: vi.fn() }
      )
    ).rejects.toThrow(/already picked/);
  });
});

describe("rejectCandidate", () => {
  it("deletes a single pending candidate", async () => {
    const { supabase, state } = makeSupabase({
      equipment: [{ ...EQ }],
      candidates: [{ ...C1 }, { ...C2 }],
    });
    const deleteCfImage = vi.fn().mockResolvedValue(undefined);
    await rejectCandidate(supabase, ENV, "c1", { deleteCfImage });
    expect(state.candidates.map(c => c.id)).toEqual(["c2"]);
    expect(deleteCfImage).toHaveBeenCalledWith(ENV, "cf-uuid-1");
  });

  it("refuses to reject a picked candidate", async () => {
    const { supabase } = makeSupabase({
      equipment: [{ ...EQ }],
      candidates: [{ ...C1, picked_at: "2026-04-26T00:00:00Z" }],
    });
    await expect(
      rejectCandidate(supabase, ENV, "c1", { deleteCfImage: vi.fn() })
    ).rejects.toThrow(/cannot reject a picked candidate/);
  });

  it("throws when the candidate doesn't exist", async () => {
    const { supabase } = makeSupabase({
      equipment: [{ ...EQ }],
      candidates: [],
    });
    await expect(
      rejectCandidate(supabase, ENV, "ghost", { deleteCfImage: vi.fn() })
    ).rejects.toThrow(/candidate not found/);
  });
});

describe("skipEquipment", () => {
  it("clears all pending candidates and stamps image_skipped_at", async () => {
    const { supabase, state } = makeSupabase({
      equipment: [{ ...EQ }],
      candidates: [{ ...C1 }, { ...C2 }],
    });
    const deleteCfImage = vi.fn().mockResolvedValue(undefined);
    await skipEquipment(supabase, ENV, "eq-1", { deleteCfImage });
    expect(state.candidates).toHaveLength(0);
    expect(state.equipment[0].image_skipped_at).toBeTruthy();
    expect(deleteCfImage).toHaveBeenCalledTimes(2);
  });

  it("keeps already-picked candidates intact", async () => {
    const { supabase, state } = makeSupabase({
      equipment: [{ ...EQ }],
      candidates: [{ ...C1, picked_at: "2026-04-26T00:00:00Z" }, { ...C2 }],
    });
    await skipEquipment(supabase, ENV, "eq-1", {
      deleteCfImage: vi.fn().mockResolvedValue(undefined),
    });
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
    const deleteCfImage = vi.fn().mockResolvedValue(undefined);
    const resource = vi.fn<() => Promise<SourcingResult>>().mockResolvedValue({
      status: "sourced",
      equipment: { id: "eq-1", slug: "stiga-airoc-m", name: "Stiga Airoc M" },
      candidates: [],
      insertedCount: 0,
    });

    const result = await resourceEquipment(
      supabase,
      ENV,
      "eq-1",
      "stiga-airoc-m",
      { deleteCfImage, resource }
    );

    expect(state.candidates).toHaveLength(0);
    expect(deleteCfImage).toHaveBeenCalledTimes(2);
    expect(resource).toHaveBeenCalledTimes(1);
    expect(result.status).toBe("sourced");
  });
});

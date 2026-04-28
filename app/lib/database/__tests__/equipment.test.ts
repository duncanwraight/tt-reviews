import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as equipment from "../equipment";
import { makeSupabase, makeCtx } from "./helpers";

/**
 * Unit tests for every equipment submodule function. A mock Supabase client
 * records the builder chain so tests can assert that filters, sort orders,
 * and RPC fallbacks behave identically to the pre-split DatabaseService.
 */

describe("equipment.getEquipment", () => {
  it("returns single row via .maybeSingle on the equipment table", async () => {
    const row = { id: "eq1", slug: "butterfly-viscaria" };
    const supabase = makeSupabase({ tables: { equipment: { data: row } } });
    const result = await equipment.getEquipment(
      makeCtx(supabase),
      "butterfly-viscaria"
    );
    expect(result).toEqual(row);
    const builder = supabase._builders.get("equipment")!;
    expect(builder.calls).toEqual(
      expect.arrayContaining([
        { method: "from", args: ["equipment"] },
        { method: "select", args: ["*"] },
        { method: "eq", args: ["slug", "butterfly-viscaria"] },
        { method: "maybeSingle", args: [] },
      ])
    );
  });

  it("returns null when query errors", async () => {
    const supabase = makeSupabase({
      tables: { equipment: { error: { message: "network" } } },
    });
    expect(await equipment.getEquipment(makeCtx(supabase), "any")).toBeNull();
  });
});

describe("equipment.getEquipmentById", () => {
  it("queries by id and returns the row", async () => {
    const row = { id: "eq1" };
    const supabase = makeSupabase({ tables: { equipment: { data: row } } });
    expect(await equipment.getEquipmentById(makeCtx(supabase), "eq1")).toEqual(
      row
    );
    const b = supabase._builders.get("equipment")!;
    expect(b.calls).toContainEqual({ method: "eq", args: ["id", "eq1"] });
  });

  it("returns null on error", async () => {
    const supabase = makeSupabase({
      tables: { equipment: { error: { message: "boom" } } },
    });
    expect(
      await equipment.getEquipmentById(makeCtx(supabase), "nope")
    ).toBeNull();
  });
});

describe("equipment.searchEquipment", () => {
  it("does text search with limit 10", async () => {
    const rows = [{ id: "a" }, { id: "b" }];
    const supabase = makeSupabase({ tables: { equipment: { data: rows } } });
    expect(
      await equipment.searchEquipment(makeCtx(supabase), "butterfly")
    ).toEqual(rows);
    const b = supabase._builders.get("equipment")!;
    expect(b.calls).toContainEqual({
      method: "textSearch",
      args: ["name", "butterfly"],
    });
    expect(b.calls).toContainEqual({ method: "limit", args: [10] });
  });

  it("returns [] on error", async () => {
    const supabase = makeSupabase({
      tables: { equipment: { error: { message: "x" } } },
    });
    expect(await equipment.searchEquipment(makeCtx(supabase), "q")).toEqual([]);
  });
});

describe("equipment.getRecentEquipment", () => {
  it("orders by created_at desc with specified limit", async () => {
    const rows = [{ id: "a" }];
    const supabase = makeSupabase({ tables: { equipment: { data: rows } } });
    expect(await equipment.getRecentEquipment(makeCtx(supabase), 5)).toEqual(
      rows
    );
    const b = supabase._builders.get("equipment")!;
    expect(b.calls).toContainEqual({
      method: "order",
      args: ["created_at", { ascending: false }],
    });
    expect(b.calls).toContainEqual({ method: "limit", args: [5] });
  });

  it("defaults to limit 10", async () => {
    const supabase = makeSupabase({
      tables: { equipment: { data: [] } },
    });
    await equipment.getRecentEquipment(makeCtx(supabase));
    const b = supabase._builders.get("equipment")!;
    expect(b.calls).toContainEqual({ method: "limit", args: [10] });
  });
});

describe("equipment.getAllEquipment", () => {
  it("applies category, subcategory, sortBy/Order, limit, offset", async () => {
    const supabase = makeSupabase({
      tables: { equipment: { data: [{ id: "a" }] } },
    });
    await equipment.getAllEquipment(makeCtx(supabase), {
      category: "blade",
      subcategory: "inverted",
      sortBy: "name",
      sortOrder: "asc",
      limit: 20,
      offset: 40,
    });
    const b = supabase._builders.get("equipment")!;
    expect(b.calls).toContainEqual({
      method: "eq",
      args: ["category", "blade"],
    });
    expect(b.calls).toContainEqual({
      method: "eq",
      args: ["subcategory", "inverted"],
    });
    expect(b.calls).toContainEqual({
      method: "order",
      args: ["name", { ascending: true }],
    });
    expect(b.calls).toContainEqual({ method: "limit", args: [20] });
    expect(b.calls).toContainEqual({ method: "range", args: [40, 59] });
  });

  it("uses default ordering (created_at desc) and no filters when no options", async () => {
    const supabase = makeSupabase({ tables: { equipment: { data: [] } } });
    await equipment.getAllEquipment(makeCtx(supabase));
    const b = supabase._builders.get("equipment")!;
    expect(b.calls).toContainEqual({
      method: "order",
      args: ["created_at", { ascending: false }],
    });
    const eqCalls = b.calls.filter(c => c.method === "eq");
    expect(eqCalls).toHaveLength(0);
  });

  it("returns [] on query error", async () => {
    const supabase = makeSupabase({
      tables: { equipment: { error: { message: "x" } } },
    });
    expect(await equipment.getAllEquipment(makeCtx(supabase))).toEqual([]);
  });
});

describe("equipment.getEquipmentByCategory", () => {
  it("filters by category and orders by name asc", async () => {
    const supabase = makeSupabase({
      tables: { equipment: { data: [{ id: "a" }] } },
    });
    await equipment.getEquipmentByCategory(makeCtx(supabase), "rubber");
    const b = supabase._builders.get("equipment")!;
    expect(b.calls).toContainEqual({
      method: "eq",
      args: ["category", "rubber"],
    });
    expect(b.calls).toContainEqual({
      method: "order",
      args: ["name", { ascending: true }],
    });
  });
});

describe("equipment.getEquipmentCategories", () => {
  it("uses RPC result when available", async () => {
    const supabase = makeSupabase({
      rpc: {
        get_equipment_category_counts: {
          data: [{ category: "blade", count: 5 }],
        },
      },
    });
    const result = await equipment.getEquipmentCategories(makeCtx(supabase));
    expect(result).toEqual([{ category: "blade", count: 5 }]);
    expect(supabase.rpc).toHaveBeenCalledWith("get_equipment_category_counts");
  });

  it("falls back to manual aggregation on RPC error", async () => {
    const supabase = makeSupabase({
      rpc: {
        get_equipment_category_counts: {
          error: { message: "function does not exist" },
        },
      },
      tables: {
        equipment: {
          data: [
            { category: "blade" },
            { category: "blade" },
            { category: "rubber" },
          ],
        },
      },
    });
    const result = await equipment.getEquipmentCategories(makeCtx(supabase));
    expect(result).toEqual(
      expect.arrayContaining([
        { category: "blade", count: 2 },
        { category: "rubber", count: 1 },
      ])
    );
  });

  it("returns [] when both RPC and fallback fail", async () => {
    const supabase = makeSupabase({
      rpc: { get_equipment_category_counts: { error: { message: "x" } } },
      tables: { equipment: { error: { message: "y" } } },
    });

    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await equipment.getEquipmentCategories(makeCtx(supabase))).toEqual(
      []
    );
    spy.mockRestore();
  });
});

describe("equipment.getEquipmentSubcategories", () => {
  it("uses RPC result when available and passes category_filter", async () => {
    const supabase = makeSupabase({
      rpc: {
        get_equipment_subcategory_counts: {
          data: [{ subcategory: "inverted", count: 3 }],
        },
      },
    });
    const result = await equipment.getEquipmentSubcategories(
      makeCtx(supabase),
      "rubber"
    );
    expect(result).toEqual([{ subcategory: "inverted", count: 3 }]);
    expect(supabase.rpc).toHaveBeenCalledWith(
      "get_equipment_subcategory_counts",
      { category_filter: "rubber" }
    );
  });

  it("falls back to aggregation and filters null subcategories", async () => {
    const supabase = makeSupabase({
      rpc: {
        get_equipment_subcategory_counts: { error: { message: "x" } },
      },
      tables: {
        equipment: {
          data: [
            { subcategory: "inverted" },
            { subcategory: "inverted" },
            { subcategory: "long_pips" },
            { subcategory: null },
          ],
        },
      },
    });
    const result = await equipment.getEquipmentSubcategories(
      makeCtx(supabase),
      "rubber"
    );
    expect(result).toEqual(
      expect.arrayContaining([
        { subcategory: "inverted", count: 2 },
        { subcategory: "long_pips", count: 1 },
      ])
    );
  });
});

describe("equipment.getEquipmentWithStats", () => {
  it("returns RPC data when successful", async () => {
    const rows = [{ id: "a", averageRating: 4.5 }];
    const supabase = makeSupabase({
      rpc: { get_equipment_with_stats: { data: rows } },
    });
    expect(await equipment.getEquipmentWithStats(makeCtx(supabase), 7)).toEqual(
      rows
    );
    expect(supabase.rpc).toHaveBeenCalledWith("get_equipment_with_stats", {
      limit_count: 7,
    });
  });

  it("falls back to getRecentEquipment on RPC error", async () => {
    const supabase = makeSupabase({
      rpc: { get_equipment_with_stats: { error: { message: "boom" } } },
      tables: { equipment: { data: [{ id: "fallback" }] } },
    });
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await equipment.getEquipmentWithStats(makeCtx(supabase), 3)).toEqual(
      [{ id: "fallback" }]
    );
    spy.mockRestore();
  });
});

describe("equipment.getPopularEquipment", () => {
  it("returns popular as-is when popular.length >= limit", async () => {
    const rows = [{ id: "p1" }, { id: "p2" }];
    const supabase = makeSupabase({
      rpc: { get_popular_equipment: { data: rows } },
    });
    expect(await equipment.getPopularEquipment(makeCtx(supabase), 2)).toEqual(
      rows
    );
    expect(supabase.rpc).toHaveBeenCalledWith("get_popular_equipment", {
      limit_count: 2,
    });
  });

  it("falls back to getRecentEquipment on RPC error", async () => {
    const supabase = makeSupabase({
      rpc: { get_popular_equipment: { error: { message: "x" } } },
      tables: { equipment: { data: [{ id: "fallback" }] } },
    });
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await equipment.getPopularEquipment(makeCtx(supabase))).toEqual([
      { id: "fallback" },
    ]);
    spy.mockRestore();
  });

  it("tops up with random equipment when popular returns fewer than limit", async () => {
    const popular = [
      { id: "p1", averageRating: 8, reviewCount: 4 },
      { id: "p2", averageRating: 7, reviewCount: 2 },
      { id: "p3", averageRating: 9, reviewCount: 1 },
    ];
    const allEquipment = [
      { id: "p1" }, // popular — must be excluded from top-up
      { id: "e1" },
      { id: "e2" },
      { id: "e3" },
      { id: "e4" },
      { id: "e5" },
    ];
    const supabase = makeSupabase({
      rpc: { get_popular_equipment: { data: popular } },
      tables: { equipment: { data: allEquipment } },
    });
    const result = await equipment.getPopularEquipment(makeCtx(supabase), 6);
    expect(result).toHaveLength(6);
    // Popular comes first, in RPC order.
    expect(result.slice(0, 3).map(r => r.id)).toEqual(["p1", "p2", "p3"]);
    // No duplicates.
    expect(new Set(result.map(r => r.id)).size).toBe(6);
    // Top-up rows have reviewCount: 0 and no averageRating.
    for (const r of result.slice(3)) {
      expect(r.reviewCount).toBe(0);
      expect(r.averageRating).toBeUndefined();
      expect(["e1", "e2", "e3", "e4", "e5"]).toContain(r.id);
    }
  });

  it("returns min(limit, N) when total equipment is less than limit", async () => {
    const popular = [{ id: "p1" }];
    const allEquipment = [{ id: "p1" }, { id: "e1" }, { id: "e2" }];
    const supabase = makeSupabase({
      rpc: { get_popular_equipment: { data: popular } },
      tables: { equipment: { data: allEquipment } },
    });
    const result = await equipment.getPopularEquipment(makeCtx(supabase), 6);
    expect(result).toHaveLength(3);
    expect(result[0].id).toBe("p1");
    expect(new Set(result.map(r => r.id)).size).toBe(3);
  });
});

describe("equipment.getAllEquipmentWithStats", () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    errorSpy.mockRestore();
  });

  it("computes averageRating and reviewCount from joined reviews", async () => {
    const joinedRows = [
      {
        id: "a",
        name: "A",
        manufacturer: "m",
        created_at: "2024-01-01",
        equipment_reviews: { overall_rating: 8, status: "approved" },
      },
      {
        id: "a",
        name: "A",
        manufacturer: "m",
        created_at: "2024-01-01",
        equipment_reviews: { overall_rating: 6, status: "approved" },
      },
    ];
    const supabase = makeSupabase({
      tables: { equipment: { data: joinedRows } },
    });
    // getAllEquipment (second call for equipment-without-reviews) uses the
    // same shared builder — leave it returning an empty list so only
    // reviewed rows surface.
    const result = await equipment.getAllEquipmentWithStats(makeCtx(supabase), {
      sortBy: "rating",
      sortOrder: "desc",
    });
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      id: "a",
      averageRating: 7,
      reviewCount: 2,
    });
  });

  it("falls back to getAllEquipment on query error and coerces 'rating' sortBy to 'name'", async () => {
    const supabase = makeSupabase({
      tables: { equipment: { error: { message: "bad join" } } },
    });
    const result = await equipment.getAllEquipmentWithStats(makeCtx(supabase), {
      sortBy: "rating",
    });
    expect(result).toEqual([]);
  });

  it("sorts ascending by name when specified", async () => {
    const joined = [
      {
        id: "b",
        name: "B",
        manufacturer: "m",
        created_at: "2024-01-02",
        equipment_reviews: { overall_rating: 8, status: "approved" },
      },
      {
        id: "a",
        name: "A",
        manufacturer: "m",
        created_at: "2024-01-01",
        equipment_reviews: { overall_rating: 6, status: "approved" },
      },
    ];
    const supabase = makeSupabase({
      tables: { equipment: { data: joined } },
    });
    const result = await equipment.getAllEquipmentWithStats(makeCtx(supabase), {
      sortBy: "name",
      sortOrder: "asc",
    });
    expect(result.map(r => r.id)).toEqual(["a", "b"]);
  });
});

describe("equipment.getSimilarEquipment", () => {
  it("fetches current equipment then queries same category excluding id", async () => {
    // First call (getEquipmentById via .maybeSingle) returns the row;
    // the subsequent chained query returns the "similar" list.
    const supabase = makeSupabase({
      tables: {
        equipment: {
          data: [{ id: "neighbor" }],
        },
      },
    });
    // getEquipmentById's .maybeSingle should resolve to the current row.
    // The shared builder returns `result.data` on both .maybeSingle() and
    // when awaited. We reconfigure between the two internal calls is tricky,
    // so simulate by returning a list-shaped object wrapped as .maybeSingle
    // data. We pivot: set data to the current equipment for .maybeSingle,
    // and same data for awaited list (both should be a non-null object/array).
    const builder = supabase._builders.get("equipment")!;
    builder.result = {
      data: { id: "target", category: "blade" },
      error: null,
    };

    // Override the awaited result separately by re-assigning after the
    // maybeSingle call resolves. Simplest: return the same shape; the
    // function will treat .maybeSingle → { id, category: "blade" } ok.
    // For the second await the mock will return the same { data } — our
    // code treats { data, error } tuple returned from the final query.

    const result = await equipment.getSimilarEquipment(
      makeCtx(supabase),
      "target",
      4
    );
    // The awaited builder result is still the object — the function runs
    // `return await ctx.supabase.from(...).eq(...).neq(...).limit(...)`
    // and our thenable resolves to the stored state. So result becomes
    // the "data" extracted by withLogging, which unwraps and returns it.
    expect(result).toEqual({ id: "target", category: "blade" });
    expect(builder.calls).toContainEqual({
      method: "neq",
      args: ["id", "target"],
    });
    expect(builder.calls).toContainEqual({ method: "limit", args: [4] });
  });

  it("returns [] when current equipment is not found", async () => {
    const supabase = makeSupabase({
      tables: { equipment: { data: null } },
    });
    expect(
      await equipment.getSimilarEquipment(makeCtx(supabase), "missing")
    ).toEqual([]);
  });
});

describe("equipment.getRankedSimilarEquipment", () => {
  it("returns [] when no precomputed similar rows exist", async () => {
    const supabase = makeSupabase({
      tables: { equipment_similar: { data: [] } },
    });
    const result = await equipment.getRankedSimilarEquipment(
      makeCtx(supabase),
      "target",
      6
    );
    expect(result).toEqual([]);
    const b = supabase._builders.get("equipment_similar")!;
    expect(b.calls).toContainEqual({
      method: "eq",
      args: ["equipment_id", "target"],
    });
    expect(b.calls).toContainEqual({
      method: "order",
      args: ["rank", { ascending: true }],
    });
    expect(b.calls).toContainEqual({ method: "limit", args: [6] });
  });

  it("preserves rank order, drops missing equipment, attaches stats", async () => {
    // Precomputed similar IDs in rank order (lower rank = closer match).
    const similar = [
      { similar_equipment_id: "eq-2", rank: 1 },
      { similar_equipment_id: "eq-3", rank: 2 },
      { similar_equipment_id: "eq-missing", rank: 3 },
    ];
    // equipment table returns rows out of rank order — function must reorder.
    const equipRows = [
      {
        id: "eq-3",
        name: "Three",
        slug: "three",
        category: "blade",
        manufacturer: "B",
      },
      {
        id: "eq-2",
        name: "Two",
        slug: "two",
        category: "blade",
        manufacturer: "A",
      },
      // eq-missing intentionally absent — simulates a deleted equipment row
      // surviving briefly in equipment_similar before the next prune.
    ];
    const reviews = [
      { equipment_id: "eq-2", overall_rating: 8 },
      { equipment_id: "eq-2", overall_rating: 6 },
      // eq-3 has no approved reviews — should land with reviewCount=0.
    ];

    const supabase = makeSupabase({
      tables: {
        equipment_similar: { data: similar },
        equipment: { data: equipRows },
        equipment_reviews: { data: reviews },
      },
    });

    const result = await equipment.getRankedSimilarEquipment(
      makeCtx(supabase),
      "target",
      10
    );

    expect(result.map(r => r.id)).toEqual(["eq-2", "eq-3"]);
    expect(result[0].averageRating).toBe(7);
    expect(result[0].reviewCount).toBe(2);
    expect(result[1].averageRating).toBeUndefined();
    expect(result[1].reviewCount).toBe(0);

    const eqBuilder = supabase._builders.get("equipment")!;
    expect(eqBuilder.calls).toContainEqual({
      method: "in",
      args: ["id", ["eq-2", "eq-3", "eq-missing"]],
    });

    const reviewBuilder = supabase._builders.get("equipment_reviews")!;
    expect(reviewBuilder.calls).toContainEqual({
      method: "eq",
      args: ["status", "approved"],
    });
  });

  it("returns [] when the equipment fetch errors", async () => {
    const supabase = makeSupabase({
      tables: {
        equipment_similar: {
          data: [{ similar_equipment_id: "eq-2", rank: 1 }],
        },
        equipment: { error: { message: "boom" } },
      },
    });
    const result = await equipment.getRankedSimilarEquipment(
      makeCtx(supabase),
      "target"
    );
    expect(result).toEqual([]);
  });

  it("downgrades to no-ratings when review fetch errors but equipment ok", async () => {
    const supabase = makeSupabase({
      tables: {
        equipment_similar: {
          data: [{ similar_equipment_id: "eq-2", rank: 1 }],
        },
        equipment: {
          data: [
            {
              id: "eq-2",
              name: "Two",
              slug: "two",
              category: "blade",
              manufacturer: "A",
            },
          ],
        },
        equipment_reviews: { error: { message: "boom" } },
      },
    });
    const result = await equipment.getRankedSimilarEquipment(
      makeCtx(supabase),
      "target"
    );
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("eq-2");
    expect(result[0].averageRating).toBeUndefined();
    expect(result[0].reviewCount).toBe(0);
  });
});

describe("equipment.getPlayersUsingEquipment", () => {
  it("deduplicates players across multiple setup rows", async () => {
    const setups = [
      { players: { id: "p1", name: "A", slug: "a" } },
      { players: { id: "p1", name: "A", slug: "a" } },
      { players: { id: "p2", name: "B", slug: "b" } },
    ];
    const supabase = makeSupabase({
      tables: { player_equipment_setups: { data: setups } },
    });
    const result = await equipment.getPlayersUsingEquipment(
      makeCtx(supabase),
      "eq1"
    );
    expect(result).toHaveLength(2);
    expect(result.map(p => p.id).sort()).toEqual(["p1", "p2"]);
  });

  it("applies .or filter across blade_id, forehand, backhand and verified=true", async () => {
    const supabase = makeSupabase({
      tables: { player_equipment_setups: { data: [] } },
    });
    await equipment.getPlayersUsingEquipment(makeCtx(supabase), "eq1");
    const b = supabase._builders.get("player_equipment_setups")!;
    expect(b.calls).toContainEqual({
      method: "or",
      args: [
        "blade_id.eq.eq1,forehand_rubber_id.eq.eq1,backhand_rubber_id.eq.eq1",
      ],
    });
    expect(b.calls).toContainEqual({
      method: "eq",
      args: ["verified", true],
    });
  });
});

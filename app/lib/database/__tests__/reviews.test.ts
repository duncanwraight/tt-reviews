import { describe, it, expect, vi } from "vitest";
import * as reviews from "../reviews";
import { makeSupabase, makeCtx } from "./helpers";

describe("reviews.getEquipmentReviews", () => {
  it("adds status=approved filter when status arg is 'approved'", async () => {
    const supabase = makeSupabase({
      tables: { equipment_reviews: { data: [{ id: "r1" }] } },
    });
    await reviews.getEquipmentReviews(makeCtx(supabase), "eq1", "approved");
    const b = supabase._builders.get("equipment_reviews")!;
    expect(b.calls).toContainEqual({
      method: "eq",
      args: ["equipment_id", "eq1"],
    });
    expect(b.calls).toContainEqual({
      method: "eq",
      args: ["status", "approved"],
    });
  });

  it("omits the status filter when status arg is 'all'", async () => {
    const supabase = makeSupabase({
      tables: { equipment_reviews: { data: [] } },
    });
    await reviews.getEquipmentReviews(makeCtx(supabase), "eq1", "all");
    const b = supabase._builders.get("equipment_reviews")!;
    const statusFilter = b.calls.filter(
      c => c.method === "eq" && c.args[0] === "status"
    );
    expect(statusFilter).toHaveLength(0);
  });

  it("returns [] when withLogging throws", async () => {
    const supabase = makeSupabase({
      tables: {
        equipment_reviews: { error: { message: "boom" } },
      },
    });
    expect(await reviews.getEquipmentReviews(makeCtx(supabase), "eq1")).toEqual(
      []
    );
  });
});

describe("reviews.getRecentReviews", () => {
  it("filters by status=approved and orders by created_at desc", async () => {
    const supabase = makeSupabase({
      tables: { equipment_reviews: { data: [{ id: "r1" }] } },
    });
    expect(await reviews.getRecentReviews(makeCtx(supabase), 5)).toEqual([
      { id: "r1" },
    ]);
    const b = supabase._builders.get("equipment_reviews")!;
    expect(b.calls).toContainEqual({
      method: "eq",
      args: ["status", "approved"],
    });
    expect(b.calls).toContainEqual({ method: "limit", args: [5] });
  });

  it("returns [] on error", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const supabase = makeSupabase({
      tables: { equipment_reviews: { error: { message: "x" } } },
    });
    expect(await reviews.getRecentReviews(makeCtx(supabase))).toEqual([]);
    spy.mockRestore();
  });
});

describe("reviews.getUserReviews", () => {
  it("filters by user_id and orders by created_at desc", async () => {
    const supabase = makeSupabase({
      tables: { equipment_reviews: { data: [{ id: "r1" }] } },
    });
    await reviews.getUserReviews(makeCtx(supabase), "user-1");
    const b = supabase._builders.get("equipment_reviews")!;
    expect(b.calls).toContainEqual({
      method: "eq",
      args: ["user_id", "user-1"],
    });
  });

  it("returns [] on error", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const supabase = makeSupabase({
      tables: { equipment_reviews: { error: { message: "x" } } },
    });
    expect(await reviews.getUserReviews(makeCtx(supabase), "u")).toEqual([]);
    spy.mockRestore();
  });
});

describe("reviews.getUserReviewForEquipment", () => {
  it("filters by both equipment_id and user_id via maybeSingle", async () => {
    const row = { id: "r1" };
    const supabase = makeSupabase({
      tables: { equipment_reviews: { data: row } },
    });
    expect(
      await reviews.getUserReviewForEquipment(makeCtx(supabase), "eq1", "u1")
    ).toEqual(row);
    const b = supabase._builders.get("equipment_reviews")!;
    expect(b.calls).toContainEqual({
      method: "eq",
      args: ["equipment_id", "eq1"],
    });
    expect(b.calls).toContainEqual({
      method: "eq",
      args: ["user_id", "u1"],
    });
    expect(b.calls).toContainEqual({ method: "maybeSingle", args: [] });
  });

  it("returns null on error", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const supabase = makeSupabase({
      tables: { equipment_reviews: { error: { message: "x" } } },
    });
    expect(
      await reviews.getUserReviewForEquipment(makeCtx(supabase), "eq", "u")
    ).toBeNull();
    spy.mockRestore();
  });
});

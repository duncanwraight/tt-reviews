import { describe, it, expect, vi } from "vitest";
import * as admin from "../admin";
import { makeSupabase, makeCtx } from "./helpers";

describe("admin.getAdminDashboardCounts", () => {
  it("aggregates totals and status buckets across all six queries", async () => {
    const supabase = makeSupabase({
      tables: {
        equipment_submissions: {
          data: [
            { status: "pending" },
            { status: "pending" },
            { status: "approved" },
          ],
        },
        player_submissions: {
          data: [
            { status: "approved" },
            { status: "rejected" },
          ],
        },
        player_edits: {
          data: [{ status: "awaiting_second_approval" }],
        },
        equipment_reviews: {
          data: [{ status: "pending" }, { status: "approved" }],
        },
        equipment: { count: 100 },
        players: { count: 50 },
      },
    });

    const result = await admin.getAdminDashboardCounts(makeCtx(supabase));
    expect(result.totals).toEqual({
      equipmentSubmissions: 3,
      playerSubmissions: 2,
      playerEdits: 1,
      equipmentReviews: 2,
      equipment: 100,
      players: 50,
    });
    expect(result.byStatus.equipmentSubmissions).toEqual({
      pending: 2,
      awaiting_second_approval: 0,
      approved: 1,
      rejected: 0,
    });
    expect(result.byStatus.playerSubmissions).toEqual({
      pending: 0,
      awaiting_second_approval: 0,
      approved: 1,
      rejected: 1,
    });
    expect(result.byStatus.playerEdits.awaiting_second_approval).toBe(1);
    expect(result.byStatus.equipmentReviews).toEqual({
      pending: 1,
      awaiting_second_approval: 0,
      approved: 1,
      rejected: 0,
    });
  });

  it("ignores unknown status values in the data", async () => {
    const supabase = makeSupabase({
      tables: {
        equipment_submissions: {
          data: [{ status: "weird_status" }, { status: "approved" }],
        },
        player_submissions: { data: [] },
        player_edits: { data: [] },
        equipment_reviews: { data: [] },
        equipment: { count: 0 },
        players: { count: 0 },
      },
    });
    const result = await admin.getAdminDashboardCounts(makeCtx(supabase));
    expect(result.byStatus.equipmentSubmissions.approved).toBe(1);
    expect(result.byStatus.equipmentSubmissions.pending).toBe(0);
  });

  it("returns a fully-zeroed fallback when Promise.all throws", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const failingSupabase = {
      from: vi.fn(() => {
        throw new Error("blew up");
      }),
      rpc: vi.fn(),
    };
    const result = await admin.getAdminDashboardCounts({
       
      supabase: failingSupabase as unknown as any,
      context: { requestId: "t" },
    });
    expect(result.totals).toEqual({
      equipmentSubmissions: 0,
      playerSubmissions: 0,
      playerEdits: 0,
      equipmentReviews: 0,
      equipment: 0,
      players: 0,
    });
    expect(result.byStatus.equipmentSubmissions.pending).toBe(0);
    spy.mockRestore();
  });
});

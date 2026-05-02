import { describe, it, expect, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getAdminDashboardCounts } from "../dashboard.server";

function rpcStub(returnValue: {
  data?: unknown;
  error?: { message: string } | null;
}) {
  const rpc = vi.fn(() => Promise.resolve(returnValue));
  return {
    client: { rpc } as unknown as SupabaseClient,
    rpc,
  };
}

describe("getAdminDashboardCounts", () => {
  it("calls the get_admin_dashboard_counts RPC exactly once", async () => {
    const stub = rpcStub({
      data: {
        totals: {
          equipmentSubmissions: 10,
          equipmentEdits: 0,
          playerSubmissions: 0,
          playerEdits: 0,
          equipmentReviews: 0,
          videoSubmissions: 0,
          playerEquipmentSetups: 0,
          equipment: 100,
          players: 50,
        },
        byStatus: {
          equipmentSubmissions: {
            pending: 3,
            awaiting_second_approval: 1,
            approved: 5,
            rejected: 1,
          },
        },
      },
      error: null,
    });

    const counts = await getAdminDashboardCounts(stub.client);

    expect(stub.rpc).toHaveBeenCalledTimes(1);
    expect(stub.rpc).toHaveBeenCalledWith("get_admin_dashboard_counts");

    expect(counts.totals.equipmentSubmissions).toBe(10);
    expect(counts.totals.equipment).toBe(100);
    expect(counts.totals.players).toBe(50);
    expect(counts.byStatus.equipmentSubmissions.pending).toBe(3);
    expect(counts.byStatus.equipmentSubmissions.awaiting_second_approval).toBe(
      1
    );
    expect(counts.byStatus.equipmentSubmissions.approved).toBe(5);
    expect(counts.byStatus.equipmentSubmissions.rejected).toBe(1);
  });

  it("falls back to zero for any (queue × status) cell missing from the RPC payload", async () => {
    const stub = rpcStub({
      data: {
        totals: { equipmentSubmissions: 1 },
        byStatus: {},
      },
      error: null,
    });

    const counts = await getAdminDashboardCounts(stub.client);

    for (const key of [
      "equipmentSubmissions",
      "equipmentEdits",
      "playerSubmissions",
      "playerEdits",
      "equipmentReviews",
      "videoSubmissions",
      "playerEquipmentSetups",
    ] as const) {
      expect(counts.byStatus[key]).toEqual({
        pending: 0,
        awaiting_second_approval: 0,
        approved: 0,
        rejected: 0,
      });
    }
    // totals not in the payload still come through as zero.
    expect(counts.totals.equipmentEdits).toBe(0);
    expect(counts.totals.equipment).toBe(0);
    expect(counts.totals.players).toBe(0);
    // present total comes through.
    expect(counts.totals.equipmentSubmissions).toBe(1);
  });

  it("propagates RPC errors so the loader's outer .catch() can render fallbacks", async () => {
    const stub = rpcStub({
      data: null,
      error: { message: "subrequest cap" },
    });
    await expect(getAdminDashboardCounts(stub.client)).rejects.toThrow(
      "subrequest cap"
    );
  });

  it("returns full empty shape when RPC returns null data", async () => {
    const stub = rpcStub({ data: null, error: null });
    const counts = await getAdminDashboardCounts(stub.client);
    expect(counts.totals.equipment).toBe(0);
    expect(counts.byStatus.equipmentSubmissions).toEqual({
      pending: 0,
      awaiting_second_approval: 0,
      approved: 0,
      rejected: 0,
    });
  });
});

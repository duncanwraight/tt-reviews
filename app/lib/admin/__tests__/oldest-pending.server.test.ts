import { describe, it, expect, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { findOldestPendingTarget } from "../oldest-pending.server";

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

describe("findOldestPendingTarget", () => {
  it("returns null when the RPC reports no pending rows anywhere", async () => {
    const stub = rpcStub({ data: [], error: null });
    const target = await findOldestPendingTarget(stub.client);
    expect(target).toBeNull();
    expect(stub.rpc).toHaveBeenCalledWith("get_admin_oldest_pending");
  });

  it("maps the RPC's table_name to the right /admin route with focus param", async () => {
    const stub = rpcStub({
      data: [
        {
          table_name: "player_submissions",
          waiting_since: "2026-04-22T10:00:00Z",
        },
      ],
      error: null,
    });
    const target = await findOldestPendingTarget(stub.client);
    expect(target).toEqual({
      route: "/admin/player-submissions?focus=oldest",
      waitingSince: "2026-04-22T10:00:00Z",
    });
  });

  it("handles every queue table -> route mapping", async () => {
    const cases: Array<[string, string]> = [
      ["equipment_submissions", "/admin/equipment-submissions"],
      ["equipment_edits", "/admin/equipment-edits"],
      ["player_submissions", "/admin/player-submissions"],
      ["player_edits", "/admin/player-edits"],
      ["equipment_reviews", "/admin/equipment-reviews"],
      ["video_submissions", "/admin/video-submissions"],
      ["player_equipment_setup_submissions", "/admin/player-equipment-setups"],
    ];
    for (const [table, route] of cases) {
      const stub = rpcStub({
        data: [{ table_name: table, waiting_since: "2026-04-22T10:00:00Z" }],
        error: null,
      });
      const target = await findOldestPendingTarget(stub.client);
      expect(target?.route).toBe(`${route}?focus=oldest`);
    }
  });

  it("returns null for an unknown table_name (defensive — should never happen)", async () => {
    const stub = rpcStub({
      data: [{ table_name: "unknown_table", waiting_since: "2026-04-22Z" }],
      error: null,
    });
    const target = await findOldestPendingTarget(stub.client);
    expect(target).toBeNull();
  });

  it("propagates RPC errors so the loader's outer .catch() can render fallbacks", async () => {
    const stub = rpcStub({
      data: null,
      error: { message: "subrequest cap" },
    });
    await expect(findOldestPendingTarget(stub.client)).rejects.toThrow(
      "subrequest cap"
    );
  });
});

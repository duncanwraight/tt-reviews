import { describe, it, expect, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadApprovalsForSubmissions, loadPendingQueue } from "../queue.server";

/**
 * Pins the loader helpers introduced in TT-9. They replace ~50 LOC of
 * duplicate boilerplate (loader prologue + `Record<string, any[]>` cast)
 * across five admin queue routes.
 */

function makeQueueStub(
  result: { data?: unknown[] | null; error?: unknown | null } = {}
) {
  const limit = vi.fn().mockResolvedValue({
    data: "data" in result ? result.data : [],
    error: "error" in result ? result.error : null,
  });
  const order = vi.fn().mockReturnValue({ limit });
  const select = vi.fn().mockReturnValue({ order });
  const from = vi.fn().mockReturnValue({ select });
  return { from, select, order, limit };
}

function makeApprovalsStub(data: unknown[] | null) {
  const inFn = vi.fn().mockResolvedValue({ data });
  const eq = vi.fn().mockReturnValue({ in: inFn });
  const select = vi.fn().mockReturnValue({ eq });
  const from = vi.fn().mockReturnValue({ select });
  return { from, select, eq, in: inFn };
}

describe("loadPendingQueue", () => {
  it("queries the named table, newest-first, default limit 50", async () => {
    const stub = makeQueueStub({ data: [{ id: "a" }] });
    const result = await loadPendingQueue<{ id: string }>(
      { from: stub.from } as unknown as SupabaseClient,
      "equipment_submissions"
    );

    expect(stub.from).toHaveBeenCalledWith("equipment_submissions");
    expect(stub.select).toHaveBeenCalledWith("*");
    expect(stub.order).toHaveBeenCalledWith("created_at", { ascending: false });
    expect(stub.limit).toHaveBeenCalledWith(50);
    expect(result).toEqual({ data: [{ id: "a" }], error: null });
  });

  it("respects custom limit and select", async () => {
    const stub = makeQueueStub({ data: [] });
    await loadPendingQueue<{ id: string }>(
      { from: stub.from } as unknown as SupabaseClient,
      "video_submissions",
      { limit: 10, select: "*, players!inner(name, slug)" }
    );

    expect(stub.select).toHaveBeenCalledWith("*, players!inner(name, slug)");
    expect(stub.limit).toHaveBeenCalledWith(10);
  });

  it("surfaces the Supabase error without throwing", async () => {
    const err = new Error("boom");
    const stub = makeQueueStub({ data: null, error: err });
    const result = await loadPendingQueue<{ id: string }>(
      { from: stub.from } as unknown as SupabaseClient,
      "player_submissions"
    );
    expect(result).toEqual({ data: null, error: err });
  });
});

describe("loadApprovalsForSubmissions", () => {
  it("short-circuits without a DB call when ids is empty", async () => {
    const stub = makeApprovalsStub([]);
    const grouped = await loadApprovalsForSubmissions(
      { from: stub.from } as unknown as SupabaseClient,
      "equipment",
      []
    );
    expect(grouped).toEqual({});
    expect(stub.from).not.toHaveBeenCalled();
  });

  it("filters by submission_type + submission_id and groups by submission_id", async () => {
    const stub = makeApprovalsStub([
      {
        id: "x1",
        submission_id: "s1",
        submission_type: "equipment",
        moderator_id: "m1",
        action: "approved",
        source: "admin_ui",
        created_at: "2026-01-01T00:00:00Z",
      },
      {
        id: "x2",
        submission_id: "s1",
        submission_type: "equipment",
        moderator_id: "m2",
        action: "approved",
        source: "admin_ui",
        created_at: "2026-01-02T00:00:00Z",
      },
      {
        id: "x3",
        submission_id: "s2",
        submission_type: "equipment",
        moderator_id: "m1",
        action: "rejected",
        source: "admin_ui",
        created_at: "2026-01-03T00:00:00Z",
      },
    ]);

    const grouped = await loadApprovalsForSubmissions(
      { from: stub.from } as unknown as SupabaseClient,
      "equipment",
      ["s1", "s2"]
    );

    expect(stub.from).toHaveBeenCalledWith("moderator_approvals");
    expect(stub.eq).toHaveBeenCalledWith("submission_type", "equipment");
    expect(stub.in).toHaveBeenCalledWith("submission_id", ["s1", "s2"]);
    expect(grouped.s1).toHaveLength(2);
    expect(grouped.s2).toHaveLength(1);
    expect(grouped.s2[0].action).toBe("rejected");
  });

  it("returns {} when Supabase returns null data", async () => {
    const stub = makeApprovalsStub(null);
    const grouped = await loadApprovalsForSubmissions(
      { from: stub.from } as unknown as SupabaseClient,
      "equipment",
      ["s1"]
    );
    expect(grouped).toEqual({});
  });
});

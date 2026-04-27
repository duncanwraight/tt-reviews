import { describe, it, expect, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getAdminDashboardCounts } from "../dashboard.server";

/**
 * Mock supabase client — every from(table).select(*, {count: 'exact', head: true})[.eq(...)]
 * call resolves to a {count, error} shape based on the (table, status?) seed.
 */
function makeCountStub(
  seed: Record<string, number>,
  statusSeed: Record<string, Record<string, number>> = {}
) {
  let totalQueries = 0;
  let statusQueries = 0;

  function from(table: string) {
    return {
      select(_cols: string, opts?: { count?: string; head?: boolean }) {
        if (!opts?.head) {
          throw new Error(
            `expected head:true select, got ${JSON.stringify(opts)}`
          );
        }
        const builder = {
          eq(col: string, value: string) {
            if (col !== "status") {
              throw new Error(`expected eq('status', _), got eq(${col}, _)`);
            }
            statusQueries += 1;
            const tableStatuses = statusSeed[table] ?? {};
            return Promise.resolve({
              count: tableStatuses[value] ?? 0,
              error: null,
            });
          },
          then(onFulfilled: (v: { count: number; error: null }) => unknown) {
            // bare `await select(...)` (no .eq) — used for total counts.
            totalQueries += 1;
            return Promise.resolve({
              count: seed[table] ?? 0,
              error: null,
            }).then(onFulfilled);
          },
        };
        return builder;
      },
    };
  }

  return {
    client: { from } as unknown as SupabaseClient,
    inspect: () => ({ totalQueries, statusQueries }),
  };
}

describe("getAdminDashboardCounts", () => {
  it("issues only head-only count queries (no row downloads)", async () => {
    const stub = makeCountStub(
      {
        equipment_submissions: 10,
        player_submissions: 0,
        player_edits: 0,
        equipment_reviews: 0,
        video_submissions: 0,
        player_equipment_setup_submissions: 0,
        equipment: 100,
        players: 50,
      },
      {
        equipment_submissions: {
          pending: 3,
          awaiting_second_approval: 1,
          approved: 5,
          rejected: 1,
        },
      }
    );

    const counts = await getAdminDashboardCounts(stub.client);
    const inspect = stub.inspect();

    // 6 submission tables × 4 statuses = 24 status queries.
    expect(inspect.statusQueries).toBe(24);
    // 6 submission totals + equipment + players = 8 totals.
    expect(inspect.totalQueries).toBe(8);

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

  it("falls back to zero for tables with no rows of a given status", async () => {
    const stub = makeCountStub({}, {});
    const counts = await getAdminDashboardCounts(stub.client);

    for (const key of [
      "equipmentSubmissions",
      "playerSubmissions",
      "playerEdits",
      "equipmentReviews",
      "videoSubmissions",
      "playerEquipmentSetups",
    ] as const) {
      expect(counts.totals[key]).toBe(0);
      expect(counts.byStatus[key]).toEqual({
        pending: 0,
        awaiting_second_approval: 0,
        approved: 0,
        rejected: 0,
      });
    }
    expect(counts.totals.equipment).toBe(0);
    expect(counts.totals.players).toBe(0);
  });

  it("only filters status queries by status (no other filters)", async () => {
    const eqSpy = vi.fn((col: string, _v: string) => ({
      then: (cb: (r: { count: number; error: null }) => unknown) =>
        Promise.resolve({ count: 0, error: null }).then(cb),
    }));
    const selectSpy = vi.fn((_cols: string, opts?: unknown) => ({
      eq: eqSpy,
      then: (cb: (r: { count: number; error: null }) => unknown) =>
        Promise.resolve({ count: 0, error: null }).then(cb),
    }));
    const fromSpy = vi.fn(() => ({ select: selectSpy }));

    await getAdminDashboardCounts({
      from: fromSpy,
    } as unknown as SupabaseClient);

    for (const call of eqSpy.mock.calls) {
      expect(call[0]).toBe("status");
    }
    for (const call of selectSpy.mock.calls) {
      expect(call[1]).toMatchObject({ count: "exact", head: true });
    }
  });
});

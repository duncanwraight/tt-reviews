import { describe, it, expect } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { findOldestPendingTarget } from "../oldest-pending.server";

interface SeedRow {
  created_at: string;
}

function makePendingStub(perTable: Record<string, SeedRow[]>) {
  function from(table: string) {
    return {
      select(_cols: string) {
        const rows = perTable[table] ?? [];
        return {
          in(_col: string, _values: string[]) {
            return {
              order(_col2: string, opts: { ascending: boolean }) {
                const sorted = [...rows].sort((a, b) =>
                  opts.ascending
                    ? a.created_at.localeCompare(b.created_at)
                    : b.created_at.localeCompare(a.created_at)
                );
                return {
                  limit(n: number) {
                    return Promise.resolve({
                      data: sorted.slice(0, n),
                      error: null,
                    });
                  },
                };
              },
            };
          },
        };
      },
    };
  }
  return { from } as unknown as SupabaseClient;
}

describe("findOldestPendingTarget", () => {
  it("returns null when no queue has pending rows", async () => {
    const supabase = makePendingStub({});
    const target = await findOldestPendingTarget(supabase);
    expect(target).toBeNull();
  });

  it("picks the queue that holds the globally oldest pending row", async () => {
    const supabase = makePendingStub({
      equipment_submissions: [{ created_at: "2026-04-25T10:00:00Z" }],
      player_submissions: [{ created_at: "2026-04-22T10:00:00Z" }],
      equipment_reviews: [{ created_at: "2026-04-26T10:00:00Z" }],
    });
    const target = await findOldestPendingTarget(supabase);
    expect(target).not.toBeNull();
    expect(target!.route).toBe("/admin/player-submissions?focus=oldest");
    expect(target!.waitingSince).toBe("2026-04-22T10:00:00Z");
  });

  it("ignores tables with no pending rows", async () => {
    const supabase = makePendingStub({
      equipment_submissions: [{ created_at: "2026-04-26T10:00:00Z" }],
      // other tables empty
    });
    const target = await findOldestPendingTarget(supabase);
    expect(target!.route).toBe("/admin/equipment-submissions?focus=oldest");
  });

  it("emits the route with the focus=oldest query param so queue pages can sort accordingly", async () => {
    const supabase = makePendingStub({
      player_equipment_setup_submissions: [
        { created_at: "2026-04-20T10:00:00Z" },
      ],
    });
    const target = await findOldestPendingTarget(supabase);
    expect(target!.route).toBe("/admin/player-equipment-setups?focus=oldest");
  });
});

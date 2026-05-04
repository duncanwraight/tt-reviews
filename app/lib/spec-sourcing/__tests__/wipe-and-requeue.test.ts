import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  isLocalSupabaseUrl,
  parseArgs,
  wipeSpecSourcingState,
} from "../wipe-and-requeue";

interface FakeOps {
  proposalsDeleted: Array<{ id: string }> | null;
  equipmentUpdated: Array<{ id: string }> | null;
  proposalsError?: string;
  equipmentError?: string;
}

interface CallLog {
  proposalsCall?: { filter: [string, string, string | null]; payload: unknown };
  equipmentCall?: { filter: [string, string, string | null]; payload: unknown };
}

function fakeSupabase(ops: FakeOps): {
  client: SupabaseClient;
  calls: CallLog;
} {
  const calls: CallLog = {};

  const client = {
    from(table: string) {
      if (table === "equipment_spec_proposals") {
        return {
          delete() {
            return {
              not(col: string, op: string, val: string | null) {
                return {
                  select(_cols: string) {
                    calls.proposalsCall = {
                      filter: [col, op, val],
                      payload: undefined,
                    };
                    if (ops.proposalsError) {
                      return Promise.resolve({
                        data: null,
                        error: { message: ops.proposalsError },
                      });
                    }
                    return Promise.resolve({
                      data: ops.proposalsDeleted,
                      error: null,
                    });
                  },
                };
              },
            };
          },
        };
      }
      if (table === "equipment") {
        return {
          update(payload: unknown) {
            return {
              not(col: string, op: string, val: string | null) {
                return {
                  select(_cols: string) {
                    calls.equipmentCall = {
                      filter: [col, op, val],
                      payload,
                    };
                    if (ops.equipmentError) {
                      return Promise.resolve({
                        data: null,
                        error: { message: ops.equipmentError },
                      });
                    }
                    return Promise.resolve({
                      data: ops.equipmentUpdated,
                      error: null,
                    });
                  },
                };
              },
            };
          },
        };
      }
      throw new Error(`unexpected table: ${table}`);
    },
  } as unknown as SupabaseClient;

  return { client, calls };
}

describe("parseArgs", () => {
  it("returns confirmProd=false when no flag", () => {
    expect(parseArgs([])).toEqual({ confirmProd: false });
    expect(parseArgs(["--other"])).toEqual({ confirmProd: false });
  });

  it("returns confirmProd=true when --confirm-prod present", () => {
    expect(parseArgs(["--confirm-prod"])).toEqual({ confirmProd: true });
    expect(parseArgs(["--other", "--confirm-prod"])).toEqual({
      confirmProd: true,
    });
  });
});

describe("isLocalSupabaseUrl", () => {
  it.each([
    ["http://127.0.0.1:54321", true],
    ["http://localhost:54321", true],
    ["http://tt-reviews.local:54321", true],
    ["https://abcdef.supabase.co", false],
    ["https://prod.example.com", false],
  ])("%s -> %s", (url, expected) => {
    expect(isLocalSupabaseUrl(url)).toBe(expected);
  });

  it("returns false for unparsable input", () => {
    expect(isLocalSupabaseUrl("")).toBe(false);
    expect(isLocalSupabaseUrl("not-a-url")).toBe(false);
  });
});

describe("wipeSpecSourcingState", () => {
  it("deletes all proposals then resets equipment cooldown columns", async () => {
    const { client, calls } = fakeSupabase({
      proposalsDeleted: [{ id: "p-1" }, { id: "p-2" }, { id: "p-3" }],
      equipmentUpdated: [{ id: "e-1" }, { id: "e-2" }],
    });

    const result = await wipeSpecSourcingState(client);

    expect(result).toEqual({ proposals: 3, equipment: 2 });
    // Both calls use the canonical "match every row" filter.
    expect(calls.proposalsCall?.filter).toEqual(["id", "is", null]);
    expect(calls.equipmentCall?.filter).toEqual(["id", "is", null]);
    // Equipment update zeroes both cooldown columns.
    expect(calls.equipmentCall?.payload).toEqual({
      specs_sourced_at: null,
      specs_source_status: null,
    });
  });

  it("returns 0/0 when both tables are empty", async () => {
    const { client } = fakeSupabase({
      proposalsDeleted: [],
      equipmentUpdated: [],
    });
    expect(await wipeSpecSourcingState(client)).toEqual({
      proposals: 0,
      equipment: 0,
    });
  });

  it("throws with a clear message when the proposal delete fails", async () => {
    const { client } = fakeSupabase({
      proposalsDeleted: null,
      equipmentUpdated: null,
      proposalsError: "permission denied for table equipment_spec_proposals",
    });
    await expect(wipeSpecSourcingState(client)).rejects.toThrow(
      /Failed to delete equipment_spec_proposals: permission denied/
    );
  });

  it("throws if the equipment update fails after proposals were deleted", async () => {
    const { client } = fakeSupabase({
      proposalsDeleted: [{ id: "p-1" }],
      equipmentUpdated: null,
      equipmentError: "rls violation",
    });
    await expect(wipeSpecSourcingState(client)).rejects.toThrow(
      /Failed to reset equipment cooldown: rls violation/
    );
  });

  it("does not coerce a null id list into a phantom count", async () => {
    // Real Supabase returns `data: null` for some failure shapes — but
    // we surface those as errors above. For the success-with-no-rows
    // path we get `data: []`, which the count must respect.
    const { client } = fakeSupabase({
      proposalsDeleted: [],
      equipmentUpdated: [{ id: "e-1" }],
    });
    const result = await wipeSpecSourcingState(client);
    expect(result.proposals).toBe(0);
    expect(result.equipment).toBe(1);
  });

  it("calls .from in the documented order: proposals first, equipment second", async () => {
    const calls: string[] = [];
    const client = {
      from(table: string) {
        calls.push(table);
        if (table === "equipment_spec_proposals") {
          return {
            delete: () => ({
              not: () => ({
                select: () => Promise.resolve({ data: [], error: null }),
              }),
            }),
          };
        }
        return {
          update: () => ({
            not: () => ({
              select: () => Promise.resolve({ data: [], error: null }),
            }),
          }),
        };
      },
    } as unknown as SupabaseClient;
    await wipeSpecSourcingState(client);
    expect(calls).toEqual(["equipment_spec_proposals", "equipment"]);
  });
});

// Smoke check that vi import is used somewhere in this file (keeps
// linter happy if vi is auto-imported elsewhere).
void vi;

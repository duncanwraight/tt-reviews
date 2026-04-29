import { describe, it, expect } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { applyPlayerEdit } from "../player-edit-applier.server";

/**
 * Hand-rolled minimal supabase stub mirroring the
 * equipment-edit-applier.server.test.ts shape so future appliers'
 * tests stay visually parallel. Read/update patterns:
 *   - from("player_edits").select("*").eq("id", X).single() → edit row
 *   - from("players").update(updates).eq("id", X)           → captured
 */
interface StubState {
  edit: Record<string, unknown> & { id: string };
  // Optional override — if supplied, the .single() read on
  // player_edits returns this error instead of `edit`.
  editError?: { message: string };
  // Optional override — if supplied, the .update() on players returns
  // this error.
  updateError?: { message: string };
}

interface CapturedUpdate {
  table: string;
   
  updates: Record<string, any>;
   
  filter: { col: string; value: any };
}

function makeStub(state: StubState) {
  const updates: CapturedUpdate[] = [];

  function from(table: string) {
    if (table === "player_edits") {
      return {
        select(_cols: string) {
          return {
            eq(_col: string, _value: string) {
              return {
                single: async () =>
                  state.editError
                    ? { data: null, error: state.editError }
                    : { data: state.edit, error: null },
              };
            },
          };
        },
      };
    }
    if (table === "players") {
      return {
         
        update(payload: Record<string, any>) {
          return {
             
            eq(col: string, value: any) {
              updates.push({ table, updates: payload, filter: { col, value } });
              return Promise.resolve(
                state.updateError
                  ? { error: state.updateError }
                  : { error: null }
              );
            },
          };
        },
      };
    }
    throw new Error(`unexpected from(${table})`);
  }

  return {
    client: { from } as unknown as SupabaseClient,
    captured: updates,
  };
}

describe("applyPlayerEdit", () => {
  it("applies edit_data fields verbatim, excluding edit_reason", async () => {
    const stub = makeStub({
      edit: {
        id: "pe1",
        player_id: "p1",
        edit_data: {
          name: "Ma Long",
          highest_rating: 2900,
          edit_reason: "ranking update",
        },
      },
    });

    const res = await applyPlayerEdit(stub.client, "pe1");

    expect(res).toEqual({ success: true });
    expect(stub.captured).toHaveLength(1);
    expect(stub.captured[0].table).toBe("players");
    expect(stub.captured[0].filter).toEqual({ col: "id", value: "p1" });
    expect(stub.captured[0].updates).toEqual({
      name: "Ma Long",
      highest_rating: 2900,
    });
    // edit_reason must be stripped — it lives on the edit row, not the
    // player row.
    expect(stub.captured[0].updates.edit_reason).toBeUndefined();
  });

  it("includes image_key when present on the edit row", async () => {
    const stub = makeStub({
      edit: {
        id: "pe1",
        player_id: "p1",
        edit_data: { name: "Fan Zhendong" },
        image_key: "players/fan-zhendong/123.png",
      },
    });

    const res = await applyPlayerEdit(stub.client, "pe1");

    expect(res.success).toBe(true);
    expect(stub.captured[0].updates).toEqual({
      name: "Fan Zhendong",
      image_key: "players/fan-zhendong/123.png",
    });
  });

  it("returns success with no UPDATE when only edit_reason is present", async () => {
    const stub = makeStub({
      edit: {
        id: "pe1",
        player_id: "p1",
        edit_data: { edit_reason: "typo correction" },
      },
    });

    const res = await applyPlayerEdit(stub.client, "pe1");

    expect(res.success).toBe(true);
    expect(stub.captured).toHaveLength(0);
  });

  it("returns success with no UPDATE when edit_data is empty and image_key is missing", async () => {
    const stub = makeStub({
      edit: { id: "pe1", player_id: "p1", edit_data: {} },
    });

    const res = await applyPlayerEdit(stub.client, "pe1");

    expect(res.success).toBe(true);
    expect(stub.captured).toHaveLength(0);
  });

  it("returns failure when the edit row is not found", async () => {
    const stub = makeStub({
      edit: { id: "pe1" },
      editError: { message: "no rows returned" },
    });

    const res = await applyPlayerEdit(stub.client, "pe1");

    expect(res.success).toBe(false);
    expect(res.error).toMatch(/no rows returned/);
    expect(stub.captured).toHaveLength(0);
  });

  it("returns failure when the edit row has no player_id", async () => {
    const stub = makeStub({
      edit: { id: "pe1", edit_data: { name: "Orphan" } },
    });

    const res = await applyPlayerEdit(stub.client, "pe1");

    expect(res.success).toBe(false);
    expect(res.error).toMatch(/no player_id/i);
    expect(stub.captured).toHaveLength(0);
  });

  it("surfaces the players UPDATE error", async () => {
    const stub = makeStub({
      edit: {
        id: "pe1",
        player_id: "p1",
        edit_data: { name: "X" },
      },
      updateError: { message: "RLS violation" },
    });

    const res = await applyPlayerEdit(stub.client, "pe1");

    expect(res.success).toBe(false);
    expect(res.error).toMatch(/RLS violation/);
    expect(stub.captured).toHaveLength(1);
  });
});

import { describe, it, expect } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { applyPlayerEquipmentSetup } from "../player-equipment-setup-applier.server";

/**
 * Hand-rolled Supabase stub mirroring sibling appliers' test shapes.
 * Read/insert patterns:
 *   - from("player_equipment_setup_submissions").select("*").eq("id", X).single() → submission
 *   - from("player_equipment_setups").insert({...})                               → captured
 */
interface StubState {
  submission: Record<string, unknown> & { id: string };
  readError?: { message: string };
  insertError?: { message: string };
}

interface CapturedInsert {
  table: string;
  payload: Record<string, unknown>;
}

function makeStub(state: StubState) {
  const inserts: CapturedInsert[] = [];

  function from(table: string) {
    if (table === "player_equipment_setup_submissions") {
      return {
        select(_cols: string) {
          return {
            eq(_col: string, _value: string) {
              return {
                single: async () =>
                  state.readError
                    ? { data: null, error: state.readError }
                    : { data: state.submission, error: null },
              };
            },
          };
        },
      };
    }
    if (table === "player_equipment_setups") {
      return {
        insert(payload: Record<string, unknown>) {
          inserts.push({ table, payload });
          return Promise.resolve(
            state.insertError ? { error: state.insertError } : { error: null }
          );
        },
      };
    }
    throw new Error(`unexpected from(${table})`);
  }

  return {
    client: { from } as unknown as SupabaseClient,
    captured: inserts,
  };
}

describe("applyPlayerEquipmentSetup", () => {
  it("creates a player_equipment_setups row with verified=true and the submission fields", async () => {
    const stub = makeStub({
      submission: {
        id: "ses1",
        player_id: "p1",
        year: 2024,
        blade_id: "blade-uuid",
        forehand_rubber_id: "fh-uuid",
        forehand_thickness: "max",
        forehand_side: "forehand",
        backhand_rubber_id: "bh-uuid",
        backhand_thickness: "1.9",
        backhand_side: "backhand",
        source_url: "https://example.com/interview",
        source_type: "interview",
      },
    });

    const res = await applyPlayerEquipmentSetup(stub.client, "ses1");

    expect(res).toEqual({ success: true });
    expect(stub.captured).toHaveLength(1);
    expect(stub.captured[0].table).toBe("player_equipment_setups");
    expect(stub.captured[0].payload).toEqual({
      player_id: "p1",
      year: 2024,
      blade_id: "blade-uuid",
      forehand_rubber_id: "fh-uuid",
      forehand_thickness: "max",
      forehand_color: "red",
      backhand_rubber_id: "bh-uuid",
      backhand_thickness: "1.9",
      backhand_color: "black",
      source_url: "https://example.com/interview",
      source_type: "interview",
      verified: true,
    });
  });

  it("maps forehand_side='backhand' / backhand_side='forehand' to swapped colours", async () => {
    // Reverse-flip case: if the submitter said the forehand-side
    // physical rubber was on the backhand of the bat, color should be
    // "black", not "red".
    const stub = makeStub({
      submission: {
        id: "ses1",
        player_id: "p1",
        year: 2024,
        forehand_side: "backhand",
        backhand_side: "forehand",
      },
    });

    const res = await applyPlayerEquipmentSetup(stub.client, "ses1");

    expect(res.success).toBe(true);
    expect(stub.captured[0].payload.forehand_color).toBe("black");
    expect(stub.captured[0].payload.backhand_color).toBe("red");
  });

  it("maps unknown / null side values to null colour", async () => {
    const stub = makeStub({
      submission: {
        id: "ses1",
        player_id: "p1",
        year: 2024,
        forehand_side: null,
        backhand_side: "neither",
      },
    });

    const res = await applyPlayerEquipmentSetup(stub.client, "ses1");

    expect(res.success).toBe(true);
    expect(stub.captured[0].payload.forehand_color).toBeNull();
    expect(stub.captured[0].payload.backhand_color).toBeNull();
  });

  it("passes through optional ids / source as nullable", async () => {
    const stub = makeStub({
      submission: {
        id: "ses1",
        player_id: "p1",
        year: 2020,
        blade_id: null,
        forehand_rubber_id: null,
        backhand_rubber_id: null,
        source_url: null,
        source_type: null,
      },
    });

    const res = await applyPlayerEquipmentSetup(stub.client, "ses1");

    expect(res.success).toBe(true);
    expect(stub.captured[0].payload.blade_id).toBeNull();
    expect(stub.captured[0].payload.source_url).toBeNull();
    expect(stub.captured[0].payload.verified).toBe(true);
  });

  it("returns failure when the submission row is not found", async () => {
    const stub = makeStub({
      submission: { id: "ses1" },
      readError: { message: "no rows returned" },
    });

    const res = await applyPlayerEquipmentSetup(stub.client, "ses1");

    expect(res.success).toBe(false);
    expect(res.error).toMatch(/no rows returned/);
    expect(stub.captured).toHaveLength(0);
  });

  it("surfaces the player_equipment_setups INSERT error", async () => {
    const stub = makeStub({
      submission: {
        id: "ses1",
        player_id: "p1",
        year: 2024,
      },
      insertError: { message: "FK violation on blade_id" },
    });

    const res = await applyPlayerEquipmentSetup(stub.client, "ses1");

    expect(res.success).toBe(false);
    expect(res.error).toMatch(/FK violation/);
    expect(stub.captured).toHaveLength(1);
  });
});

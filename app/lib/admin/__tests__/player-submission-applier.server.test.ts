import { describe, it, expect } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { applyPlayerSubmission } from "../player-submission-applier.server";

/**
 * Hand-rolled Supabase stub mirroring the
 * equipment-submission-applier.server.test.ts shape so future
 * appliers' tests stay visually parallel. Patterns we cover:
 *   - from("player_submissions").select("*").eq("id", X).single() → submission
 *   - from("players").insert(...).select("id").single()           → captured (returns id)
 *   - from("player_equipment_setups").insert(...)                 → captured
 *   - from("player_footage").insert(...)                          → captured
 *   - from("players").delete().eq("id", X)                        → captured (rollback path)
 */
interface StubState {
  submission: Record<string, unknown> & { id: string; name: string };
  readError?: { message: string };
  playersInsertError?: { message: string };
  equipmentSetupInsertError?: { message: string };
  footageInsertError?: { message: string };
  playerId?: string;
}

interface CapturedInsert {
  table: string;
  payload: Record<string, unknown> | Array<Record<string, unknown>>;
}

interface CapturedDelete {
  table: string;
  column: string;
  value: unknown;
}

function makeStub(state: StubState) {
  const inserts: CapturedInsert[] = [];
  const deletes: CapturedDelete[] = [];
  const playerId = state.playerId ?? "player-new";

  function from(table: string) {
    if (table === "player_submissions") {
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
    if (table === "players") {
      return {
        insert(payload: Record<string, unknown>) {
          inserts.push({ table, payload });
          return {
            select(_cols: string) {
              return {
                single: async () =>
                  state.playersInsertError
                    ? { data: null, error: state.playersInsertError }
                    : { data: { id: playerId }, error: null },
              };
            },
          };
        },
        delete() {
          return {
            eq(column: string, value: unknown) {
              deletes.push({ table, column, value });
              return Promise.resolve({ error: null });
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
            state.equipmentSetupInsertError
              ? { error: state.equipmentSetupInsertError }
              : { error: null }
          );
        },
      };
    }
    if (table === "player_footage") {
      return {
        insert(payload: Array<Record<string, unknown>>) {
          inserts.push({ table, payload });
          return Promise.resolve(
            state.footageInsertError
              ? { error: state.footageInsertError }
              : { error: null }
          );
        },
      };
    }
    throw new Error(`unexpected from(${table})`);
  }

  return {
    client: { from } as unknown as SupabaseClient,
    inserts,
    deletes,
  };
}

describe("applyPlayerSubmission", () => {
  it("creates a players row with the submission fields and a generated slug", async () => {
    const stub = makeStub({
      submission: {
        id: "ps1",
        name: "Ma Long",
        highest_rating: "2900",
        active_years: "2003-",
        playing_style: "shakehand offensive",
        birth_country: "CHN",
        represents: "CHN",
        image_key: "players/submission-abc/123.png",
      },
    });

    const res = await applyPlayerSubmission(stub.client, "ps1");

    expect(res).toEqual({ success: true });
    expect(stub.inserts).toHaveLength(1);
    expect(stub.inserts[0].table).toBe("players");
    expect(stub.inserts[0].payload).toEqual({
      name: "Ma Long",
      slug: "ma-long",
      highest_rating: "2900",
      active_years: "2003-",
      playing_style: "shakehand offensive",
      birth_country: "CHN",
      represents: "CHN",
      active: true,
      image_key: "players/submission-abc/123.png",
    });
  });

  it("normalises slug from a name with diacritics-stripped punctuation and case", async () => {
    const stub = makeStub({
      submission: { id: "ps1", name: "WANG Hao!" },
    });

    const res = await applyPlayerSubmission(stub.client, "ps1");

    expect(res.success).toBe(true);
    expect((stub.inserts[0].payload as Record<string, unknown>).slug).toBe(
      "wang-hao"
    );
  });

  it("passes nulls through for optional fields the submission may omit", async () => {
    const stub = makeStub({
      submission: {
        id: "ps1",
        name: "Test Player",
        highest_rating: null,
        active_years: null,
        playing_style: null,
        birth_country: null,
        represents: null,
        image_key: null,
      },
    });

    const res = await applyPlayerSubmission(stub.client, "ps1");

    expect(res.success).toBe(true);
    const payload = stub.inserts[0].payload as Record<string, unknown>;
    expect(payload.highest_rating).toBeNull();
    expect(payload.image_key).toBeNull();
    expect(payload.active).toBe(true);
  });

  it("returns failure when the submission row is not found", async () => {
    const stub = makeStub({
      submission: { id: "ps1", name: "Missing" },
      readError: { message: "no rows returned" },
    });

    const res = await applyPlayerSubmission(stub.client, "ps1");

    expect(res.success).toBe(false);
    expect(res.error).toMatch(/no rows returned/);
    expect(stub.inserts).toHaveLength(0);
  });

  it("surfaces the players INSERT error (e.g. slug collision)", async () => {
    const stub = makeStub({
      submission: { id: "ps1", name: "Existing Name" },
      playersInsertError: {
        message:
          'duplicate key value violates unique constraint "players_slug_key"',
      },
    });

    const res = await applyPlayerSubmission(stub.client, "ps1");

    expect(res.success).toBe(false);
    expect(res.error).toMatch(/duplicate key/);
    expect(stub.inserts).toHaveLength(1);
    // Players insert failed before any cascade — no rollback delete.
    expect(stub.deletes).toHaveLength(0);
  });

  it("cascades equipment_setup into player_equipment_setups with mapped colours", async () => {
    const stub = makeStub({
      submission: {
        id: "ps1",
        name: "Cascade Player",
        equipment_setup: {
          year: 2024,
          blade_id: "blade-uuid",
          forehand_rubber_id: "fh-uuid",
          forehand_thickness: "2.1mm",
          forehand_side: "forehand",
          backhand_rubber_id: "bh-uuid",
          backhand_thickness: "2.0mm",
          backhand_side: "backhand",
          source_url: "https://example.com",
          source_type: "interview",
        },
      },
    });

    const res = await applyPlayerSubmission(stub.client, "ps1");

    expect(res).toEqual({ success: true });
    expect(stub.inserts).toHaveLength(2);
    expect(stub.inserts[1].table).toBe("player_equipment_setups");
    expect(stub.inserts[1].payload).toMatchObject({
      player_id: "player-new",
      year: 2024,
      blade_id: "blade-uuid",
      forehand_rubber_id: "fh-uuid",
      forehand_thickness: "2.1mm",
      forehand_color: "red",
      backhand_rubber_id: "bh-uuid",
      backhand_thickness: "2.0mm",
      backhand_color: "black",
      source_url: "https://example.com",
      source_type: "interview",
      verified: true,
    });
  });

  it("skips equipment_setup cascade when year is missing (NOT NULL guard)", async () => {
    const stub = makeStub({
      submission: {
        id: "ps1",
        name: "No Year",
        equipment_setup: {
          blade_id: "blade-uuid",
        },
      },
    });

    const res = await applyPlayerSubmission(stub.client, "ps1");

    expect(res).toEqual({ success: true });
    expect(stub.inserts).toHaveLength(1);
    expect(stub.inserts[0].table).toBe("players");
  });

  it("cascades videos into player_footage with platform allowlist", async () => {
    const stub = makeStub({
      submission: {
        id: "ps1",
        name: "Video Player",
        videos: [
          { url: "https://youtube.com/a", title: "A", platform: "youtube" },
          { url: "https://other.com/b", title: "B", platform: "vimeo" },
          { url: "https://other.com/c", title: "C" },
        ],
      },
    });

    const res = await applyPlayerSubmission(stub.client, "ps1");

    expect(res).toEqual({ success: true });
    expect(stub.inserts).toHaveLength(2);
    expect(stub.inserts[1].table).toBe("player_footage");
    const rows = stub.inserts[1].payload as Array<Record<string, unknown>>;
    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({
      player_id: "player-new",
      url: "https://youtube.com/a",
      title: "A",
      platform: "youtube",
      active: true,
    });
    // Unknown platform falls back to 'other' (allowlist behaviour).
    expect(rows[1].platform).toBe("other");
    // Missing platform falls back to 'other'.
    expect(rows[2].platform).toBe("other");
  });

  it("rolls back the players row when equipment_setup cascade fails", async () => {
    const stub = makeStub({
      submission: {
        id: "ps1",
        name: "Rollback Player",
        equipment_setup: {
          year: 2024,
          blade_id: "blade-uuid",
        },
      },
      equipmentSetupInsertError: {
        message: "FK violation: blade_id not found",
      },
    });

    const res = await applyPlayerSubmission(stub.client, "ps1");

    expect(res.success).toBe(false);
    expect(res.error).toMatch(/FK violation/);
    expect(stub.deletes).toEqual([
      { table: "players", column: "id", value: "player-new" },
    ]);
  });

  it("rolls back the players row when player_footage cascade fails", async () => {
    const stub = makeStub({
      submission: {
        id: "ps1",
        name: "Rollback Player",
        videos: [{ url: "https://x", title: "X", platform: "youtube" }],
      },
      footageInsertError: { message: "videos URL too long" },
    });

    const res = await applyPlayerSubmission(stub.client, "ps1");

    expect(res.success).toBe(false);
    expect(res.error).toMatch(/videos URL too long/);
    expect(stub.deletes).toEqual([
      { table: "players", column: "id", value: "player-new" },
    ]);
  });
});

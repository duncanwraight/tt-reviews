import { describe, it, expect } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { applyPlayerSubmission } from "../player-submission-applier.server";

/**
 * Hand-rolled Supabase stub mirroring the
 * equipment-submission-applier.server.test.ts shape so future
 * appliers' tests stay visually parallel. Read/insert patterns:
 *   - from("player_submissions").select("*").eq("id", X).single() → submission
 *   - from("players").insert(...)                                 → captured
 */
interface StubState {
  submission: Record<string, unknown> & { id: string; name: string };
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
    expect(stub.captured).toHaveLength(1);
    expect(stub.captured[0].table).toBe("players");
    expect(stub.captured[0].payload).toEqual({
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
      submission: {
        id: "ps1",
        name: "WANG Hao!",
      },
    });

    const res = await applyPlayerSubmission(stub.client, "ps1");

    expect(res.success).toBe(true);
    expect(stub.captured[0].payload.slug).toBe("wang-hao");
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
    expect(stub.captured[0].payload.highest_rating).toBeNull();
    expect(stub.captured[0].payload.image_key).toBeNull();
    expect(stub.captured[0].payload.active).toBe(true);
  });

  it("returns failure when the submission row is not found", async () => {
    const stub = makeStub({
      submission: { id: "ps1", name: "Missing" },
      readError: { message: "no rows returned" },
    });

    const res = await applyPlayerSubmission(stub.client, "ps1");

    expect(res.success).toBe(false);
    expect(res.error).toMatch(/no rows returned/);
    expect(stub.captured).toHaveLength(0);
  });

  it("surfaces the players INSERT error (e.g. slug collision)", async () => {
    const stub = makeStub({
      submission: {
        id: "ps1",
        name: "Existing Name",
      },
      insertError: {
        message:
          'duplicate key value violates unique constraint "players_slug_key"',
      },
    });

    const res = await applyPlayerSubmission(stub.client, "ps1");

    expect(res.success).toBe(false);
    expect(res.error).toMatch(/duplicate key/);
    expect(stub.captured).toHaveLength(1);
  });
});

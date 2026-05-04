import { describe, it, expect } from "vitest";
import * as search from "../search";
import { makeSupabase, makeCtx } from "./helpers";

describe("search.search", () => {
  it("queries equipment + players in parallel and returns both", async () => {
    const equipmentRows = [{ id: "e1" }];
    const playerRows = [{ id: "p1" }];
    const supabase = makeSupabase({
      tables: {
        equipment: { data: equipmentRows },
        players: { data: playerRows },
      },
    });

    const result = await search.search(makeCtx(supabase), "butterfly");
    expect(result.equipment).toEqual(equipmentRows);
    expect(result.players).toEqual(playerRows);
  });

  it("returns empty arrays when underlying queries error out", async () => {
    const supabase = makeSupabase({
      tables: {
        equipment: { error: { message: "x" } },
        players: { error: { message: "y" } },
      },
    });
    const result = await search.search(makeCtx(supabase), "q");
    expect(result).toEqual({ equipment: [], players: [] });
  });

  it("applies the search filter with limit 10 on both tables", async () => {
    const supabase = makeSupabase({
      tables: {
        equipment: { data: [] },
        players: { data: [] },
      },
    });
    await search.search(makeCtx(supabase), "vis");
    const eq = supabase._builders.get("equipment")!;
    const pl = supabase._builders.get("players")!;
    // Equipment: TT-163 token-OR on (name, manufacturer) — single token
    // here, but multi-token queries chain one .or() per token.
    expect(eq.calls).toContainEqual({
      method: "or",
      args: ["name.ilike.%vis%,manufacturer.ilike.%vis%"],
    });
    // Players still use textSearch on the bare name column — there's
    // no brand split there.
    expect(pl.calls).toContainEqual({
      method: "textSearch",
      args: ["name", "vis", { type: "websearch" }],
    });
  });
});

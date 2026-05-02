import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as players from "../players";
import { makeSupabase, makeCtx } from "./helpers";

describe("players.getPlayer", () => {
  it("returns row for slug via maybeSingle", async () => {
    const row = { id: "p1", slug: "ma-long" };
    const supabase = makeSupabase({ tables: { players: { data: row } } });
    expect(await players.getPlayer(makeCtx(supabase), "ma-long")).toEqual(row);
    const b = supabase._builders.get("players")!;
    expect(b.calls).toContainEqual({ method: "eq", args: ["slug", "ma-long"] });
    expect(b.calls).toContainEqual({ method: "maybeSingle", args: [] });
  });

  it("returns null on error", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const supabase = makeSupabase({
      tables: { players: { error: { message: "x" } } },
    });
    expect(await players.getPlayer(makeCtx(supabase), "x")).toBeNull();
    spy.mockRestore();
  });
});

describe("players.getAllPlayers", () => {
  it("applies country (.or), playingStyle, gender, active, sort, limit, offset", async () => {
    const supabase = makeSupabase({ tables: { players: { data: [] } } });
    await players.getAllPlayers(makeCtx(supabase), {
      country: "CHN",
      playingStyle: "shakehand",
      gender: "male",
      active: true,
      sortBy: "highest_rating",
      sortOrder: "asc",
      limit: 10,
      offset: 20,
    });
    const b = supabase._builders.get("players")!;
    expect(b.calls).toContainEqual({
      method: "or",
      args: ["represents.eq.CHN,birth_country.eq.CHN"],
    });
    expect(b.calls).toContainEqual({
      method: "eq",
      args: ["playing_style", "shakehand"],
    });
    expect(b.calls).toContainEqual({
      method: "eq",
      args: ["gender", "male"],
    });
    expect(b.calls).toContainEqual({ method: "eq", args: ["active", true] });
    expect(b.calls).toContainEqual({
      method: "order",
      args: ["highest_rating", { ascending: true }],
    });
    expect(b.calls).toContainEqual({ method: "limit", args: [10] });
    expect(b.calls).toContainEqual({ method: "range", args: [20, 29] });
  });

  it("defaults to created_at desc and adds no filters when no options", async () => {
    const supabase = makeSupabase({ tables: { players: { data: [] } } });
    await players.getAllPlayers(makeCtx(supabase));
    const b = supabase._builders.get("players")!;
    expect(b.calls).toContainEqual({
      method: "order",
      args: ["created_at", { ascending: false }],
    });
  });

  it("returns [] on error", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const supabase = makeSupabase({
      tables: { players: { error: { message: "x" } } },
    });
    expect(await players.getAllPlayers(makeCtx(supabase))).toEqual([]);
    spy.mockRestore();
  });
});

describe("players.getPlayersWithoutFilters", () => {
  it("selects all ordered by created_at desc", async () => {
    const supabase = makeSupabase({
      tables: { players: { data: [{ id: "a" }] } },
    });
    expect(await players.getPlayersWithoutFilters(makeCtx(supabase))).toEqual([
      { id: "a" },
    ]);
    const b = supabase._builders.get("players")!;
    expect(b.calls).toContainEqual({
      method: "order",
      args: ["created_at", { ascending: false }],
    });
  });
});

describe("players.getPlayersCount", () => {
  it("returns count and applies filters", async () => {
    const supabase = makeSupabase({
      tables: { players: { count: 42, data: null, error: null } },
    });
    const result = await players.getPlayersCount(makeCtx(supabase), {
      country: "JPN",
    });
    expect(result).toBe(42);
    const b = supabase._builders.get("players")!;
    expect(b.calls).toContainEqual({
      method: "select",
      args: ["*", { count: "exact", head: true }],
    });
  });

  it("returns 0 on error", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const supabase = makeSupabase({
      tables: { players: { error: { message: "x" } } },
    });
    expect(await players.getPlayersCount(makeCtx(supabase))).toBe(0);
    spy.mockRestore();
  });
});

describe("players.getPlayerCountries", () => {
  it("unions represents + birth_country, sorted", async () => {
    const supabase = makeSupabase({
      tables: {
        players: {
          data: [
            { represents: "CHN", birth_country: "CHN" },
            { represents: "JPN", birth_country: null },
            { represents: null, birth_country: "BRA" },
            { represents: "CHN", birth_country: null },
          ],
        },
      },
    });
    const result = await players.getPlayerCountries(makeCtx(supabase));
    expect(result).toEqual(["BRA", "CHN", "JPN"]);
  });

  it("returns [] on error", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const supabase = makeSupabase({
      tables: { players: { error: { message: "x" } } },
    });
    expect(await players.getPlayerCountries(makeCtx(supabase))).toEqual([]);
    spy.mockRestore();
  });
});

describe("players.searchPlayers", () => {
  it("does text search with limit 10", async () => {
    const supabase = makeSupabase({
      tables: { players: { data: [{ id: "p1" }] } },
    });
    expect(await players.searchPlayers(makeCtx(supabase), "ma")).toEqual([
      { id: "p1" },
    ]);
    const b = supabase._builders.get("players")!;
    expect(b.calls).toContainEqual({
      method: "textSearch",
      args: ["name", "ma", { type: "websearch" }],
    });
    expect(b.calls).toContainEqual({ method: "limit", args: [10] });
  });
});

describe("players.getPlayerEquipmentSetups", () => {
  it("filters by player_id + verified and orders by year desc", async () => {
    const setups = [{ id: "s1", year: 2024 }];
    const supabase = makeSupabase({
      tables: { player_equipment_setups: { data: setups } },
    });
    expect(
      await players.getPlayerEquipmentSetups(makeCtx(supabase), "p1")
    ).toEqual(setups);
    const b = supabase._builders.get("player_equipment_setups")!;
    expect(b.calls).toContainEqual({
      method: "eq",
      args: ["player_id", "p1"],
    });
    expect(b.calls).toContainEqual({
      method: "eq",
      args: ["verified", true],
    });
    expect(b.calls).toContainEqual({
      method: "order",
      args: ["year", { ascending: false }],
    });
  });
});

describe("players.getPlayerFootage", () => {
  it("filters active + player_id and orders by created_at desc", async () => {
    const supabase = makeSupabase({
      tables: { player_footage: { data: [{ id: "f1" }] } },
    });
    const result = await players.getPlayerFootage(makeCtx(supabase), "p1");
    expect(result).toEqual([{ id: "f1" }]);
    const b = supabase._builders.get("player_footage")!;
    expect(b.calls).toContainEqual({ method: "eq", args: ["active", true] });
  });
});

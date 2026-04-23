import type { Player, PlayerEquipmentSetup } from "~/lib/types";
import { Logger } from "~/lib/logger.server";
import type { DatabaseContext } from "./types";
import { withLogging } from "./logging";

export async function getPlayer(
  ctx: DatabaseContext,
  slug: string
): Promise<Player | null> {
  return withLogging<Player | null>(
    ctx,
    "get_player",
    () =>
      ctx.supabase.from("players").select("*").eq("slug", slug).maybeSingle(),
    { slug }
  ).catch(() => null);
}

export interface GetAllPlayersOptions {
  country?: string;
  playingStyle?: string;
  gender?: string;
  active?: boolean;
  limit?: number;
  offset?: number;
  sortBy?: "name" | "created_at" | "highest_rating";
  sortOrder?: "asc" | "desc";
}

export async function getAllPlayers(
  ctx: DatabaseContext,
  options?: GetAllPlayersOptions
): Promise<Player[]> {
  return withLogging<Player[]>(
    ctx,
    "get_all_players",
    () => {
      let query = ctx.supabase.from("players").select("*");

      if (options?.country) {
        query = query.or(
          `represents.eq.${options.country},birth_country.eq.${options.country}`
        );
      }
      if (options?.playingStyle) {
        query = query.eq("playing_style", options.playingStyle);
      }
      if (options?.gender) {
        query = query.eq("gender", options.gender);
      }
      if (options?.active !== undefined) {
        query = query.eq("active", options.active);
      }

      const sortBy = options?.sortBy || "created_at";
      const sortOrder = options?.sortOrder || "desc";
      query = query.order(sortBy, { ascending: sortOrder === "asc" });

      if (options?.limit) {
        query = query.limit(options.limit);
      }
      if (options?.offset) {
        query = query.range(
          options.offset,
          options.offset + (options.limit || 10) - 1
        );
      }
      return query;
    },
    options
  ).catch((): Player[] => []);
}

export async function getPlayersWithoutFilters(
  ctx: DatabaseContext
): Promise<Player[]> {
  return withLogging<Player[]>(ctx, "get_players_without_filters", () =>
    ctx.supabase
      .from("players")
      .select("*")
      .order("created_at", { ascending: false })
  ).catch((): Player[] => []);
}

export interface GetPlayersCountOptions {
  country?: string;
  playingStyle?: string;
  gender?: string;
  active?: boolean;
}

export async function getPlayersCount(
  ctx: DatabaseContext,
  options?: GetPlayersCountOptions
): Promise<number> {
  // Count queries return { count, error } — data is always null, so
  // withLogging's data-unwrap doesn't fit. Use a direct await + Logger.
  const logContext = ctx.context || { requestId: "unknown" };
  try {
    let query = ctx.supabase
      .from("players")
      .select("*", { count: "exact", head: true });

    if (options?.country) {
      query = query.or(
        `represents.eq.${options.country},birth_country.eq.${options.country}`
      );
    }
    if (options?.playingStyle) {
      query = query.eq("playing_style", options.playingStyle);
    }
    if (options?.gender) {
      query = query.eq("gender", options.gender);
    }
    if (options?.active !== undefined) {
      query = query.eq("active", options.active);
    }

    const { count, error } = await query;

    if (error) {
      Logger.error(
        "Database operation failed: get_players_count",
        logContext,
        new Error(error.message || "Database error"),
        { operation: "get_players_count", ...options, error_details: error }
      );
      return 0;
    }

    return count || 0;
  } catch (error) {
    Logger.error(
      "Database operation failed: get_players_count",
      logContext,
      error as Error,
      { operation: "get_players_count", ...options }
    );
    return 0;
  }
}

export async function getPlayerCountries(
  ctx: DatabaseContext
): Promise<string[]> {
  const rows = await withLogging<
    Array<{ represents?: string | null; birth_country?: string | null }>
  >(ctx, "get_player_countries", () =>
    ctx.supabase.from("players").select("represents, birth_country")
  ).catch(
    (): Array<{
      represents?: string | null;
      birth_country?: string | null;
    }> => []
  );

  const countries = new Set<string>();
  rows.forEach(row => {
    if (row.represents) countries.add(row.represents);
    if (row.birth_country) countries.add(row.birth_country);
  });

  return Array.from(countries).sort();
}

export async function searchPlayers(
  ctx: DatabaseContext,
  query: string
): Promise<Player[]> {
  return withLogging<Player[]>(
    ctx,
    "search_players",
    () =>
      ctx.supabase
        .from("players")
        .select("*")
        .textSearch("name", query)
        .limit(10),
    { query, limit: 10 }
  ).catch((): Player[] => []);
}

export async function getPlayerEquipmentSetups(
  ctx: DatabaseContext,
  playerId: string
): Promise<PlayerEquipmentSetup[]> {
  return withLogging<PlayerEquipmentSetup[]>(
    ctx,
    "get_player_equipment_setups",
    () =>
      ctx.supabase
        .from("player_equipment_setups")
        .select(
          `
          *,
          blade:blade_id(name, slug),
          forehand_rubber:forehand_rubber_id(name, slug),
          backhand_rubber:backhand_rubber_id(name, slug)
        `
        )
        .eq("player_id", playerId)
        .eq("verified", true)
        .order("year", { ascending: false }),
    { playerId }
  ).catch((): PlayerEquipmentSetup[] => []);
}

export async function getPlayerFootage(
  ctx: DatabaseContext,
  playerId: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<any[]> {
  return withLogging<unknown[]>(
    ctx,
    "get_player_footage",
    () =>
      ctx.supabase
        .from("player_footage")
        .select("*")
        .eq("player_id", playerId)
        .eq("active", true)
        .order("created_at", { ascending: false }),
    { playerId }
  )
    .then(rows => rows ?? [])
    .catch(() => []);
}

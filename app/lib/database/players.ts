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
  // TT-224: kind discriminator filters /players by professional vs
  // amateur. Undefined means "no kind filter" (legacy behaviour).
  playerKind?: "professional" | "amateur";
  limit?: number;
  offset?: number;
  // The `highest_rating` sortBy is preserved as the URL contract from
  // TT-219; for professionals it maps to peak_world_rank asc nulls
  // last, and for amateurs to peak_rating_value desc nulls last. When
  // no `playerKind` filter is supplied it defaults to the pro path
  // (matching TT-219 behaviour).
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
      if (options?.playerKind) {
        query = query.eq("player_kind", options.playerKind);
      }

      const sortBy = options?.sortBy || "created_at";
      const sortOrder = options?.sortOrder || "desc";
      if (sortBy === "highest_rating") {
        // TT-219 / TT-224: the URL-visible "highest_rating" sortBy is
        // a stable contract for "best player first". The underlying
        // column depends on the kind: pros order by peak_world_rank
        // ascending (lower rank = better); amateurs by
        // peak_rating_value descending (higher = better). Unrated
        // rows (NULL on the relevant column) always sort last.
        if (options?.playerKind === "amateur") {
          query = query.order("peak_rating_value", {
            ascending: false,
            nullsFirst: false,
          });
        } else {
          query = query.order("peak_world_rank", {
            ascending: true,
            nullsFirst: false,
          });
        }
      } else {
        query = query.order(sortBy, { ascending: sortOrder === "asc" });
      }

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
  playerKind?: "professional" | "amateur";
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
    if (options?.playerKind) {
      query = query.eq("player_kind", options.playerKind);
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
        .textSearch("name", query, { type: "websearch" })
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

// Bulk variant of getPlayerEquipmentSetups for card-grid contexts
// (homepage Popular Players, /players grid). Returns the most-recent
// verified setup per player in a single PostgREST round-trip rather
// than N — important on Cloudflare Workers Free where the 50-
// subrequest cap makes N-of-N fan-out untenable above ~25 players.
//
// "Most recent" = max(year) per player among verified setups, ties
// broken by id. Resolved in JS after pulling all verified setups for
// the requested player IDs.
export interface PlayerCurrentSetup {
  blade?: { name: string; manufacturer: string };
  forehandRubber?: { name: string; manufacturer: string };
  backhandRubber?: { name: string; manufacturer: string };
}

export async function getMostRecentEquipmentSetupsForPlayers(
  ctx: DatabaseContext,
  playerIds: string[]
): Promise<Map<string, PlayerCurrentSetup>> {
  if (playerIds.length === 0) return new Map();

  interface SetupRow {
    player_id: string;
    year: number | null;
    id: string;
    blade: { name: string; manufacturer: string } | null;
    forehand_rubber: { name: string; manufacturer: string } | null;
    backhand_rubber: { name: string; manufacturer: string } | null;
  }

  const rows = await withLogging<SetupRow[]>(
    ctx,
    "get_most_recent_equipment_setups_for_players",
    () =>
      ctx.supabase
        .from("player_equipment_setups")
        .select(
          `
          player_id,
          year,
          id,
          blade:blade_id(name, manufacturer),
          forehand_rubber:forehand_rubber_id(name, manufacturer),
          backhand_rubber:backhand_rubber_id(name, manufacturer)
        `
        )
        .in("player_id", playerIds)
        .eq("verified", true)
        .order("year", { ascending: false, nullsFirst: false }),
    { playerCount: playerIds.length }
  ).catch((): SetupRow[] => []);

  const byPlayer = new Map<string, PlayerCurrentSetup>();
  for (const row of rows) {
    // .order returns rows sorted year-desc; first row per player_id is
    // the most recent. Skip subsequent rows.
    if (byPlayer.has(row.player_id)) continue;
    byPlayer.set(row.player_id, {
      blade: row.blade ?? undefined,
      forehandRubber: row.forehand_rubber ?? undefined,
      backhandRubber: row.backhand_rubber ?? undefined,
    });
  }
  return byPlayer;
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

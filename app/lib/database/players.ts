import type { Player, PlayerEquipmentSetup } from "~/lib/types";
import type { DatabaseContext } from "./types";

export async function getPlayer(
  ctx: DatabaseContext,
  slug: string
): Promise<Player | null> {
  const { data, error } = await ctx.supabase
    .from("players")
    .select("*")
    .eq("slug", slug)
    .maybeSingle();

  if (error) {
    console.error("Error fetching player:", error);
    return null;
  }

  return data as Player | null;
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

  const { data, error } = await query;

  if (error) {
    console.error("Error fetching players:", error);
    return [];
  }

  return (data as Player[]) || [];
}

export async function getPlayersWithoutFilters(
  ctx: DatabaseContext
): Promise<Player[]> {
  const { data, error } = await ctx.supabase
    .from("players")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Error fetching players:", error);
    return [];
  }

  return (data as Player[]) || [];
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
    console.error("Error counting players:", error);
    return 0;
  }

  return count || 0;
}

export async function getPlayerCountries(
  ctx: DatabaseContext
): Promise<string[]> {
  const { data, error } = await ctx.supabase
    .from("players")
    .select("represents, birth_country");

  if (error) {
    console.error("Error fetching player countries:", error);
    return [];
  }

  const countries = new Set<string>();
  data.forEach(player => {
    if (player.represents) countries.add(player.represents);
    if (player.birth_country) countries.add(player.birth_country);
  });

  return Array.from(countries).sort();
}

export async function searchPlayers(
  ctx: DatabaseContext,
  query: string
): Promise<Player[]> {
  const { data, error } = await ctx.supabase
    .from("players")
    .select("*")
    .textSearch("name", query)
    .limit(10);

  if (error) {
    console.error("Error searching players:", error);
    return [];
  }

  return (data as Player[]) || [];
}

export async function getPlayerEquipmentSetups(
  ctx: DatabaseContext,
  playerId: string
): Promise<PlayerEquipmentSetup[]> {
  const { data, error } = await ctx.supabase
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
    .order("year", { ascending: false });

  if (error) {
    console.error("Error fetching player equipment setups:", error);
    return [];
  }

  return (data as PlayerEquipmentSetup[]) || [];
}

export async function getPlayerFootage(
  ctx: DatabaseContext,
  playerId: string
) {
  const { data, error } = await ctx.supabase
    .from("player_footage")
    .select("*")
    .eq("player_id", playerId)
    .eq("active", true)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Error fetching player footage:", error);
    return [];
  }

  return data || [];
}

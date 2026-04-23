import type { Equipment } from "~/lib/types";
import { Logger } from "~/lib/logger.server";
import type { DatabaseContext } from "./types";
import { withLogging } from "./logging";

export async function getEquipment(
  ctx: DatabaseContext,
  slug: string
): Promise<Equipment | null> {
  return withLogging<Equipment | null>(
    ctx,
    "get_equipment",
    () =>
      ctx.supabase.from("equipment").select("*").eq("slug", slug).maybeSingle(),
    { slug }
  ).catch(() => null);
}

export async function getEquipmentById(
  ctx: DatabaseContext,
  id: string
): Promise<Equipment | null> {
  return withLogging<Equipment | null>(
    ctx,
    "get_equipment_by_id",
    () =>
      ctx.supabase.from("equipment").select("*").eq("id", id).maybeSingle(),
    { id }
  ).catch(() => null);
}

export async function searchEquipment(
  ctx: DatabaseContext,
  query: string
): Promise<Equipment[]> {
  return withLogging<Equipment[]>(
    ctx,
    "search_equipment",
    () =>
      ctx.supabase
        .from("equipment")
        .select("*")
        .textSearch("name", query)
        .limit(10),
    { query, limit: 10 }
  ).catch((): Equipment[] => []);
}

export async function getRecentEquipment(
  ctx: DatabaseContext,
  limit = 10
): Promise<Equipment[]> {
  return withLogging<Equipment[]>(
    ctx,
    "get_recent_equipment",
    () =>
      ctx.supabase
        .from("equipment")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(limit),
    { limit }
  ).catch((): Equipment[] => []);
}

export interface GetAllEquipmentOptions {
  category?: string;
  subcategory?: string;
  limit?: number;
  offset?: number;
  sortBy?: "name" | "created_at" | "manufacturer";
  sortOrder?: "asc" | "desc";
}

export async function getAllEquipment(
  ctx: DatabaseContext,
  options?: GetAllEquipmentOptions
): Promise<Equipment[]> {
  return withLogging<Equipment[]>(
    ctx,
    "get_all_equipment",
    async () => {
      let query = ctx.supabase.from("equipment").select("*");

      if (options?.category) {
        query = query.eq("category", options.category);
      }

      if (options?.subcategory) {
        query = query.eq("subcategory", options.subcategory);
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

      return await query;
    },
    options
  ).catch((): Equipment[] => []);
}

export async function getEquipmentByCategory(
  ctx: DatabaseContext,
  category: string
): Promise<Equipment[]> {
  return withLogging<Equipment[]>(
    ctx,
    "get_equipment_by_category",
    () =>
      ctx.supabase
        .from("equipment")
        .select("*")
        .eq("category", category)
        .order("name", { ascending: true }),
    { category }
  ).catch((): Equipment[] => []);
}

export async function getEquipmentCategories(
  ctx: DatabaseContext
): Promise<{ category: string; count: number }[]> {
  const logContext = ctx.context || { requestId: "unknown" };

  // Try the database aggregation RPC first — silent fallback if absent.
  const { data: rpcData, error: rpcError } = await ctx.supabase.rpc(
    "get_equipment_category_counts"
  );
  if (!rpcError && rpcData) {
    return rpcData || [];
  }

  const fallbackRows = await withLogging<Array<{ category: string }>>(
    ctx,
    "get_equipment_categories_fallback",
    () => ctx.supabase.from("equipment").select("category")
  ).catch((error: unknown) => {
    Logger.error(
      "Error fetching equipment categories (fallback)",
      logContext,
      error as Error
    );
    return [] as Array<{ category: string }>;
  });

  const categoryCount: Record<string, number> = {};
  fallbackRows.forEach(item => {
    categoryCount[item.category] = (categoryCount[item.category] || 0) + 1;
  });

  return Object.entries(categoryCount).map(([category, count]) => ({
    category,
    count,
  }));
}

export async function getEquipmentSubcategories(
  ctx: DatabaseContext,
  category: string
): Promise<{ subcategory: string; count: number }[]> {
  const logContext = ctx.context || { requestId: "unknown" };

  const { data: rpcData, error: rpcError } = await ctx.supabase.rpc(
    "get_equipment_subcategory_counts",
    { category_filter: category }
  );
  if (!rpcError && rpcData) {
    return rpcData || [];
  }

  const fallbackRows = await withLogging<
    Array<{ subcategory: string | null }>
  >(
    ctx,
    "get_equipment_subcategories_fallback",
    () =>
      ctx.supabase
        .from("equipment")
        .select("subcategory")
        .eq("category", category)
        .not("subcategory", "is", null),
    { category }
  ).catch((error: unknown) => {
    Logger.error(
      "Error fetching equipment subcategories (fallback)",
      logContext,
      error as Error,
      { category }
    );
    return [] as Array<{ subcategory: string | null }>;
  });

  const subcategoryCount: Record<string, number> = {};
  fallbackRows.forEach(item => {
    if (item.subcategory) {
      subcategoryCount[item.subcategory] =
        (subcategoryCount[item.subcategory] || 0) + 1;
    }
  });

  return Object.entries(subcategoryCount).map(([subcategory, count]) => ({
    subcategory,
    count,
  }));
}

export async function getEquipmentWithStats(
  ctx: DatabaseContext,
  limit = 10
): Promise<(Equipment & { averageRating?: number; reviewCount?: number })[]> {
  const logContext = ctx.context || { requestId: "unknown" };
  const { data, error } = await ctx.supabase.rpc("get_equipment_with_stats", {
    limit_count: limit,
  });

  if (error) {
    Logger.error(
      "Error fetching equipment with stats",
      logContext,
      new Error(error.message || "rpc error"),
      { limit, error_details: error }
    );
    return getRecentEquipment(ctx, limit);
  }

  return data || [];
}

export interface GetAllEquipmentWithStatsOptions {
  category?: string;
  subcategory?: string;
  limit?: number;
  offset?: number;
  sortBy?: "name" | "created_at" | "manufacturer" | "rating";
  sortOrder?: "asc" | "desc";
}

export async function getAllEquipmentWithStats(
  ctx: DatabaseContext,
  options?: GetAllEquipmentWithStatsOptions
): Promise<(Equipment & { averageRating?: number; reviewCount?: number })[]> {
  const logContext = ctx.context || { requestId: "unknown" };

  let query = ctx.supabase.from("equipment").select(`
      *,
      equipment_reviews!inner(
        overall_rating,
        status
      )
    `);

  if (options?.category) {
    query = query.eq("category", options.category);
  }

  if (options?.subcategory) {
    query = query.eq("subcategory", options.subcategory);
  }

  query = query.eq("equipment_reviews.status", "approved");

  const { data: equipmentWithReviews, error } = await query;

  if (error) {
    Logger.error(
      "Error fetching equipment with reviews",
      logContext,
      new Error(error.message || "query error"),
      { ...options, error_details: error }
    );
    const fallbackOptions = options
      ? {
          ...options,
          sortBy: options.sortBy === "rating" ? "name" : options.sortBy,
        }
      : undefined;
    return getAllEquipment(
      ctx,
      fallbackOptions as GetAllEquipmentOptions | undefined
    );
  }

  const equipmentStatsMap = new Map<
    string,
    { averageRating: number; reviewCount: number }
  >();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  equipmentWithReviews?.forEach((item: any) => {
    if (!equipmentStatsMap.has(item.id)) {
      equipmentStatsMap.set(item.id, { averageRating: 0, reviewCount: 0 });
    }

    const stats = equipmentStatsMap.get(item.id)!;
    stats.reviewCount++;
    stats.averageRating += item.equipment_reviews.overall_rating;
  });

  const equipmentWithStats: (Equipment & {
    averageRating?: number;
    reviewCount?: number;
  })[] = [];
  const processedIds = new Set<string>();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  equipmentWithReviews?.forEach((item: any) => {
    if (processedIds.has(item.id)) return;
    processedIds.add(item.id);

    const stats = equipmentStatsMap.get(item.id)!;
    const averageRating = stats.averageRating / stats.reviewCount;

    const { equipment_reviews: _reviews, ...equipment } = item;
    void _reviews;
    equipmentWithStats.push({
      ...equipment,
      averageRating: Math.round(averageRating * 10) / 10,
      reviewCount: stats.reviewCount,
    });
  });

  const equipmentWithoutReviews = await getAllEquipment(ctx, {
    ...options,
    limit: undefined,
    sortBy: options?.sortBy === "rating" ? "name" : options?.sortBy,
  } as GetAllEquipmentOptions);

  const equipmentWithoutReviewsFiltered = equipmentWithoutReviews.filter(
    equipment => !processedIds.has(equipment.id)
  );

  const allEquipment = [
    ...equipmentWithStats,
    ...equipmentWithoutReviewsFiltered.map(equipment => ({
      ...equipment,
      averageRating: undefined,
      reviewCount: 0,
    })),
  ];

  const sortBy = options?.sortBy || "created_at";
  const sortOrder = options?.sortOrder || "desc";

  allEquipment.sort((a, b) => {
    let comparison = 0;

    switch (sortBy) {
      case "rating": {
        const aRating = a.averageRating || 0;
        const bRating = b.averageRating || 0;
        comparison = aRating - bRating;
        break;
      }
      case "name":
        comparison = a.name.localeCompare(b.name);
        break;
      case "manufacturer":
        comparison = a.manufacturer.localeCompare(b.manufacturer);
        break;
      case "created_at":
      default:
        comparison =
          new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
        break;
    }

    return sortOrder === "desc" ? -comparison : comparison;
  });

  const start = options?.offset || 0;
  const end = options?.limit ? start + options.limit : undefined;

  return allEquipment.slice(start, end);
}

export async function getPopularEquipment(
  ctx: DatabaseContext,
  limit = 6
): Promise<(Equipment & { averageRating?: number; reviewCount?: number })[]> {
  const logContext = ctx.context || { requestId: "unknown" };
  const { data, error } = await ctx.supabase.rpc("get_popular_equipment", {
    limit_count: limit,
  });

  if (error) {
    Logger.error(
      "Error fetching popular equipment",
      logContext,
      new Error(error.message || "rpc error"),
      { limit, error_details: error }
    );
    return getRecentEquipment(ctx, limit);
  }

  return data || [];
}

export async function getSimilarEquipment(
  ctx: DatabaseContext,
  equipmentId: string,
  limit = 6
): Promise<Equipment[]> {
  return withLogging<Equipment[]>(
    ctx,
    "get_similar_equipment",
    async () => {
      const currentEquipment = await getEquipmentById(ctx, equipmentId);
      if (!currentEquipment) return { data: [], error: null };

      return await ctx.supabase
        .from("equipment")
        .select("*")
        .eq("category", currentEquipment.category)
        .neq("id", equipmentId)
        .limit(limit);
    },
    { equipmentId, limit }
  ).catch((): Equipment[] => []);
}

export async function getPlayersUsingEquipment(
  ctx: DatabaseContext,
  equipmentId: string
): Promise<Array<{ id: string; name: string; slug: string }>> {
  type PlayerResult = { id: string; name: string; slug: string };
  return withLogging<PlayerResult[]>(
    ctx,
    "get_players_using_equipment",
    async () => {
      const result = await ctx.supabase
        .from("player_equipment_setups")
        .select(
          `
          players!inner (
            id,
            name,
            slug
          )
        `
        )
        .or(
          `blade_id.eq.${equipmentId},forehand_rubber_id.eq.${equipmentId},backhand_rubber_id.eq.${equipmentId}`
        )
        .eq("verified", true);

      if (result.data) {
        const uniquePlayers = new Map<string, PlayerResult>();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        result.data.forEach((setup: any) => {
          const player = setup.players;
          if (player && !uniquePlayers.has(player.id)) {
            uniquePlayers.set(player.id, player);
          }
        });
        return {
          data: Array.from(uniquePlayers.values()),
          error: result.error,
        };
      }

      return result;
    },
    { equipmentId }
  ).catch((): PlayerResult[] => []);
}

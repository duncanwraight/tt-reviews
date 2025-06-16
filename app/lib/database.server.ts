import { createClient, SupabaseClient } from "@supabase/supabase-js";
import type { AppLoadContext } from "react-router";
import { Logger, type LogContext } from "~/lib/logger.server";
import { withDatabaseCorrelation } from "~/lib/middleware/correlation.server";

// Re-export shared types
export type { Player, Equipment, PlayerEquipmentSetup } from "./types";

// Import shared types for server-side usage
import type { Player, Equipment, PlayerEquipmentSetup } from "./types";

export interface EquipmentReview {
  id: string;
  equipment_id: string;
  user_id: string;
  status: "pending" | "approved" | "rejected";
  overall_rating: number;
  category_ratings: Record<string, number>;
  review_text?: string;
  reviewer_context: ReviewerContext;
  created_at: string;
  updated_at: string;
  equipment?: Equipment;
}

export interface ReviewerContext {
  playing_level?: string;
  style_of_play?: string;
  testing_duration?: string;
  testing_quantity?: string;
  testing_type?: string;
  other_equipment?: string;
  purchase_location?: string;
  purchase_price?: string;
}

export interface PlayerEdit {
  id: string;
  player_id: string;
  user_id: string;
  edit_data: Partial<Player>;
  status: "pending" | "approved" | "rejected" | "awaiting_second_approval";
  moderator_id?: string;
  moderator_notes?: string;
  created_at: string;
  updated_at: string;
  players?: Player;
}

export interface EquipmentSubmission {
  id: string;
  user_id: string;
  name: string;
  manufacturer: string;
  category: "blade" | "rubber" | "ball";
  subcategory?: "inverted" | "long_pips" | "anti" | "short_pips";
  specifications: Record<string, unknown>;
  status: import("./types").ReviewStatus;
  moderator_id?: string;
  moderator_notes?: string;
  rejection_category?: import("./types").RejectionCategory;
  rejection_reason?: string;
  approval_count: number;
  created_at: string;
  updated_at: string;
}

export interface PlayerSubmission {
  id: string;
  user_id: string;
  name: string;
  highest_rating?: string;
  active_years?: string;
  playing_style?: string; // Now uses configurable categories instead of hardcoded values
  birth_country?: string;
  represents?: string;
  equipment_setup?: {
    year?: number;
    blade_name?: string;
    forehand_rubber_name?: string;
    forehand_thickness?: string;
    forehand_color?: "red" | "black";
    backhand_rubber_name?: string;
    backhand_thickness?: string;
    backhand_color?: "red" | "black";
    source_type?:
      | "interview"
      | "video"
      | "tournament_footage"
      | "official_website";
    source_url?: string;
  };
  status: import("./types").ReviewStatus;
  moderator_id?: string;
  moderator_notes?: string;
  rejection_category?: import("./types").RejectionCategory;
  rejection_reason?: string;
  approval_count: number;
  image_url?: string;
  image_key?: string;
  created_at: string;
  updated_at: string;
}

// Supabase client factory
export function createSupabaseClient(context: AppLoadContext): SupabaseClient {
  const env = context.cloudflare.env as Cloudflare.Env;
  const supabaseUrl = env.SUPABASE_URL;
  const supabaseKey = env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error("Missing Supabase environment variables");
  }

  return createClient(supabaseUrl, supabaseKey);
}

export function createSupabaseAdminClient(
  context: AppLoadContext
): SupabaseClient {
  const env = context.cloudflare.env as Cloudflare.Env;
  const supabaseUrl = env.SUPABASE_URL;
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Missing Supabase admin environment variables");
  }

  return createClient(supabaseUrl, serviceRoleKey);
}

// Main database service class
export class DatabaseService {
  private supabase: SupabaseClient;
  private context?: LogContext;

  constructor(context: AppLoadContext, logContext?: LogContext) {
    this.supabase = createSupabaseClient(context);
    this.context = logContext;
  }

  /**
   * Execute database operation with logging and performance monitoring
   */
  private async withLogging<T>(
    operation: string,
    fn: () => Promise<{ data: T; error: any }>,
    metadata?: any
  ): Promise<T> {
    const context = this.context || { requestId: 'unknown', userId: undefined };
    
    return withDatabaseCorrelation(
      operation,
      async () => {
        const result = await fn();
        
        if (result.error) {
          Logger.error(
            `Database operation failed: ${operation}`,
            context,
            new Error(result.error.message || 'Database error'),
            { operation, ...metadata, error_details: result.error }
          );
          throw new Error(result.error.message || `Database operation ${operation} failed`);
        }

        // Log successful operations in debug mode
        Logger.debug(`Database operation completed: ${operation}`, context, {
          operation,
          result_count: Array.isArray(result.data) ? result.data.length : result.data ? 1 : 0,
          ...metadata,
        });

        return result.data;
      },
      context,
      metadata
    );
  }

  /**
   * Execute database query with logging (for operations that don't follow standard pattern)
   */
  private async executeQuery<T>(
    operation: string,
    queryFn: () => Promise<T>,
    metadata?: any
  ): Promise<T> {
    const context = this.context || { requestId: 'unknown', userId: undefined };
    
    return withDatabaseCorrelation(
      operation,
      queryFn,
      context,
      metadata
    );
  }

  // Equipment methods
  async getEquipment(slug: string): Promise<Equipment | null> {
    return this.withLogging(
      'get_equipment',
      () => this.supabase
        .from("equipment")
        .select("*")
        .eq("slug", slug)
        .maybeSingle(),
      { slug }
    ).catch(() => null); // Return null on error for backwards compatibility
  }

  async getEquipmentById(id: string): Promise<Equipment | null> {
    return this.withLogging(
      'get_equipment_by_id',
      () => this.supabase
        .from("equipment")
        .select("*")
        .eq("id", id)
        .maybeSingle(),
      { id }
    ).catch(() => null);
  }

  async searchEquipment(query: string): Promise<Equipment[]> {
    return this.withLogging(
      'search_equipment',
      () => this.supabase
        .from("equipment")
        .select("*")
        .textSearch("name", query)
        .limit(10),
      { query, limit: 10 }
    ).catch(() => []);
  }

  async getRecentEquipment(limit = 10): Promise<Equipment[]> {
    return this.withLogging(
      'get_recent_equipment',
      () => this.supabase
        .from("equipment")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(limit),
      { limit }
    ).catch(() => []);
  }

  async getAllEquipment(options?: {
    category?: string;
    subcategory?: string;
    limit?: number;
    offset?: number;
    sortBy?: "name" | "created_at" | "manufacturer";
    sortOrder?: "asc" | "desc";
  }): Promise<Equipment[]> {
    return this.withLogging(
      'get_all_equipment',
      async () => {
        let query = this.supabase.from("equipment").select("*");

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
    ).catch(() => []);
  }

  async getEquipmentByCategory(category: string): Promise<Equipment[]> {
    return this.withLogging(
      'get_equipment_by_category',
      () => this.supabase
        .from("equipment")
        .select("*")
        .eq("category", category)
        .order("name", { ascending: true }),
      { category }
    ).catch(() => []);
  }

  async getEquipmentCategories(): Promise<
    { category: string; count: number }[]
  > {
    // Try database aggregation function first, but fallback silently if not available
    const { data: rpcData, error: rpcError } = await this.supabase
      .rpc('get_equipment_category_counts');

    // If RPC function exists and works, use it
    if (!rpcError && rpcData) {
      return rpcData || [];
    }

    // Silently fallback to manual aggregation (don't log error for missing function)
    const { data: fallbackData, error: fallbackError } = await this.supabase
      .from("equipment")
      .select("category");
    
    if (fallbackError || !fallbackData) {
      console.error("Error fetching equipment categories:", fallbackError);
      return [];
    }

    const categoryCount: Record<string, number> = {};
    fallbackData.forEach((item: any) => {
      categoryCount[item.category] = (categoryCount[item.category] || 0) + 1;
    });

    return Object.entries(categoryCount).map(([category, count]) => ({
      category,
      count,
    }));
  }

  async getEquipmentSubcategories(category: string): Promise<
    { subcategory: string; count: number }[]
  > {
    // Try database aggregation function first, but fallback silently if not available
    const { data: rpcData, error: rpcError } = await this.supabase
      .rpc('get_equipment_subcategory_counts', { category_filter: category });

    // If RPC function exists and works, use it
    if (!rpcError && rpcData) {
      return rpcData || [];
    }

    // Silently fallback to manual aggregation (don't log error for missing function)
    const { data: fallbackData, error: fallbackError } = await this.supabase
      .from("equipment")
      .select("subcategory")
      .eq("category", category)
      .not("subcategory", "is", null);
    
    if (fallbackError || !fallbackData) {
      console.error("Error fetching equipment subcategories:", fallbackError);
      return [];
    }

    const subcategoryCount: Record<string, number> = {};
    fallbackData.forEach((item: any) => {
      if (item.subcategory) {
        subcategoryCount[item.subcategory] = (subcategoryCount[item.subcategory] || 0) + 1;
      }
    });

    return Object.entries(subcategoryCount).map(([subcategory, count]) => ({
      subcategory,
      count,
    }));
  }

  // Player methods
  async getPlayer(slug: string): Promise<Player | null> {
    const { data, error } = await this.supabase
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

  async getAllPlayers(options?: {
    country?: string;
    playingStyle?: string;
    gender?: string;
    active?: boolean;
    limit?: number;
    offset?: number;
    sortBy?: "name" | "created_at" | "highest_rating";
    sortOrder?: "asc" | "desc";
  }): Promise<Player[]> {
    let query = this.supabase.from("players").select("*");

    if (options?.country) {
      query = query.or(`represents.eq.${options.country},birth_country.eq.${options.country}`);
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

  async getPlayersWithoutFilters(): Promise<Player[]> {
    const { data, error } = await this.supabase
      .from("players")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching players:", error);
      return [];
    }

    return (data as Player[]) || [];
  }

  async getPlayersCount(options?: {
    country?: string;
    playingStyle?: string;
    gender?: string;
    active?: boolean;
  }): Promise<number> {
    let query = this.supabase
      .from("players")
      .select("*", { count: "exact", head: true });

    if (options?.country) {
      query = query.or(`represents.eq.${options.country},birth_country.eq.${options.country}`);
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

  async getPlayerCountries(): Promise<string[]> {
    const { data, error } = await this.supabase
      .from("players")
      .select("represents, birth_country");

    if (error) {
      console.error("Error fetching player countries:", error);
      return [];
    }

    const countries = new Set<string>();
    data.forEach((player) => {
      if (player.represents) countries.add(player.represents);
      if (player.birth_country) countries.add(player.birth_country);
    });

    return Array.from(countries).sort();
  }

  async searchPlayers(query: string): Promise<Player[]> {
    const { data, error } = await this.supabase
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

  async getPlayerEquipmentSetups(
    playerId: string
  ): Promise<PlayerEquipmentSetup[]> {
    const { data, error } = await this.supabase
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

  // Review methods
  async getEquipmentReviews(
    equipmentId: string,
    status: "approved" | "all" = "approved"
  ): Promise<EquipmentReview[]> {
    return this.withLogging(
      'get_equipment_reviews',
      async () => {
        let query = this.supabase
          .from("equipment_reviews")
          .select(
            `
            *,
            equipment (
              id,
              name,
              manufacturer,
              category,
              subcategory
            )
          `
          )
          .eq("equipment_id", equipmentId)
          .order("created_at", { ascending: false });

        if (status === "approved") {
          query = query.eq("status", "approved");
        }

        return await query;
      },
      { equipmentId, status }
    ).catch(() => []);
  }

  async getRecentReviews(limit = 10): Promise<EquipmentReview[]> {
    const { data, error } = await this.supabase
      .from("equipment_reviews")
      .select(
        `
        *,
        equipment (
          id,
          name,
          manufacturer,
          category,
          subcategory,
          slug
        )
      `
      )
      .eq("status", "approved")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      console.error("Error fetching recent reviews:", error);
      return [];
    }

    return (data as EquipmentReview[]) || [];
  }

  async getUserReviews(userId: string): Promise<EquipmentReview[]> {
    const { data, error } = await this.supabase
      .from("equipment_reviews")
      .select(
        `
        *,
        equipment (
          id,
          name,
          slug,
          manufacturer,
          category,
          subcategory
        )
      `
      )
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching user reviews:", error);
      return [];
    }

    return (data as EquipmentReview[]) || [];
  }

  async getUserReviewForEquipment(equipmentId: string, userId: string): Promise<EquipmentReview | null> {
    const { data, error } = await this.supabase
      .from("equipment_reviews")
      .select(
        `
        *,
        equipment (
          id,
          name,
          slug,
          manufacturer,
          category,
          subcategory
        )
      `
      )
      .eq("equipment_id", equipmentId)
      .eq("user_id", userId)
      .maybeSingle();

    if (error) {
      console.error("Error fetching user review for equipment:", error);
      return null;
    }

    return data as EquipmentReview | null;
  }

  // Equipment submission methods
  async submitEquipment(
    submission: Omit<
      EquipmentSubmission,
      | "id"
      | "created_at"
      | "updated_at"
      | "status"
      | "moderator_id"
      | "moderator_notes"
    >
  ): Promise<EquipmentSubmission | null> {
    const { data, error } = await this.supabase
      .from("equipment_submissions")
      .insert({
        ...submission,
        status: "pending",
      })
      .select()
      .single();

    if (error) {
      console.error("Error submitting equipment:", error);
      return null;
    }

    return data as EquipmentSubmission;
  }

  async getUserEquipmentSubmissions(
    userId: string
  ): Promise<EquipmentSubmission[]> {
    const { data, error } = await this.supabase
      .from("equipment_submissions")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching user equipment submissions:", error);
      return [];
    }

    return (data as EquipmentSubmission[]) || [];
  }

  // Player submission methods
  async submitPlayer(
    submission: Omit<
      PlayerSubmission,
      | "id"
      | "created_at"
      | "updated_at"
      | "status"
      | "moderator_id"
      | "moderator_notes"
    >
  ): Promise<PlayerSubmission | null> {
    const { data, error } = await this.supabase
      .from("player_submissions")
      .insert({
        ...submission,
        status: "pending",
      })
      .select()
      .single();

    if (error) {
      console.error("Error submitting player:", error);
      return null;
    }

    return data as PlayerSubmission;
  }

  async getUserPlayerSubmissions(userId: string): Promise<PlayerSubmission[]> {
    const { data, error } = await this.supabase
      .from("player_submissions")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching user player submissions:", error);
      return [];
    }

    return (data as PlayerSubmission[]) || [];
  }

  // Equipment with ratings and review counts
  async getEquipmentWithStats(limit = 10): Promise<(Equipment & { 
    averageRating?: number; 
    reviewCount?: number; 
  })[]> {
    const { data, error } = await this.supabase.rpc('get_equipment_with_stats', {
      limit_count: limit
    });

    if (error) {
      console.error("Error fetching equipment with stats:", error);
      // Fallback to basic equipment data
      return this.getRecentEquipment(limit);
    }

    return data || [];
  }

  async getAllEquipmentWithStats(options?: {
    category?: string;
    subcategory?: string;
    limit?: number;
    offset?: number;
    sortBy?: "name" | "created_at" | "manufacturer" | "rating";
    sortOrder?: "asc" | "desc";
  }): Promise<(Equipment & { 
    averageRating?: number; 
    reviewCount?: number; 
  })[]> {
    // First get basic equipment with filtering
    let query = this.supabase
      .from("equipment")
      .select(`
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

    // Only include approved reviews
    query = query.eq("equipment_reviews.status", "approved");

    const { data: equipmentWithReviews, error } = await query;

    if (error) {
      console.error("Error fetching equipment with reviews:", error);
      // Fallback to basic equipment without stats
      return this.getAllEquipment(options);
    }

    // Calculate stats for each equipment
    const equipmentStatsMap = new Map<string, { averageRating: number; reviewCount: number }>();
    
    equipmentWithReviews?.forEach((item: any) => {
      if (!equipmentStatsMap.has(item.id)) {
        equipmentStatsMap.set(item.id, { averageRating: 0, reviewCount: 0 });
      }
      
      const stats = equipmentStatsMap.get(item.id)!;
      stats.reviewCount++;
      stats.averageRating += item.equipment_reviews.overall_rating;
    });

    // Calculate final averages and create equipment list
    const equipmentWithStats: (Equipment & { averageRating?: number; reviewCount?: number })[] = [];
    const processedIds = new Set<string>();

    equipmentWithReviews?.forEach((item: any) => {
      if (processedIds.has(item.id)) return;
      processedIds.add(item.id);

      const stats = equipmentStatsMap.get(item.id)!;
      const averageRating = stats.averageRating / stats.reviewCount;

      // Remove the equipment_reviews field and add our computed stats
      const { equipment_reviews, ...equipment } = item;
      equipmentWithStats.push({
        ...equipment,
        averageRating: Math.round(averageRating * 10) / 10, // Round to 1 decimal
        reviewCount: stats.reviewCount
      });
    });

    // Add equipment with no reviews
    const equipmentWithoutReviews = await this.getAllEquipment({
      ...options,
      limit: undefined // Get all for filtering
    });

    const equipmentWithoutReviewsFiltered = equipmentWithoutReviews.filter(
      (equipment) => !processedIds.has(equipment.id)
    );

    const allEquipment = [
      ...equipmentWithStats,
      ...equipmentWithoutReviewsFiltered.map(equipment => ({
        ...equipment,
        averageRating: undefined,
        reviewCount: 0
      }))
    ];

    // Apply sorting
    const sortBy = options?.sortBy || "created_at";
    const sortOrder = options?.sortOrder || "desc";

    allEquipment.sort((a, b) => {
      let comparison = 0;
      
      switch (sortBy) {
        case "rating":
          const aRating = a.averageRating || 0;
          const bRating = b.averageRating || 0;
          comparison = aRating - bRating;
          break;
        case "name":
          comparison = a.name.localeCompare(b.name);
          break;
        case "manufacturer":
          comparison = a.manufacturer.localeCompare(b.manufacturer);
          break;
        case "created_at":
        default:
          comparison = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
          break;
      }
      
      return sortOrder === "desc" ? -comparison : comparison;
    });

    // Apply limit and offset
    const start = options?.offset || 0;
    const end = options?.limit ? start + options.limit : undefined;
    
    return allEquipment.slice(start, end);
  }

  async getPopularEquipment(limit = 6): Promise<(Equipment & { 
    averageRating?: number; 
    reviewCount?: number; 
  })[]> {
    const { data, error } = await this.supabase.rpc('get_popular_equipment', {
      limit_count: limit
    });

    if (error) {
      console.error("Error fetching popular equipment:", error);
      // Fallback to recent equipment
      return this.getRecentEquipment(limit);
    }

    return data || [];
  }

  async getAdminDashboardCounts(): Promise<{
    totals: {
      equipmentSubmissions: number;
      playerSubmissions: number;
      playerEdits: number;
      equipmentReviews: number;
      equipment: number;
      players: number;
    };
    byStatus: {
      equipmentSubmissions: Record<string, number>;
      playerSubmissions: Record<string, number>;
      playerEdits: Record<string, number>;
      equipmentReviews: Record<string, number>;
    };
  }> {
    try {
      // Use a single aggregation query to get all counts efficiently
      const [
        equipmentSubmissionsQuery,
        playerSubmissionsQuery,
        playerEditsQuery,
        equipmentReviewsQuery,
        equipmentCountQuery,
        playersCountQuery
      ] = await Promise.all([
        // Get equipment submissions grouped by status
        this.supabase
          .from("equipment_submissions")
          .select("status", { count: "exact" })
          .neq("status", null),
        
        // Get player submissions grouped by status  
        this.supabase
          .from("player_submissions")
          .select("status", { count: "exact" })
          .neq("status", null),
          
        // Get player edits grouped by status
        this.supabase
          .from("player_edits") 
          .select("status", { count: "exact" })
          .neq("status", null),
          
        // Get equipment reviews grouped by status
        this.supabase
          .from("equipment_reviews")
          .select("status", { count: "exact" })
          .neq("status", null),
          
        // Get total equipment count
        this.supabase
          .from("equipment")
          .select("*", { count: "exact", head: true }),
          
        // Get total players count
        this.supabase
          .from("players")
          .select("*", { count: "exact", head: true })
      ]);

      // Process the results to get status counts
      const getStatusCounts = (data: any[] | null): Record<string, number> => {
        const counts: Record<string, number> = {
          pending: 0,
          awaiting_second_approval: 0,
          approved: 0,
          rejected: 0
        };
        
        if (data) {
          // This is a workaround - we get all data and count by status in memory
          // In a real app, we'd use GROUP BY in the database
          data.forEach((item: any) => {
            if (item.status && counts.hasOwnProperty(item.status)) {
              counts[item.status]++;
            }
          });
        }
        
        return counts;
      };

      const result = {
        totals: {
          equipmentSubmissions: equipmentSubmissionsQuery.count || 0,
          playerSubmissions: playerSubmissionsQuery.count || 0,
          playerEdits: playerEditsQuery.count || 0,
          equipmentReviews: equipmentReviewsQuery.count || 0,
          equipment: equipmentCountQuery.count || 0,
          players: playersCountQuery.count || 0,
        },
        byStatus: {
          equipmentSubmissions: getStatusCounts(equipmentSubmissionsQuery.data),
          playerSubmissions: getStatusCounts(playerSubmissionsQuery.data),
          playerEdits: getStatusCounts(playerEditsQuery.data),
          equipmentReviews: getStatusCounts(equipmentReviewsQuery.data),
        }
      };

      return result;
    } catch (error) {
      console.error("Error fetching admin dashboard counts:", error);
      
      // Return empty counts as fallback
      return {
        totals: {
          equipmentSubmissions: 0,
          playerSubmissions: 0,
          playerEdits: 0,
          equipmentReviews: 0,
          equipment: 0,
          players: 0,
        },
        byStatus: {
          equipmentSubmissions: { pending: 0, awaiting_second_approval: 0, approved: 0, rejected: 0 },
          playerSubmissions: { pending: 0, awaiting_second_approval: 0, approved: 0, rejected: 0 },
          playerEdits: { pending: 0, awaiting_second_approval: 0, approved: 0, rejected: 0 },
          equipmentReviews: { pending: 0, awaiting_second_approval: 0, approved: 0, rejected: 0 },
        }
      };
    }
  }

  // Get similar equipment for comparison suggestions
  async getSimilarEquipment(equipmentId: string, limit = 6): Promise<Equipment[]> {
    return this.withLogging(
      'get_similar_equipment',
      async () => {
        // First get current equipment details
        const currentEquipment = await this.getEquipmentById(equipmentId);
        if (!currentEquipment) return { data: [], error: null };

        return await this.supabase
          .from("equipment")
          .select("*")
          .eq("category", currentEquipment.category)
          .neq("id", equipmentId)
          .limit(limit);
      },
      { equipmentId, limit }
    ).catch(() => []);
  }

  // Get players using specific equipment
  async getPlayersUsingEquipment(equipmentId: string): Promise<Array<{ id: string; name: string; slug: string }>> {
    return this.withLogging(
      'get_players_using_equipment',
      async () => {
        const result = await this.supabase
          .from("player_equipment_setups")
          .select(`
            players!inner (
              id,
              name,
              slug
            )
          `)
          .or(`blade_id.eq.${equipmentId},forehand_rubber_id.eq.${equipmentId},backhand_rubber_id.eq.${equipmentId}`)
          .eq("verified", true);
        
        if (result.data) {
          // Extract unique players (remove duplicates if player has multiple setups with same equipment)
          const uniquePlayers = new Map();
          result.data.forEach((setup: any) => {
            const player = setup.players;
            if (player && !uniquePlayers.has(player.id)) {
              uniquePlayers.set(player.id, player);
            }
          });
          return { data: Array.from(uniquePlayers.values()), error: result.error };
        }
        
        return result;
      },
      { equipmentId }
    ).catch(() => []);
  }

  // General search
  async search(query: string): Promise<{
    equipment: Equipment[];
    players: Player[];
  }> {
    const [equipment, players] = await Promise.all([
      this.searchEquipment(query),
      this.searchPlayers(query),
    ]);

    return { equipment, players };
  }
}

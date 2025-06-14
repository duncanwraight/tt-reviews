import { createClient, SupabaseClient } from "@supabase/supabase-js";
import type { AppLoadContext } from "react-router";

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
  playing_style?:
    | "attacker"
    | "all_rounder"
    | "defender"
    | "counter_attacker"
    | "chopper"
    | "unknown";
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

  constructor(context: AppLoadContext) {
    this.supabase = createSupabaseClient(context);
  }

  // Equipment methods
  async getEquipment(slug: string): Promise<Equipment | null> {
    const { data, error } = await this.supabase
      .from("equipment")
      .select("*")
      .eq("slug", slug)
      .maybeSingle();

    if (error) {
      console.error("Error fetching equipment:", error);
      return null;
    }

    return data as Equipment | null;
  }

  async getEquipmentById(id: string): Promise<Equipment | null> {
    const { data, error } = await this.supabase
      .from("equipment")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (error) {
      console.error("Error fetching equipment by ID:", error);
      return null;
    }

    return data as Equipment | null;
  }

  async searchEquipment(query: string): Promise<Equipment[]> {
    const { data, error } = await this.supabase
      .from("equipment")
      .select("*")
      .textSearch("name", query)
      .limit(10);

    if (error) {
      console.error("Error searching equipment:", error);
      return [];
    }

    return (data as Equipment[]) || [];
  }

  async getRecentEquipment(limit = 10): Promise<Equipment[]> {
    const { data, error } = await this.supabase
      .from("equipment")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      console.error("Error fetching recent equipment:", error);
      return [];
    }

    return (data as Equipment[]) || [];
  }

  async getAllEquipment(options?: {
    category?: string;
    limit?: number;
    offset?: number;
    sortBy?: "name" | "created_at" | "manufacturer";
    sortOrder?: "asc" | "desc";
  }): Promise<Equipment[]> {
    let query = this.supabase.from("equipment").select("*");

    if (options?.category) {
      query = query.eq("category", options.category);
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
      console.error("Error fetching equipment:", error);
      return [];
    }

    return (data as Equipment[]) || [];
  }

  async getEquipmentByCategory(category: string): Promise<Equipment[]> {
    const { data, error } = await this.supabase
      .from("equipment")
      .select("*")
      .eq("category", category)
      .order("name", { ascending: true });

    if (error) {
      console.error("Error fetching equipment by category:", error);
      return [];
    }

    return (data as Equipment[]) || [];
  }

  async getEquipmentCategories(): Promise<
    { category: string; count: number }[]
  > {
    const { data, error } = await this.supabase
      .from("equipment")
      .select("category");

    if (error) {
      console.error("Error fetching equipment categories:", error);
      return [];
    }

    const categoryCount: Record<string, number> = {};
    data.forEach((item) => {
      categoryCount[item.category] = (categoryCount[item.category] || 0) + 1;
    });

    return Object.entries(categoryCount).map(([category, count]) => ({
      category,
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

  async getAllPlayers(): Promise<Player[]> {
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

    const { data, error } = await query;

    if (error) {
      console.error("Error fetching reviews:", error);
      return [];
    }

    return (data as EquipmentReview[]) || [];
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

import type { SupabaseClient } from "@supabase/supabase-js";
import type { AppLoadContext } from "react-router";
import type { LogContext } from "~/lib/logger.server";
import { ContentService } from "~/lib/content.server";
import {
  createSupabaseClient,
  createSupabaseAdminClient,
} from "./database/client";
import type { DatabaseContext } from "./database/types";
import * as equipment from "./database/equipment";
import * as players from "./database/players";
import * as reviews from "./database/reviews";
import * as submissions from "./database/submissions";
import * as search from "./database/search";
import * as admin from "./database/admin";

// Re-export shared types
export type { Player, Equipment, PlayerEquipmentSetup } from "./types";
export type {
  EquipmentReview,
  ReviewerContext,
  PlayerEdit,
  EquipmentSubmission,
  PlayerSubmission,
} from "./database/types";
export { createSupabaseClient, createSupabaseAdminClient };

// Import shared types for server-side usage
import type { Player, Equipment, PlayerEquipmentSetup } from "./types";
import type {
  EquipmentReview,
  EquipmentSubmission,
  PlayerSubmission,
} from "./database/types";

// Main database service class
export class DatabaseService {
  private supabase: SupabaseClient;
  private context?: LogContext;
  public content: ContentService;

  constructor(
    context: AppLoadContext,
    supabaseClientOrLogContext?: SupabaseClient | LogContext,
    logContext?: LogContext
  ) {
    // Handle both old and new constructor signatures
    if (supabaseClientOrLogContext && "from" in supabaseClientOrLogContext) {
      // New signature: DatabaseService(context, supabaseClient, logContext?)
      this.supabase = supabaseClientOrLogContext as SupabaseClient;
      this.context = logContext;
    } else {
      // Old signature: DatabaseService(context, logContext?)
      this.supabase = createSupabaseClient(context);
      this.context = supabaseClientOrLogContext as LogContext;
    }
    this.content = new ContentService(this.supabase);
  }

  private get ctx(): DatabaseContext {
    return { supabase: this.supabase, context: this.context };
  }

  // Equipment methods
  async getEquipment(slug: string): Promise<Equipment | null> {
    return equipment.getEquipment(this.ctx, slug);
  }

  async getEquipmentById(id: string): Promise<Equipment | null> {
    return equipment.getEquipmentById(this.ctx, id);
  }

  async searchEquipment(query: string): Promise<Equipment[]> {
    return equipment.searchEquipment(this.ctx, query);
  }

  async getRecentEquipment(limit = 10): Promise<Equipment[]> {
    return equipment.getRecentEquipment(this.ctx, limit);
  }

  async getAllEquipment(
    options?: equipment.GetAllEquipmentOptions
  ): Promise<Equipment[]> {
    return equipment.getAllEquipment(this.ctx, options);
  }

  async getEquipmentByCategory(category: string): Promise<Equipment[]> {
    return equipment.getEquipmentByCategory(this.ctx, category);
  }

  async getEquipmentCategories(): Promise<
    { category: string; count: number }[]
  > {
    return equipment.getEquipmentCategories(this.ctx);
  }

  async getEquipmentSubcategories(
    category: string
  ): Promise<{ subcategory: string; count: number }[]> {
    return equipment.getEquipmentSubcategories(this.ctx, category);
  }

  // Player methods
  async getPlayer(slug: string): Promise<Player | null> {
    return players.getPlayer(this.ctx, slug);
  }

  async getAllPlayers(
    options?: players.GetAllPlayersOptions
  ): Promise<Player[]> {
    return players.getAllPlayers(this.ctx, options);
  }

  async getPlayersWithoutFilters(): Promise<Player[]> {
    return players.getPlayersWithoutFilters(this.ctx);
  }

  async getPlayersCount(
    options?: players.GetPlayersCountOptions
  ): Promise<number> {
    return players.getPlayersCount(this.ctx, options);
  }

  async getPlayerCountries(): Promise<string[]> {
    return players.getPlayerCountries(this.ctx);
  }

  async searchPlayers(query: string): Promise<Player[]> {
    return players.searchPlayers(this.ctx, query);
  }

  async getPlayerEquipmentSetups(
    playerId: string
  ): Promise<PlayerEquipmentSetup[]> {
    return players.getPlayerEquipmentSetups(this.ctx, playerId);
  }

  async getPlayerFootage(playerId: string) {
    return players.getPlayerFootage(this.ctx, playerId);
  }

  // Review methods
  async getEquipmentReviews(
    equipmentId: string,
    status: "approved" | "all" = "approved"
  ): Promise<EquipmentReview[]> {
    return reviews.getEquipmentReviews(this.ctx, equipmentId, status);
  }

  async getRecentReviews(limit = 10): Promise<EquipmentReview[]> {
    return reviews.getRecentReviews(this.ctx, limit);
  }

  async getUserReviews(userId: string): Promise<EquipmentReview[]> {
    return reviews.getUserReviews(this.ctx, userId);
  }

  async getUserReviewForEquipment(
    equipmentId: string,
    userId: string
  ): Promise<EquipmentReview | null> {
    return reviews.getUserReviewForEquipment(this.ctx, equipmentId, userId);
  }

  // Submission methods
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
    return submissions.submitEquipment(this.ctx, submission);
  }

  async getUserEquipmentSubmissions(
    userId: string
  ): Promise<EquipmentSubmission[]> {
    return submissions.getUserEquipmentSubmissions(this.ctx, userId);
  }

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
    return submissions.submitPlayer(this.ctx, submission);
  }

  async getUserPlayerSubmissions(userId: string): Promise<PlayerSubmission[]> {
    return submissions.getUserPlayerSubmissions(this.ctx, userId);
  }

  async getEquipmentWithStats(
    limit = 10
  ): Promise<(Equipment & { averageRating?: number; reviewCount?: number })[]> {
    return equipment.getEquipmentWithStats(this.ctx, limit);
  }

  async getAllEquipmentWithStats(
    options?: equipment.GetAllEquipmentWithStatsOptions
  ): Promise<(Equipment & { averageRating?: number; reviewCount?: number })[]> {
    return equipment.getAllEquipmentWithStats(this.ctx, options);
  }

  async getPopularEquipment(
    limit = 6
  ): Promise<(Equipment & { averageRating?: number; reviewCount?: number })[]> {
    return equipment.getPopularEquipment(this.ctx, limit);
  }

  async getAdminDashboardCounts(): Promise<admin.AdminDashboardCounts> {
    return admin.getAdminDashboardCounts(this.ctx);
  }

  async getSimilarEquipment(
    equipmentId: string,
    limit = 6
  ): Promise<Equipment[]> {
    return equipment.getSimilarEquipment(this.ctx, equipmentId, limit);
  }

  async getPlayersUsingEquipment(
    equipmentId: string
  ): Promise<Array<{ id: string; name: string; slug: string }>> {
    return equipment.getPlayersUsingEquipment(this.ctx, equipmentId);
  }

  // General search
  async search(query: string): Promise<{
    equipment: Equipment[];
    players: Player[];
  }> {
    return search.search(this.ctx, query);
  }

  async getDiscordMessageId(
    submissionType: submissions.SubmissionType,
    submissionId: string
  ): Promise<string | null> {
    return submissions.getDiscordMessageId(
      this.ctx,
      submissionType,
      submissionId
    );
  }
}

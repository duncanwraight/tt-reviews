import type { SupabaseClient } from "@supabase/supabase-js";
import type { LogContext } from "~/lib/logger.server";
import type {
  Player,
  Equipment,
  ReviewStatus,
  RejectionCategory,
} from "~/lib/types";

/**
 * Shared dependencies for database submodule functions. Constructed once in
 * DatabaseService's constructor and passed as the first arg to every exported
 * function under app/lib/database/*. Lets tests build a minimal context with
 * a mocked supabase client instead of instantiating the whole class.
 */
export interface DatabaseContext {
  supabase: SupabaseClient;
  context?: LogContext;
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
  status: ReviewStatus;
  moderator_id?: string;
  moderator_notes?: string;
  rejection_category?: RejectionCategory;
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
  playing_style?: string;
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
  status: ReviewStatus;
  moderator_id?: string;
  moderator_notes?: string;
  rejection_category?: RejectionCategory;
  rejection_reason?: string;
  approval_count: number;
  image_url?: string;
  image_key?: string;
  created_at: string;
  updated_at: string;
}

// Shared types that can be used by both client and server components

export type ReviewStatus =
  | "pending"
  | "under_review"
  | "awaiting_second_approval"
  | "approved"
  | "rejected";

export type ApprovalSource = "admin_ui" | "discord";

export type RejectionCategory =
  | "duplicate"
  | "insufficient_info"
  | "poor_image_quality"
  | "inappropriate_content"
  | "invalid_data"
  | "spam"
  | "other";

// Unified submission types
export type SubmissionType = 
  | "equipment"
  | "player" 
  | "player_edit"
  | "video"
  | "review"
  | "player_equipment_setup";

// Base interface for all submissions
export interface BaseSubmission {
  id: string;
  user_id: string;
  status: ReviewStatus;
  rejection_category?: RejectionCategory;
  rejection_reason?: string;
  created_at: string;
  updated_at: string;
}

// Discord notification data structure
export interface DiscordNotificationData {
  id: string;
  submissionType: SubmissionType;
  title: string;
  description: string;
  color: number;
  fields: Array<{
    name: string;
    value: string;
    inline?: boolean;
  }>;
  adminUrl?: string;
  submitterEmail?: string;
  // Type-specific data
  [key: string]: any;
}

export interface Player {
  id: string;
  name: string;
  slug: string;
  highest_rating?: string;
  active_years?: string;
  active: boolean;
  playing_style?: string; // Now uses configurable categories instead of hardcoded values
  birth_country?: string; // ISO 3166-1 alpha-3 country code for birth country
  represents?: string; // ISO 3166-1 alpha-3 country code for represented country
  created_at: string;
  updated_at: string;
}

export interface Equipment {
  id: string;
  name: string;
  slug: string;
  category: "blade" | "rubber" | "ball";
  subcategory?: "inverted" | "long_pips" | "anti" | "short_pips";
  manufacturer: string;
  specifications: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface PlayerEquipmentSetup {
  id: string;
  player_id: string;
  year: number;
  blade_id?: string;
  forehand_rubber_id?: string;
  forehand_thickness?: string;
  forehand_color?: "red" | "black";
  backhand_rubber_id?: string;
  backhand_thickness?: string;
  backhand_color?: "red" | "black";
  source_url?: string;
  source_type?:
    | "interview"
    | "video"
    | "tournament_footage"
    | "official_website";
  verified: boolean;
  created_at: string;
  updated_at: string;
}

export interface ModeratorApproval {
  id: string;
  submission_type: SubmissionType;
  submission_id: string;
  moderator_id: string;
  source: ApprovalSource;
  action: "approved" | "rejected";
  notes?: string;
  rejection_category?: RejectionCategory;
  rejection_reason?: string;
  created_at: string;
  updated_at: string;
}

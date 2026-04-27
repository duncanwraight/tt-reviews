import type { DiscordNotificationData } from "~/lib/types";

/**
 * The canonical set of submission types — single source of truth aligned
 * with the moderator_approvals.submission_type CHECK constraint
 * (supabase/migrations/20251231180000_add_player_equipment_setup_to_moderation.sql).
 *
 * Adding a value: extend this tuple, add a SUBMISSION_REGISTRY entry,
 * apply the matching DB migration, and update the constraint in lockstep.
 * The registry-vs-constraint test in __tests__/registry.test.ts catches
 * drift either way.
 */
export const SUBMISSION_TYPE_VALUES = [
  "equipment",
  "player",
  "player_edit",
  "video",
  "review",
  "player_equipment_setup",
] as const;

export type SubmissionType = (typeof SUBMISSION_TYPE_VALUES)[number];

// Field types for form generation
export type FieldType =
  | "text"
  | "textarea"
  | "select"
  | "number"
  | "email"
  | "image"
  | "dynamic_select"
  | "video_list"
  | "equipment_setup"
  | "equipment_setup_standalone"
  | "equipment_specs"
  | "checkbox"
  | "hidden"
  | "rating_slider"
  | "rating_categories";

// Form field configuration
export interface FormField {
  name: string;
  label: string;
  type: FieldType;
  required?: boolean;
  placeholder?: string;
  disabled?: boolean;
  options?: Array<{ value: string; label: string }>;
  validation?: {
    min?: number;
    max?: number;
    pattern?: string;
    message?: string;
  };
  dependencies?: {
    field: string;
    showWhen?: string | string[];
    hideWhen?: string | string[];
  };
  // For dynamic selects like subcategories
  dynamicOptions?: {
    dependsOn: string;
    rpcFunction: string;
    paramName: string;
  };
  // Layout configuration
  layout?: {
    colSpan?: 1 | 2; // Grid column span
    order?: number;
  };
}

// Form configuration for each submission type
export interface FormConfig {
  title: string;
  description: string;
  submitButtonText: string;
  successTitle: string;
  successMessage: string;
  redirectPath: string;
  fields: FormField[];
}

// Configuration for each submission type
export interface SubmissionConfig {
  type: SubmissionType;
  tableName: string;
  displayName: string;
  adminPath: string;
  form: FormConfig;
  discord: {
    color: number;
    emoji: string;
    titlePrefix: string;
  };
  // Function to transform submission data into Discord notification format (optional)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  formatForDiscord?: (data: any) => DiscordNotificationData;
}

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
  "equipment_edit",
] as const;

export type SubmissionType = (typeof SUBMISSION_TYPE_VALUES)[number];

// Field types for form generation
export type FieldType =
  | "text"
  | "textarea"
  | "select"
  | "radio"
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
  // `helpText` on an option is rendered as a subtitle beneath that
  // option's label — used by `radio` to surface per-option guidance
  // (e.g., notability caveat under "Amateur"). `select` ignores it.
  options?: Array<{ value: string; label: string; helpText?: string }>;
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
  // Conditional label override: when the named field's value matches
  // `equals`, render `label` instead of the field's default label.
  // UI-only — the column / form name doesn't change. Used for the
  // "Represents" → "Country (where they compete)" flip when the
  // submitter picks Amateur on the player form.
  labelWhen?: {
    field: string;
    equals: string | string[];
    label: string;
  };
  // Conditional required: when the named field's value matches
  // `equals`, treat this field as required even if `required` is
  // false. Mirrors `dependencies` shape. The client validator and
  // the rendered `*` marker both honour it. Server-side checks live
  // in `validate.server.ts`.
  requiredWhen?: {
    field: string;
    equals: string | string[];
  };
  // When `dependencies` hides this field, opt in to keeping the value
  // in the submitted form data via a `<input type="hidden">` bridge.
  // Useful for fields whose UI is conditional but whose value still
  // needs to reach the server (e.g., image_action when the equipment
  // has no current image — the dropdown is hidden but the implicit
  // "replace" value still has to submit).
  preserveWhenHidden?: boolean;
  // UI-only field — its value drives form behaviour (a toggle that
  // shows another field) but never lands on the submission row. The
  // submit action's field-extraction loop skips these. Avoids the
  // PGRST204 "column not found" 500s that hit when a name like
  // `include_equipment` reached the INSERT (TT-131).
  transient?: boolean;
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

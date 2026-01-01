import type { SubmissionType, DiscordNotificationData } from "~/lib/types";

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
  formatForDiscord?: (data: any) => DiscordNotificationData;
}

// Discord color constants
const DISCORD_COLORS = {
  BLUE: 0x3498db,
  PURPLE: 0x9b59b6,
  GREEN: 0x2ecc71,
  ORANGE: 0xe67e22,
  RED: 0xe74c3c,
  YELLOW: 0xf1c40f,
} as const;

// Helper function to create admin URL
function createAdminUrl(type: SubmissionType, id: string): string {
  const path = type === "player_equipment_setup" ? "player-equipment-setups" : type.replace("_", "-") + "s";
  return `/admin/${path}#${id}`;
}

// Field factory functions for DRY form definitions
const createNameField = (type: 'equipment' | 'player', placeholder: string): FormField => {
  const capitalizedType = type.charAt(0).toUpperCase() + type.slice(1);
  return {
    name: "name",
    label: capitalizedType + " Name",
    type: "text",
    required: true,
    placeholder,
    layout: { colSpan: 2 },
  };
};

const createSelectField = (name: string, label: string, colSpan: 1 | 2 = 1, required: boolean = false): FormField => ({
  name,
  label,
  type: "select",
  required,
  layout: { colSpan },
});

const createTextAreaField = (name: string, label: string, placeholder: string, required: boolean = false): FormField => ({
  name,
  label,
  type: "textarea",
  required,
  placeholder,
  layout: { colSpan: 2 },
});

// Discord field utilities for DRY notification formatting
const createDiscordField = (name: string, value: string, inline: boolean = true) => ({
  name,
  value,
  inline,
});

const createOptionalDiscordField = (name: string, value: string | undefined, inline: boolean = true) =>
  value ? [createDiscordField(name, value, inline)] : [];

const createSubmitterField = (email: string | undefined) => 
  createDiscordField("Submitted by", email || "Anonymous", false);

const createTruncatedTextField = (name: string, text: string | undefined, maxLength: number = 200) =>
  text ? [createDiscordField(
    name,
    text.length > maxLength ? text.substring(0, maxLength) + "..." : text,
    false
  )] : [];

// Registry of all submission types
export const SUBMISSION_REGISTRY: Record<SubmissionType, SubmissionConfig> = {
  equipment: {
    type: "equipment",
    tableName: "equipment_submissions",
    displayName: "Equipment Submission",
    adminPath: "/admin/equipment-submissions",
    form: {
      title: "Submit New Equipment",
      description: "Add a new piece of table tennis equipment to our database.",
      submitButtonText: "Submit Equipment",
      successTitle: "Equipment Submitted!",
      successMessage: "Your equipment has been successfully submitted and will be reviewed by our team. Thank you for contributing to our database!",
      redirectPath: "/profile",
      fields: [
        createNameField('equipment', 'e.g., Hurricane 3'),
        {
          name: "manufacturer",
          label: "Manufacturer",
          type: "text",
          required: true,
          placeholder: "e.g., DHS, Butterfly, Yasaka",
          layout: { colSpan: 1 },
        },
        createSelectField('category', 'Category', 1, true),
        {
          name: "subcategory",
          label: "Subcategory",
          type: "select",
          required: false,
          layout: { colSpan: 2 },
          dependencies: {
            field: "category",
            showWhen: ["rubber"],
          },
        },
        {
          name: "image",
          label: "Product Image (Optional)",
          type: "image",
          required: false,
          placeholder: "Upload the manufacturer's official product photo",
          layout: { colSpan: 2 },
        },
        createTextAreaField('specifications', 'Additional Specifications (Optional)', 'Any additional details about the equipment (e.g., speed, spin, control ratings, weight, etc.)'),
      ],
    },
    discord: {
      color: DISCORD_COLORS.PURPLE,
      emoji: "🏓",
      titlePrefix: "Equipment Submission",
    },
    formatForDiscord: (data: any): DiscordNotificationData => ({
      id: data.id,
      submissionType: "equipment",
      title: "🏓 Equipment Submission",
      description: "A new piece of equipment has been submitted and needs moderation.",
      color: DISCORD_COLORS.PURPLE,
      adminUrl: createAdminUrl("equipment", data.id),
      submitterEmail: data.submitter_email,
      fields: [
        createDiscordField("Equipment", data.name || "Unknown Equipment"),
        createDiscordField("Manufacturer", data.manufacturer || "Unknown"),
        createDiscordField("Category", data.category || "Unknown"),
        ...createOptionalDiscordField("Subcategory", data.subcategory),
        createSubmitterField(data.submitter_email),
        ...createTruncatedTextField("Specifications", data.specifications?.notes),
      ],
    }),
  },

  player: {
    type: "player",
    tableName: "player_submissions",
    displayName: "Player Submission",
    adminPath: "/admin/player-submissions",
    form: {
      title: "Submit New Player",
      description: "Add a new professional table tennis player to our database.",
      submitButtonText: "Submit Player",
      successTitle: "Player Submitted!",
      successMessage: "Your player has been successfully submitted and will be reviewed by our team. Thank you for contributing to our database!",
      redirectPath: "/profile",
      fields: [
        createNameField('player', 'e.g., Ma Long'),
        {
          name: "highest_rating",
          label: "Highest Rating",
          type: "text",
          required: false,
          placeholder: "e.g., 3000+",
          layout: { colSpan: 1 },
        },
        {
          name: "active_years",
          label: "Active Years",
          type: "text",
          required: false,
          placeholder: "e.g., 2005-present",
          layout: { colSpan: 1 },
        },
        createSelectField('playing_style', 'Playing Style'),
        createSelectField('birth_country', 'Birth Country'),
        createSelectField('represents', 'Represents'),
        {
          name: "image",
          label: "Player Photo (Optional)",
          type: "image",
          required: false,
          placeholder: "Upload an upper-body photo of the player",
          layout: { colSpan: 2 },
        },
        {
          name: "include_equipment",
          label: "Include Equipment Setup",
          type: "checkbox",
          required: false,
          layout: { colSpan: 2 },
        },
        {
          name: "equipment_setup",
          label: "Equipment Setup",
          type: "equipment_setup",
          required: false,
          layout: { colSpan: 2 },
          dependencies: {
            field: "include_equipment",
            showWhen: "true",
          },
        },
        {
          name: "videos",
          label: "Training Videos or Match Footage",
          type: "video_list",
          required: false,
          layout: { colSpan: 2 },
        },
      ],
    },
    discord: {
      color: DISCORD_COLORS.GREEN,
      emoji: "👤",
      titlePrefix: "Player Submission",
    },
    formatForDiscord: (data: any): DiscordNotificationData => ({
      id: data.id,
      submissionType: "player",
      title: "👤 Player Submission",
      description: "A new player has been submitted and needs moderation.",
      color: DISCORD_COLORS.GREEN,
      adminUrl: createAdminUrl("player", data.id),
      submitterEmail: data.submitter_email,
      fields: [
        createDiscordField("Player", data.name || "Unknown Player"),
        ...createOptionalDiscordField("Highest Rating", data.highest_rating),
        ...createOptionalDiscordField("Playing Style", data.playing_style),
        ...createOptionalDiscordField("Birth Country", data.birth_country),
        ...createOptionalDiscordField("Represents", data.represents),
        createSubmitterField(data.submitter_email),
        ...(data.equipment_data ? [createDiscordField("Equipment Info", "Includes equipment setup data", false)] : []),
        ...(data.videos && data.videos.length > 0 ? [createDiscordField("Videos", data.videos.length + " video(s) included", false)] : []),
      ],
    }),
  },

  player_edit: {
    type: "player_edit",
    tableName: "player_edits",
    displayName: "Player Edit",
    adminPath: "/admin/player-edits",
    form: {
      title: "Edit Player Information",
      description: "Suggest updates to player information in our database.",
      submitButtonText: "Submit Changes",
      successTitle: "Changes Submitted!",
      successMessage: "Your suggested changes have been submitted and will be reviewed by our team.",
      redirectPath: "/profile",
      fields: [
        createSelectField('player_id', 'Player', 2, true),
        {
          name: "name",
          label: "Player Name",
          type: "text",
          required: false,
          placeholder: "Leave blank to keep current name",
          layout: { colSpan: 2 },
        },
        {
          name: "highest_rating",
          label: "Highest Rating",
          type: "text",
          required: false,
          placeholder: "Leave blank to keep current rating",
          layout: { colSpan: 1 },
        },
        {
          name: "active_years",
          label: "Active Years",
          type: "text",
          required: false,
          placeholder: "Leave blank to keep current years",
          layout: { colSpan: 1 },
        },
        createSelectField('playing_style', 'Playing Style'),
        {
          name: "active",
          label: "Player Status",
          type: "select",
          required: false,
          layout: { colSpan: 1 },
          options: [
            { value: "true", label: "Active" },
            { value: "false", label: "Inactive" },
          ],
        },
        {
          name: "image",
          label: "Update Player Photo (Optional)",
          type: "image",
          required: false,
          placeholder: "Upload a new upper-body photo of the player",
          layout: { colSpan: 2 },
        },
        createTextAreaField('edit_reason', 'Reason for Changes', 'Please explain why these changes should be made...', true),
      ],
    },
    discord: {
      color: DISCORD_COLORS.ORANGE,
      emoji: "✏️",
      titlePrefix: "Player Edit",
    },
    formatForDiscord: (data: any): DiscordNotificationData => {
      // Create a summary of the changes
      const changes = [];
      if (data.edit_data?.name) changes.push("Name: " + data.edit_data.name);
      if (data.edit_data?.highest_rating) changes.push("Rating: " + data.edit_data.highest_rating);
      if (data.edit_data?.active_years) changes.push("Active: " + data.edit_data.active_years);
      if (data.edit_data?.active !== undefined) changes.push("Status: " + (data.edit_data.active ? "Active" : "Inactive"));

      return {
        id: data.id,
        submissionType: "player_edit",
        title: "✏️ Player Edit Submitted",
        description: "A player information update has been submitted and needs moderation.",
        color: DISCORD_COLORS.ORANGE,
        adminUrl: createAdminUrl("player_edit", data.id),
        submitterEmail: data.submitter_email,
        fields: [
          {
            name: "Player",
            value: data.player_name || "Unknown Player",
            inline: true,
          },
          {
            name: "Submitted by",
            value: data.submitter_email || "Anonymous",
            inline: true,
          },
          {
            name: "Changes",
            value: changes.length > 0 ? changes.join("\n") : "No changes specified",
            inline: false,
          },
        ],
      };
    },
  },

  video: {
    type: "video",
    tableName: "video_submissions",
    displayName: "Video Submission",
    adminPath: "/admin/video-submissions",
    form: {
      title: "Submit Video Information",
      description: "Add training videos, match footage, or other video content for professional table tennis players.",
      submitButtonText: "Submit Videos",
      successTitle: "Videos Submitted!",
      successMessage: "Your videos have been successfully submitted and will be reviewed by our team.",
      redirectPath: "/profile",
      fields: [
        createSelectField('player_id', 'Player', 2, true),
        {
          name: "videos",
          label: "Videos",
          type: "video_list",
          required: true,
          layout: { colSpan: 2 },
        },
      ],
    },
    discord: {
      color: DISCORD_COLORS.RED,
      emoji: "📹",
      titlePrefix: "Video Submission",
    },
    formatForDiscord: (data: any): DiscordNotificationData => ({
      id: data.id,
      submissionType: "video",
      title: "📹 Video Submission",
      description: "New video content has been submitted and needs moderation.",
      color: DISCORD_COLORS.RED,
      adminUrl: createAdminUrl("video", data.id),
      submitterEmail: data.submitter_email,
      fields: [
        createDiscordField("Player", data.player_name || "Unknown Player"),
        createDiscordField("Video Count", (data.videos?.length || 0).toString()),
        createSubmitterField(data.submitter_email),
        ...(data.videos && data.videos.length > 0 ? data.videos.slice(0, 3).map((video: any, index: number) => ({
          name: "Video " + (index + 1),
          value: video.title + " (" + (video.platform || "Unknown") + ")",
          inline: false,
        })) : []),
        ...(data.videos && data.videos.length > 3 ? [{
          name: "Additional Videos",
          value: "... and " + (data.videos.length - 3) + " more video(s)",
          inline: false,
        }] : []),
      ],
    }),
  },

  review: {
    type: "review",
    tableName: "equipment_reviews",
    displayName: "Equipment Review",
    adminPath: "/admin/equipment-reviews",
    form: {
      title: "Write Equipment Review",
      description: "Share your experience with table tennis equipment to help other players.",
      submitButtonText: "Submit Review",
      successTitle: "Review Submitted!",
      successMessage: "Your review has been submitted and will be reviewed by our team.",
      redirectPath: "/profile",
      fields: [
        {
          name: "equipment_id",
          label: "Equipment",
          type: "hidden",
          required: true,
        },
        {
          name: "equipment_display",
          label: "Reviewing",
          type: "text",
          required: false,
          disabled: true,
          layout: { colSpan: 2 },
          placeholder: "Loading equipment...",
        },
        {
          name: "playing_level",
          label: "Your Playing Level",
          type: "select",
          required: true,
          layout: { colSpan: 1 },
          options: [
            { value: "beginner", label: "Beginner" },
            { value: "intermediate", label: "Intermediate" },
            { value: "advanced", label: "Advanced" },
            { value: "professional", label: "Professional" },
          ],
        },
        {
          name: "experience_duration",
          label: "How long have you used this equipment?",
          type: "select",
          required: true,
          layout: { colSpan: 1 },
          options: [
            { value: "less_than_month", label: "Less than a month" },
            { value: "1_to_3_months", label: "1-3 months" },
            { value: "3_to_6_months", label: "3-6 months" },
            { value: "6_months_to_year", label: "6 months to 1 year" },
            { value: "over_year", label: "Over a year" },
          ],
        },
        {
          name: "rating_categories",
          label: "Rate each aspect from 1 to 10",
          type: "rating_categories",
          required: false,
          layout: { colSpan: 2 },
          validation: { min: 1, max: 10 },
        },
        {
          name: "overall_rating",
          label: "Overall Rating",
          type: "rating_slider",
          required: true,
          layout: { colSpan: 2 },
          validation: { min: 1, max: 10 },
        },
        createTextAreaField('review_text', 'Review', 'Share your experience with this equipment...', true),
      ],
    },
    discord: {
      color: DISCORD_COLORS.BLUE,
      emoji: "⭐",
      titlePrefix: "Equipment Review",
    },
    formatForDiscord: (data: any): DiscordNotificationData => ({
      id: data.id,
      submissionType: "review",
      title: "⭐ Equipment Review",
      description: "A new equipment review has been submitted and needs moderation.",
      color: DISCORD_COLORS.BLUE,
      adminUrl: createAdminUrl("review", data.id),
      submitterEmail: data.submitter_email,
      fields: [
        createDiscordField("Equipment", data.equipment_name || "Unknown Equipment"),
        createDiscordField("Rating", data.overall_rating ? data.overall_rating + "/10" : "No rating"),
        createDiscordField("Reviewer", data.submitter_email || "Anonymous"),
        ...createTruncatedTextField("Review", data.review_text),
      ],
    }),
  },

  player_equipment_setup: {
    type: "player_equipment_setup",
    tableName: "player_equipment_setup_submissions",
    displayName: "Player Equipment Setup",
    adminPath: "/admin/player-equipment-setups",
    form: {
      title: "Submit Player Equipment Setup",
      description: "Add equipment setup information for a professional player.",
      submitButtonText: "Submit Setup",
      successTitle: "Setup Submitted!",
      successMessage: "The equipment setup has been submitted and will be verified by our team.",
      redirectPath: "/profile",
      fields: [
        createSelectField('player_id', 'Player', 2, true),
        {
          name: "equipment_setup",
          label: "Equipment Details",
          type: "equipment_setup_standalone",
          required: false, // Individual fields handle their own validation
          layout: { colSpan: 2 },
        },
      ],
    },
    discord: {
      color: DISCORD_COLORS.PURPLE,
      emoji: "🏓",
      titlePrefix: "Player Equipment Setup",
    },
    formatForDiscord: (data: any): DiscordNotificationData => ({
      id: data.id,
      submissionType: "player_equipment_setup",
      title: "🏓 Player Equipment Setup",
      description: "A new player equipment setup has been submitted and needs verification.",
      color: DISCORD_COLORS.PURPLE,
      adminUrl: createAdminUrl("player_equipment_setup", data.id),
      submitterEmail: data.submitter_email,
      fields: [
        createDiscordField("Player", data.player_name || "Unknown Player"),
        createDiscordField("Year", (data.year || "Unknown").toString()),
        createSubmitterField(data.submitter_email),
        ...createOptionalDiscordField("Blade", data.blade_name),
        ...(data.forehand_rubber_name ? [createDiscordField(
          "Forehand Rubber",
          data.forehand_rubber_name + (data.forehand_thickness ? " (" + data.forehand_thickness + ")" : "")
        )] : []),
        ...(data.backhand_rubber_name ? [createDiscordField(
          "Backhand Rubber", 
          data.backhand_rubber_name + (data.backhand_thickness ? " (" + data.backhand_thickness + ")" : "")
        )] : []),
        ...(data.source_url ? [createDiscordField(
          "Source",
          (data.source_type || "Unknown") + ": " + data.source_url,
          false
        )] : []),
      ],
    }),
  },
};

// Helper functions
export function getSubmissionConfig(type: SubmissionType): SubmissionConfig {
  const config = SUBMISSION_REGISTRY[type];
  if (!config) {
    throw new Error("Unknown submission type: " + type);
  }
  return config;
}

export function getAllSubmissionTypes(): SubmissionType[] {
  return Object.keys(SUBMISSION_REGISTRY) as SubmissionType[];
}

export function getSubmissionTableName(type: SubmissionType): string {
  return getSubmissionConfig(type).tableName;
}

export function formatSubmissionForDiscord(type: SubmissionType, data: any): DiscordNotificationData {
  const config = getSubmissionConfig(type);
  if (!config.formatForDiscord) {
    // Fallback for submission types without custom Discord formatting
    return {
      id: data.id || "unknown",
      submissionType: type,
      title: `New ${config.displayName} Submission`,
      description: `A new ${config.displayName.toLowerCase()} has been submitted for review.`,
      color: config.discord.color,
      fields: [{ name: "Status", value: "Pending Review", inline: true }],
      adminUrl: config.adminPath,
    };
  }
  return config.formatForDiscord(data);
}

export function getFormConfig(type: SubmissionType): FormConfig {
  return getSubmissionConfig(type).form;
}

export function getFormFields(type: SubmissionType): FormField[] {
  return getFormConfig(type).fields;
}
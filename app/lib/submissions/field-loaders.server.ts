/**
 * Unified field option loading utilities for submission forms
 * Eliminates DRY violations in submission route handlers
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { SubmissionType } from "~/lib/types";
import { createCategoryService } from "~/lib/categories.server";

interface OptionLoaderConfig {
  table: string;
  columns: string;
  filters: Record<string, any>;
  orderBy?: string;
  formatter?: (item: any) => { value: string; label: string };
}

// Default formatters
const defaultFormatter = (item: any) => ({
  value: item.value || item.id,
  label: item.name,
});

const countryFormatter = (country: any) => ({
  value: country.value,
  label: country.flag_emoji ? `${country.flag_emoji} ${country.name}` : country.name,
});

const equipmentFormatter = (eq: any) => ({
  value: eq.id,
  label: `${eq.name} (${eq.manufacturer})`,
});

const playerFormatter = (player: any) => ({
  value: player.id,
  label: player.name,
});

// Option loading configuration for each submission type
const optionLoaders: Record<SubmissionType, Record<string, OptionLoaderConfig>> = {
  equipment: {
    category: {
      table: "categories",
      columns: "id, name, value",
      filters: { type: "equipment_category", is_active: true },
      orderBy: "name",
    },
    subcategory: {
      table: "categories",
      columns: "id, name, value",
      filters: { type: "equipment_subcategory", is_active: true },
      orderBy: "display_order",
    },
  },
  player: {
    birth_country: {
      table: "categories",
      columns: "id, name, value, flag_emoji",
      filters: { type: "country", is_active: true },
      orderBy: "name",
      formatter: countryFormatter,
    },
    represents: {
      table: "categories",
      columns: "id, name, value, flag_emoji",
      filters: { type: "country", is_active: true },
      orderBy: "name",
      formatter: countryFormatter,
    },
    playing_style: {
      table: "categories",
      columns: "id, name, value",
      filters: { type: "playing_style", is_active: true },
      orderBy: "name",
    },
  },
  player_edit: {
    player_id: {
      table: "players",
      columns: "id, name",
      filters: { active: true },
      orderBy: "name",
      formatter: playerFormatter,
    },
    playing_style: {
      table: "categories",
      columns: "id, name, value",
      filters: { type: "playing_style", is_active: true },
      orderBy: "name",
    },
  },
  video: {
    player_id: {
      table: "players",
      columns: "id, name",
      filters: { active: true },
      orderBy: "name",
      formatter: playerFormatter,
    },
  },
  review: {
    equipment_id: {
      table: "equipment",
      columns: "id, name, manufacturer",
      filters: {},
      orderBy: "name",
      formatter: equipmentFormatter,
    },
  },
  player_equipment_setup: {
    player_id: {
      table: "players",
      columns: "id, name",
      filters: { active: true },
      orderBy: "name",
      formatter: playerFormatter,
    },
  },
};

/**
 * Load equipment-specific rating categories for reviews using existing categories system
 */
export async function loadReviewRatingCategories(
  equipmentId: string,
  sbClient: SupabaseClient
): Promise<Array<{ name: string; label: string; description?: string; min_label?: string; max_label?: string }>> {
  // First get the equipment category and subcategory to determine which rating categories to show
  const { data: equipment } = await sbClient
    .from("equipment")
    .select("category, subcategory")
    .eq("id", equipmentId)
    .single();

  if (!equipment) return [];

  // Use the CategoryService to get rating categories for this equipment type and subtype
  const categoryService = createCategoryService(sbClient);
  const ratingCategories = await categoryService.getReviewRatingCategories(
    equipment.category,
    equipment.subcategory
  );

  // Transform to the expected format, including custom slider labels
  return ratingCategories.map(category => ({
    name: category.value,
    label: category.name,
    description: category.description,
    min_label: category.min_label,
    max_label: category.max_label,
  }));
}

// Type for field options - most fields use value/label, but rating_categories uses name/label/description/min_label/max_label
type FieldOptions = Record<string, Array<{ value: string; label: string }>> & {
  rating_categories?: Array<{ name: string; label: string; description?: string; min_label?: string; max_label?: string }>;
};

/**
 * Load all field options for a specific submission type
 */
export async function loadFieldOptions(
  submissionType: SubmissionType,
  sbClient: SupabaseClient,
  additionalData?: { equipmentId?: string }
): Promise<FieldOptions> {
  const fieldOptions: FieldOptions = {};
  const loaders = optionLoaders[submissionType];

  if (!loaders) return fieldOptions;

  // Load all options in parallel for better performance
  const loadPromises = Object.entries(loaders).map(async ([fieldName, config]) => {
    const { data } = await sbClient
      .from(config.table)
      .select(config.columns)
      .match(config.filters)
      .order(config.orderBy || "name");

    const formatter = config.formatter || defaultFormatter;
    fieldOptions[fieldName] = data?.map(formatter) || [];
  });

  await Promise.all(loadPromises);

  // For reviews, also load rating categories if we have equipment ID
  if (submissionType === "review" && additionalData?.equipmentId) {
    const ratingCategories = await loadReviewRatingCategories(additionalData.equipmentId, sbClient);
    // Pass through as-is - RatingCategories component expects { name, label, description }
    fieldOptions.rating_categories = ratingCategories;
  }

  return fieldOptions;
}

// Pre-selection handlers for URL parameters
interface PreSelectionHandler {
  paramName: string;
  fieldName: string;
  handler: (paramValue: string, fieldOptions: any, sbClient: SupabaseClient) => Promise<Record<string, any>>;
}

const preSelectionHandlers: Record<SubmissionType, PreSelectionHandler[]> = {
  equipment: [],
  player: [],
  player_edit: [
    {
      paramName: "player_id",
      fieldName: "player_id",
      handler: async (playerId, fieldOptions) => {
        const selectedPlayer = fieldOptions.player_id?.find((p: any) => p.value === playerId);
        return selectedPlayer ? { player_id: playerId } : {};
      },
    },
  ],
  video: [
    {
      paramName: "player",
      fieldName: "player_id",
      handler: async (playerName, fieldOptions) => {
        const selectedPlayer = fieldOptions.player_id?.find((p: any) => p.label === playerName);
        return selectedPlayer ? { player_id: selectedPlayer.value } : {};
      },
    },
  ],
  review: [
    {
      paramName: "equipment_slug",
      fieldName: "equipment_id",
      handler: async (slug, fieldOptions, sbClient) => {
        const { data: equipment } = await sbClient
          .from("equipment")
          .select("id, name, manufacturer")
          .eq("slug", slug)
          .single();

        return equipment ? {
          equipment_id: equipment.id,
          equipment_display: `${equipment.name} (${equipment.manufacturer})`,
        } : {};
      },
    },
  ],
  player_equipment_setup: [
    {
      paramName: "player_id",
      fieldName: "player_id",
      handler: async (playerId, fieldOptions) => {
        const selectedPlayer = fieldOptions.player_id?.find((p: any) => p.value === playerId);
        return selectedPlayer
          ? { player_id: playerId, player_name: selectedPlayer.label, player_locked: true }
          : {};
      },
    },
  ],
};

/**
 * Handle pre-selections from URL parameters
 */
export async function handlePreSelections(
  submissionType: SubmissionType,
  url: URL,
  fieldOptions: any,
  sbClient: SupabaseClient
): Promise<Record<string, any>> {
  const handlers = preSelectionHandlers[submissionType] || [];
  const preSelectedValues: Record<string, any> = {};

  for (const handler of handlers) {
    const paramValue = url.searchParams.get(handler.paramName);
    if (paramValue) {
      const values = await handler.handler(paramValue, fieldOptions, sbClient);
      Object.assign(preSelectedValues, values);
    }
  }

  return preSelectedValues;
}
/**
 * Unified field option loading utilities for submission forms
 * Eliminates DRY violations in submission route handlers
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { SubmissionType } from "~/lib/types";
import {
  createCategoryService,
  type CategoryOption,
} from "~/lib/categories.server";

interface OptionLoaderConfig {
  table: string;
  columns: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  filters: Record<string, any>;
  orderBy?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  formatter?: (item: any) => { value: string; label: string };
}

// Default formatters
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const defaultFormatter = (item: any) => ({
  value: item.value || item.id,
  label: item.name,
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const countryFormatter = (country: any) => ({
  value: country.value,
  label: country.flag_emoji
    ? `${country.flag_emoji} ${country.name}`
    : country.name,
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const equipmentFormatter = (eq: any) => ({
  value: eq.id,
  label: `${eq.name} (${eq.manufacturer})`,
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const playerFormatter = (player: any) => ({
  value: player.id,
  label: player.name,
});

// Option loading configuration for each submission type
const optionLoaders: Record<
  SubmissionType,
  Record<string, OptionLoaderConfig>
> = {
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
    // Note: blades and rubbers are loaded separately in loadFieldOptions
    // because they need different structure (id, name, manufacturer)
  },
};

// Equipment option format for combobox (different from standard value/label)
export interface EquipmentOption {
  id: string;
  name: string;
  manufacturer: string;
}

/**
 * Load equipment-specific rating categories for reviews using existing categories system
 */
export async function loadReviewRatingCategories(
  equipmentId: string,
  sbClient: SupabaseClient
): Promise<
  Array<{
    name: string;
    label: string;
    description?: string;
    min_label?: string;
    max_label?: string;
  }>
> {
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

// Type for field options - most fields use value/label, but some have special formats
type FieldOptions = Record<string, Array<{ value: string; label: string }>> & {
  rating_categories?: Array<{
    name: string;
    label: string;
    description?: string;
    min_label?: string;
    max_label?: string;
  }>;
  blades?: EquipmentOption[];
  rubbers?: EquipmentOption[];
  // Equipment spec fields, grouped by parent category/subcategory value
  // (e.g., "blade", "inverted") so the equipment submission form can switch
  // typed inputs reactively when the category dropdown changes. Subcategory
  // takes precedence — same lookup rule as CategoryService.getEquipmentSpecFields.
  spec_fields_by_parent?: Record<string, CategoryOption[]>;
};

/**
 * Load every active equipment_spec_field row with its type metadata, flat.
 * Used by the submission action to parse `spec_*` form values into typed
 * JSONB. Duplicates by `value` are fine — the parser dedupes.
 */
export async function loadAllEquipmentSpecFields(
  sbClient: SupabaseClient
): Promise<CategoryOption[]> {
  const { data, error } = await sbClient
    .from("categories")
    .select(
      "id, name, value, display_order, field_type, unit, scale_min, scale_max"
    )
    .eq("type", "equipment_spec_field")
    .eq("is_active", true);

  if (error || !data) return [];
  return data as CategoryOption[];
}

/**
 * Preload all equipment spec fields, grouped by their parent value
 * (equipment category or subcategory). The client picks the right group at
 * render time based on the selected category/subcategory.
 *
 * Two queries instead of a self-FK embed: PostgREST's nested-select hints
 * for self-referencing relationships return `parent: []` silently when
 * they fail to resolve, which is impossible to distinguish from "no
 * parent." Joining in JS is boring and correct.
 */
async function loadEquipmentSpecFieldsByParent(
  sbClient: SupabaseClient
): Promise<Record<string, CategoryOption[]>> {
  const [specFieldsResult, parentsResult] = await Promise.all([
    sbClient
      .from("categories")
      .select(
        "id, name, value, display_order, field_type, unit, scale_min, scale_max, parent_id"
      )
      .eq("type", "equipment_spec_field")
      .eq("is_active", true)
      .order("display_order"),
    sbClient
      .from("categories")
      .select("id, value")
      .in("type", ["equipment_category", "equipment_subcategory"])
      .eq("is_active", true),
  ]);

  if (specFieldsResult.error || !specFieldsResult.data) return {};
  if (parentsResult.error || !parentsResult.data) return {};

  const parentValueById = new Map<string, string>();
  for (const row of parentsResult.data) {
    parentValueById.set(row.id, row.value);
  }

  const grouped: Record<string, CategoryOption[]> = {};
  for (const row of specFieldsResult.data as Array<
    CategoryOption & { parent_id: string | null }
  >) {
    if (!row.parent_id) continue;
    const parentValue = parentValueById.get(row.parent_id);
    if (!parentValue) continue;
    if (!grouped[parentValue]) grouped[parentValue] = [];
    grouped[parentValue].push({
      id: row.id,
      name: row.name,
      value: row.value,
      display_order: row.display_order,
      field_type: row.field_type,
      unit: row.unit,
      scale_min: row.scale_min,
      scale_max: row.scale_max,
    });
  }
  return grouped;
}

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
  const loadPromises = Object.entries(loaders).map(
    async ([fieldName, config]) => {
      const { data } = await sbClient
        .from(config.table)
        .select(config.columns)
        .match(config.filters)
        .order(config.orderBy || "name");

      const formatter = config.formatter || defaultFormatter;
      fieldOptions[fieldName] = data?.map(formatter) || [];
    }
  );

  await Promise.all(loadPromises);

  // For reviews, also load rating categories if we have equipment ID
  if (submissionType === "review" && additionalData?.equipmentId) {
    const ratingCategories = await loadReviewRatingCategories(
      additionalData.equipmentId,
      sbClient
    );
    // Pass through as-is - RatingCategories component expects { name, label, description }
    fieldOptions.rating_categories = ratingCategories;
  }

  // For equipment submissions, preload spec field metadata grouped by
  // parent value so the form can render typed inputs per selected
  // category/subcategory without an extra round-trip.
  if (submissionType === "equipment") {
    fieldOptions.spec_fields_by_parent =
      await loadEquipmentSpecFieldsByParent(sbClient);
  }

  // For player_equipment_setup, load blades and rubbers for combobox selection
  if (submissionType === "player_equipment_setup") {
    const [bladesResult, rubbersResult] = await Promise.all([
      sbClient
        .from("equipment")
        .select("id, name, manufacturer")
        .eq("category", "blade")
        .order("name"),
      sbClient
        .from("equipment")
        .select("id, name, manufacturer")
        .eq("category", "rubber")
        .order("name"),
    ]);

    fieldOptions.blades = (bladesResult.data as EquipmentOption[]) || [];
    fieldOptions.rubbers = (rubbersResult.data as EquipmentOption[]) || [];
  }

  return fieldOptions;
}

// Pre-selection handlers for URL parameters
interface PreSelectionHandler {
  paramName: string;
  fieldName: string;
  handler: (
    paramValue: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    fieldOptions: any,
    sbClient: SupabaseClient
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ) => Promise<Record<string, any>>;
}

const preSelectionHandlers: Record<SubmissionType, PreSelectionHandler[]> = {
  equipment: [],
  player: [],
  player_edit: [
    {
      paramName: "player_id",
      fieldName: "player_id",
      handler: async (playerId, fieldOptions) => {
        const selectedPlayer = fieldOptions.player_id?.find(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (p: any) => p.value === playerId
        );
        return selectedPlayer ? { player_id: playerId } : {};
      },
    },
  ],
  video: [
    {
      paramName: "player",
      fieldName: "player_id",
      handler: async (playerName, fieldOptions) => {
        const selectedPlayer = fieldOptions.player_id?.find(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (p: any) => p.label === playerName
        );
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

        return equipment
          ? {
              equipment_id: equipment.id,
              equipment_display: `${equipment.name} (${equipment.manufacturer})`,
            }
          : {};
      },
    },
  ],
  player_equipment_setup: [
    {
      paramName: "player_id",
      fieldName: "player_id",
      handler: async (playerId, fieldOptions) => {
        const selectedPlayer = fieldOptions.player_id?.find(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (p: any) => p.value === playerId
        );
        return selectedPlayer
          ? {
              player_id: playerId,
              player_name: selectedPlayer.label,
              player_locked: true,
            }
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  fieldOptions: any,
  sbClient: SupabaseClient
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<Record<string, any>> {
  const handlers = preSelectionHandlers[submissionType] || [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
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

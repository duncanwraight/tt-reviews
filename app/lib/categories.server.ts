import type { SupabaseClient } from "@supabase/supabase-js";
import { Logger, createLogContext } from "./logger.server";

export type CategoryType =
  | "equipment_category"
  | "equipment_subcategory"
  | "playing_style"
  | "country"
  | "rejection_category"
  | "review_rating_category"
  | "review_rating_scope"
  | "equipment_spec_field";

export type SpecFieldType = "int" | "float" | "range" | "text" | "enum";

// Slugs for the three review_rating_scope pseudo-parent rows. A
// review_rating_category row whose parent_id points at one of these
// scope rows is treated as "shared" across the equipment types listed
// in the comment beside each value.
export const REVIEW_RATING_SCOPE_PADDLE = "paddle"; // blade + all rubbers
export const REVIEW_RATING_SCOPE_ALL_RUBBERS = "all_rubbers"; // all rubber subcategories
export const REVIEW_RATING_SCOPE_ALL_PIPS_ANTI = "all_pips_anti"; // long/short/medium pips + anti

export interface EnumOption {
  value: string;
  label: string;
}

export interface Category {
  id: string;
  type: CategoryType;
  parent_id?: string;
  name: string;
  value: string;
  display_order: number;
  flag_emoji?: string;
  description?: string;
  examples?: string;
  min_label?: string;
  max_label?: string;
  field_type?: SpecFieldType;
  unit?: string;
  scale_min?: number;
  scale_max?: number;
  enum_options?: EnumOption[];
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CategoryOption {
  id: string;
  name: string;
  value: string;
  flag_emoji?: string;
  description?: string;
  examples?: string;
  min_label?: string;
  max_label?: string;
  field_type?: SpecFieldType;
  unit?: string;
  scale_min?: number;
  scale_max?: number;
  enum_options?: EnumOption[];
  display_order: number;
}

export class CategoryService {
  constructor(private supabase: SupabaseClient) {}

  /**
   * Get all categories of a specific type
   */
  async getCategoriesByType(type: CategoryType): Promise<CategoryOption[]> {
    try {
      const { data, error } = await this.supabase.rpc(
        "get_categories_by_type",
        { category_type_param: type }
      );

      if (error) {
        Logger.error(
          `Error fetching ${type} categories`,
          createLogContext("categories-server", { categoryType: type }),
          error instanceof Error ? error : undefined
        );
        return [];
      }

      return data || [];
    } catch (error) {
      Logger.error(
        `Exception fetching ${type} categories`,
        createLogContext("categories-server", { categoryType: type }),
        error instanceof Error ? error : undefined
      );
      return [];
    }
  }

  /**
   * Get subcategories for a parent category (e.g., rubber subcategories)
   */
  async getSubcategoriesByParent(
    parentValue: string
  ): Promise<CategoryOption[]> {
    try {
      const { data, error } = await this.supabase.rpc(
        "get_subcategories_by_parent",
        { parent_category_value: parentValue }
      );

      if (error) {
        Logger.error(
          `Error fetching subcategories for ${parentValue}`,
          createLogContext("categories-server", { parentValue }),
          error instanceof Error ? error : undefined
        );
        return [];
      }

      return data || [];
    } catch (error) {
      Logger.error(
        `Exception fetching subcategories for ${parentValue}`,
        createLogContext("categories-server", { parentValue }),
        error instanceof Error ? error : undefined
      );
      return [];
    }
  }

  /**
   * Get equipment categories
   */
  async getEquipmentCategories(): Promise<CategoryOption[]> {
    return this.getCategoriesByType("equipment_category");
  }

  /**
   * Get equipment subcategories for a specific category
   */
  async getEquipmentSubcategories(
    categoryValue: string
  ): Promise<CategoryOption[]> {
    return this.getSubcategoriesByParent(categoryValue);
  }

  /**
   * Get playing styles
   */
  async getPlayingStyles(): Promise<CategoryOption[]> {
    return this.getCategoriesByType("playing_style");
  }

  /**
   * Get countries
   */
  async getCountries(): Promise<CategoryOption[]> {
    return this.getCategoriesByType("country");
  }

  /**
   * Get rejection categories
   */
  async getRejectionCategories(): Promise<CategoryOption[]> {
    return this.getCategoriesByType("rejection_category");
  }

  /**
   * Create a new category (admin only)
   */
  async createCategory(
    category: Omit<Category, "id" | "created_at" | "updated_at">
  ): Promise<Category | null> {
    try {
      const { data, error } = await this.supabase
        .from("categories")
        .insert(category)
        .select()
        .single();

      if (error) {
        Logger.error(
          "Error creating category",
          createLogContext("categories-server"),
          error instanceof Error ? error : undefined
        );
        return null;
      }

      return data;
    } catch (error) {
      Logger.error(
        "Exception creating category",
        createLogContext("categories-server"),
        error instanceof Error ? error : undefined
      );
      return null;
    }
  }

  /**
   * Update a category (admin only)
   */
  async updateCategory(
    id: string,
    updates: Partial<Category>
  ): Promise<Category | null> {
    const { data, error } = await this.supabase
      .from("categories")
      .update(updates)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      Logger.error(
        "Error updating category",
        createLogContext("categories-server", { categoryId: id }),
        error instanceof Error ? error : undefined
      );
      throw new Error(
        `Failed to update category: ${error.message} (code: ${error.code})`
      );
    }

    return data;
  }

  /**
   * Delete a category (admin only)
   */
  async deleteCategory(id: string): Promise<boolean> {
    try {
      const { error } = await this.supabase
        .from("categories")
        .delete()
        .eq("id", id);

      if (error) {
        Logger.error(
          "Error deleting category",
          createLogContext("categories-server", { categoryId: id }),
          error instanceof Error ? error : undefined
        );
        return false;
      }

      return true;
    } catch (error) {
      Logger.error(
        "Exception deleting category",
        createLogContext("categories-server", { categoryId: id }),
        error instanceof Error ? error : undefined
      );
      return false;
    }
  }

  /**
   * Reorder categories (admin only)
   */
  async reorderCategories(
    categoryUpdates: { id: string; display_order: number }[]
  ): Promise<boolean> {
    try {
      const updates = categoryUpdates.map(update =>
        this.supabase
          .from("categories")
          .update({ display_order: update.display_order })
          .eq("id", update.id)
      );

      const results = await Promise.all(updates);

      // Check if any updates failed
      const hasErrors = results.some(result => result.error);
      if (hasErrors) {
        Logger.error(
          "Error reordering categories",
          createLogContext("categories-server")
        );
        return false;
      }

      return true;
    } catch (error) {
      Logger.error(
        "Exception reordering categories",
        createLogContext("categories-server"),
        error instanceof Error ? error : undefined
      );
      return false;
    }
  }

  /**
   * Get all categories for admin management (includes inactive)
   */
  async getAllCategoriesForAdmin(type?: CategoryType): Promise<Category[]> {
    try {
      let query = this.supabase.from("categories").select("*");

      if (type) {
        query = query.eq("type", type);
      }

      const { data, error } = await query.order("type").order("display_order");

      if (error) {
        Logger.error(
          "Error fetching categories for admin",
          createLogContext("categories-server", { categoryType: type }),
          error instanceof Error ? error : undefined
        );
        return [];
      }

      return data || [];
    } catch (error) {
      Logger.error(
        "Exception fetching categories for admin",
        createLogContext("categories-server", { categoryType: type }),
        error instanceof Error ? error : undefined
      );
      return [];
    }
  }

  /**
   * Get review rating categories for specific equipment category and subcategory.
   *
   * Returns the union of sliders that apply to this equipment, in the order
   * the form should render them. The set is composed from:
   *   - review_rating_scope rows (shared across equipment types):
   *       paddle         → blade + all rubber subcategories
   *       all_rubbers    → all rubber subcategories
   *       all_pips_anti  → long_pips / short_pips / medium_pips / anti
   *   - the equipment's own equipment_category and equipment_subcategory.
   *
   * Sliders from broader scopes render first, then progressively narrower
   * scopes, then the equipment-specific ones. Slugs are deduped (defensive —
   * the seed shouldn't produce duplicates) keeping the higher-priority row.
   */
  async getReviewRatingCategories(
    equipmentCategoryValue?: string,
    equipmentSubcategoryValue?: string
  ): Promise<CategoryOption[]> {
    try {
      if (!equipmentCategoryValue) {
        return this.getCategoriesByType("review_rating_category");
      }

      const RUBBER_SUBCATS = new Set([
        "inverted",
        "anti",
        "long_pips",
        "short_pips",
        "medium_pips",
      ]);
      const PIPS_ANTI_SUBCATS = new Set([
        "anti",
        "long_pips",
        "short_pips",
        "medium_pips",
      ]);

      const isRubberSubcat =
        !!equipmentSubcategoryValue &&
        RUBBER_SUBCATS.has(equipmentSubcategoryValue);
      const isPipsOrAnti =
        !!equipmentSubcategoryValue &&
        PIPS_ANTI_SUBCATS.has(equipmentSubcategoryValue);
      const isPaddle = equipmentCategoryValue === "blade" || isRubberSubcat;

      // Build the priority-ordered list of (type, value) pairs we need to
      // resolve to parent IDs. Earlier entries render first.
      const wantedParents: Array<{ type: CategoryType; value: string }> = [];
      if (isPaddle)
        wantedParents.push({
          type: "review_rating_scope",
          value: REVIEW_RATING_SCOPE_PADDLE,
        });
      if (isRubberSubcat)
        wantedParents.push({
          type: "review_rating_scope",
          value: REVIEW_RATING_SCOPE_ALL_RUBBERS,
        });
      if (isPipsOrAnti)
        wantedParents.push({
          type: "review_rating_scope",
          value: REVIEW_RATING_SCOPE_ALL_PIPS_ANTI,
        });
      wantedParents.push({
        type: "equipment_category",
        value: equipmentCategoryValue,
      });
      if (equipmentSubcategoryValue)
        wantedParents.push({
          type: "equipment_subcategory",
          value: equipmentSubcategoryValue,
        });

      // Resolve the parent IDs in a single query. The .in() pair only ANDs
      // — we filter the result down to the exact (type, value) tuples we
      // want, keyed via a Set.
      const wantedTypes = Array.from(new Set(wantedParents.map(p => p.type)));
      const wantedValues = Array.from(new Set(wantedParents.map(p => p.value)));
      const wantedKey = (type: string, value: string) => `${type}:${value}`;
      const wantedKeys = new Set(
        wantedParents.map(p => wantedKey(p.type, p.value))
      );

      const { data: parents, error: parentsError } = await this.supabase
        .from("categories")
        .select("id, type, value")
        .in("type", wantedTypes)
        .in("value", wantedValues)
        .eq("is_active", true);

      if (parentsError || !parents) {
        Logger.error(
          `Error resolving review-rating parent IDs for ${equipmentCategoryValue}/${equipmentSubcategoryValue}`,
          createLogContext("categories-server", {
            equipmentCategoryValue,
            equipmentSubcategoryValue,
          }),
          parentsError instanceof Error ? parentsError : undefined
        );
        return [];
      }

      // priorityById: lower number = earlier in render order. Built from
      // wantedParents order so we don't depend on PG row order.
      const priorityById = new Map<string, number>();
      for (const p of parents) {
        if (!wantedKeys.has(wantedKey(p.type, p.value))) continue;
        const idx = wantedParents.findIndex(
          w => w.type === p.type && w.value === p.value
        );
        if (idx >= 0) priorityById.set(p.id, idx);
      }

      if (priorityById.size === 0) return [];

      const { data, error } = await this.supabase
        .from("categories")
        .select(
          `
          id,
          name,
          value,
          description,
          examples,
          min_label,
          max_label,
          display_order,
          parent_id
        `
        )
        .eq("type", "review_rating_category")
        .in("parent_id", Array.from(priorityById.keys()))
        .eq("is_active", true);

      if (error || !data) {
        Logger.error(
          `Error fetching review rating categories for ${equipmentCategoryValue}/${equipmentSubcategoryValue}`,
          createLogContext("categories-server", {
            equipmentCategoryValue,
            equipmentSubcategoryValue,
          }),
          error instanceof Error ? error : undefined
        );
        return [];
      }

      type Row = CategoryOption & { parent_id: string };
      const rows = data as Row[];
      rows.sort((a, b) => {
        const pa = priorityById.get(a.parent_id) ?? Number.MAX_SAFE_INTEGER;
        const pb = priorityById.get(b.parent_id) ?? Number.MAX_SAFE_INTEGER;
        if (pa !== pb) return pa - pb;
        return a.display_order - b.display_order;
      });

      // Dedupe by slug (defensive — the seed shouldn't produce duplicate
      // slugs across the applied parents). Keep the higher-priority row.
      const seen = new Set<string>();
      const deduped: CategoryOption[] = [];
      for (const r of rows) {
        if (seen.has(r.value)) continue;
        seen.add(r.value);
        deduped.push({
          id: r.id,
          name: r.name,
          value: r.value,
          description: r.description,
          examples: r.examples,
          min_label: r.min_label,
          max_label: r.max_label,
          display_order: r.display_order,
        });
      }
      return deduped;
    } catch (error) {
      Logger.error(
        "Exception fetching review rating categories",
        createLogContext("categories-server", {
          equipmentCategoryValue,
          equipmentSubcategoryValue,
        }),
        error instanceof Error ? error : undefined
      );
      return [];
    }
  }

  /**
   * Get equipment spec field definitions for a specific equipment category and subcategory.
   * Powers the DB-driven specs table in the equipment comparison page (TT-25).
   * Each returned row's `value` is a key in equipment.specifications JSONB.
   */
  async getEquipmentSpecFields(
    equipmentCategoryValue?: string,
    equipmentSubcategoryValue?: string
  ): Promise<CategoryOption[]> {
    try {
      if (!equipmentCategoryValue) {
        return this.getCategoriesByType("equipment_spec_field");
      }

      let parentId: string | null = null;

      if (equipmentSubcategoryValue) {
        const { data: equipmentSubcategory } = await this.supabase
          .from("categories")
          .select("id")
          .eq("type", "equipment_subcategory")
          .eq("value", equipmentSubcategoryValue)
          .eq("is_active", true)
          .single();

        if (equipmentSubcategory) {
          parentId = equipmentSubcategory.id;
        }
      }

      if (!parentId) {
        const { data: equipmentCategory } = await this.supabase
          .from("categories")
          .select("id")
          .eq("type", "equipment_category")
          .eq("value", equipmentCategoryValue)
          .eq("is_active", true)
          .single();

        if (!equipmentCategory) {
          Logger.error(
            `Equipment category '${equipmentCategoryValue}' not found`,
            createLogContext("categories-server", { equipmentCategoryValue })
          );
          return [];
        }

        parentId = equipmentCategory.id;
      }

      const { data, error } = await this.supabase
        .from("categories")
        .select(
          `
          id,
          name,
          value,
          description,
          display_order,
          field_type,
          unit,
          scale_min,
          scale_max
        `
        )
        .eq("type", "equipment_spec_field")
        .eq("parent_id", parentId)
        .eq("is_active", true)
        .order("display_order");

      if (error) {
        Logger.error(
          `Error fetching equipment spec fields for ${equipmentCategoryValue}/${equipmentSubcategoryValue}`,
          createLogContext("categories-server", {
            equipmentCategoryValue,
            equipmentSubcategoryValue,
          }),
          error instanceof Error ? error : undefined
        );
        return [];
      }

      return data || [];
    } catch (error) {
      Logger.error(
        "Exception fetching equipment spec fields",
        createLogContext("categories-server", {
          equipmentCategoryValue,
          equipmentSubcategoryValue,
        }),
        error instanceof Error ? error : undefined
      );
      return [];
    }
  }
}

/**
 * Create a category service instance
 */
export function createCategoryService(
  supabase: SupabaseClient
): CategoryService {
  return new CategoryService(supabase);
}

/**
 * Helper function to format country options with flags
 */
export function formatCountryOption(country: CategoryOption): string {
  return country.flag_emoji
    ? `${country.flag_emoji} ${country.name}`
    : country.name;
}

/**
 * Helper function to get display name for category types
 */
export function getCategoryTypeDisplayName(type: CategoryType): string {
  switch (type) {
    case "equipment_category":
      return "Equipment Categories";
    case "equipment_subcategory":
      return "Equipment Subcategories";
    case "playing_style":
      return "Playing Styles";
    case "country":
      return "Countries";
    case "rejection_category":
      return "Rejection Categories";
    case "review_rating_category":
      return "Review Rating Categories";
    default:
      return type;
  }
}

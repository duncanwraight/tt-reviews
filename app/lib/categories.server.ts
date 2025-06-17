import type { SupabaseClient } from "@supabase/supabase-js";

export type CategoryType =
  | "equipment_category"
  | "equipment_subcategory"
  | "playing_style"
  | "country"
  | "rejection_category"
  | "review_rating_category";

export interface Category {
  id: string;
  type: CategoryType;
  parent_id?: string;
  name: string;
  value: string;
  display_order: number;
  flag_emoji?: string;
  description?: string;
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
        console.error(`Error fetching ${type} categories:`, error);
        return [];
      }

      return data || [];
    } catch (error) {
      console.error(`Exception fetching ${type} categories:`, error);
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
        console.error(
          `Error fetching subcategories for ${parentValue}:`,
          error
        );
        return [];
      }

      return data || [];
    } catch (error) {
      console.error(
        `Exception fetching subcategories for ${parentValue}:`,
        error
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
   * Get review rating categories for specific equipment category/subcategory
   */
  async getReviewRatingCategories(
    equipmentCategoryValue?: string
  ): Promise<CategoryOption[]> {
    try {
      let query = this.supabase
        .from("categories")
        .select("id, name, value, description, display_order")
        .eq("type", "review_rating_category")
        .eq("is_active", true);

      if (equipmentCategoryValue) {
        // First, find the parent category ID by its value
        const { data: parentCategory } = await this.supabase
          .from("categories")
          .select("id")
          .eq("value", equipmentCategoryValue)
          .eq("is_active", true)
          .maybeSingle();

        if (parentCategory) {
          query = query.eq("parent_id", parentCategory.id);
        } else {
          // If no parent category found, return empty array
          return [];
        }
      } else {
        // If no category specified, get general categories (no parent)
        query = query.is("parent_id", null);
      }

      const { data, error } = await query.order("display_order");

      if (error) {
        console.error(
          `Error fetching review rating categories for ${equipmentCategoryValue}:`,
          error
        );
        return [];
      }

      return data || [];
    } catch (error) {
      console.error(
        `Exception fetching review rating categories for ${equipmentCategoryValue}:`,
        error
      );
      return [];
    }
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
        console.error("Error creating category:", error);
        return null;
      }

      return data;
    } catch (error) {
      console.error("Exception creating category:", error);
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
    try {
      const { data, error } = await this.supabase
        .from("categories")
        .update(updates)
        .eq("id", id)
        .select()
        .single();

      if (error) {
        console.error("Error updating category:", error);
        return null;
      }

      return data;
    } catch (error) {
      console.error("Exception updating category:", error);
      return null;
    }
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
        console.error("Error deleting category:", error);
        return false;
      }

      return true;
    } catch (error) {
      console.error("Exception deleting category:", error);
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
        console.error("Error reordering categories");
        return false;
      }

      return true;
    } catch (error) {
      console.error("Exception reordering categories:", error);
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
        console.error("Error fetching categories for admin:", error);
        return [];
      }

      return data || [];
    } catch (error) {
      console.error("Exception fetching categories for admin:", error);
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

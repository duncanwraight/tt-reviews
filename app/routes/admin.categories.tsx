import type { Route } from "./+types/admin.categories";
import { lazy, Suspense } from "react";
import { getServerClient } from "~/lib/supabase.server";
import { getUserWithRole } from "~/lib/auth.server";
import { createCategoryService } from "~/lib/categories.server";
import { LoadingState } from "~/components/ui/LoadingState";
import { data, redirect } from "react-router";

// Lazy load the category manager for better code splitting
const CategoryManager = lazy(() =>
  import("~/components/admin/CategoryManager").then(module => ({
    default: module.CategoryManager,
  }))
);

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Category Management | Admin | TT Reviews" },
    {
      name: "description",
      content: "Manage categories and dropdown options for TT Reviews.",
    },
  ];
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const sbServerClient = getServerClient(request, context);
  const user = await getUserWithRole(sbServerClient, context);

  if (!user) {
    throw redirect("/login", { headers: sbServerClient.headers });
  }

  // Check admin role for access control
  if (user.role !== "admin") {
    throw redirect("/", { headers: sbServerClient.headers });
  }

  // Load all categories for admin management
  const categoryService = createCategoryService(sbServerClient.client);
  const [
    equipmentCategories,
    playingStyles,
    countries,
    rejectionCategories,
    allCategories,
  ] = await Promise.all([
    categoryService.getEquipmentCategories(),
    categoryService.getPlayingStyles(),
    categoryService.getCountries(),
    categoryService.getRejectionCategories(),
    categoryService.getAllCategoriesForAdmin(),
  ]);

  return data(
    {
      user,
      categories: {
        equipmentCategories,
        playingStyles,
        countries,
        rejectionCategories,
        all: allCategories,
      },
      env: {
        SUPABASE_URL: (context.cloudflare.env as unknown as Record<string, string>)
          .SUPABASE_URL!,
        SUPABASE_ANON_KEY: (context.cloudflare.env as unknown as Record<string, string>)
          .SUPABASE_ANON_KEY!,
      },
    },
    { headers: sbServerClient.headers }
  );
}

export async function action({ request, context }: Route.ActionArgs) {
  const sbServerClient = getServerClient(request, context);
  const user = await getUserWithRole(sbServerClient, context);

  if (!user || user.role !== "admin") {
    throw redirect("/login", { headers: sbServerClient.headers });
  }

  const formData = await request.formData();
  const intent = formData.get("intent") as string;
  const categoryService = createCategoryService(sbServerClient.client);

  try {
    switch (intent) {
      case "create": {
        const type = formData.get("type") as any;
        const name = formData.get("name") as string;
        const value = formData.get("value") as string;
        const parentId = (formData.get("parent_id") as string) || undefined;
        const flagEmoji = (formData.get("flag_emoji") as string) || undefined;
        const displayOrder =
          parseInt(formData.get("display_order") as string) || 0;

        if (!type || !name || !value) {
          return data(
            { error: "Type, name, and value are required" },
            { status: 400, headers: sbServerClient.headers }
          );
        }

        const result = await categoryService.createCategory({
          type,
          name: name.trim(),
          value: value.trim(),
          parent_id: parentId ?? undefined,
          flag_emoji: flagEmoji?.trim() ?? undefined,
          display_order: displayOrder,
          is_active: true,
        });

        if (!result) {
          return data(
            { error: "Failed to create category" },
            { status: 500, headers: sbServerClient.headers }
          );
        }

        return data(
          { success: true, message: "Category created successfully" },
          { headers: sbServerClient.headers }
        );
      }

      case "update": {
        const id = formData.get("id") as string;
        const name = formData.get("name") as string;
        const value = formData.get("value") as string;
        const flagEmoji = (formData.get("flag_emoji") as string) || undefined;
        const displayOrder =
          parseInt(formData.get("display_order") as string) || 0;
        const isActive = formData.get("is_active") === "true";

        if (!id || !name || !value) {
          return data(
            { error: "ID, name, and value are required" },
            { status: 400, headers: sbServerClient.headers }
          );
        }

        // Build updates object - only include parent_id if the field was in the form
        const updates: Record<string, unknown> = {
          name: name.trim(),
          value: value.trim(),
          display_order: displayOrder,
          is_active: isActive,
        };

        // Only include flag_emoji if it has a value
        if (flagEmoji) {
          updates.flag_emoji = flagEmoji.trim();
        }

        // Only include parent_id if the field was present in the form
        // Use null (not undefined) to clear a parent in the database
        if (formData.has("parent_id")) {
          const parentId = formData.get("parent_id") as string;
          updates.parent_id = parentId || null;
        }

        const result = await categoryService.updateCategory(id, updates);

        if (!result) {
          return data(
            { error: "Failed to update category" },
            { status: 500, headers: sbServerClient.headers }
          );
        }

        return data(
          { success: true, message: "Category updated successfully" },
          { headers: sbServerClient.headers }
        );
      }

      case "delete": {
        const id = formData.get("id") as string;

        if (!id) {
          return data(
            { error: "Category ID is required" },
            { status: 400, headers: sbServerClient.headers }
          );
        }

        const result = await categoryService.deleteCategory(id);

        if (!result) {
          return data(
            { error: "Failed to delete category" },
            { status: 500, headers: sbServerClient.headers }
          );
        }

        return data(
          { success: true, message: "Category deleted successfully" },
          { headers: sbServerClient.headers }
        );
      }

      case "reorder": {
        const updates = JSON.parse(formData.get("updates") as string);

        if (!Array.isArray(updates)) {
          return data(
            { error: "Invalid reorder data" },
            { status: 400, headers: sbServerClient.headers }
          );
        }

        const result = await categoryService.reorderCategories(updates);

        if (!result) {
          return data(
            { error: "Failed to reorder categories" },
            { status: 500, headers: sbServerClient.headers }
          );
        }

        return data(
          { success: true, message: "Categories reordered successfully" },
          { headers: sbServerClient.headers }
        );
      }

      default:
        return data(
          { error: "Invalid action" },
          { status: 400, headers: sbServerClient.headers }
        );
    }
  } catch (error) {
    console.error("Category management error:", error);
    return data(
      { error: "An error occurred while managing categories" },
      { status: 500, headers: sbServerClient.headers }
    );
  }
}

export default function AdminCategories({
  loaderData,
  actionData,
}: Route.ComponentProps) {
  const { categories, env } = loaderData;

  // Filter categories by type for the new manager components
  const equipmentCategories = categories.all.filter(
    cat => cat.type === "equipment_category"
  );
  const equipmentSubcategories = categories.all.filter(
    cat => cat.type === "equipment_subcategory"
  );
  const playingStyles = categories.all.filter(
    cat => cat.type === "playing_style"
  );
  const countries = categories.all.filter(cat => cat.type === "country");
  const rejectionCategories = categories.all.filter(
    cat => cat.type === "rejection_category"
  );
  const reviewRatingCategories = categories.all.filter(
    cat => cat.type === "review_rating_category"
  );

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-bold text-gray-900 mb-6">
          Category Management
        </h2>
        <p className="text-gray-600 mb-8">
          Manage dropdown categories used throughout the application. Categories
          control what options are available in forms for equipment, players,
          and moderation.
        </p>
      </div>

      {/* Success/Error Messages */}
      {actionData && "success" in actionData && actionData.success && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <div className="flex">
            <div className="flex-shrink-0">
              <span className="text-green-600 text-xl">✅</span>
            </div>
            <div className="ml-3">
              <p className="text-sm text-green-800">{actionData.message}</p>
            </div>
          </div>
        </div>
      )}

      {actionData && "error" in actionData && actionData.error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex">
            <div className="flex-shrink-0">
              <span className="text-red-600 text-xl">❌</span>
            </div>
            <div className="ml-3">
              <p className="text-sm text-red-800">{actionData.error}</p>
            </div>
          </div>
        </div>
      )}

      {/* Category Type Sections */}
      <Suspense
        fallback={<LoadingState message="Loading category management..." />}
      >
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Equipment Categories */}
          <CategoryManager
            categories={equipmentCategories}
            type="equipment_category"
            title="Equipment Categories"
            description="Categories for equipment types (e.g., Blade, Rubber)"
            showFlags={false}
            allowSubcategories={false}
          />

          {/* Playing Styles */}
          <CategoryManager
            categories={playingStyles}
            type="playing_style"
            title="Playing Styles"
            description="Player playing style options"
            showFlags={false}
            allowSubcategories={false}
          />

          {/* Countries */}
          <CategoryManager
            categories={countries}
            type="country"
            title="Countries"
            description="Country options with flag emojis"
            showFlags={true}
            allowSubcategories={false}
          />

          {/* Rejection Categories */}
          <CategoryManager
            categories={rejectionCategories}
            type="rejection_category"
            title="Rejection Categories"
            description="Reasons for rejecting submissions"
            showFlags={false}
            allowSubcategories={false}
          />
        </div>

        {/* Equipment Subcategories Section */}
        <CategoryManager
          categories={equipmentSubcategories}
          type="equipment_subcategory"
          title="Equipment Subcategories"
          description="Subcategories that appear when specific equipment categories are selected (e.g., Rubber types)"
          showFlags={false}
          allowSubcategories={true}
          parentCategories={equipmentCategories}
        />

        {/* Review Rating Categories Section */}
        <CategoryManager
          categories={reviewRatingCategories}
          type="review_rating_category"
          title="Review Rating Categories"
          description="Rating aspects for equipment reviews (e.g., Speed, Control, Feel). These are organized by equipment subcategory."
          showFlags={false}
          allowSubcategories={true}
          parentCategories={[...equipmentCategories, ...equipmentSubcategories]}
        />
      </Suspense>
    </div>
  );
}

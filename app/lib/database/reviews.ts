import type { DatabaseContext, EquipmentReview } from "./types";
import { withLogging } from "./logging";

export async function getEquipmentReviews(
  ctx: DatabaseContext,
  equipmentId: string,
  status: "approved" | "all" = "approved"
): Promise<EquipmentReview[]> {
  return withLogging<EquipmentReview[]>(
    ctx,
    "get_equipment_reviews",
    async () => {
      let query = ctx.supabase
        .from("equipment_reviews")
        .select(
          `
          *,
          equipment (
            id,
            name,
            manufacturer,
            category,
            subcategory
          )
        `
        )
        .eq("equipment_id", equipmentId)
        .order("created_at", { ascending: false });

      if (status === "approved") {
        query = query.eq("status", "approved");
      }

      return await query;
    },
    { equipmentId, status }
  ).catch((): EquipmentReview[] => []);
}

export async function getRecentReviews(
  ctx: DatabaseContext,
  limit = 10
): Promise<EquipmentReview[]> {
  const { data, error } = await ctx.supabase
    .from("equipment_reviews")
    .select(
      `
      *,
      equipment (
        id,
        name,
        manufacturer,
        category,
        subcategory,
        slug
      )
    `
    )
    .eq("status", "approved")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("Error fetching recent reviews:", error);
    return [];
  }

  return (data as EquipmentReview[]) || [];
}

export async function getUserReviews(
  ctx: DatabaseContext,
  userId: string
): Promise<EquipmentReview[]> {
  const { data, error } = await ctx.supabase
    .from("equipment_reviews")
    .select(
      `
      *,
      equipment (
        id,
        name,
        slug,
        manufacturer,
        category,
        subcategory
      )
    `
    )
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Error fetching user reviews:", error);
    return [];
  }

  return (data as EquipmentReview[]) || [];
}

export async function getUserReviewForEquipment(
  ctx: DatabaseContext,
  equipmentId: string,
  userId: string
): Promise<EquipmentReview | null> {
  const { data, error } = await ctx.supabase
    .from("equipment_reviews")
    .select(
      `
      *,
      equipment (
        id,
        name,
        slug,
        manufacturer,
        category,
        subcategory
      )
    `
    )
    .eq("equipment_id", equipmentId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    console.error("Error fetching user review for equipment:", error);
    return null;
  }

  return data as EquipmentReview | null;
}

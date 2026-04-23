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
    () => {
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

      return query;
    },
    { equipmentId, status }
  ).catch((): EquipmentReview[] => []);
}

export async function getRecentReviews(
  ctx: DatabaseContext,
  limit = 10
): Promise<EquipmentReview[]> {
  return withLogging<EquipmentReview[]>(
    ctx,
    "get_recent_reviews",
    () =>
      ctx.supabase
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
        .limit(limit),
    { limit }
  ).catch((): EquipmentReview[] => []);
}

export async function getUserReviews(
  ctx: DatabaseContext,
  userId: string
): Promise<EquipmentReview[]> {
  return withLogging<EquipmentReview[]>(
    ctx,
    "get_user_reviews",
    () =>
      ctx.supabase
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
        .order("created_at", { ascending: false }),
    { userId }
  ).catch((): EquipmentReview[] => []);
}

export async function getUserReviewForEquipment(
  ctx: DatabaseContext,
  equipmentId: string,
  userId: string
): Promise<EquipmentReview | null> {
  return withLogging<EquipmentReview | null>(
    ctx,
    "get_user_review_for_equipment",
    () =>
      ctx.supabase
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
        .maybeSingle(),
    { equipmentId, userId }
  ).catch(() => null);
}

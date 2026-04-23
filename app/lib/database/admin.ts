import { Logger } from "~/lib/logger.server";
import type { DatabaseContext } from "./types";

export interface AdminDashboardCounts {
  totals: {
    equipmentSubmissions: number;
    playerSubmissions: number;
    playerEdits: number;
    equipmentReviews: number;
    equipment: number;
    players: number;
  };
  byStatus: {
    equipmentSubmissions: Record<string, number>;
    playerSubmissions: Record<string, number>;
    playerEdits: Record<string, number>;
    equipmentReviews: Record<string, number>;
  };
}

const EMPTY_STATUS_COUNTS = (): Record<string, number> => ({
  pending: 0,
  awaiting_second_approval: 0,
  approved: 0,
  rejected: 0,
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getStatusCounts(data: any[] | null): Record<string, number> {
  const counts = EMPTY_STATUS_COUNTS();

  if (data) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    data.forEach((item: any) => {
      if (item.status && Object.prototype.hasOwnProperty.call(counts, item.status)) {
        counts[item.status]++;
      }
    });
  }

  return counts;
}

export async function getAdminDashboardCounts(
  ctx: DatabaseContext
): Promise<AdminDashboardCounts> {
  try {
    const [
      equipmentSubmissionsQuery,
      playerSubmissionsQuery,
      playerEditsQuery,
      equipmentReviewsQuery,
      equipmentCountQuery,
      playersCountQuery,
    ] = await Promise.all([
      ctx.supabase
        .from("equipment_submissions")
        .select("status")
        .neq("status", null),
      ctx.supabase
        .from("player_submissions")
        .select("status")
        .neq("status", null),
      ctx.supabase.from("player_edits").select("status").neq("status", null),
      ctx.supabase
        .from("equipment_reviews")
        .select("status")
        .neq("status", null),
      ctx.supabase
        .from("equipment")
        .select("*", { count: "exact", head: true }),
      ctx.supabase
        .from("players")
        .select("*", { count: "exact", head: true }),
    ]);

    return {
      totals: {
        equipmentSubmissions: equipmentSubmissionsQuery.data?.length || 0,
        playerSubmissions: playerSubmissionsQuery.data?.length || 0,
        playerEdits: playerEditsQuery.data?.length || 0,
        equipmentReviews: equipmentReviewsQuery.data?.length || 0,
        equipment: equipmentCountQuery.count || 0,
        players: playersCountQuery.count || 0,
      },
      byStatus: {
        equipmentSubmissions: getStatusCounts(equipmentSubmissionsQuery.data),
        playerSubmissions: getStatusCounts(playerSubmissionsQuery.data),
        playerEdits: getStatusCounts(playerEditsQuery.data),
        equipmentReviews: getStatusCounts(equipmentReviewsQuery.data),
      },
    };
  } catch (error) {
    const logContext = ctx.context || { requestId: "unknown" };
    Logger.error(
      "Error fetching admin dashboard counts",
      logContext,
      error as Error
    );

    return {
      totals: {
        equipmentSubmissions: 0,
        playerSubmissions: 0,
        playerEdits: 0,
        equipmentReviews: 0,
        equipment: 0,
        players: 0,
      },
      byStatus: {
        equipmentSubmissions: EMPTY_STATUS_COUNTS(),
        playerSubmissions: EMPTY_STATUS_COUNTS(),
        playerEdits: EMPTY_STATUS_COUNTS(),
        equipmentReviews: EMPTY_STATUS_COUNTS(),
      },
    };
  }
}

import type { Route } from "./+types/admin._index";
import { data, redirect } from "react-router";
import { createSupabaseAdminClient } from "~/lib/database.server";
import { getServerClient } from "~/lib/supabase.server";
import { getUserWithRole } from "~/lib/auth.server";

// Helper function to get dashboard counts using admin client
async function getAdminDashboardCountsWithClient(supabase: any) {
  try {
    // Use admin client to bypass RLS policies - same logic as DatabaseService but with admin access
    const [
      equipmentSubmissionsQuery,
      playerSubmissionsQuery,
      playerEditsQuery,
      equipmentReviewsQuery,
      videoSubmissionsQuery,
      playerEquipmentSetupsQuery,
      equipmentCountQuery,
      playersCountQuery,
    ] = await Promise.all([
      // Get equipment submissions grouped by status
      supabase
        .from("equipment_submissions")
        .select("status")
        .not("status", "is", null),

      // Get player submissions grouped by status
      supabase
        .from("player_submissions")
        .select("status")
        .not("status", "is", null),

      // Get player edits grouped by status
      supabase.from("player_edits").select("status").not("status", "is", null),

      // Get equipment reviews grouped by status
      supabase
        .from("equipment_reviews")
        .select("status")
        .not("status", "is", null),

      // Get video submissions grouped by status
      supabase
        .from("video_submissions")
        .select("status")
        .not("status", "is", null),

      // Get player equipment setup submissions grouped by status
      supabase
        .from("player_equipment_setup_submissions")
        .select("status")
        .not("status", "is", null),

      // Get total equipment count
      supabase
        .from("equipment")
        .select("*", { count: "exact", head: true }),

      // Get total players count
      supabase
        .from("players")
        .select("*", { count: "exact", head: true }),
    ]);

    // Process the results to get status counts
    const getStatusCounts = (data: any[] | null): Record<string, number> => {
      const counts: Record<string, number> = {
        pending: 0,
        awaiting_second_approval: 0,
        approved: 0,
        rejected: 0,
      };

      if (data) {
        data.forEach((item: any) => {
          if (item.status && counts.hasOwnProperty(item.status)) {
            counts[item.status]++;
          }
        });
      }

      return counts;
    };

    const result = {
      totals: {
        equipmentSubmissions: equipmentSubmissionsQuery.data?.length || 0,
        playerSubmissions: playerSubmissionsQuery.data?.length || 0,
        playerEdits: playerEditsQuery.data?.length || 0,
        equipmentReviews: equipmentReviewsQuery.data?.length || 0,
        videoSubmissions: videoSubmissionsQuery.data?.length || 0,
        playerEquipmentSetups: playerEquipmentSetupsQuery.data?.length || 0,
        equipment: equipmentCountQuery.count || 0,
        players: playersCountQuery.count || 0,
      },
      byStatus: {
        equipmentSubmissions: getStatusCounts(equipmentSubmissionsQuery.data),
        playerSubmissions: getStatusCounts(playerSubmissionsQuery.data),
        playerEdits: getStatusCounts(playerEditsQuery.data),
        equipmentReviews: getStatusCounts(equipmentReviewsQuery.data),
        videoSubmissions: getStatusCounts(videoSubmissionsQuery.data),
        playerEquipmentSetups: getStatusCounts(playerEquipmentSetupsQuery.data),
      },
    };

    return result;
  } catch (error) {
    console.error("Error fetching admin dashboard counts:", error);

    // Return empty counts as fallback
    return {
      totals: {
        equipmentSubmissions: 0,
        playerSubmissions: 0,
        playerEdits: 0,
        equipmentReviews: 0,
        videoSubmissions: 0,
        playerEquipmentSetups: 0,
        equipment: 0,
        players: 0,
      },
      byStatus: {
        equipmentSubmissions: {
          pending: 0,
          awaiting_second_approval: 0,
          approved: 0,
          rejected: 0,
        },
        playerSubmissions: {
          pending: 0,
          awaiting_second_approval: 0,
          approved: 0,
          rejected: 0,
        },
        playerEdits: {
          pending: 0,
          awaiting_second_approval: 0,
          approved: 0,
          rejected: 0,
        },
        playerEquipmentSetups: {
          pending: 0,
          awaiting_second_approval: 0,
          approved: 0,
          rejected: 0,
        },
        equipmentReviews: {
          pending: 0,
          awaiting_second_approval: 0,
          approved: 0,
          rejected: 0,
        },
        videoSubmissions: {
          pending: 0,
          awaiting_second_approval: 0,
          approved: 0,
          rejected: 0,
        },
      },
    };
  }
}

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Admin Dashboard | TT Reviews" },
    {
      name: "description",
      content: "Admin dashboard for managing TT Reviews submissions and edits.",
    },
  ];
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const sbServerClient = getServerClient(request, context);
  const user = await getUserWithRole(sbServerClient);

  // Check admin access - CRITICAL security check before using admin client
  if (!user || user.role !== "admin") {
    throw redirect("/", { headers: sbServerClient.headers });
  }

  const supabase = createSupabaseAdminClient(context);

  // Now safe to use admin client to bypass RLS policies since user is verified admin
  const dashboardCounts = await getAdminDashboardCountsWithClient(supabase);

  // Extract totals for easier access
  const {
    equipmentSubmissions: equipmentSubmissionsCount,
    playerSubmissions: playerSubmissionsCount,
    playerEdits: playerEditsCount,
    equipmentReviews: equipmentReviewsCount,
    videoSubmissions: videoSubmissionsCount,
    playerEquipmentSetups: playerEquipmentSetupsCount,
    equipment: equipmentCount,
    players: playersCount,
  } = dashboardCounts.totals;

  // Extract status counts from the optimized query results
  const {
    equipmentSubmissions: equipmentSubmissionsByStatus,
    playerSubmissions: playerSubmissionsByStatus,
    playerEdits: playerEditsByStatus,
    equipmentReviews: equipmentReviewsByStatus,
    videoSubmissions: videoSubmissionsByStatus,
    playerEquipmentSetups: playerEquipmentSetupsByStatus,
  } = dashboardCounts.byStatus;

  // Extract individual status counts for easier access
  const pendingEquipmentSubmissions = equipmentSubmissionsByStatus.pending;
  const awaitingEquipmentSubmissions =
    equipmentSubmissionsByStatus.awaiting_second_approval;
  const approvedEquipmentSubmissions = equipmentSubmissionsByStatus.approved;
  const rejectedEquipmentSubmissions = equipmentSubmissionsByStatus.rejected;

  const pendingPlayerSubmissions = playerSubmissionsByStatus.pending;
  const awaitingPlayerSubmissions =
    playerSubmissionsByStatus.awaiting_second_approval;
  const approvedPlayerSubmissions = playerSubmissionsByStatus.approved;
  const rejectedPlayerSubmissions = playerSubmissionsByStatus.rejected;

  const pendingPlayerEdits = playerEditsByStatus.pending;
  const awaitingPlayerEdits = playerEditsByStatus.awaiting_second_approval;
  const approvedPlayerEdits = playerEditsByStatus.approved;
  const rejectedPlayerEdits = playerEditsByStatus.rejected;

  const pendingEquipmentReviews = equipmentReviewsByStatus.pending;
  const awaitingEquipmentReviews =
    equipmentReviewsByStatus.awaiting_second_approval;
  const approvedEquipmentReviews = equipmentReviewsByStatus.approved;
  const rejectedEquipmentReviews = equipmentReviewsByStatus.rejected;

  const pendingVideoSubmissions = videoSubmissionsByStatus.pending;
  const awaitingVideoSubmissions =
    videoSubmissionsByStatus.awaiting_second_approval;
  const approvedVideoSubmissions = videoSubmissionsByStatus.approved;
  const rejectedVideoSubmissions = videoSubmissionsByStatus.rejected;

  const pendingPlayerEquipmentSetups = playerEquipmentSetupsByStatus.pending;
  const awaitingPlayerEquipmentSetups =
    playerEquipmentSetupsByStatus.awaiting_second_approval;
  const approvedPlayerEquipmentSetups = playerEquipmentSetupsByStatus.approved;
  const rejectedPlayerEquipmentSetups = playerEquipmentSetupsByStatus.rejected;

  return data({
    stats: {
      equipmentSubmissions: equipmentSubmissionsCount || 0,
      playerSubmissions: playerSubmissionsCount || 0,
      playerEdits: playerEditsCount || 0,
      equipmentReviews: equipmentReviewsCount || 0,
      videoSubmissions: videoSubmissionsCount || 0,
      playerEquipmentSetups: playerEquipmentSetupsCount || 0,
      equipment: equipmentCount || 0,
      players: playersCount || 0,
      // Equipment submission status breakdown
      equipmentPending:
        (pendingEquipmentSubmissions || 0) +
        (awaitingEquipmentSubmissions || 0),
      equipmentApproved: approvedEquipmentSubmissions || 0,
      equipmentRejected: rejectedEquipmentSubmissions || 0,
      // Player submission status breakdown
      playerSubmissionsPending:
        (pendingPlayerSubmissions || 0) + (awaitingPlayerSubmissions || 0),
      playerSubmissionsApproved: approvedPlayerSubmissions || 0,
      playerSubmissionsRejected: rejectedPlayerSubmissions || 0,
      // Player edits status breakdown
      playerEditsPending:
        (pendingPlayerEdits || 0) + (awaitingPlayerEdits || 0),
      playerEditsApproved: approvedPlayerEdits || 0,
      playerEditsRejected: rejectedPlayerEdits || 0,
      // Equipment reviews status breakdown
      equipmentReviewsPending:
        (pendingEquipmentReviews || 0) + (awaitingEquipmentReviews || 0),
      equipmentReviewsApproved: approvedEquipmentReviews || 0,
      equipmentReviewsRejected: rejectedEquipmentReviews || 0,
      // Video submissions status breakdown
      videoSubmissionsPending:
        (pendingVideoSubmissions || 0) + (awaitingVideoSubmissions || 0),
      videoSubmissionsApproved: approvedVideoSubmissions || 0,
      videoSubmissionsRejected: rejectedVideoSubmissions || 0,
      // Player equipment setups status breakdown
      playerEquipmentSetupsPending:
        (pendingPlayerEquipmentSetups || 0) + (awaitingPlayerEquipmentSetups || 0),
      playerEquipmentSetupsApproved: approvedPlayerEquipmentSetups || 0,
      playerEquipmentSetupsRejected: rejectedPlayerEquipmentSetups || 0,
    },
  });
}

export default function AdminDashboard({ loaderData }: Route.ComponentProps) {
  const { stats } = loaderData;

  const statCards = [
    {
      title: "Equipment Submissions",
      total: stats.equipmentSubmissions,
      pending: stats.equipmentPending,
      approved: stats.equipmentApproved,
      rejected: stats.equipmentRejected,
      link: "/admin/equipment-submissions",
      color: "bg-blue-500",
    },
    {
      title: "Player Submissions",
      total: stats.playerSubmissions,
      pending: stats.playerSubmissionsPending,
      approved: stats.playerSubmissionsApproved,
      rejected: stats.playerSubmissionsRejected,
      link: "/admin/player-submissions",
      color: "bg-green-500",
    },
    {
      title: "Player Edits",
      total: stats.playerEdits,
      pending: stats.playerEditsPending,
      approved: stats.playerEditsApproved,
      rejected: stats.playerEditsRejected,
      link: "/admin/player-edits",
      color: "bg-purple-500",
    },
    {
      title: "Equipment Setups",
      total: stats.playerEquipmentSetups,
      pending: stats.playerEquipmentSetupsPending,
      approved: stats.playerEquipmentSetupsApproved,
      rejected: stats.playerEquipmentSetupsRejected,
      link: "/admin/player-equipment-setups",
      color: "bg-teal-500",
    },
    {
      title: "Equipment Reviews",
      total: stats.equipmentReviews,
      pending: stats.equipmentReviewsPending,
      approved: stats.equipmentReviewsApproved,
      rejected: stats.equipmentReviewsRejected,
      link: "/admin/equipment-reviews",
      color: "bg-yellow-500",
    },
    {
      title: "Video Submissions",
      total: stats.videoSubmissions,
      pending: stats.videoSubmissionsPending,
      approved: stats.videoSubmissionsApproved,
      rejected: stats.videoSubmissionsRejected,
      link: "/admin/video-submissions",
      color: "bg-pink-500",
    },
  ];

  const contentStats = [
    {
      title: "Total Equipment",
      count: stats.equipment,
      icon: "🏓",
      color: "bg-orange-100 text-orange-800",
    },
    {
      title: "Total Players",
      count: stats.players,
      icon: "👤",
      color: "bg-indigo-100 text-indigo-800",
    },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-bold text-gray-900 mb-6">
          Dashboard Overview
        </h2>

        {/* Pending Items Alert */}
        {stats.equipmentPending +
          stats.playerSubmissionsPending +
          stats.playerEditsPending +
          stats.playerEquipmentSetupsPending +
          stats.videoSubmissionsPending >
          0 && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
            <div className="flex">
              <div className="flex-shrink-0">
                <span className="text-yellow-600 text-xl">⚠️</span>
              </div>
              <div className="ml-3">
                <h3 className="text-sm font-medium text-yellow-800">
                  Items Pending Review
                </h3>
                <div className="mt-2 text-sm text-yellow-700">
                  You have{" "}
                  {stats.equipmentPending +
                    stats.playerSubmissionsPending +
                    stats.playerEditsPending +
                    stats.playerEquipmentSetupsPending +
                    stats.videoSubmissionsPending}{" "}
                  items waiting for review.
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Moderation Stats */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-6 mb-8">
          {statCards.map((card, index) => (
            <div key={index} className="bg-white rounded-lg shadow p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-medium text-gray-600">
                  {card.title}
                </h3>
                <span className="text-2xl font-semibold text-gray-900">
                  {card.total}
                </span>
              </div>

              {/* Status breakdown with color coding */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center">
                    <div className="w-2 h-2 bg-yellow-500 rounded-full mr-2"></div>
                    <span className="text-gray-600">Pending</span>
                  </div>
                  <span className="font-medium text-yellow-700">
                    {card.pending}
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center">
                    <div className="w-2 h-2 bg-green-500 rounded-full mr-2"></div>
                    <span className="text-gray-600">Approved</span>
                  </div>
                  <span className="font-medium text-green-700">
                    {card.approved}
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center">
                    <div className="w-2 h-2 bg-red-500 rounded-full mr-2"></div>
                    <span className="text-gray-600">Rejected</span>
                  </div>
                  <span className="font-medium text-red-700">
                    {card.rejected}
                  </span>
                </div>
              </div>

              <div className="mt-4 pt-4 border-t border-gray-200">
                <a
                  href={card.link}
                  className="text-sm text-purple-600 hover:text-purple-800 font-medium"
                >
                  View all →
                </a>
              </div>
            </div>
          ))}
        </div>

        {/* Content Stats */}
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">
            Content Statistics
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {contentStats.map((stat, index) => (
              <div key={index} className="flex items-center">
                <div className={`${stat.color} rounded-lg p-3 mr-4`}>
                  <span className="text-2xl">{stat.icon}</span>
                </div>
                <div>
                  <div className="text-2xl font-semibold text-gray-900">
                    {stat.count}
                  </div>
                  <div className="text-sm text-gray-600">{stat.title}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

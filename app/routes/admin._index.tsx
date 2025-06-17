import type { Route } from "./+types/admin._index";
import { data } from "react-router";
import {
  DatabaseService,
  createSupabaseAdminClient,
} from "~/lib/database.server";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Admin Dashboard | TT Reviews" },
    {
      name: "description",
      content: "Admin dashboard for managing TT Reviews submissions and edits.",
    },
  ];
}

export async function loader({ context }: Route.LoaderArgs) {
  const db = new DatabaseService(context);
  const supabase = createSupabaseAdminClient(context);

  // Use optimized database function to get all counts efficiently
  const dashboardCounts = await db.getAdminDashboardCounts();

  // Extract totals for easier access
  const {
    equipmentSubmissions: equipmentSubmissionsCount,
    playerSubmissions: playerSubmissionsCount,
    playerEdits: playerEditsCount,
    equipmentReviews: equipmentReviewsCount,
    equipment: equipmentCount,
    players: playersCount,
  } = dashboardCounts.totals;

  // Extract status counts from the optimized query results
  const {
    equipmentSubmissions: equipmentSubmissionsByStatus,
    playerSubmissions: playerSubmissionsByStatus,
    playerEdits: playerEditsByStatus,
    equipmentReviews: equipmentReviewsByStatus,
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

  return data({
    stats: {
      equipmentSubmissions: equipmentSubmissionsCount || 0,
      playerSubmissions: playerSubmissionsCount || 0,
      playerEdits: playerEditsCount || 0,
      equipmentReviews: equipmentReviewsCount || 0,
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
      title: "Equipment Reviews",
      total: stats.equipmentReviews,
      pending: stats.equipmentReviewsPending,
      approved: stats.equipmentReviewsApproved,
      rejected: stats.equipmentReviewsRejected,
      link: "/admin/equipment-reviews",
      color: "bg-yellow-500",
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
          stats.playerEditsPending >
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
                    stats.playerEditsPending}{" "}
                  items waiting for review.
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Moderation Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
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

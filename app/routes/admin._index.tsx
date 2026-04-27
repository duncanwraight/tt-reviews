import type { Route } from "./+types/admin._index";
import { data, redirect } from "react-router";
import { createSupabaseAdminClient } from "~/lib/database.server";
import { getServerClient } from "~/lib/supabase.server";
import { getUserWithRole } from "~/lib/auth.server";
import { Logger, createLogContext } from "~/lib/logger.server";
import { AlertTriangle, Package, Users } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import {
  emptyDashboardCounts,
  getAdminDashboardCounts,
  type AdminDashboardCounts,
  type StatusCounts,
} from "~/lib/admin/dashboard.server";

const pendingTotal = (s: StatusCounts) =>
  s.pending + s.awaiting_second_approval;

async function loadDashboardCountsSafe(
  supabase: ReturnType<typeof createSupabaseAdminClient>
): Promise<AdminDashboardCounts> {
  try {
    return await getAdminDashboardCounts(supabase);
  } catch (error) {
    Logger.error(
      "Error fetching admin dashboard counts",
      createLogContext("admin-index"),
      error instanceof Error ? error : undefined
    );
    return emptyDashboardCounts();
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

  // Safe to use admin client (bypasses RLS) — user is verified admin above.
  const counts = await loadDashboardCountsSafe(supabase);
  const { totals, byStatus } = counts;

  return data({
    stats: {
      equipmentSubmissions: totals.equipmentSubmissions,
      playerSubmissions: totals.playerSubmissions,
      playerEdits: totals.playerEdits,
      equipmentReviews: totals.equipmentReviews,
      videoSubmissions: totals.videoSubmissions,
      playerEquipmentSetups: totals.playerEquipmentSetups,
      equipment: totals.equipment,
      players: totals.players,
      // Pending = pending + awaiting_second_approval (matches the badge convention).
      equipmentPending: pendingTotal(byStatus.equipmentSubmissions),
      equipmentApproved: byStatus.equipmentSubmissions.approved,
      equipmentRejected: byStatus.equipmentSubmissions.rejected,
      playerSubmissionsPending: pendingTotal(byStatus.playerSubmissions),
      playerSubmissionsApproved: byStatus.playerSubmissions.approved,
      playerSubmissionsRejected: byStatus.playerSubmissions.rejected,
      playerEditsPending: pendingTotal(byStatus.playerEdits),
      playerEditsApproved: byStatus.playerEdits.approved,
      playerEditsRejected: byStatus.playerEdits.rejected,
      equipmentReviewsPending: pendingTotal(byStatus.equipmentReviews),
      equipmentReviewsApproved: byStatus.equipmentReviews.approved,
      equipmentReviewsRejected: byStatus.equipmentReviews.rejected,
      videoSubmissionsPending: pendingTotal(byStatus.videoSubmissions),
      videoSubmissionsApproved: byStatus.videoSubmissions.approved,
      videoSubmissionsRejected: byStatus.videoSubmissions.rejected,
      playerEquipmentSetupsPending: pendingTotal(
        byStatus.playerEquipmentSetups
      ),
      playerEquipmentSetupsApproved: byStatus.playerEquipmentSetups.approved,
      playerEquipmentSetupsRejected: byStatus.playerEquipmentSetups.rejected,
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

  const contentStats: Array<{
    title: string;
    count: number;
    icon: LucideIcon;
    color: string;
  }> = [
    {
      title: "Total Equipment",
      count: stats.equipment,
      icon: Package,
      color: "bg-orange-100 text-orange-700",
    },
    {
      title: "Total Players",
      count: stats.players,
      icon: Users,
      color: "bg-indigo-100 text-indigo-700",
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
                <AlertTriangle className="size-5 text-yellow-600" aria-hidden />
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
                  <stat.icon className="size-6" aria-hidden />
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

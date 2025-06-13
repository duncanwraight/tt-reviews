import type { Route } from "./+types/admin._index";
import { data } from "react-router";
import { DatabaseService, createSupabaseAdminClient } from "~/lib/database.server";

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

  // Get counts for dashboard stats
  const [
    { count: equipmentSubmissionsCount },
    { count: playerSubmissionsCount },
    { count: playerEditsCount },
    { count: equipmentCount },
    { count: playersCount },
  ] = await Promise.all([
    supabase
      .from("equipment_submissions")
      .select("*", { count: "exact", head: true }),
    supabase
      .from("player_submissions")
      .select("*", { count: "exact", head: true }),
    supabase.from("player_edits").select("*", { count: "exact", head: true }),
    supabase.from("equipment").select("*", { count: "exact", head: true }),
    supabase.from("players").select("*", { count: "exact", head: true }),
  ]);

  // Get pending items counts
  const [
    { count: pendingEquipmentSubmissions },
    { count: pendingPlayerSubmissions },
    { count: pendingPlayerEdits },
  ] = await Promise.all([
    supabase
      .from("equipment_submissions")
      .select("*", { count: "exact", head: true })
      .eq("status", "pending"),
    supabase
      .from("player_submissions")
      .select("*", { count: "exact", head: true })
      .eq("status", "pending"),
    supabase
      .from("player_edits")
      .select("*", { count: "exact", head: true })
      .eq("status", "pending"),
  ]);

  return data({
    stats: {
      equipmentSubmissions: equipmentSubmissionsCount || 0,
      playerSubmissions: playerSubmissionsCount || 0,
      playerEdits: playerEditsCount || 0,
      equipment: equipmentCount || 0,
      players: playersCount || 0,
      pendingEquipmentSubmissions: pendingEquipmentSubmissions || 0,
      pendingPlayerSubmissions: pendingPlayerSubmissions || 0,
      pendingPlayerEdits: pendingPlayerEdits || 0,
    },
  });
}

export default function AdminDashboard({ loaderData }: Route.ComponentProps) {
  const { stats } = loaderData;

  const statCards = [
    {
      title: "Equipment Submissions",
      total: stats.equipmentSubmissions,
      pending: stats.pendingEquipmentSubmissions,
      link: "/admin/equipment-submissions",
      color: "bg-blue-500",
    },
    {
      title: "Player Submissions",
      total: stats.playerSubmissions,
      pending: stats.pendingPlayerSubmissions,
      link: "/admin/player-submissions",
      color: "bg-green-500",
    },
    {
      title: "Player Edits",
      total: stats.playerEdits,
      pending: stats.pendingPlayerEdits,
      link: "/admin/player-edits",
      color: "bg-purple-500",
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
        {stats.pendingEquipmentSubmissions +
          stats.pendingPlayerSubmissions +
          stats.pendingPlayerEdits >
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
                  {stats.pendingEquipmentSubmissions +
                    stats.pendingPlayerSubmissions +
                    stats.pendingPlayerEdits}{" "}
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
              <div className="flex items-center">
                <div className={`${card.color} rounded-lg p-3 mr-4`}>
                  <div className="text-white text-xl font-semibold">
                    {card.pending}
                  </div>
                </div>
                <div className="flex-1">
                  <h3 className="text-sm font-medium text-gray-600">
                    {card.title}
                  </h3>
                  <div className="flex items-center mt-1">
                    <span className="text-2xl font-semibold text-gray-900">
                      {card.total}
                    </span>
                    <span className="text-sm text-gray-500 ml-2">total</span>
                  </div>
                </div>
              </div>
              <div className="mt-4">
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

      {/* Quick Actions */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">
          Quick Actions
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <a
            href="/admin/equipment-submissions"
            className="flex items-center justify-center px-4 py-3 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
          >
            Review Equipment
          </a>
          <a
            href="/admin/player-submissions"
            className="flex items-center justify-center px-4 py-3 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
          >
            Review Players
          </a>
          <a
            href="/admin/player-edits"
            className="flex items-center justify-center px-4 py-3 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
          >
            Review Edits
          </a>
          <a
            href="/players"
            className="flex items-center justify-center px-4 py-3 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
          >
            View Site
          </a>
        </div>
      </div>
    </div>
  );
}

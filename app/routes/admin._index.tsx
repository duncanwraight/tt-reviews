import type { Route } from "./+types/admin._index";
import { data, redirect, useFetcher } from "react-router";
import { createSupabaseAdminClient } from "~/lib/database.server";
import { getServerClient } from "~/lib/supabase.server";
import { getUserWithRole } from "~/lib/auth.server";
import { issueCSRFToken } from "~/lib/security.server";
import { Logger, createLogContext } from "~/lib/logger.server";
import { AlertTriangle, ArrowRight, Package, Users } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Link } from "react-router";
import {
  emptyDashboardCounts,
  getAdminDashboardCounts,
  type AdminDashboardCounts,
  type StatusCounts,
} from "~/lib/admin/dashboard.server";
import {
  findOldestPendingTarget,
  type OldestPendingTarget,
} from "~/lib/admin/oldest-pending.server";
import {
  getRecentAdminActivity,
  type AdminActivityEntry,
} from "~/lib/admin/activity.server";
import { AdminActivityWidget } from "~/components/admin/AdminActivityWidget";
import { EquipmentPhotoCoverageCard } from "~/components/admin/EquipmentPhotoCoverageCard";
import { getEquipmentSimilarStatus } from "~/lib/database/equipment";
import { formatRelativeTime } from "~/lib/date";
import {
  loadCoverageCounts,
  type CoverageCounts,
} from "~/lib/photo-sourcing/queue-stats.server";

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
  const csrfToken = await issueCSRFToken(request, context, user.id);

  // Safe to use admin client (bypasses RLS) — user is verified admin above.
  const [counts, nextPending, recentActivity, similarStatus, photoCoverage] =
    await Promise.all([
      loadDashboardCountsSafe(supabase),
      findOldestPendingTarget(supabase).catch(error => {
        Logger.error(
          "Error finding oldest pending submission",
          createLogContext("admin-index"),
          error instanceof Error ? error : undefined
        );
        return null as OldestPendingTarget | null;
      }),
      getRecentAdminActivity(supabase).catch(error => {
        Logger.error(
          "Error fetching recent admin activity",
          createLogContext("admin-index"),
          error instanceof Error ? error : undefined
        );
        return [] as AdminActivityEntry[];
      }),
      getEquipmentSimilarStatus({
        supabase,
        context: createLogContext("admin-index"),
      }),
      loadCoverageCounts(supabase).catch(error => {
        Logger.error(
          "Error loading equipment photo coverage",
          createLogContext("admin-index"),
          error instanceof Error ? error : undefined
        );
        return null as CoverageCounts | null;
      }),
    ]);
  const { totals, byStatus } = counts;

  return data({
    csrfToken,
    nextPending,
    recentActivity,
    similarStatus,
    photoCoverage,
    stats: {
      equipmentSubmissions: totals.equipmentSubmissions,
      equipmentEdits: totals.equipmentEdits,
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
      equipmentEditsPending: pendingTotal(byStatus.equipmentEdits),
      equipmentEditsApproved: byStatus.equipmentEdits.approved,
      equipmentEditsRejected: byStatus.equipmentEdits.rejected,
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
  const {
    stats,
    nextPending,
    recentActivity,
    csrfToken,
    similarStatus,
    photoCoverage,
  } = loaderData;

  const queueRows = [
    {
      title: "Equipment Submissions",
      total: stats.equipmentSubmissions,
      pending: stats.equipmentPending,
      approved: stats.equipmentApproved,
      rejected: stats.equipmentRejected,
      link: "/admin/equipment-submissions",
    },
    {
      title: "Equipment Edits",
      total: stats.equipmentEdits,
      pending: stats.equipmentEditsPending,
      approved: stats.equipmentEditsApproved,
      rejected: stats.equipmentEditsRejected,
      link: "/admin/equipment-edits",
    },
    {
      title: "Player Submissions",
      total: stats.playerSubmissions,
      pending: stats.playerSubmissionsPending,
      approved: stats.playerSubmissionsApproved,
      rejected: stats.playerSubmissionsRejected,
      link: "/admin/player-submissions",
    },
    {
      title: "Player Edits",
      total: stats.playerEdits,
      pending: stats.playerEditsPending,
      approved: stats.playerEditsApproved,
      rejected: stats.playerEditsRejected,
      link: "/admin/player-edits",
    },
    {
      title: "Equipment Setups",
      total: stats.playerEquipmentSetups,
      pending: stats.playerEquipmentSetupsPending,
      approved: stats.playerEquipmentSetupsApproved,
      rejected: stats.playerEquipmentSetupsRejected,
      link: "/admin/player-equipment-setups",
    },
    {
      title: "Equipment Reviews",
      total: stats.equipmentReviews,
      pending: stats.equipmentReviewsPending,
      approved: stats.equipmentReviewsApproved,
      rejected: stats.equipmentReviewsRejected,
      link: "/admin/equipment-reviews",
    },
    {
      title: "Video Submissions",
      total: stats.videoSubmissions,
      pending: stats.videoSubmissionsPending,
      approved: stats.videoSubmissionsApproved,
      rejected: stats.videoSubmissionsRejected,
      link: "/admin/video-submissions",
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
          stats.equipmentEditsPending +
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
                    stats.equipmentEditsPending +
                    stats.playerSubmissionsPending +
                    stats.playerEditsPending +
                    stats.playerEquipmentSetupsPending +
                    stats.videoSubmissionsPending}{" "}
                  items waiting for review.
                </div>
                {nextPending && (
                  <div className="mt-3">
                    <Link
                      to={nextPending.route}
                      className="inline-flex items-center gap-1 px-3 py-1.5 bg-yellow-600 text-white text-sm font-medium rounded-md hover:bg-yellow-700"
                    >
                      Open next pending
                      <ArrowRight className="size-4" aria-hidden />
                    </Link>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Moderation Stats */}
        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white shadow mb-8">
          <table
            className="min-w-full divide-y divide-gray-200 text-sm"
            data-testid="admin-stats-table"
          >
            <thead className="bg-gray-50">
              <tr>
                <th
                  scope="col"
                  className="px-4 py-3 text-left font-medium text-gray-700"
                >
                  Queue
                </th>
                <th
                  scope="col"
                  className="px-4 py-3 text-right font-medium text-gray-700"
                >
                  Pending
                </th>
                <th
                  scope="col"
                  className="px-4 py-3 text-right font-medium text-gray-700"
                >
                  Approved
                </th>
                <th
                  scope="col"
                  className="px-4 py-3 text-right font-medium text-gray-700"
                >
                  Rejected
                </th>
                <th
                  scope="col"
                  className="px-4 py-3 text-right font-medium text-gray-700"
                >
                  Total
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {queueRows.map(row => (
                <tr key={row.link}>
                  <th
                    scope="row"
                    className="whitespace-nowrap px-4 py-3 text-left font-medium"
                  >
                    <Link
                      to={row.link}
                      className="text-purple-700 hover:text-purple-900"
                    >
                      {row.title}
                    </Link>
                  </th>
                  <td className="px-4 py-3 text-right font-medium text-yellow-700 tabular-nums">
                    {row.pending}
                  </td>
                  <td className="px-4 py-3 text-right font-medium text-green-700 tabular-nums">
                    {row.approved}
                  </td>
                  <td className="px-4 py-3 text-right font-medium text-red-700 tabular-nums">
                    {row.rejected}
                  </td>
                  <td className="px-4 py-3 text-right font-semibold text-gray-900 tabular-nums">
                    {row.total}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Content Stats + Photo Coverage + Recent Activity */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
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

          {photoCoverage && (
            <EquipmentPhotoCoverageCard counts={photoCoverage} />
          )}

          <AdminActivityWidget entries={recentActivity} />
        </div>

        <RecomputeSimilarSection
          csrfToken={csrfToken}
          initialStatus={similarStatus}
        />
      </div>
    </div>
  );
}

interface RecomputeSimilarSectionProps {
  csrfToken: string;
  initialStatus: { lastRun: string | null; pairCount: number };
}

function RecomputeSimilarSection({
  csrfToken,
  initialStatus,
}: RecomputeSimilarSectionProps) {
  const fetcher = useFetcher<
    | {
        success: true;
        equipmentProcessed: number;
        pairsWritten: number;
        durationMs: number;
        runStart: string;
      }
    | { success: false; error: string }
  >();
  const isSubmitting = fetcher.state !== "idle";
  const result = fetcher.data;

  // After a manual recompute completes, the action result becomes the source
  // of truth without needing a page reload. Loader value is the fallback.
  const status =
    result && result.success
      ? { lastRun: result.runStart, pairCount: result.pairsWritten }
      : initialStatus;

  return (
    <div className="bg-white rounded-lg shadow p-6 mt-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-2">
        Similar equipment recompute
      </h3>
      <p className="text-sm text-gray-600 mb-4">
        Rebuild the precomputed similarity table. The daily 03:00 UTC cron does
        this automatically — use this button after a fresh deploy or to debug.
      </p>

      <p
        className="text-sm text-gray-700 mb-4"
        data-testid="recompute-similar-status"
      >
        {status.lastRun ? (
          <>
            Last run:{" "}
            <span data-testid="recompute-similar-last-run">
              {formatRelativeTime(status.lastRun)}
            </span>
            {" — "}
            <span data-testid="recompute-similar-pair-count">
              {status.pairCount.toLocaleString()}
            </span>{" "}
            pairs stored.
          </>
        ) : (
          <span data-testid="recompute-similar-never-run">
            Never run — use the button below to populate the similarity table.
          </span>
        )}
      </p>

      <fetcher.Form method="post" action="/admin/recompute-similar">
        <input type="hidden" name="_csrf" value={csrfToken} />
        <button
          type="submit"
          disabled={isSubmitting}
          data-testid="recompute-similar-button"
          className="inline-flex items-center gap-2 px-4 py-2 bg-purple-600 text-white text-sm font-medium rounded-md hover:bg-purple-700 disabled:opacity-50"
        >
          {isSubmitting ? "Recomputing…" : "Recompute now"}
        </button>
      </fetcher.Form>

      {result && result.success && (
        <p
          className="mt-3 text-sm text-green-700"
          data-testid="recompute-similar-success"
        >
          Recomputed {result.pairsWritten} pairs across{" "}
          {result.equipmentProcessed} items in {result.durationMs}ms.
        </p>
      )}
      {result && !result.success && (
        <p
          className="mt-3 text-sm text-red-700"
          data-testid="recompute-similar-error"
        >
          {result.error}
        </p>
      )}
    </div>
  );
}

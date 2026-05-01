import type { Route } from "./+types/admin.video-submissions";
import {
  data,
  redirect,
  Form,
  useSearchParams,
  useNavigation,
} from "react-router";
import { sortPendingByFocus } from "~/lib/admin/queue-focus";
import { createModerationService } from "~/lib/moderation.server";
import { RejectionModal } from "~/components/ui/RejectionModal";
import { useState } from "react";
import type { RejectionCategory } from "~/lib/types";
import { sanitizeAdminContent } from "~/lib/sanitize";
import { formatDate } from "~/lib/date";
import {
  CheckCircle2,
  XCircle,
  Clock,
  ListChecks,
  Film,
  CirclePlay,
  Video,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Logger, createLogContext } from "~/lib/logger.server";
import {
  ensureAdminAction,
  ensureAdminLoader,
} from "~/lib/admin/middleware.server";
import { applyVideoSubmission } from "~/lib/admin/video-submission-applier.server";
import {
  loadApprovalsForSubmissions,
  loadPendingQueue,
} from "~/lib/admin/queue.server";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Video Submissions | Admin | TT Reviews" },
    {
      name: "description",
      content: "Review and moderate video submissions.",
    },
  ];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
interface VideoSubmissionRow extends Record<string, any> {
  id: string;
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const gate = await ensureAdminLoader(request, context);
  if (gate instanceof Response) return gate;
  const { sbServerClient, user, supabaseAdmin, csrfToken } = gate;

  const { data: submissions, error } =
    await loadPendingQueue<VideoSubmissionRow>(
      supabaseAdmin,
      "video_submissions",
      { select: "*, players!inner(name, slug)" }
    );

  if (error) {
    Logger.error(
      "Video submissions error",
      createLogContext("admin-video-submissions", {
        route: "/admin/video-submissions",
        method: "GET",
        userId: user.id,
      }),
      error instanceof Error ? error : undefined
    );
    return data(
      { submissions: [], user, csrfToken },
      { headers: sbServerClient.headers }
    );
  }

  if (submissions && submissions.length > 0) {
    const approvalsById = await loadApprovalsForSubmissions(
      supabaseAdmin,
      "video",
      submissions.map(s => s.id)
    );
    submissions.forEach(submission => {
      submission.moderator_approvals = approvalsById[submission.id] || [];
    });
  }

  return data(
    { submissions: submissions || [], user, csrfToken },
    { headers: sbServerClient.headers }
  );
}

export async function action({ request, context }: Route.ActionArgs) {
  try {
    const gate = await ensureAdminAction(request, context);
    if (gate instanceof Response) return gate;
    const { sbServerClient, user, supabaseAdmin: supabase } = gate;

    const formData = await request.formData();
    const submissionId = formData.get("submissionId") as string;
    const actionType = formData.get("action") as string;
    const moderatorNotes = (formData.get("notes") as string) || undefined;
    const rejectionCategory = formData.get(
      "category"
    ) as RejectionCategory | null;
    const rawRejectionReason = formData.get("reason") as string | null;

    // Sanitize rejection reason to prevent XSS attacks
    const rejectionReason = rawRejectionReason
      ? sanitizeAdminContent(rawRejectionReason.trim())
      : null;

    if (!submissionId || !actionType) {
      return data(
        { error: "Missing required fields" },
        { status: 400, headers: sbServerClient.headers }
      );
    }

    const moderationService = createModerationService(supabase);

    let result;
    if (actionType === "approved") {
      result = await moderationService.recordApproval(
        "video",
        submissionId,
        user.id,
        "admin_ui",
        moderatorNotes
      );

      // If this approval results in full approval, create the
      // player_footage rows. TT-116: this apply step never existed in
      // the route before — admin-approved video submissions were
      // silently dropped along with Discord-approved ones. Same helper
      // is invoked from the Discord engine on a 2× moderator approval
      // flip — see app/lib/discord/moderation-appliers.ts.
      if (result.success && result.newStatus === "approved") {
        const applyResult = await applyVideoSubmission(supabase, submissionId);
        if (!applyResult.success) {
          Logger.error(
            "Failed to apply video submission",
            createLogContext("admin-video-submissions", {
              route: "/admin/video-submissions",
              method: request.method,
              userId: user.id,
              submissionId,
            }),
            new Error(applyResult.error || "unknown")
          );
          return data(
            {
              error: `Approved but failed to publish videos: ${applyResult.error || "unknown error"}`,
            },
            { status: 500, headers: sbServerClient.headers }
          );
        }
      }
    } else if (actionType === "rejected") {
      if (!rejectionCategory || !rejectionReason) {
        return data(
          { error: "Rejection requires category and reason" },
          { status: 400, headers: sbServerClient.headers }
        );
      }

      result = await moderationService.recordRejection(
        "video",
        submissionId,
        user.id,
        "admin_ui",
        { category: rejectionCategory, reason: rejectionReason },
        context.cloudflare?.env?.R2_BUCKET
      );
    } else {
      return data(
        { error: "Invalid action" },
        { status: 400, headers: sbServerClient.headers }
      );
    }

    if (!result.success) {
      return data(
        { error: result.error || "Operation failed" },
        { status: 500, headers: sbServerClient.headers }
      );
    }

    return redirect("/admin/video-submissions", {
      headers: sbServerClient.headers,
    });
  } catch (error) {
    Logger.error(
      "Admin video action error",
      createLogContext("admin-video-submissions", {
        route: "/admin/video-submissions",
        method: request.method,
      }),
      error instanceof Error ? error : undefined
    );
    return data({ error: "Internal server error" }, { status: 500 });
  }
}

export default function AdminVideoSubmissions({
  loaderData,
}: Route.ComponentProps) {
  const { submissions, user, csrfToken } = loaderData;
  const [rejectionModal, setRejectionModal] = useState<{
    isOpen: boolean;
    submissionId: string;
    submissionName: string;
  }>({ isOpen: false, submissionId: "", submissionName: "" });

  const [searchParams] = useSearchParams();
  const navigation = useNavigation();
  const isSubmitting = navigation.state !== "idle";
  // Group submissions by status; pending list re-sorts oldest-first when the
  // dashboard's "Open next pending" quick-action set focus=oldest.
  const pendingSubmissions = sortPendingByFocus(
    submissions.filter(
      s => s.status === "pending" || s.status === "awaiting_second_approval"
    ),
    searchParams
  );
  const processedSubmissions = submissions.filter(
    s => s.status === "approved" || s.status === "rejected"
  );

  const getStatusBadge = (status: string, approvalCount?: number) => {
    const baseClasses =
      "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium";
    switch (status) {
      case "pending":
        const pendingText = approvalCount
          ? `${approvalCount}/2 approvals`
          : "pending";
        return {
          classes: `${baseClasses} bg-yellow-100 text-yellow-800`,
          text: pendingText,
        };
      case "awaiting_second_approval":
        return {
          classes: `${baseClasses} bg-blue-100 text-blue-800`,
          text: "1/2 approvals",
        };
      case "approved":
        return {
          classes: `${baseClasses} bg-green-100 text-green-800`,
          text: "approved",
        };
      case "rejected":
        return {
          classes: `${baseClasses} bg-red-100 text-red-800`,
          text: "rejected",
        };
      default:
        return {
          classes: `${baseClasses} bg-gray-100 text-gray-800`,
          text: status,
        };
    }
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const getApprovalCount = (submission: any) => {
    if (!submission.moderator_approvals) return 0;
    return submission.moderator_approvals.filter(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (a: any) => a.action === "approved"
    ).length;
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const canApprove = (submission: any) => {
    if (submission.status === "approved" || submission.status === "rejected")
      return false;
    const approvals = submission.moderator_approvals || [];
    const userApproval = approvals.find(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (a: any) => a.moderator_id === user.id && a.action === "approved"
    );
    return !userApproval;
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const canReject = (submission: any) => {
    return submission.status !== "approved" && submission.status !== "rejected";
  };

  const getPlatformIcon = (platform: string): LucideIcon => {
    switch (platform) {
      case "youtube":
        return CirclePlay;
      case "other":
        return Video;
      default:
        return Film;
    }
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const renderSubmissionItem = (submission: any) => (
    <li key={submission.id}>
      <div className="px-4 py-4 sm:px-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Film className="size-6 text-gray-500" aria-hidden />
            <div>
              <p className="text-sm font-medium text-gray-900">
                Videos for {submission.players.name}
              </p>
              <p className="text-sm text-gray-500">
                {submission.videos && Array.isArray(submission.videos)
                  ? `${submission.videos.length} video${submission.videos.length !== 1 ? "s" : ""}`
                  : "No videos"}
              </p>
            </div>
          </div>
          <div className="flex items-center space-x-3">
            {(() => {
              const badge = getStatusBadge(
                submission.status,
                getApprovalCount(submission)
              );
              return <span className={badge.classes}>{badge.text}</span>;
            })()}
            <div className="text-sm text-gray-500">
              {formatDate(submission.created_at)}
            </div>
          </div>
        </div>

        {/* Video List */}
        {submission.videos &&
          Array.isArray(submission.videos) &&
          submission.videos.length > 0 && (
            <div className="mt-3 bg-gray-50 rounded-lg p-3">
              <h4 className="text-sm font-medium text-gray-900 mb-2">
                Videos:
              </h4>
              <div className="space-y-2">
                {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                {submission.videos.map((video: any, index: number) => {
                  const PlatformIcon = getPlatformIcon(video.platform);
                  return (
                    <div
                      key={index}
                      className="flex items-start space-x-3 p-2 bg-white rounded border"
                    >
                      <PlatformIcon
                        className="size-5 text-gray-500 shrink-0 mt-0.5"
                        aria-hidden
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">
                          {video.title}
                        </p>
                        <a
                          href={video.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm text-blue-600 hover:text-blue-800 truncate block"
                        >
                          {video.url}
                        </a>
                        <p className="text-xs text-gray-500 capitalize">
                          Platform: {video.platform}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

        {submission.moderator_notes && (
          <div className="mt-2 text-sm">
            <strong className="text-gray-700">Moderator Notes:</strong>
            <p className="text-gray-600 mt-1">{submission.moderator_notes}</p>
          </div>
        )}

        {/* Show rejection details for rejected submissions */}
        {submission.status === "rejected" &&
          (submission.rejection_reason || submission.rejection_category) && (
            <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-md">
              <div className="flex items-start">
                <div className="flex-shrink-0">
                  <svg
                    className="h-5 w-5 text-red-400"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                  >
                    <path
                      fillRule="evenodd"
                      d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                      clipRule="evenodd"
                    />
                  </svg>
                </div>
                <div className="ml-3">
                  <h5 className="text-sm font-medium text-red-800">
                    Rejected
                    {submission.rejection_category && (
                      <span className="ml-2 text-xs font-normal">
                        ({submission.rejection_category.replace(/_/g, " ")})
                      </span>
                    )}
                  </h5>
                  {submission.rejection_reason && (
                    <p className="text-sm text-red-700 mt-1">
                      {submission.rejection_reason}
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

        {/* Approval History */}
        {submission.moderator_approvals &&
          submission.moderator_approvals.length > 0 && (
            <div className="mt-3 bg-gray-50 rounded-lg p-3">
              <h4 className="text-sm font-medium text-gray-900 mb-2">
                Approval History:
              </h4>
              <div className="space-y-1">
                {submission.moderator_approvals.map(
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  (approval: any, index: number) => (
                    <div key={index} className="text-sm flex justify-between">
                      <span
                        className={`font-medium ${
                          approval.action === "approved"
                            ? "text-green-700"
                            : "text-red-700"
                        }`}
                      >
                        {approval.action} by {approval.source}
                      </span>
                      <span className="text-gray-500">
                        {formatDate(approval.created_at)}
                      </span>
                    </div>
                  )
                )}
              </div>
            </div>
          )}

        {/* Action buttons only for pending submissions */}
        {(submission.status === "pending" ||
          submission.status === "awaiting_second_approval") && (
          <div className="mt-3 flex items-center space-x-3">
            {canApprove(submission) && (
              <Form method="post" className="inline">
                <input type="hidden" name="_csrf" value={csrfToken} />
                <input
                  type="hidden"
                  name="submissionId"
                  value={submission.id}
                />
                <input type="hidden" name="action" value="approved" />
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="inline-flex items-center px-3 py-2 border border-transparent text-sm leading-4 font-medium rounded-md text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Approve
                </button>
              </Form>
            )}
            {canReject(submission) && (
              <button
                onClick={() =>
                  setRejectionModal({
                    isOpen: true,
                    submissionId: submission.id,
                    submissionName: `Videos for ${submission.players.name}`,
                  })
                }
                disabled={isSubmitting}
                className="inline-flex items-center px-3 py-2 border border-transparent text-sm leading-4 font-medium rounded-md text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Reject
              </button>
            )}
          </div>
        )}
      </div>
    </li>
  );

  return (
    <div className="space-y-6">
      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <Clock className="size-6 text-yellow-600" aria-hidden />
            </div>
            <div className="ml-3">
              <p className="text-sm font-medium text-yellow-800">
                Pending Review
              </p>
              <p className="text-2xl font-bold text-yellow-900">
                {pendingSubmissions.length}
              </p>
            </div>
          </div>
        </div>
        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <CheckCircle2 className="size-6 text-green-600" aria-hidden />
            </div>
            <div className="ml-3">
              <p className="text-sm font-medium text-green-800">Approved</p>
              <p className="text-2xl font-bold text-green-900">
                {
                  processedSubmissions.filter(s => s.status === "approved")
                    .length
                }
              </p>
            </div>
          </div>
        </div>
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <XCircle className="size-6 text-red-600" aria-hidden />
            </div>
            <div className="ml-3">
              <p className="text-sm font-medium text-red-800">Rejected</p>
              <p className="text-2xl font-bold text-red-900">
                {
                  processedSubmissions.filter(s => s.status === "rejected")
                    .length
                }
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-gray-900">Video Submissions</h2>
        <div className="text-sm text-gray-600">
          {submissions.length} total submissions
        </div>
      </div>

      {submissions.length === 0 ? (
        <div className="text-center py-12">
          <Film
            className="size-16 text-gray-300 mx-auto mb-4"
            aria-hidden
            strokeWidth={1.5}
          />
          <h3 className="text-xl font-semibold text-gray-900 mb-2">
            No submissions found
          </h3>
          <p className="text-gray-600">
            No video submissions to review at this time.
          </p>
        </div>
      ) : (
        <div className="space-y-8">
          {/* Pending Submissions Section */}
          {pendingSubmissions.length > 0 && (
            <div>
              <div className="mb-4">
                <h3 className="text-xl font-semibold text-gray-900 flex items-center gap-2">
                  <Clock className="size-5 text-yellow-600" aria-hidden />
                  Pending Review ({pendingSubmissions.length})
                </h3>
                <p className="text-sm text-gray-600 mt-1">
                  Video submissions that need moderator approval
                </p>
              </div>
              <div className="bg-white shadow overflow-hidden rounded-md border-l-4 border-yellow-400">
                <ul className="divide-y divide-gray-200">
                  {pendingSubmissions.map(renderSubmissionItem)}
                </ul>
              </div>
            </div>
          )}

          {/* Processed Submissions Section */}
          {processedSubmissions.length > 0 && (
            <div>
              <div className="mb-4">
                <h3 className="text-xl font-semibold text-gray-900 flex items-center gap-2">
                  <ListChecks className="size-5 text-gray-600" aria-hidden />
                  Recently Processed ({processedSubmissions.length})
                </h3>
                <p className="text-sm text-gray-600 mt-1">
                  Video submissions that have been approved or rejected
                </p>
              </div>
              <div className="bg-white shadow overflow-hidden rounded-md">
                <ul className="divide-y divide-gray-200">
                  {processedSubmissions.map(renderSubmissionItem)}
                </ul>
              </div>
            </div>
          )}
        </div>
      )}

      <RejectionModal
        isOpen={rejectionModal.isOpen}
        onClose={() =>
          setRejectionModal({
            isOpen: false,
            submissionId: "",
            submissionName: "",
          })
        }
        submissionId={rejectionModal.submissionId}
        submissionType="video"
        submissionName={rejectionModal.submissionName}
        csrfToken={csrfToken}
      />
    </div>
  );
}

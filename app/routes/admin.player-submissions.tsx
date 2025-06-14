import type { Route } from "./+types/admin.player-submissions";
import { data, redirect, Form } from "react-router";
import { createSupabaseAdminClient } from "~/lib/database.server";
import { getServerClient } from "~/lib/supabase.server";
import { getUserWithRole } from "~/lib/auth.server";
import { createModerationService } from "~/lib/moderation.server";
import { RejectionModal } from "~/components/ui/RejectionModal";
import { useState } from "react";
import type { RejectionCategory } from "~/lib/types";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Player Submissions | Admin | TT Reviews" },
    { name: "description", content: "Review and moderate player submissions." },
  ];
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const sbServerClient = getServerClient(request, context);
  const user = await getUserWithRole(sbServerClient, context);

  // Check admin access
  if (!user || user.role !== "admin") {
    throw redirect("/", { headers: sbServerClient.headers });
  }

  const supabase = createSupabaseAdminClient(context);

  // Get all submissions first
  const { data: submissions, error } = await supabase
    .from("player_submissions")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(50);

  // Then get approvals for each submission manually
  if (submissions && submissions.length > 0) {
    const submissionIds = submissions.map(s => s.id);
    const { data: approvals } = await supabase
      .from("moderator_approvals")
      .select("*")
      .eq("submission_type", "player")
      .in("submission_id", submissionIds);

    // Group approvals by submission_id
    const approvalsBySubmission = (approvals || []).reduce((acc, approval) => {
      if (!acc[approval.submission_id]) {
        acc[approval.submission_id] = [];
      }
      acc[approval.submission_id].push(approval);
      return acc;
    }, {} as Record<string, any[]>);

    // Add approvals to each submission
    submissions.forEach(submission => {
      submission.moderator_approvals = approvalsBySubmission[submission.id] || [];
    });
  }

  if (error) {
    console.error("Error fetching player submissions:", error);
    return data({ submissions: [], user }, { headers: sbServerClient.headers });
  }

  return data({ submissions: submissions || [], user }, { headers: sbServerClient.headers });
}

export async function action({ request, context }: Route.ActionArgs) {
  const sbServerClient = getServerClient(request, context);
  const user = await getUserWithRole(sbServerClient, context);

  // Check admin access
  if (!user || user.role !== "admin") {
    throw redirect("/", { headers: sbServerClient.headers });
  }

  const formData = await request.formData();
  const submissionId = formData.get("submissionId") as string;
  const actionType = formData.get("action") as string;
  const moderatorNotes = formData.get("notes") as string || undefined;
  const rejectionCategory = formData.get("category") as RejectionCategory | null;
  const rejectionReason = formData.get("reason") as string | null;

  if (!submissionId || !actionType) {
    return data({ error: "Missing required fields" }, { status: 400, headers: sbServerClient.headers });
  }

  const supabase = createSupabaseAdminClient(context);
  const moderationService = createModerationService(supabase);

  let result;
  if (actionType === "approved") {
    result = await moderationService.recordApproval(
      "player",
      submissionId,
      user.id,
      "admin_ui",
      moderatorNotes
    );
    
    // If this approval results in full approval, create the player record
    if (result.success && result.newStatus === "approved") {
      const { data: submission } = await supabase
        .from("player_submissions")
        .select("*")
        .eq("id", submissionId)
        .single();

      if (submission) {
        const slug = submission.name
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/(^-|-$)/g, '');

        await supabase
          .from("players")
          .insert({
            name: submission.name,
            slug: slug,
            highest_rating: submission.highest_rating,
            active_years: submission.active_years,
            playing_style: submission.playing_style,
            birth_country: submission.birth_country,
            represents: submission.represents,
            active: true,
          });
      }
    }
  } else if (actionType === "rejected") {
    if (!rejectionCategory || !rejectionReason) {
      return data({ error: "Rejection requires category and reason" }, { status: 400, headers: sbServerClient.headers });
    }
    
    result = await moderationService.recordRejection(
      "player",
      submissionId,
      user.id,
      "admin_ui",
      { category: rejectionCategory, reason: rejectionReason },
      context.cloudflare?.env?.R2_BUCKET
    );
  } else {
    return data({ error: "Invalid action" }, { status: 400, headers: sbServerClient.headers });
  }

  if (!result.success) {
    return data({ error: result.error || "Operation failed" }, { status: 500, headers: sbServerClient.headers });
  }

  return redirect("/admin/player-submissions", { headers: sbServerClient.headers });
}

export default function AdminPlayerSubmissions({
  loaderData,
}: Route.ComponentProps) {
  const { submissions, user } = loaderData;
  const [rejectionModal, setRejectionModal] = useState<{
    isOpen: boolean;
    submissionId: string;
    submissionName: string;
  }>({ isOpen: false, submissionId: "", submissionName: "" });

  // Group submissions by status
  const pendingSubmissions = submissions.filter(s => 
    s.status === "pending" || s.status === "awaiting_second_approval"
  );
  const processedSubmissions = submissions.filter(s => 
    s.status === "approved" || s.status === "rejected"
  );

  const getStatusBadge = (status: string, approvalCount?: number) => {
    const baseClasses =
      "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium";
    switch (status) {
      case "pending":
        const pendingText = approvalCount ? `${approvalCount}/2 approvals` : "pending";
        return { classes: `${baseClasses} bg-yellow-100 text-yellow-800`, text: pendingText };
      case "awaiting_second_approval":
        return { classes: `${baseClasses} bg-blue-100 text-blue-800`, text: "1/2 approvals" };
      case "approved":
        return { classes: `${baseClasses} bg-green-100 text-green-800`, text: "approved" };
      case "rejected":
        return { classes: `${baseClasses} bg-red-100 text-red-800`, text: "rejected" };
      default:
        return { classes: `${baseClasses} bg-gray-100 text-gray-800`, text: status };
    }
  };

  const getApprovalCount = (submission: any) => {
    if (!submission.moderator_approvals) return 0;
    return submission.moderator_approvals.filter((a: any) => a.action === "approved").length;
  };

  const canApprove = (submission: any) => {
    if (submission.status === "approved" || submission.status === "rejected") return false;
    const approvals = submission.moderator_approvals || [];
    const userApproval = approvals.find((a: any) => a.moderator_id === user.id && a.action === "approved");
    return !userApproval;
  };

  const canReject = (submission: any) => {
    return submission.status !== "approved" && submission.status !== "rejected";
  };

  const getPlayingStyleLabel = (style: string | undefined): string => {
    if (!style || style === "unknown") return "";
    return style.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());
  };

  const renderSubmissionItem = (submission: any) => (
    <li key={submission.id}>
      <div className="px-4 py-4 sm:px-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center">
            <span className="text-2xl mr-3">👤</span>
            <div>
              <p className="text-sm font-medium text-gray-900">
                {submission.name}
              </p>
              <p className="text-sm text-gray-500">
                {submission.playing_style &&
                  getPlayingStyleLabel(submission.playing_style)}
                {submission.represents &&
                  ` • Represents: ${submission.represents}`}
                {submission.birth_country &&
                  ` • Born: ${submission.birth_country}`}
              </p>
            </div>
          </div>
          <div className="flex items-center space-x-3">
            {(() => {
              const badge = getStatusBadge(submission.status, getApprovalCount(submission));
              return (
                <span className={badge.classes}>
                  {badge.text}
                </span>
              );
            })()}
            <div className="text-sm text-gray-500">
              {new Date(submission.created_at).toLocaleDateString()}
            </div>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
          {submission.highest_rating && (
            <div>
              <span className="font-medium text-gray-700">
                Highest Rating:
              </span>
              <span className="ml-2 text-gray-900">
                {submission.highest_rating}
              </span>
            </div>
          )}
          {submission.active_years && (
            <div>
              <span className="font-medium text-gray-700">
                Active Years:
              </span>
              <span className="ml-2 text-gray-900">
                {submission.active_years}
              </span>
            </div>
          )}
          {submission.playing_style && (
            <div>
              <span className="font-medium text-gray-700">
                Playing Style:
              </span>
              <span className="ml-2 text-gray-900">
                {getPlayingStyleLabel(submission.playing_style)}
              </span>
            </div>
          )}
        </div>

        {submission.equipment_setup &&
          Object.keys(submission.equipment_setup).length > 0 && (
            <div className="mt-3 bg-gray-50 rounded-lg p-3">
              <h4 className="text-sm font-medium text-gray-900 mb-2">
                Equipment Setup:
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
                {Object.entries(submission.equipment_setup).map(
                  ([key, value]) => (
                    <div key={key}>
                      <span className="font-medium text-gray-700">
                        {key
                          .replace(/_/g, " ")
                          .replace(/\b\w/g, (l) => l.toUpperCase())}
                        :
                      </span>
                      <span className="ml-2 text-gray-900">
                        {String(value)}
                      </span>
                    </div>
                  )
                )}
              </div>
            </div>
          )}

        {submission.moderator_notes && (
          <div className="mt-2 text-sm">
            <strong className="text-gray-700">
              Moderator Notes:
            </strong>
            <p className="text-gray-600 mt-1">
              {submission.moderator_notes}
            </p>
          </div>
        )}

        {/* Show rejection details for rejected submissions */}
        {submission.status === "rejected" && (submission.rejection_reason || submission.rejection_category) && (
          <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-md">
            <div className="flex items-start">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="ml-3">
                <h5 className="text-sm font-medium text-red-800">
                  Rejected
                  {submission.rejection_category && (
                    <span className="ml-2 text-xs font-normal">
                      ({submission.rejection_category.replace(/_/g, ' ')})
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
        {submission.moderator_approvals && submission.moderator_approvals.length > 0 && (
          <div className="mt-3 bg-gray-50 rounded-lg p-3">
            <h4 className="text-sm font-medium text-gray-900 mb-2">
              Approval History:
            </h4>
            <div className="space-y-1">
              {submission.moderator_approvals.map((approval: any, index: number) => (
                <div key={index} className="text-sm flex justify-between">
                  <span className={`font-medium ${
                    approval.action === "approved" ? "text-green-700" : "text-red-700"
                  }`}>
                    {approval.action} by {approval.source}
                  </span>
                  <span className="text-gray-500">
                    {new Date(approval.created_at).toLocaleDateString()}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Action buttons only for pending submissions */}
        {(submission.status === "pending" || submission.status === "awaiting_second_approval") && (
          <div className="mt-3 flex items-center space-x-3">
            {canApprove(submission) && (
              <Form method="post" className="inline">
                <input
                  type="hidden"
                  name="submissionId"
                  value={submission.id}
                />
                <input type="hidden" name="action" value="approved" />
                <button
                  type="submit"
                  className="inline-flex items-center px-3 py-2 border border-transparent text-sm leading-4 font-medium rounded-md text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
                >
                  Approve
                </button>
              </Form>
            )}
            {canReject(submission) && (
              <button
                type="button"
                onClick={() => setRejectionModal({
                  isOpen: true,
                  submissionId: submission.id,
                  submissionName: submission.name
                })}
                className="inline-flex items-center px-3 py-2 border border-transparent text-sm leading-4 font-medium rounded-md text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
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
              <span className="text-2xl">⏳</span>
            </div>
            <div className="ml-3">
              <p className="text-sm font-medium text-yellow-800">Pending Review</p>
              <p className="text-2xl font-bold text-yellow-900">{pendingSubmissions.length}</p>
            </div>
          </div>
        </div>
        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <span className="text-2xl">✅</span>
            </div>
            <div className="ml-3">
              <p className="text-sm font-medium text-green-800">Approved</p>
              <p className="text-2xl font-bold text-green-900">
                {processedSubmissions.filter(s => s.status === "approved").length}
              </p>
            </div>
          </div>
        </div>
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <span className="text-2xl">❌</span>
            </div>
            <div className="ml-3">
              <p className="text-sm font-medium text-red-800">Rejected</p>
              <p className="text-2xl font-bold text-red-900">
                {processedSubmissions.filter(s => s.status === "rejected").length}
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-gray-900">
          Player Submissions
        </h2>
        <div className="text-sm text-gray-600">
          {submissions.length} total submissions
        </div>
      </div>

      {submissions.length === 0 ? (
        <div className="text-center py-12">
          <div className="text-6xl mb-4">👤</div>
          <h3 className="text-xl font-semibold text-gray-900 mb-2">
            No submissions found
          </h3>
          <p className="text-gray-600">
            No player submissions to review at this time.
          </p>
        </div>
      ) : (
        <div className="space-y-8">
          {/* Pending Submissions Section */}
          {pendingSubmissions.length > 0 && (
            <div>
              <div className="mb-4">
                <h3 className="text-xl font-semibold text-gray-900 flex items-center">
                  <span className="text-2xl mr-2">⏳</span>
                  Pending Review ({pendingSubmissions.length})
                </h3>
                <p className="text-sm text-gray-600 mt-1">
                  Submissions that need moderator approval
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
                <h3 className="text-xl font-semibold text-gray-900 flex items-center">
                  <span className="text-2xl mr-2">📋</span>
                  Recently Processed ({processedSubmissions.length})
                </h3>
                <p className="text-sm text-gray-600 mt-1">
                  Submissions that have been approved or rejected
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
        onClose={() => setRejectionModal({ isOpen: false, submissionId: "", submissionName: "" })}
        submissionId={rejectionModal.submissionId}
        submissionType="player"
        submissionName={rejectionModal.submissionName}
      />
    </div>
  );
}

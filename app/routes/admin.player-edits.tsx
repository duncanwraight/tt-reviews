import type { Route } from "./+types/admin.player-edits";
import { data, redirect, Form } from "react-router";
import { createModerationService } from "~/lib/moderation.server";
import { RejectionModal } from "~/components/ui/RejectionModal";
import { useState } from "react";
import type { RejectionCategory } from "~/lib/types";
import { sanitizeAdminContent } from "~/lib/sanitize";
import { formatDate } from "~/lib/date";
import { CheckCircle2, XCircle, Clock, ListChecks, Pencil } from "lucide-react";
import { ImagePlaceholder } from "~/components/ui/ImagePlaceholder";
import { Logger, createLogContext } from "~/lib/logger.server";
import {
  ensureAdminAction,
  ensureAdminLoader,
} from "~/lib/admin/middleware.server";
import {
  loadApprovalsForSubmissions,
  loadPendingQueue,
} from "~/lib/admin/queue.server";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Player Edits | Admin | TT Reviews" },
    {
      name: "description",
      content: "Review and moderate player edit submissions.",
    },
  ];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
interface PlayerEditRow extends Record<string, any> {
  id: string;
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const gate = await ensureAdminLoader(request, context);
  if (gate instanceof Response) return gate;
  const { sbServerClient, user, supabaseAdmin, csrfToken } = gate;

  const { data: playerEdits, error } = await loadPendingQueue<PlayerEditRow>(
    supabaseAdmin,
    "player_edits",
    { select: "*, players ( id, name, slug )" }
  );

  if (error) {
    Logger.error(
      "Error fetching player edits",
      createLogContext("admin-player-edits", {
        route: "/admin/player-edits",
        method: "GET",
        userId: user.id,
      }),
      error instanceof Error ? error : undefined
    );
    return data(
      { playerEdits: [], user, csrfToken },
      { headers: sbServerClient.headers }
    );
  }

  if (playerEdits && playerEdits.length > 0) {
    const approvalsById = await loadApprovalsForSubmissions(
      supabaseAdmin,
      "player_edit",
      playerEdits.map(e => e.id)
    );
    playerEdits.forEach(edit => {
      edit.moderator_approvals = approvalsById[edit.id] || [];
    });
  }

  return data(
    { playerEdits: playerEdits || [], user, csrfToken },
    { headers: sbServerClient.headers }
  );
}

export async function action({ request, context }: Route.ActionArgs) {
  const gate = await ensureAdminAction(request, context);
  if (gate instanceof Response) return gate;
  const { sbServerClient, user, supabaseAdmin: supabase } = gate;

  const formData = await request.formData();
  const editId = formData.get("editId") as string;
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

  if (!editId || !actionType) {
    return data(
      { error: "Missing required fields" },
      { status: 400, headers: sbServerClient.headers }
    );
  }

  const moderationService = createModerationService(supabase);

  let result;
  if (actionType === "approved") {
    result = await moderationService.recordApproval(
      "player_edit",
      editId,
      user.id,
      "admin_ui",
      moderatorNotes
    );

    // If fully approved, apply the edits to the player record
    if (result.success && result.newStatus === "approved") {
      const { data: edit } = await supabase
        .from("player_edits")
        .select("*")
        .eq("id", editId)
        .single();

      if (edit && edit.player_id) {
        // Build update object from edit_data, excluding edit_reason
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const updateData: Record<string, any> = {};
        if (edit.edit_data) {
          const { edit_reason, ...editableFields } = edit.edit_data;
          Object.assign(updateData, editableFields);
        }

        // Include image_key if present
        if (edit.image_key) {
          updateData.image_key = edit.image_key;
        }

        if (Object.keys(updateData).length > 0) {
          const { error: updateError } = await supabase
            .from("players")
            .update(updateData)
            .eq("id", edit.player_id);

          if (updateError) {
            Logger.error(
              "Failed to apply player edit",
              createLogContext("admin-player-edits", {
                route: "/admin/player-edits",
                method: request.method,
                userId: user.id,
                editId,
              }),
              updateError instanceof Error ? updateError : undefined
            );
            return data(
              {
                error: `Approved but failed to apply changes: ${updateError.message}`,
              },
              { status: 500, headers: sbServerClient.headers }
            );
          }
        }
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
      "player_edit",
      editId,
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

  return redirect("/admin/player-edits", { headers: sbServerClient.headers });
}

export default function AdminPlayerEdits({ loaderData }: Route.ComponentProps) {
  const { playerEdits, user, csrfToken } = loaderData;
  const [rejectionModal, setRejectionModal] = useState<{
    isOpen: boolean;
    submissionId: string;
    submissionName: string;
  }>({ isOpen: false, submissionId: "", submissionName: "" });

  // Group edits by status
  const pendingEdits = playerEdits.filter(
    e => e.status === "pending" || e.status === "awaiting_second_approval"
  );
  const processedEdits = playerEdits.filter(
    e => e.status === "approved" || e.status === "rejected"
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
  const getApprovalCount = (edit: any) => {
    if (!edit.moderator_approvals) return 0;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return edit.moderator_approvals.filter((a: any) => a.action === "approved")
      .length;
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const canApprove = (edit: any) => {
    if (edit.status === "approved" || edit.status === "rejected") return false;
    const approvals = edit.moderator_approvals || [];
    const userApproval = approvals.find(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (a: any) => a.moderator_id === user.id && a.action === "approved"
    );
    return !userApproval;
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const canReject = (edit: any) => {
    return edit.status !== "approved" && edit.status !== "rejected";
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const formatEditData = (editData: any) => {
    return Object.entries(editData)
      .map(([key, value]) => {
        const label = key
          .replace(/_/g, " ")
          .replace(/\b\w/g, l => l.toUpperCase());
        return `${label}: ${value}`;
      })
      .join(", ");
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const renderEditItem = (edit: any) => (
    <li key={edit.id}>
      <div className="px-4 py-4 sm:px-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center">
            {edit.image_key ? (
              <img
                src={`/api/images/${edit.image_key}`}
                alt={edit.players?.name || "Player"}
                className="w-16 h-16 object-cover rounded-full mr-3 border border-gray-200"
              />
            ) : (
              <ImagePlaceholder
                kind="player"
                className="w-16 h-16 rounded-full mr-3 border border-gray-200"
              />
            )}
            <div>
              <p className="text-sm font-medium text-gray-900">
                Edit for {edit.players?.name || "Unknown Player"}
              </p>
              <p className="text-sm text-gray-500">
                Changes: {formatEditData(edit.edit_data)}
              </p>
            </div>
          </div>
          <div className="flex items-center space-x-3">
            {(() => {
              const badge = getStatusBadge(edit.status, getApprovalCount(edit));
              return <span className={badge.classes}>{badge.text}</span>;
            })()}
            <div className="text-sm text-gray-500">
              {formatDate(edit.created_at)}
            </div>
          </div>
        </div>

        <div className="mt-3 bg-gray-50 rounded-lg p-3">
          <h4 className="text-sm font-medium text-gray-900 mb-2">
            Proposed Changes:
          </h4>
          <div className="space-y-1">
            {Object.entries(edit.edit_data).map(([key, value]) => (
              <div key={key} className="text-sm">
                <span className="font-medium text-gray-700">
                  {key
                    .replace(/_/g, " ")
                    .replace(/\b\w/g, l => l.toUpperCase())}
                  :
                </span>
                <span className="ml-2 text-gray-900">{String(value)}</span>
              </div>
            ))}
          </div>
        </div>

        {edit.moderator_notes && (
          <div className="mt-2 text-sm">
            <strong className="text-gray-700">Moderator Notes:</strong>
            <p className="text-gray-600 mt-1">{edit.moderator_notes}</p>
          </div>
        )}

        {/* Show rejection details for rejected edits */}
        {edit.status === "rejected" &&
          (edit.rejection_reason || edit.rejection_category) && (
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
                    {edit.rejection_category && (
                      <span className="ml-2 text-xs font-normal">
                        ({edit.rejection_category.replace(/_/g, " ")})
                      </span>
                    )}
                  </h5>
                  {edit.rejection_reason && (
                    <p className="text-sm text-red-700 mt-1">
                      {edit.rejection_reason}
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

        {/* Approval History */}
        {edit.moderator_approvals && edit.moderator_approvals.length > 0 && (
          <div className="mt-3 bg-gray-50 rounded-lg p-3">
            <h4 className="text-sm font-medium text-gray-900 mb-2">
              Approval History:
            </h4>
            <div className="space-y-1">
              {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
              {edit.moderator_approvals.map((approval: any, index: number) => (
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
              ))}
            </div>
          </div>
        )}

        {/* Action buttons only for pending edits */}
        {(edit.status === "pending" ||
          edit.status === "awaiting_second_approval") && (
          <div className="mt-3 flex items-center space-x-3">
            {canApprove(edit) && (
              <Form method="post" className="inline">
                <input type="hidden" name="_csrf" value={csrfToken} />
                <input type="hidden" name="editId" value={edit.id} />
                <input type="hidden" name="action" value="approved" />
                <button
                  type="submit"
                  className="inline-flex items-center px-3 py-2 border border-transparent text-sm leading-4 font-medium rounded-md text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
                >
                  Approve
                </button>
              </Form>
            )}
            {canReject(edit) && (
              <button
                type="button"
                onClick={() =>
                  setRejectionModal({
                    isOpen: true,
                    submissionId: edit.id,
                    submissionName: `Edit for ${edit.players?.name || "Unknown Player"}`,
                  })
                }
                className="inline-flex items-center px-3 py-2 border border-transparent text-sm leading-4 font-medium rounded-md text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
              >
                Reject
              </button>
            )}
            {edit.players?.slug && (
              <a
                href={`/players/${edit.players.slug}`}
                className="inline-flex items-center px-3 py-2 border border-gray-300 text-sm leading-4 font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500"
              >
                View Player
              </a>
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
                {pendingEdits.length}
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
                {processedEdits.filter(e => e.status === "approved").length}
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
                {processedEdits.filter(e => e.status === "rejected").length}
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-gray-900">Player Edits</h2>
        <div className="text-sm text-gray-600">
          {playerEdits.length} total edits
        </div>
      </div>

      {playerEdits.length === 0 ? (
        <div className="text-center py-12">
          <Pencil
            className="size-16 text-gray-300 mx-auto mb-4"
            aria-hidden
            strokeWidth={1.5}
          />
          <h3 className="text-xl font-semibold text-gray-900 mb-2">
            No edits found
          </h3>
          <p className="text-gray-600">
            No player edits to review at this time.
          </p>
        </div>
      ) : (
        <div className="space-y-8">
          {/* Pending Edits Section */}
          {pendingEdits.length > 0 && (
            <div>
              <div className="mb-4">
                <h3 className="text-xl font-semibold text-gray-900 flex items-center gap-2">
                  <Clock className="size-5 text-yellow-600" aria-hidden />
                  Pending Review ({pendingEdits.length})
                </h3>
                <p className="text-sm text-gray-600 mt-1">
                  Edits that need moderator approval
                </p>
              </div>
              <div className="bg-white shadow overflow-hidden rounded-md border-l-4 border-yellow-400">
                <ul className="divide-y divide-gray-200">
                  {pendingEdits.map(renderEditItem)}
                </ul>
              </div>
            </div>
          )}

          {/* Processed Edits Section */}
          {processedEdits.length > 0 && (
            <div>
              <div className="mb-4">
                <h3 className="text-xl font-semibold text-gray-900 flex items-center gap-2">
                  <ListChecks className="size-5 text-gray-600" aria-hidden />
                  Recently Processed ({processedEdits.length})
                </h3>
                <p className="text-sm text-gray-600 mt-1">
                  Edits that have been approved or rejected
                </p>
              </div>
              <div className="bg-white shadow overflow-hidden rounded-md">
                <ul className="divide-y divide-gray-200">
                  {processedEdits.map(renderEditItem)}
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
        submissionType="player_edit"
        submissionName={rejectionModal.submissionName}
        csrfToken={csrfToken}
      />
    </div>
  );
}

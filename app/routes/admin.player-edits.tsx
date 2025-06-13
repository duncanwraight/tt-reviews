import type { Route } from "./+types/admin.player-edits";
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
    { title: "Player Edits | Admin | TT Reviews" },
    {
      name: "description",
      content: "Review and moderate player edit submissions.",
    },
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

  // Get all player edits with player info first
  const { data: playerEdits, error } = await supabase
    .from("player_edits")
    .select(`
      *,
      players (
        id,
        name,
        slug
      )
    `)
    .order("created_at", { ascending: false })
    .limit(50);

  // Then get approvals for each edit manually
  if (playerEdits && playerEdits.length > 0) {
    const editIds = playerEdits.map(e => e.id);
    const { data: approvals } = await supabase
      .from("moderator_approvals")
      .select("*")
      .eq("submission_type", "player_edit")
      .in("submission_id", editIds);

    // Group approvals by submission_id
    const approvalsByEdit = (approvals || []).reduce((acc, approval) => {
      if (!acc[approval.submission_id]) {
        acc[approval.submission_id] = [];
      }
      acc[approval.submission_id].push(approval);
      return acc;
    }, {} as Record<string, any[]>);

    // Add approvals to each edit
    playerEdits.forEach(edit => {
      edit.moderator_approvals = approvalsByEdit[edit.id] || [];
    });
  }

  if (error) {
    console.error("Error fetching player edits:", error);
    return data({ playerEdits: [], user }, { headers: sbServerClient.headers });
  }

  return data({ playerEdits: playerEdits || [], user }, { headers: sbServerClient.headers });
}

export async function action({ request, context }: Route.ActionArgs) {
  const sbServerClient = getServerClient(request, context);
  const user = await getUserWithRole(sbServerClient, context);

  // Check admin access
  if (!user || user.role !== "admin") {
    throw redirect("/", { headers: sbServerClient.headers });
  }

  const formData = await request.formData();
  const editId = formData.get("editId") as string;
  const actionType = formData.get("action") as string;
  const moderatorNotes = formData.get("notes") as string || undefined;
  const rejectionCategory = formData.get("category") as RejectionCategory | null;
  const rejectionReason = formData.get("reason") as string | null;

  if (!editId || !actionType) {
    return data({ error: "Missing required fields" }, { status: 400, headers: sbServerClient.headers });
  }

  const supabase = createSupabaseAdminClient(context);
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
  } else if (actionType === "rejected") {
    if (!rejectionCategory || !rejectionReason) {
      return data({ error: "Rejection requires category and reason" }, { status: 400, headers: sbServerClient.headers });
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
    return data({ error: "Invalid action" }, { status: 400, headers: sbServerClient.headers });
  }

  if (!result.success) {
    return data({ error: result.error || "Operation failed" }, { status: 500, headers: sbServerClient.headers });
  }

  return redirect("/admin/player-edits", { headers: sbServerClient.headers });
}

export default function AdminPlayerEdits({ loaderData }: Route.ComponentProps) {
  const { playerEdits, user } = loaderData;
  const [rejectionModal, setRejectionModal] = useState<{
    isOpen: boolean;
    submissionId: string;
    submissionName: string;
  }>({ isOpen: false, submissionId: "", submissionName: "" });

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

  const getApprovalCount = (edit: any) => {
    if (!edit.moderator_approvals) return 0;
    return edit.moderator_approvals.filter((a: any) => a.action === "approved").length;
  };

  const canApprove = (edit: any) => {
    if (edit.status === "approved" || edit.status === "rejected") return false;
    const approvals = edit.moderator_approvals || [];
    const userApproval = approvals.find((a: any) => a.moderator_id === user.id && a.action === "approved");
    return !userApproval;
  };

  const canReject = (edit: any) => {
    return edit.status !== "approved" && edit.status !== "rejected";
  };

  const formatEditData = (editData: any) => {
    return Object.entries(editData)
      .map(([key, value]) => {
        const label = key
          .replace(/_/g, " ")
          .replace(/\b\w/g, (l) => l.toUpperCase());
        return `${label}: ${value}`;
      })
      .join(", ");
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-gray-900">Player Edits</h2>
        <div className="text-sm text-gray-600">
          {playerEdits.length} total edits
        </div>
      </div>

      {playerEdits.length === 0 ? (
        <div className="text-center py-12">
          <div className="text-6xl mb-4">✏️</div>
          <h3 className="text-xl font-semibold text-gray-900 mb-2">
            No edits found
          </h3>
          <p className="text-gray-600">
            No player edits to review at this time.
          </p>
        </div>
      ) : (
        <div className="bg-white shadow overflow-hidden rounded-md">
          <ul className="divide-y divide-gray-200">
            {playerEdits.map((edit) => (
              <li key={edit.id}>
                <div className="px-4 py-4 sm:px-6">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center">
                      <span className="text-2xl mr-3">👤</span>
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
                        return (
                          <span className={badge.classes}>
                            {badge.text}
                          </span>
                        );
                      })()}
                      <div className="text-sm text-gray-500">
                        {new Date(edit.created_at).toLocaleDateString()}
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
                              .replace(/\b\w/g, (l) => l.toUpperCase())}
                            :
                          </span>
                          <span className="ml-2 text-gray-900">
                            {String(value)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {edit.moderator_notes && (
                    <div className="mt-2 text-sm">
                      <strong className="text-gray-700">
                        Moderator Notes:
                      </strong>
                      <p className="text-gray-600 mt-1">
                        {edit.moderator_notes}
                      </p>
                    </div>
                  )}

                  {/* Approval History */}
                  {edit.moderator_approvals && edit.moderator_approvals.length > 0 && (
                    <div className="mt-3 bg-gray-50 rounded-lg p-3">
                      <h4 className="text-sm font-medium text-gray-900 mb-2">
                        Approval History:
                      </h4>
                      <div className="space-y-1">
                        {edit.moderator_approvals.map((approval: any, index: number) => (
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

                  <div className="mt-3 flex items-center space-x-3">
                    {canApprove(edit) && (
                      <Form method="post" className="inline">
                        <input
                          type="hidden"
                          name="editId"
                          value={edit.id}
                        />
                        <input type="hidden" name="action" value="approved" />
                        <button
                          type="submit"
                          className="inline-flex items-center px-3 py-1.5 border border-transparent text-xs font-medium rounded text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
                        >
                          Approve
                        </button>
                      </Form>
                    )}
                    {canReject(edit) && (
                      <button
                        type="button"
                        onClick={() => setRejectionModal({
                          isOpen: true,
                          submissionId: edit.id,
                          submissionName: `Edit for ${edit.players?.name || "Unknown Player"}`
                        })}
                        className="inline-flex items-center px-3 py-1.5 border border-transparent text-xs font-medium rounded text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
                      >
                        Reject
                      </button>
                    )}
                    {edit.players?.slug && (
                      <a
                        href={`/players/${edit.players.slug}`}
                        className="inline-flex items-center px-3 py-1.5 border border-gray-300 text-xs font-medium rounded text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500"
                      >
                        View Player
                      </a>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
      
      <RejectionModal
        isOpen={rejectionModal.isOpen}
        onClose={() => setRejectionModal({ isOpen: false, submissionId: "", submissionName: "" })}
        submissionId={rejectionModal.submissionId}
        submissionType="player_edit"
        submissionName={rejectionModal.submissionName}
      />
    </div>
  );
}

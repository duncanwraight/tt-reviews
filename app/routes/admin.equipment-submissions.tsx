import type { Route } from "./+types/admin.equipment-submissions";
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
    { title: "Equipment Submissions | Admin | TT Reviews" },
    {
      name: "description",
      content: "Review and moderate equipment submissions.",
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

  // Get all submissions first
  const { data: submissions, error } = await supabase
    .from("equipment_submissions")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(50);

  // Then get approvals for each submission manually
  if (submissions && submissions.length > 0) {
    const submissionIds = submissions.map(s => s.id);
    const { data: approvals } = await supabase
      .from("moderator_approvals")
      .select("*")
      .eq("submission_type", "equipment")
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

  console.log("Equipment submissions query result:", { submissions, error, count: submissions?.length });

  if (error) {
    console.error("Equipment submissions error:", error);
    return data({ submissions: [], user }, { headers: sbServerClient.headers });
  }

  return data({ submissions: submissions || [], user }, { headers: sbServerClient.headers });
}

export async function action({ request, context }: Route.ActionArgs) {
  try {
    console.log("Admin equipment action started");
    
    const sbServerClient = getServerClient(request, context);
    const user = await getUserWithRole(sbServerClient, context);

    console.log("User:", { id: user?.id, role: user?.role });

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

    console.log("Form data:", { submissionId, actionType, moderatorNotes, rejectionCategory, rejectionReason });

    if (!submissionId || !actionType) {
      return data({ error: "Missing required fields" }, { status: 400, headers: sbServerClient.headers });
    }

    const supabase = createSupabaseAdminClient(context);
    const moderationService = createModerationService(supabase);
    
    console.log("Created moderation service");

  let result;
  if (actionType === "approved") {
    result = await moderationService.recordApproval(
      "equipment",
      submissionId,
      user.id,
      "admin_ui",
      moderatorNotes
    );
    
    // If this approval results in full approval, create the equipment record
    if (result.success && result.newStatus === "approved") {
      const { data: submission } = await supabase
        .from("equipment_submissions")
        .select("*")
        .eq("id", submissionId)
        .single();

      if (submission) {
        const slug = submission.name
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/(^-|-$)/g, '');

        await supabase
          .from("equipment")
          .insert({
            name: submission.name,
            slug: slug,
            manufacturer: submission.manufacturer,
            category: submission.category,
            subcategory: submission.subcategory,
            specifications: submission.specifications,
          });
      }
    }
  } else if (actionType === "rejected") {
    if (!rejectionCategory || !rejectionReason) {
      return data({ error: "Rejection requires category and reason" }, { status: 400, headers: sbServerClient.headers });
    }
    
    result = await moderationService.recordRejection(
      "equipment",
      submissionId,
      user.id,
      "admin_ui",
      { category: rejectionCategory, reason: rejectionReason },
      context.cloudflare?.env?.R2_BUCKET
    );
  } else {
    return data({ error: "Invalid action" }, { status: 400, headers: sbServerClient.headers });
  }

  console.log("Moderation result:", result);

  if (!result.success) {
    console.error("Moderation failed:", result.error);
    return data({ error: result.error || "Operation failed" }, { status: 500, headers: sbServerClient.headers });
  }

  console.log("Moderation success, redirecting");
  return redirect("/admin/equipment-submissions", { headers: sbServerClient.headers });
  
  } catch (error) {
    console.error("Admin equipment action error:", error);
    return data({ error: "Internal server error" }, { status: 500 });
  }
}

export default function AdminEquipmentSubmissions({
  loaderData,
}: Route.ComponentProps) {
  const { submissions, user } = loaderData;
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

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case "blade":
        return "🏓";
      case "rubber":
        return "⚫";
      case "ball":
        return "🟠";
      default:
        return "📋";
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-gray-900">
          Equipment Submissions
        </h2>
        <div className="text-sm text-gray-600">
          {submissions.length} total submissions
        </div>
      </div>

      {submissions.length === 0 ? (
        <div className="text-center py-12">
          <div className="text-6xl mb-4">📋</div>
          <h3 className="text-xl font-semibold text-gray-900 mb-2">
            No submissions found
          </h3>
          <p className="text-gray-600">
            No equipment submissions to review at this time.
          </p>
        </div>
      ) : (
        <div className="bg-white shadow overflow-hidden rounded-md">
          <ul className="divide-y divide-gray-200">
            {submissions.map((submission) => (
              <li key={submission.id}>
                <div className="px-4 py-4 sm:px-6">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center">
                      <span className="text-2xl mr-3">
                        {getCategoryIcon(submission.category)}
                      </span>
                      <div>
                        <p className="text-sm font-medium text-gray-900">
                          {submission.name}
                        </p>
                        <p className="text-sm text-gray-500">
                          by {submission.manufacturer} • {submission.category}
                          {submission.subcategory &&
                            ` (${submission.subcategory})`}
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

                  {submission.specifications &&
                    Object.keys(submission.specifications).length > 0 && (
                      <div className="mt-2 text-sm text-gray-600">
                        <strong>Specifications:</strong>
                        <div className="mt-1 grid grid-cols-2 md:grid-cols-4 gap-2">
                          {Object.entries(submission.specifications).map(
                            ([key, value]) => (
                              <span key={key} className="text-xs">
                                <strong>{key}:</strong> {String(value)}
                              </span>
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
                          className="inline-flex items-center px-3 py-1.5 border border-transparent text-xs font-medium rounded text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
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
                        className="inline-flex items-center px-3 py-1.5 border border-transparent text-xs font-medium rounded text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
                      >
                        Reject
                      </button>
                    )}
                    <button
                      className="inline-flex items-center px-3 py-1.5 border border-gray-300 text-xs font-medium rounded text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500"
                      onClick={() => {
                        /* TODO: Implement view details modal */
                      }}
                    >
                      View Details
                    </button>
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
        submissionType="equipment"
        submissionName={rejectionModal.submissionName}
      />
    </div>
  );
}

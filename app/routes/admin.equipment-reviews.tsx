import type { Route } from "./+types/admin.equipment-reviews";
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
    { title: "Equipment Reviews | Admin | TT Reviews" },
    {
      name: "description",
      content: "Review and moderate equipment reviews.",
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

  // Get all reviews first
  const { data: reviews, error } = await supabase
    .from("equipment_reviews")
    .select(`
      *,
      equipment (
        id,
        name,
        slug,
        manufacturer,
        category,
        subcategory
      )
    `)
    .order("created_at", { ascending: false })
    .limit(50);

  // Then get approvals for each review manually
  if (reviews && reviews.length > 0) {
    const reviewIds = reviews.map(r => r.id);
    const { data: approvals } = await supabase
      .from("moderator_approvals")
      .select("*")
      .eq("submission_type", "equipment_review")
      .in("submission_id", reviewIds);

    // Group approvals by submission_id
    const approvalsByReview = (approvals || []).reduce((acc, approval) => {
      if (!acc[approval.submission_id]) {
        acc[approval.submission_id] = [];
      }
      acc[approval.submission_id].push(approval);
      return acc;
    }, {} as Record<string, any[]>);

    // Add approvals to each review
    reviews.forEach((review: any) => {
      review.approvals = approvalsByReview[review.id] || [];
    });
  }

  if (error) {
    console.error("Error fetching reviews:", error);
    throw new Response("Failed to load reviews", { status: 500 });
  }

  return data(
    {
      user,
      reviews: reviews || [],
    },
    { headers: sbServerClient.headers }
  );
}

export async function action({ request, context }: Route.ActionArgs) {
  const sbServerClient = getServerClient(request, context);
  const user = await getUserWithRole(sbServerClient, context);

  if (!user || user.role !== "admin") {
    throw redirect("/", { headers: sbServerClient.headers });
  }

  const formData = await request.formData();
  const intent = formData.get("intent") as string;
  const reviewId = formData.get("reviewId") as string;

  const supabase = createSupabaseAdminClient(context);
  const moderation = createModerationService(supabase);

  try {
    switch (intent) {
      case "approve":
        await moderation.approveEquipmentReview(reviewId, user.id);
        break;
      case "reject":
        const rejectionCategory = formData.get("rejectionCategory") as RejectionCategory;
        const rejectionReason = formData.get("rejectionReason") as string;
        await moderation.rejectEquipmentReview(
          reviewId, 
          user.id, 
          rejectionCategory, 
          rejectionReason,
          context.cloudflare?.env?.R2_BUCKET
        );
        break;
      default:
        throw new Response("Invalid action", { status: 400 });
    }

    return redirect("/admin/equipment-reviews", { headers: sbServerClient.headers });
  } catch (error) {
    console.error("Moderation action failed:", error);
    throw new Response("Action failed", { status: 500 });
  }
}

export default function AdminEquipmentReviews({
  loaderData,
}: Route.ComponentProps) {
  const { reviews, user } = loaderData;
  const [rejectionModal, setRejectionModal] = useState<{
    isOpen: boolean;
    submissionId: string;
    submissionName: string;
  }>({ isOpen: false, submissionId: "", submissionName: "" });

  // Group reviews by status
  const pendingReviews = reviews.filter((r: any) => 
    r.status === "pending" || r.status === "awaiting_second_approval"
  );
  const processedReviews = reviews.filter((r: any) => 
    r.status === "approved" || r.status === "rejected"
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

  const getApprovalCount = (review: any) => {
    if (!review.approvals) return 0;
    return review.approvals.filter((a: any) => a.action === "approved").length;
  };

  const canApprove = (review: any) => {
    if (review.status === "approved" || review.status === "rejected") return false;
    const approvals = review.approvals || [];
    const userApproval = approvals.find((a: any) => a.moderator_id === user.id && a.action === "approved");
    return !userApproval;
  };

  const canReject = (review: any) => {
    return review.status !== "approved" && review.status !== "rejected";
  };

  const getCategoryLabel = (key: string) => {
    const labels: Record<string, string> = {
      speed: "Speed",
      spin: "Spin",
      control: "Control",
      feel: "Feel",
      disruption: "Disruption",
      consistency: "Consistency",
      block_quality: "Block Quality",
      chop_quality: "Chop Quality",
      counter_attack: "Counter Attack",
      float_quality: "Float Quality",
      throw_angle: "Throw Angle",
      weight_balance: "Weight Balance",
      stiffness: "Stiffness",
      vibration: "Vibration",
      durability: "Durability",
    };
    return labels[key] || key.charAt(0).toUpperCase() + key.slice(1).replace("_", " ");
  };

  const renderReviewItem = (review: any) => (
    <li key={review.id}>
      <div className="px-4 py-4 sm:px-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center">
            <span className="text-2xl mr-3">📝</span>
            <div>
              <p className="text-sm font-medium text-gray-900">
                {review.equipment?.name || "Unknown Equipment"}
              </p>
              <p className="text-sm text-gray-500">
                by {review.equipment?.manufacturer || "Unknown"} • Overall: {review.overall_rating}/10
              </p>
            </div>
          </div>
          <div className="flex items-center space-x-3">
            {(() => {
              const badge = getStatusBadge(review.status, getApprovalCount(review));
              return (
                <span className={badge.classes}>
                  {badge.text}
                </span>
              );
            })()}
            <div className="text-sm text-gray-500">
              {new Date(review.created_at).toLocaleDateString()}
            </div>
          </div>
        </div>

        {/* Review Content */}
        {review.review_text && (
          <div className="mt-2 text-sm text-gray-600">
            <strong>Review:</strong>
            <p className="mt-1 bg-gray-50 p-2 rounded text-gray-700">
              {review.review_text}
            </p>
          </div>
        )}

        {/* Category Ratings */}
        {Object.keys(review.category_ratings || {}).length > 0 && (
          <div className="mt-2 text-sm text-gray-600">
            <strong>Detailed Ratings:</strong>
            <div className="mt-1 grid grid-cols-2 md:grid-cols-4 gap-2">
              {Object.entries(review.category_ratings).map(([category, rating]) => (
                <span key={category} className="text-xs">
                  <strong>{getCategoryLabel(category)}:</strong> {rating}/10
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Reviewer Context */}
        {review.reviewer_context && Object.keys(review.reviewer_context).length > 0 && (
          <div className="mt-2 text-sm text-gray-600">
            <strong>Reviewer Info:</strong>
            <div className="mt-1 grid grid-cols-2 md:grid-cols-4 gap-2">
              {Object.entries(review.reviewer_context).map(([key, value]) => (
                value && (
                  <span key={key} className="text-xs">
                    <strong>{getCategoryLabel(key)}:</strong> {String(value)}
                  </span>
                )
              ))}
            </div>
          </div>
        )}

        {/* Show rejection details for rejected reviews */}
        {review.status === "rejected" && (
          <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-md">
            <div className="flex items-start">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="ml-3">
                <h5 className="text-sm font-medium text-red-800">
                  Rejected Review
                </h5>
              </div>
            </div>
          </div>
        )}

        {/* Approval History */}
        {review.approvals && review.approvals.length > 0 && (
          <div className="mt-3 bg-gray-50 rounded-lg p-3">
            <h4 className="text-sm font-medium text-gray-900 mb-2">
              Approval History:
            </h4>
            <div className="space-y-1">
              {review.approvals.map((approval: any, index: number) => (
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

        {/* Action buttons only for pending reviews */}
        {(review.status === "pending" || review.status === "awaiting_second_approval") && (
          <div className="mt-3 flex items-center space-x-3">
            {canApprove(review) && (
              <Form method="post" className="inline">
                <input
                  type="hidden"
                  name="reviewId"
                  value={review.id}
                />
                <input type="hidden" name="intent" value="approve" />
                <button
                  type="submit"
                  className="inline-flex items-center px-3 py-2 border border-transparent text-sm leading-4 font-medium rounded-md text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
                >
                  Approve
                </button>
              </Form>
            )}
            {canReject(review) && (
              <button
                onClick={() =>
                  setRejectionModal({
                    isOpen: true,
                    submissionId: review.id,
                    submissionName: `${review.equipment?.name} review`,
                  })
                }
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
              <p className="text-2xl font-bold text-yellow-900">{pendingReviews.length}</p>
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
                {processedReviews.filter(r => r.status === "approved").length}
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
                {processedReviews.filter(r => r.status === "rejected").length}
              </p>
            </div>
          </div>
        </div>
      </div>

      {reviews.length === 0 ? (
        <div className="text-center py-12">
          <div className="text-4xl mb-4">📝</div>
          <h3 className="text-lg font-medium text-gray-900 mb-2">No Reviews</h3>
          <p className="text-gray-600">No equipment reviews have been submitted yet.</p>
        </div>
      ) : (
        <div className="space-y-8">
          {/* Pending Reviews Section */}
          {pendingReviews.length > 0 && (
            <div>
              <div className="mb-4">
                <h3 className="text-xl font-semibold text-gray-900 flex items-center">
                  <span className="text-2xl mr-2">⏳</span>
                  Pending Review ({pendingReviews.length})
                </h3>
                <p className="text-sm text-gray-600 mt-1">
                  Reviews that need moderator approval
                </p>
              </div>
              <div className="bg-white shadow overflow-hidden rounded-md border-l-4 border-yellow-400">
                <ul className="divide-y divide-gray-200">
                  {pendingReviews.map(renderReviewItem)}
                </ul>
              </div>
            </div>
          )}

          {/* Processed Reviews Section */}
          {processedReviews.length > 0 && (
            <div>
              <div className="mb-4">
                <h3 className="text-xl font-semibold text-gray-900 flex items-center">
                  <span className="text-2xl mr-2">📋</span>
                  Recently Processed ({processedReviews.length})
                </h3>
                <p className="text-sm text-gray-600 mt-1">
                  Reviews that have been approved or rejected
                </p>
              </div>
              <div className="bg-white shadow overflow-hidden rounded-md">
                <ul className="divide-y divide-gray-200">
                  {processedReviews.map(renderReviewItem)}
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
        submissionType="equipment_review"
        submissionName={rejectionModal.submissionName}
      />
    </div>
  );
}


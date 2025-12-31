import type { ReviewStatus, RejectionCategory, SubmissionType } from "~/lib/types";
import { SafeHtml } from "~/lib/sanitize";

interface Submission {
  id: string;
  name?: string;
  player_name?: string;
  equipment_name?: string;
  review_text?: string;
  overall_rating?: number;
  type: SubmissionType;
  status: ReviewStatus;
  rejection_category?: RejectionCategory;
  rejection_reason?: string;
  approval_count: number;
  created_at: string;
  updated_at: string;
}

interface UserSubmissionsProps {
  submissions: Submission[];
}

export function UserSubmissions({ submissions }: UserSubmissionsProps) {
  const getStatusBadge = (status: ReviewStatus, approvalCount: number) => {
    const baseClasses =
      "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium";

    switch (status) {
      case "pending":
        return (
          <span className={`${baseClasses} bg-gray-100 text-gray-800`}>
            Pending Review
          </span>
        );
      case "under_review":
      case "awaiting_second_approval":
        return (
          <span className={`${baseClasses} bg-blue-100 text-blue-800`}>
            Under Review ({approvalCount}/2 approvals)
          </span>
        );
      case "approved":
        return (
          <span className={`${baseClasses} bg-green-100 text-green-800`}>
            Approved
          </span>
        );
      case "rejected":
        return (
          <span className={`${baseClasses} bg-red-100 text-red-800`}>
            Rejected
          </span>
        );
      default:
        return (
          <span className={`${baseClasses} bg-gray-100 text-gray-800`}>
            {status}
          </span>
        );
    }
  };

  const getTypeIcon = (type: SubmissionType) => {
    switch (type) {
      case "equipment":
        return "⚙️";
      case "player":
        return "👤";
      case "player_edit":
        return "✏️";
      case "review":
        return "⭐";
      case "video":
        return "📹";
      case "player_equipment_setup":
        return "🏓";
      default:
        return "📄";
    }
  };

  const getTypeName = (type: SubmissionType) => {
    switch (type) {
      case "equipment":
        return "Equipment";
      case "player":
        return "Player";
      case "player_edit":
        return "Player Edit";
      case "review":
        return "Review";
      case "video":
        return "Video";
      case "player_equipment_setup":
        return "Equipment Setup";
      default:
        return "Submission";
    }
  };

  const getRejectionCategoryName = (category: RejectionCategory) => {
    switch (category) {
      case "duplicate":
        return "Duplicate Entry";
      case "insufficient_info":
        return "Insufficient Information";
      case "poor_image_quality":
        return "Poor Image Quality";
      case "inappropriate_content":
        return "Inappropriate Content";
      case "invalid_data":
        return "Invalid Data";
      case "spam":
        return "Spam";
      case "other":
        return "Other";
      default:
        return category;
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  if (submissions.length === 0) {
    return (
      <div className="text-center py-8">
        <div className="text-gray-400 text-4xl mb-4">📝</div>
        <h3 className="text-lg font-medium text-gray-900 mb-2">
          No submissions yet
        </h3>
        <p className="text-gray-600 mb-4">
          Start contributing to the community by submitting equipment, players, or reviews.
        </p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <a
            href="/submissions/equipment/submit"
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-purple-600 hover:bg-purple-700"
          >
            Submit Equipment
          </a>
          <a
            href="/submissions/player/submit"
            className="inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
          >
            Submit Player
          </a>
          <a
            href="/submissions/review/submit"
            className="inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
          >
            Write Review
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-medium text-gray-900">
            Your Submissions
          </h3>
          <span className="text-sm text-gray-500">
            {submissions.length} total
          </span>
        </div>

        <div className="space-y-3">
          {submissions.map(submission => (
            <div
              key={submission.id}
              className="border border-gray-200 rounded-lg p-4 hover:shadow-sm transition-shadow"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center space-x-2 mb-2">
                    <span className="text-lg">
                      {getTypeIcon(submission.type)}
                    </span>
                    <span className="text-sm font-medium text-gray-500">
                      {getTypeName(submission.type)}
                    </span>
                    <span className="text-gray-300">•</span>
                    <span className="text-sm text-gray-500">
                      {formatDate(submission.created_at)}
                    </span>
                  </div>

                  <h4 className="text-base font-medium text-gray-900 mb-2">
                    {submission.name || submission.player_name || submission.equipment_name ||
                     (submission.type === "review" && submission.overall_rating ?
                       `Review (${submission.overall_rating}/10)` : "Submission")}
                  </h4>

                  {submission.status === "rejected" &&
                    submission.rejection_reason && (
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
                              Rejection Reason
                              {submission.rejection_category && (
                                <span className="ml-2 text-xs font-normal">
                                  (
                                  {getRejectionCategoryName(
                                    submission.rejection_category
                                  )}
                                  )
                                </span>
                              )}
                            </h5>
                            <SafeHtml
                              content={submission.rejection_reason}
                              profile="admin"
                              className="text-sm text-red-700 mt-1"
                            />
                          </div>
                        </div>
                      </div>
                    )}
                </div>

                <div className="flex-shrink-0 ml-4">
                  {getStatusBadge(submission.status, submission.approval_count)}
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="text-center pt-4 border-t border-gray-200">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <a
              href="/submissions/equipment/submit"
              className="inline-flex items-center px-3 py-2 border border-transparent text-sm font-medium rounded-md text-purple-700 bg-purple-100 hover:bg-purple-200"
            >
              Submit Equipment
            </a>
            <a
              href="/submissions/player/submit"
              className="inline-flex items-center px-3 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
            >
              Submit Player
            </a>
            <a
              href="/submissions/review/submit"
              className="inline-flex items-center px-3 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
            >
              Write Review
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

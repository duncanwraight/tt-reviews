import { RatingStars } from "../ui/RatingStars";

interface EquipmentReview {
  id: string;
  overall_rating: number;
  category_ratings: Record<string, number>;
  review_text?: string;
  reviewer_context: {
    playing_level?: string;
    style_of_play?: string;
    testing_duration?: string;
    testing_quantity?: string;
    testing_type?: string;
    other_equipment?: string;
    purchase_location?: string;
    purchase_price?: string;
  };
  status: "pending" | "approved" | "rejected";
  created_at: string;
}

interface ReviewCardProps {
  review: EquipmentReview;
}

export function ReviewCard({ review }: ReviewCardProps) {
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "approved":
        return "bg-green-100 text-green-800";
      case "pending":
        return "bg-yellow-100 text-yellow-800";
      case "rejected":
        return "bg-red-100 text-red-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  const getCategoryLabel = (key: string) => {
    const labels: Record<string, string> = {
      spin: "Spin",
      speed: "Speed",
      control: "Control",
      spin_sensitivity: "Spin Sensitivity",
      feel: "Feel",
      reversal: "Reversal",
      dwell: "Dwell Time",
      quality: "Quality",
    };
    return (
      labels[key] ||
      key.charAt(0).toUpperCase() + key.slice(1).replace("_", " ")
    );
  };

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <RatingStars rating={review.overall_rating} showCount={false} />
          <span className="text-sm text-gray-600">
            {formatDate(review.created_at)}
          </span>
        </div>
        <span
          className={`px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(
            review.status
          )}`}
        >
          {review.status.charAt(0).toUpperCase() + review.status.slice(1)}
        </span>
      </div>

      {review.review_text && (
        <div className="mb-6">
          <p className="text-gray-700 leading-relaxed">{review.review_text}</p>
        </div>
      )}

      {Object.keys(review.category_ratings).length > 0 && (
        <div className="mb-6">
          <h4 className="text-sm font-semibold text-gray-900 mb-3">
            Detailed Ratings
          </h4>
          <div className="grid grid-cols-2 gap-4">
            {Object.entries(review.category_ratings).map(
              ([category, rating]) => (
                <div
                  key={category}
                  className="flex items-center justify-between"
                >
                  <span className="text-sm text-gray-600">
                    {getCategoryLabel(category)}
                  </span>
                  <div className="flex items-center gap-2">
                    <div className="w-16 bg-gray-200 rounded-full h-2">
                      <div
                        className="bg-purple-600 h-2 rounded-full"
                        style={{ width: `${(rating / 10) * 100}%` }}
                      ></div>
                    </div>
                    <span className="text-sm font-medium text-gray-900 w-8">
                      {rating}/10
                    </span>
                  </div>
                </div>
              )
            )}
          </div>
        </div>
      )}

      <div className="border-t border-gray-100 pt-4">
        <h4 className="text-sm font-semibold text-gray-900 mb-2">
          Reviewer Context
        </h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm text-gray-600">
          {review.reviewer_context.playing_level && (
            <div>
              <span className="font-medium">Level:</span>{" "}
              {review.reviewer_context.playing_level}
            </div>
          )}
          {review.reviewer_context.style_of_play && (
            <div>
              <span className="font-medium">Style:</span>{" "}
              {review.reviewer_context.style_of_play}
            </div>
          )}
          {review.reviewer_context.testing_duration && (
            <div>
              <span className="font-medium">Testing Duration:</span>{" "}
              {review.reviewer_context.testing_duration}
            </div>
          )}
          {review.reviewer_context.testing_type && (
            <div>
              <span className="font-medium">Testing Type:</span>{" "}
              {review.reviewer_context.testing_type}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

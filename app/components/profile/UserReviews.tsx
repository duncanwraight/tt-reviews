import { Link } from "react-router";
import { ReviewCard } from "../equipment/ReviewCard";

interface UserReview {
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
  status: 'pending' | 'approved' | 'rejected';
  created_at: string;
  equipment?: {
    name: string;
    slug: string;
  };
}

interface UserReviewsProps {
  reviews: UserReview[];
}

export function UserReviews({ reviews }: UserReviewsProps) {
  if (reviews.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Your Reviews</h2>
        <div className="text-center py-8 text-gray-500">
          <p className="mb-4">You haven't submitted any reviews yet.</p>
          <Link 
            to="/equipment" 
            className="inline-flex items-center px-4 py-2 bg-purple-600 text-white font-medium rounded-lg hover:bg-purple-700 transition-colors"
          >
            Browse Equipment to Review
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-900">Your Reviews</h2>
        <span className="text-sm text-gray-500">{reviews.length} review{reviews.length !== 1 ? 's' : ''}</span>
      </div>
      <div className="space-y-4">
        {reviews.map((review) => (
          <div key={review.id} className="border border-gray-200 rounded-lg">
            {review.equipment && (
              <div className="px-4 py-2 bg-gray-50 border-b border-gray-200 rounded-t-lg">
                <Link 
                  to={`/equipment/${review.equipment.slug}`}
                  className="text-sm font-medium text-purple-600 hover:text-purple-800"
                >
                  {review.equipment.name}
                </Link>
              </div>
            )}
            <ReviewCard review={review} />
          </div>
        ))}
      </div>
    </div>
  );
}
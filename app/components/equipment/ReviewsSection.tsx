import { Link } from "react-router";
import { ReviewCard } from "./ReviewCard";
import { AverageRatings } from "./AverageRatings";

interface Review {
  id: string;
  overall_rating: number;
  category_ratings: Record<string, number>;
  review_text?: string;
  reviewer_context: Record<string, unknown>;
  status: "pending" | "approved" | "rejected";
  created_at: string;
}

interface User {
  id: string;
  email?: string;
}

interface ReviewsSectionProps {
  reviews: Review[];
  reviewCount: number;
  user?: User | null;
  equipmentName: string;
  equipmentSlug: string;
  ratingCategories?: Array<{
    name: string;
    value: string;
  }>;
}

export function ReviewsSection({
  reviews,
  reviewCount,
  user,
  equipmentName,
  equipmentSlug,
  ratingCategories = [],
}: ReviewsSectionProps) {
  return (
    <section className="py-12">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <ReviewsSectionHeader
          reviewCount={reviewCount}
          user={user}
          equipmentSlug={equipmentSlug}
        />

        {reviews.length > 0 ? (
          <>
            <AverageRatings
              reviews={reviews}
              ratingCategories={ratingCategories}
            />
            <ReviewsList reviews={reviews} />
          </>
        ) : (
          <NoReviewsState
            equipmentName={equipmentName}
            user={user}
            equipmentSlug={equipmentSlug}
          />
        )}
      </div>
    </section>
  );
}

function ReviewsSectionHeader({
  reviewCount,
  user,
  equipmentSlug,
}: {
  reviewCount: number;
  user?: User | null;
  equipmentSlug: string;
}) {
  return (
    <div className="flex items-center justify-between mb-8">
      <h2 className="text-2xl font-bold text-gray-900">
        Reviews ({reviewCount})
      </h2>
      <WriteReviewButton user={user} equipmentSlug={equipmentSlug} />
    </div>
  );
}

function WriteReviewButton({
  user,
  equipmentSlug,
}: {
  user?: User | null;
  equipmentSlug: string;
}) {
  if (user) {
    return (
      <Link
        to={`/submissions/review/submit?equipment_slug=${equipmentSlug}`}
        className="inline-flex items-center px-4 py-2 bg-purple-600 text-white font-semibold rounded-lg hover:bg-purple-700 transition-colors"
      >
        Write a Review
      </Link>
    );
  }

  return (
    <Link
      to="/login"
      className="inline-flex items-center px-4 py-2 border border-purple-600 text-purple-600 font-semibold rounded-lg hover:bg-purple-600 hover:text-white transition-colors"
    >
      Login to Review
    </Link>
  );
}

function ReviewsList({ reviews }: { reviews: Review[] }) {
  return (
    <div className="space-y-6">
      {reviews.map(review => (
        <ReviewCard key={review.id} review={review} />
      ))}
    </div>
  );
}

function NoReviewsState({
  equipmentName,
  user,
  equipmentSlug,
}: {
  equipmentName: string;
  user?: User | null;
  equipmentSlug: string;
}) {
  return (
    <div className="text-center py-12">
      <div className="text-6xl mb-4">📝</div>
      <h3 className="text-xl font-semibold text-gray-900 mb-2">
        No Reviews Yet
      </h3>
      <p className="text-gray-600 mb-6">
        Be the first to review the {equipmentName}!
      </p>
      <NoReviewsAction user={user} equipmentSlug={equipmentSlug} />
    </div>
  );
}

function NoReviewsAction({
  user,
  equipmentSlug,
}: {
  user?: User | null;
  equipmentSlug: string;
}) {
  if (user) {
    return (
      <Link
        to={`/submissions/review/submit?equipment_slug=${equipmentSlug}`}
        className="inline-flex items-center px-6 py-3 bg-purple-600 text-white font-semibold rounded-lg hover:bg-purple-700 transition-colors"
      >
        Write the First Review
      </Link>
    );
  }

  return (
    <Link
      to="/login"
      className="inline-flex items-center px-6 py-3 border border-purple-600 text-purple-600 font-semibold rounded-lg hover:bg-purple-600 hover:text-white transition-colors"
    >
      Login to Write Review
    </Link>
  );
}

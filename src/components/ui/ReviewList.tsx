import { EquipmentReview } from '../../types/database.js'
import { RatingStars } from './RatingStars.js'

interface ReviewListProps {
  reviews: EquipmentReview[]
  showEquipmentName?: boolean
}

interface ReviewItemProps {
  review: EquipmentReview
  showEquipmentName?: boolean
}

function ReviewItem({ review, showEquipmentName = false }: ReviewItemProps) {
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })
  }

  const getStatusBadge = (status: string) => {
    const badges = {
      pending: 'bg-yellow-100 text-yellow-800',
      approved: 'bg-green-100 text-green-800',
      rejected: 'bg-red-100 text-red-800',
    }
    return badges[status as keyof typeof badges] || badges.pending
  }

  const categoryLabels: Record<string, string> = {
    spin: 'Spin',
    speed: 'Speed',
    control: 'Control',
    spin_sensitivity: 'Spin Sensitivity',
    reversal: 'Reversal',
    dwell: 'Dwell',
    feel: 'Feel',
    quality: 'Quality',
  }

  return (
    <div class="bg-white rounded-lg shadow-md p-6 border border-gray-200">
      {/* Header */}
      <div class="flex justify-between items-start mb-4">
        <div>
          {showEquipmentName && review.equipment && (
            <h4 class="text-lg font-medium text-gray-900 mb-1">{review.equipment.name}</h4>
          )}
          <div class="flex items-center space-x-3">
            <RatingStars rating={review.overall_rating / 2} />
            <span class="text-lg font-semibold text-gray-900">{review.overall_rating}/10</span>
          </div>
        </div>
        <div class="text-right">
          <span
            class={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getStatusBadge(review.status)}`}
          >
            {review.status.charAt(0).toUpperCase() + review.status.slice(1)}
          </span>
          <p class="text-sm text-gray-500 mt-1">{formatDate(review.created_at)}</p>
        </div>
      </div>

      {/* Category Ratings */}
      {Object.keys(review.category_ratings).length > 0 && (
        <div class="mb-4">
          <h5 class="text-sm font-medium text-gray-700 mb-2">Category Ratings</h5>
          <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {Object.entries(review.category_ratings).map(([category, rating]) => (
              <div key={category} class="flex justify-between items-center">
                <span class="text-sm text-gray-600">{categoryLabels[category] || category}:</span>
                <span class="font-medium text-gray-900">{rating}/10</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Review Text */}
      {review.review_text && (
        <div class="mb-4">
          <p class="text-gray-700 leading-relaxed">{review.review_text}</p>
        </div>
      )}

      {/* Reviewer Context */}
      {review.reviewer_context && Object.keys(review.reviewer_context).length > 0 && (
        <div class="border-t border-gray-200 pt-4">
          <h5 class="text-sm font-medium text-gray-700 mb-2">Reviewer Info</h5>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
            {review.reviewer_context.playing_level && (
              <div>
                <span class="text-gray-600">Level:</span>{' '}
                <span class="text-gray-900">{review.reviewer_context.playing_level}</span>
              </div>
            )}
            {review.reviewer_context.style_of_play && (
              <div>
                <span class="text-gray-600">Style:</span>{' '}
                <span class="text-gray-900">{review.reviewer_context.style_of_play}</span>
              </div>
            )}
            {review.reviewer_context.testing_duration && (
              <div>
                <span class="text-gray-600">Testing Duration:</span>{' '}
                <span class="text-gray-900">{review.reviewer_context.testing_duration}</span>
              </div>
            )}
            {review.reviewer_context.testing_quantity && (
              <div>
                <span class="text-gray-600">Testing Quantity:</span>{' '}
                <span class="text-gray-900">{review.reviewer_context.testing_quantity}</span>
              </div>
            )}
            {review.reviewer_context.other_equipment && (
              <div class="md:col-span-2">
                <span class="text-gray-600">Other Equipment:</span>{' '}
                <span class="text-gray-900">{review.reviewer_context.other_equipment}</span>
              </div>
            )}
            {review.reviewer_context.purchase_price && (
              <div>
                <span class="text-gray-600">Purchase:</span>{' '}
                <span class="text-gray-900">{review.reviewer_context.purchase_price}</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export function ReviewList({ reviews, showEquipmentName = false }: ReviewListProps) {
  if (reviews.length === 0) {
    return (
      <div class="text-center py-8">
        <div class="text-gray-500">
          <svg
            class="mx-auto h-12 w-12 text-gray-400 mb-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M7 8h10m0 0V6a2 2 0 00-2-2H9a2 2 0 00-2 2v2m0 0v10a2 2 0 002 2h6a2 2 0 002-2V8m0 0V6a2 2 0 00-2-2H9a2 2 0 00-2 2v2m0 0v10a2 2 0 002 2h6a2 2 0 002-2V8"
            />
          </svg>
          <h3 class="text-lg font-medium text-gray-900 mb-2">No reviews yet</h3>
          <p class="text-gray-600">Be the first to review this equipment!</p>
        </div>
      </div>
    )
  }

  return (
    <div class="space-y-6">
      {reviews.map(review => (
        <ReviewItem key={review.id} review={review} showEquipmentName={showEquipmentName} />
      ))}
    </div>
  )
}

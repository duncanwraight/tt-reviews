import { FC } from 'hono/jsx'
import { Equipment } from '../../types/database.js'

interface ReviewFormProps {
  equipment: Equipment
  isEditing?: boolean
  existingReview?: ReviewFormData
}

interface ReviewFormData {
  id?: string
  overall_rating: number
  category_ratings: Record<string, number>
  review_text: string
  reviewer_context: {
    playing_level?: string
    style_of_play?: string
    testing_duration?: string
    testing_quantity?: string
    testing_type?: string
    other_equipment?: string
    purchase_location?: string
    purchase_price?: string
  }
}

const categoryLabels: Record<string, string> = {
  spin: 'Spin Generation',
  speed: 'Speed',
  control: 'Control',
  spin_sensitivity: 'Spin Sensitivity',
  reversal: 'Spin Reversal',
  dwell: 'Dwell Time',
  feel: 'Feel & Sound',
  quality: 'Build Quality',
}

const rubberCategories = ['spin', 'speed', 'control', 'spin_sensitivity', 'feel']
const antiCategories = ['speed', 'control', 'spin_sensitivity', 'reversal']
const bladeCategories = ['speed', 'control', 'dwell', 'feel', 'quality']

export const ReviewForm: FC<ReviewFormProps> = ({
  equipment,
  isEditing = false,
  existingReview,
}) => {
  const getRelevantCategories = () => {
    if (equipment.category === 'blade') {
      return bladeCategories
    } else if (equipment.subcategory === 'anti') {
      return antiCategories
    } else {
      return rubberCategories
    }
  }

  const categories = getRelevantCategories()
  const formTitle = isEditing
    ? `Edit Review for ${equipment.name}`
    : `Write a Review for ${equipment.name}`
  const submitText = isEditing ? 'Update Review' : 'Submit Review'

  return (
    <div class="bg-white rounded-lg shadow-md p-6">
      <h3 class="text-xl font-semibold text-gray-900 mb-4">{formTitle}</h3>

      <form
        method="post"
        action={isEditing ? `/api/reviews/${existingReview?.id}/update` : `/api/reviews/submit`}
        class="space-y-6"
      >
        {/* Hidden equipment ID */}
        <input type="hidden" name="equipment_id" value={equipment.id} />

        {/* Overall Rating */}
        <div class="form-group">
          <label class="block text-sm font-medium text-gray-700 mb-2">
            Overall Rating (1-10) *
          </label>
          <input
            type="number"
            name="overall_rating"
            min="1"
            max="10"
            step="0.5"
            value={existingReview?.overall_rating || 5}
            required
            class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
          <p class="text-xs text-gray-500 mt-1">Rate from 1 (poor) to 10 (excellent)</p>
        </div>

        {/* Category Ratings */}
        <div class="form-group">
          <h4 class="text-lg font-medium text-gray-900 mb-3">Category Ratings (1-10)</h4>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            {categories.map(category => (
              <div key={category} class="form-group">
                <label class="block text-sm font-medium text-gray-700 mb-1">
                  {categoryLabels[category]}
                </label>
                <input
                  type="number"
                  name={`category_rating_${category}`}
                  min="1"
                  max="10"
                  step="0.5"
                  value={existingReview?.category_ratings[category] || 5}
                  class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            ))}
          </div>
        </div>

        {/* Review Text */}
        <div class="form-group">
          <label class="block text-sm font-medium text-gray-700 mb-2">Your Review *</label>
          <textarea
            name="review_text"
            rows={4}
            required
            value={existingReview?.review_text || ''}
            class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="Share your experience with this equipment..."
          />
        </div>

        {/* Reviewer Context */}
        <div class="form-group">
          <h4 class="text-lg font-medium text-gray-900 mb-3">About You & Your Testing</h4>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Playing Level</label>
              <input
                type="text"
                name="playing_level"
                value={existingReview?.reviewer_context.playing_level || ''}
                class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="e.g., 2000 USATT, 1800 TTR"
              />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Style of Play</label>
              <input
                type="text"
                name="style_of_play"
                value={existingReview?.reviewer_context.style_of_play || ''}
                class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="e.g., Offensive looper, All-round"
              />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Testing Duration</label>
              <input
                type="text"
                name="testing_duration"
                value={existingReview?.reviewer_context.testing_duration || ''}
                class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="e.g., 3 months, 6 weeks"
              />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Testing Frequency</label>
              <input
                type="text"
                name="testing_quantity"
                value={existingReview?.reviewer_context.testing_quantity || ''}
                class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="e.g., 5+ hours per week"
              />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">
                Other Equipment Used
              </label>
              <input
                type="text"
                name="other_equipment"
                value={existingReview?.reviewer_context.other_equipment || ''}
                class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="e.g., Butterfly Timo Boll ALC blade"
              />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Purchase Info</label>
              <input
                type="text"
                name="purchase_price"
                value={existingReview?.reviewer_context.purchase_price || ''}
                class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="e.g., Paddle Palace, $65"
              />
            </div>
          </div>
        </div>

        {/* Submit Buttons */}
        <div class="flex justify-end space-x-3 pt-4 border-t border-gray-200">
          <button
            type="button"
            class="px-4 py-2 text-gray-700 bg-gray-200 rounded-md hover:bg-gray-300 focus:outline-none focus:ring-2 focus:ring-gray-500"
          >
            Cancel
          </button>
          <button
            type="submit"
            class="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {submitText}
          </button>
        </div>
      </form>

      <div class="mt-4 text-sm text-gray-600">
        <p>Your review will be submitted for moderation and will appear publicly once approved.</p>
      </div>
    </div>
  )
}

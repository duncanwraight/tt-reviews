import { useState } from 'hono/jsx'
import { Equipment } from '../../types/database.js'

interface ReviewFormProps {
  equipment: Equipment
  onSubmit?: (reviewData: ReviewFormData) => void
  onCancel?: () => void
}

interface ReviewFormData {
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

export function ReviewForm({ equipment, onSubmit, onCancel }: ReviewFormProps) {
  const [formData, setFormData] = useState<ReviewFormData>({
    overall_rating: 5,
    category_ratings: {},
    review_text: '',
    reviewer_context: {},
  })

  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const getRelevantCategories = () => {
    if (equipment.category === 'blade') {
      return bladeCategories
    } else if (equipment.subcategory === 'anti') {
      return antiCategories
    } else {
      return rubberCategories
    }
  }

  const handleCategoryRatingChange = (category: string, value: number) => {
    setFormData(prev => ({
      ...prev,
      category_ratings: {
        ...prev.category_ratings,
        [category]: value,
      },
    }))
  }

  const handleContextChange = (field: string, value: string) => {
    setFormData(prev => ({
      ...prev,
      reviewer_context: {
        ...prev.reviewer_context,
        [field]: value,
      },
    }))
  }

  const handleSubmit = async (e: Event) => {
    e.preventDefault()
    setIsSubmitting(true)
    setError(null)

    try {
      const response = await fetch('/api/reviews', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('access_token')}`,
        },
        body: JSON.stringify({
          equipment_id: equipment.id,
          ...formData,
        }),
      })

      if (!response.ok) {
        const errorData = (await response.json()) as { error?: string }
        throw new Error(errorData.error || 'Failed to submit review')
      }

      const result = await response.json()
      onSubmit?.(formData)

      // Reset form
      setFormData({
        overall_rating: 5,
        category_ratings: {},
        review_text: '',
        reviewer_context: {},
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setIsSubmitting(false)
    }
  }

  const categories = getRelevantCategories()

  return (
    <div class="bg-white rounded-lg shadow-md p-6">
      <h3 class="text-xl font-semibold text-gray-900 mb-4">Write a Review for {equipment.name}</h3>

      {error && (
        <div class="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-4">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit}>
        {/* Overall Rating */}
        <div class="mb-6">
          <label class="block text-sm font-medium text-gray-700 mb-2">Overall Rating (1-10)</label>
          <input
            type="range"
            min="1"
            max="10"
            step="0.5"
            value={formData.overall_rating}
            onInput={e =>
              setFormData(prev => ({
                ...prev,
                overall_rating: parseFloat((e.target as HTMLInputElement).value),
              }))
            }
            class="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
          />
          <div class="flex justify-between text-xs text-gray-500 mt-1">
            <span>1</span>
            <span class="font-medium text-blue-600">{formData.overall_rating}</span>
            <span>10</span>
          </div>
        </div>

        {/* Category Ratings */}
        <div class="mb-6">
          <h4 class="text-lg font-medium text-gray-900 mb-3">Category Ratings</h4>
          <div class="space-y-4">
            {categories.map(category => (
              <div key={category}>
                <label class="block text-sm font-medium text-gray-700 mb-1">
                  {categoryLabels[category]} (1-10)
                </label>
                <input
                  type="range"
                  min="1"
                  max="10"
                  step="0.5"
                  value={formData.category_ratings[category] || 5}
                  onInput={e =>
                    handleCategoryRatingChange(
                      category,
                      parseFloat((e.target as HTMLInputElement).value)
                    )
                  }
                  class="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                />
                <div class="flex justify-between text-xs text-gray-500 mt-1">
                  <span>1</span>
                  <span class="font-medium text-blue-600">
                    {formData.category_ratings[category] || 5}
                  </span>
                  <span>10</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Review Text */}
        <div class="mb-6">
          <label class="block text-sm font-medium text-gray-700 mb-2">Your Review</label>
          <textarea
            value={formData.review_text}
            onInput={e =>
              setFormData(prev => ({
                ...prev,
                review_text: (e.target as HTMLTextAreaElement).value,
              }))
            }
            rows={4}
            class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="Share your experience with this equipment..."
          />
        </div>

        {/* Reviewer Context */}
        <div class="mb-6">
          <h4 class="text-lg font-medium text-gray-900 mb-3">About You & Your Testing</h4>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Playing Level</label>
              <input
                type="text"
                value={formData.reviewer_context.playing_level || ''}
                onInput={e =>
                  handleContextChange('playing_level', (e.target as HTMLInputElement).value)
                }
                class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="e.g., 2000 USATT, 1800 TTR"
              />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Style of Play</label>
              <input
                type="text"
                value={formData.reviewer_context.style_of_play || ''}
                onInput={e =>
                  handleContextChange('style_of_play', (e.target as HTMLInputElement).value)
                }
                class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="e.g., Offensive looper, All-round"
              />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Testing Duration</label>
              <input
                type="text"
                value={formData.reviewer_context.testing_duration || ''}
                onInput={e =>
                  handleContextChange('testing_duration', (e.target as HTMLInputElement).value)
                }
                class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="e.g., 3 months, 6 weeks"
              />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Testing Quantity</label>
              <input
                type="text"
                value={formData.reviewer_context.testing_quantity || ''}
                onInput={e =>
                  handleContextChange('testing_quantity', (e.target as HTMLInputElement).value)
                }
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
                value={formData.reviewer_context.other_equipment || ''}
                onInput={e =>
                  handleContextChange('other_equipment', (e.target as HTMLInputElement).value)
                }
                class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="e.g., Butterfly Timo Boll ALC blade"
              />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">
                Purchase Location & Price
              </label>
              <input
                type="text"
                value={formData.reviewer_context.purchase_price || ''}
                onInput={e =>
                  handleContextChange('purchase_price', (e.target as HTMLInputElement).value)
                }
                class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="e.g., Paddle Palace, $65"
              />
            </div>
          </div>
        </div>

        {/* Submit Buttons */}
        <div class="flex justify-end space-x-3">
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              class="px-4 py-2 text-gray-700 bg-gray-200 rounded-md hover:bg-gray-300 focus:outline-none focus:ring-2 focus:ring-gray-500"
            >
              Cancel
            </button>
          )}
          <button
            type="submit"
            disabled={isSubmitting}
            class="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSubmitting ? 'Submitting...' : 'Submit Review'}
          </button>
        </div>
      </form>

      <div class="mt-4 text-sm text-gray-600">
        <p>Your review will be submitted for moderation and will appear publicly once approved.</p>
      </div>
    </div>
  )
}

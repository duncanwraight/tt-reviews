import { FC } from 'hono/jsx'
import { RatingStarsProps } from '../../types/components'

export const RatingStars: FC<RatingStarsProps> = ({ rating, count, size = 'medium' }) => {
  const fullStars = Math.floor(rating)
  const hasHalfStar = rating % 1 >= 0.5
  const emptyStars = 5 - fullStars - (hasHalfStar ? 1 : 0)

  const sizeClasses = {
    small: 'text-sm',
    medium: 'text-base',
    large: 'text-lg',
  }

  return (
    <div class={`rating flex items-center gap-1 ${sizeClasses[size]}`}>
      <div class="stars flex text-yellow-500">
        {/* Full stars */}
        {Array(fullStars)
          .fill(0)
          .map((_, i) => (
            <span key={`full-${i}`}>★</span>
          ))}

        {/* Half star */}
        {hasHalfStar && <span>☆</span>}

        {/* Empty stars */}
        {Array(emptyStars)
          .fill(0)
          .map((_, i) => (
            <span key={`empty-${i}`} class="text-gray-300">
              ☆
            </span>
          ))}
      </div>

      {count !== undefined && (
        <span class="rating-text text-sm text-gray-600 ml-2">
          ({count} review{count !== 1 ? 's' : ''})
        </span>
      )}
    </div>
  )
}

interface RatingBarsProps {
  ratings: Record<string, number>
}

export const RatingBars: FC<RatingBarsProps> = ({ ratings }) => {
  return (
    <div class="rating-bars space-y-3">
      {Object.entries(ratings).map(([metric, value]) => (
        <div key={metric} class="rating-bar flex items-center gap-3">
          <span class="rating-label min-w-20 text-sm font-medium text-gray-700 capitalize">
            {metric}
          </span>
          <div class="rating-progress flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
            <div
              class="rating-fill h-full bg-teal-500 transition-all duration-300 ease-out"
              style={`width: ${(value / 10) * 100}%`}
            />
          </div>
          <span class="rating-value min-w-8 text-right text-sm font-semibold text-gray-900">
            {value}/10
          </span>
        </div>
      ))}
    </div>
  )
}

import { EquipmentPageProps } from '../../types/components'
import { Layout } from '../Layout'
import { Breadcrumb, generateBreadcrumbs } from '../ui/Breadcrumb'
import { RatingStars, RatingBars } from '../ui/RatingStars'

export function EquipmentPage({
  equipment,
  reviews,
  usedByPlayers = [],
  similarEquipment = [],
}: EquipmentPageProps) {
  const breadcrumbs = generateBreadcrumbs(`/equipment/${equipment.slug}`)

  return (
    <Layout
      title={`${equipment.name} Review - Specs, Player Usage & Ratings`}
      description={`${equipment.name} professional reviews and ratings. ${usedByPlayers.length ? `Used by ${usedByPlayers.map(p => p.name).join(', ')}.` : ''} Complete specs and community ratings.`}
      structuredData={generateEquipmentSchema(equipment, reviews)}
    >
      <Breadcrumb items={breadcrumbs} />
      <EquipmentHeader equipment={equipment} usedByPlayers={usedByPlayers} />
      <ReviewsSection equipment={equipment} reviews={reviews} />
    </Layout>
  )
}

function EquipmentHeader({ equipment, usedByPlayers }: { equipment: any; usedByPlayers: any[] }) {
  const averageRating = 4.5 // TODO: Calculate from reviews
  const reviewCount = 23 // TODO: Get from reviews.length

  return (
    <section class="equipment-header bg-white border-b border-gray-200 py-8">
      <div class="main-container">
        <div class="equipment-info grid grid-cols-1 lg:grid-cols-4 gap-8 items-start">
          <div class="equipment-image lg:col-span-1">
            <div class="w-full aspect-square bg-gray-100 rounded-lg flex items-center justify-center text-6xl text-gray-400">
              🏓
            </div>
          </div>

          <div class="equipment-details lg:col-span-3">
            <h1 class="text-3xl font-bold text-gray-900 mb-4">{equipment.name}</h1>

            <div class="equipment-meta flex flex-wrap gap-6 mb-4 text-sm">
              <span>
                <span class="font-medium text-gray-700">Manufacturer:</span>{' '}
                {equipment.manufacturer}
              </span>
              <span>
                <span class="font-medium text-gray-700">Category:</span> {equipment.category}
              </span>
              {equipment.subcategory && (
                <span>
                  <span class="font-medium text-gray-700">Type:</span> {equipment.subcategory}
                </span>
              )}
            </div>

            <div class="equipment-rating mb-6">
              <RatingStars rating={averageRating} count={reviewCount} size="large" />
            </div>

            {usedByPlayers.length > 0 && (
              <div class="used-by">
                <h3 class="text-lg font-semibold text-gray-900 mb-3">
                  Used by Professional Players
                </h3>
                <div class="player-avatars flex flex-wrap gap-2">
                  {usedByPlayers.map(player => (
                    <a
                      key={player.slug}
                      href={`/players/${player.slug}`}
                      class="player-avatar w-12 h-12 bg-purple-600 text-white rounded-full flex items-center justify-center text-sm font-semibold hover:bg-purple-700 transition-colors"
                      onclick={`navigate('/players/${player.slug}'); return false;`}
                      title={player.name}
                    >
                      {player.name.charAt(0)}
                    </a>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}

function ReviewsSection({ equipment, reviews }: { equipment: any; reviews: any[] }) {
  // Mock rating breakdown - in real implementation, calculate from reviews
  const ratingBreakdown = {
    Spin: 9,
    Speed: 8,
    Control: 7,
  }

  const mockReviews = reviews.length
    ? reviews
    : [
        {
          id: '1',
          reviewer: {
            level: 'Advanced Player',
            context: 'USATT 2100 • Offensive style • 3 months testing',
          },
          rating: 4.5,
          text: 'Excellent rubber with great spin potential. The speed is impressive but still controllable for loop rallies. Perfect for offensive players looking for a reliable FH rubber.',
          equipment_used: 'Butterfly Innerforce Layer ZLC, Tenergy 64 FH, Tenergy 05 BH',
        },
        {
          id: '2',
          reviewer: {
            level: 'Intermediate Player',
            context: 'Club level • All-round style • 6 months testing',
          },
          rating: 4.0,
          text: 'Great rubber but requires good technique. Can be unforgiving for beginners but rewards consistent practice. Excellent for training loop consistency.',
          equipment_used: 'Stiga Clipper, Tenergy 64 FH, Mark V BH',
        },
      ]

  return (
    <section class="section py-8">
      <div class="review-layout grid grid-cols-1 lg:grid-cols-4 gap-8 max-w-7xl mx-auto px-4">
        <ReviewSidebar />

        <div class="review-content lg:col-span-3 space-y-6">
          <RatingBreakdown ratings={ratingBreakdown} />

          <div class="reviews-list space-y-6">
            {mockReviews.map(review => (
              <ReviewCard key={review.id} review={review} />
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}

function ReviewSidebar() {
  return (
    <div class="review-sidebar bg-white rounded-lg p-6 border border-gray-200 h-fit sticky top-24">
      <div class="filter-section mb-6">
        <h3 class="text-lg font-semibold text-gray-900 mb-3">Filter Reviews</h3>
        <div class="space-y-3">
          <select class="w-full p-2 border border-gray-300 rounded-md text-sm">
            <option>All Levels</option>
            <option>Beginner</option>
            <option>Intermediate</option>
            <option>Advanced</option>
            <option>Professional</option>
          </select>
          <select class="w-full p-2 border border-gray-300 rounded-md text-sm">
            <option>All Styles</option>
            <option>Offensive</option>
            <option>All-Round</option>
            <option>Defensive</option>
          </select>
        </div>
      </div>

      <div class="filter-section">
        <h3 class="text-lg font-semibold text-gray-900 mb-3">Sort By</h3>
        <select class="w-full p-2 border border-gray-300 rounded-md text-sm">
          <option>Most Recent</option>
          <option>Highest Rated</option>
          <option>Most Helpful</option>
        </select>
      </div>
    </div>
  )
}

function RatingBreakdown({ ratings }: { ratings: Record<string, number> }) {
  return (
    <div class="rating-breakdown bg-white rounded-lg p-6 border border-gray-200">
      <h3 class="text-xl font-semibold text-gray-900 mb-4">Rating Breakdown</h3>
      <RatingBars ratings={ratings} />
    </div>
  )
}

function ReviewCard({ review }: { review: any }) {
  return (
    <div class="review-card bg-white rounded-lg p-6 border border-gray-200">
      <div class="reviewer-info flex justify-between items-start mb-4 pb-4 border-b border-gray-100">
        <div>
          <div class="font-semibold text-gray-900">{review.reviewer.level}</div>
          <div class="reviewer-context text-sm text-gray-600">{review.reviewer.context}</div>
        </div>
        <div class="review-ratings">
          <RatingStars rating={review.rating} />
        </div>
      </div>

      <div class="review-text text-gray-700 leading-relaxed mb-4">{review.text}</div>

      <div class="review-equipment bg-gray-50 p-3 rounded-md text-sm text-gray-600">
        <span class="font-medium">Setup:</span> {review.equipment_used}
      </div>
    </div>
  )
}

function generateEquipmentSchema(equipment: any, reviews: any[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: equipment.name,
    description: `Professional table tennis ${equipment.category} reviews and specifications`,
    brand: {
      '@type': 'Brand',
      name: equipment.manufacturer,
    },
    category: `Table Tennis ${equipment.category}`,
    aggregateRating: {
      '@type': 'AggregateRating',
      ratingValue: '4.5',
      reviewCount: reviews.length || 1,
      bestRating: '5',
      worstRating: '1',
    },
    review: reviews.slice(0, 3).map(review => ({
      '@type': 'Review',
      reviewRating: {
        '@type': 'Rating',
        ratingValue: review.rating || 4.5,
        bestRating: '5',
      },
      author: {
        '@type': 'Person',
        name: review.reviewer?.level || 'Anonymous Reviewer',
      },
      reviewBody: review.text || review.review_text,
    })),
  }
}

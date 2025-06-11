import { Equipment, EquipmentReview, ReviewerContext } from '../../types/database'
import { Layout } from '../Layout'
import { RatingStars } from '../ui/RatingStars'

interface EquipmentIndexPageProps {
  recentEquipment: Equipment[]
  recentReviews: EquipmentReview[]
  categories: { category: string; count: number }[]
}

export function EquipmentIndexPage({
  recentEquipment,
  recentReviews,
  categories,
}: EquipmentIndexPageProps) {
  return (
    <Layout title="Equipment Reviews - Blades, Rubbers & More | TT Reviews">
      <div class="max-w-7xl mx-auto px-4 py-8">
        {/* Hero Section */}
        <div class="text-center mb-12">
          <h1 class="text-4xl font-bold text-gray-900 mb-4">Table Tennis Equipment Reviews</h1>
          <p class="text-xl text-gray-600 max-w-3xl mx-auto mb-8">
            Discover the best table tennis equipment through comprehensive reviews, professional
            player setups, and community ratings. From professional blades to tournament rubbers.
          </p>
          <div class="flex justify-center">
            <a
              href="/equipment/submit"
              class="inline-flex items-center px-6 py-3 bg-primary text-white font-medium rounded-lg hover:bg-primary/90 transition-colors"
            >
              Submit New Equipment →
            </a>
          </div>
        </div>

        {/* Categories Grid */}
        <section class="mb-16">
          <div class="flex items-center justify-between mb-8">
            <h2 class="text-2xl font-bold text-gray-900">Browse by Category</h2>
          </div>
          <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
            {categories.map(({ category, count }) => (
              <a
                href={`/equipment/category/${category}`}
                class="group bg-white rounded-lg border border-gray-200 p-6 hover:shadow-md transition-shadow"
              >
                <div class="flex items-center justify-between">
                  <div>
                    <h3 class="text-lg font-semibold text-gray-900 capitalize group-hover:text-primary transition-colors">
                      {category === 'blade'
                        ? 'Blades'
                        : category === 'rubber'
                          ? 'Rubbers'
                          : 'Balls'}
                    </h3>
                    <p class="text-gray-600 mt-1">{count} items</p>
                  </div>
                  <div class="text-2xl">
                    {category === 'blade' ? '🏓' : category === 'rubber' ? '🔴' : '⚪'}
                  </div>
                </div>
              </a>
            ))}
          </div>
        </section>

        <div class="grid grid-cols-1 lg:grid-cols-2 gap-12">
          {/* Recent Equipment */}
          <section>
            <div class="flex items-center justify-between mb-6">
              <h2 class="text-2xl font-bold text-gray-900">Latest Equipment</h2>
              <div class="flex items-center space-x-4">
                <a href="/equipment/submit" class="text-primary hover:text-primary/80 font-medium">
                  Submit Equipment
                </a>
                <a href="/equipment/all" class="text-primary hover:text-primary/80 font-medium">
                  View All →
                </a>
              </div>
            </div>
            <div class="space-y-4">
              {recentEquipment.map(equipment => (
                <div class="bg-white rounded-lg border border-gray-200 p-4 hover:shadow-md transition-shadow">
                  <div class="flex items-start justify-between">
                    <div class="flex-1">
                      <a
                        href={`/equipment/${equipment.slug}`}
                        class="text-lg font-semibold text-gray-900 hover:text-primary transition-colors"
                      >
                        {equipment.name}
                      </a>
                      <p class="text-gray-600 mt-1">{equipment.manufacturer}</p>
                      <div class="flex items-center mt-2 space-x-2">
                        <span class="px-2 py-1 bg-gray-100 text-gray-700 text-xs rounded-full capitalize">
                          {equipment.category}
                        </span>
                        {equipment.subcategory && (
                          <span class="px-2 py-1 bg-blue-100 text-blue-700 text-xs rounded-full capitalize">
                            {equipment.subcategory.replace('_', ' ')}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Recent Reviews */}
          <section>
            <div class="flex items-center justify-between mb-6">
              <h2 class="text-2xl font-bold text-gray-900">Latest Reviews</h2>
            </div>
            <div class="space-y-4">
              {recentReviews.map(review => (
                <div class="bg-white rounded-lg border border-gray-200 p-4 hover:shadow-md transition-shadow">
                  <div class="flex items-start justify-between mb-3">
                    <div class="flex-1">
                      <a
                        href={`/equipment/${review.equipment?.slug || '#'}`}
                        class="font-semibold text-gray-900 hover:text-primary transition-colors"
                      >
                        {review.equipment?.name}
                      </a>
                      <p class="text-sm text-gray-600">{review.equipment?.manufacturer}</p>
                    </div>
                    <div class="flex items-center space-x-2">
                      <RatingStars rating={review.overall_rating / 2} size="small" />
                      <span class="text-sm font-medium text-gray-700">
                        {review.overall_rating}/10
                      </span>
                    </div>
                  </div>
                  {review.review_text && (
                    <p class="text-gray-700 text-sm line-clamp-3 mb-3">{review.review_text}</p>
                  )}
                  <div class="flex items-center justify-between text-xs text-gray-500">
                    <div class="flex items-center space-x-2">
                      <span class="capitalize">
                        {(review.reviewer_context as ReviewerContext)?.playing_level || 'Reviewer'}
                      </span>
                      <span>•</span>
                      <span class="capitalize">
                        {(review.reviewer_context as ReviewerContext)?.style_of_play || 'Player'}
                      </span>
                    </div>
                    <span>{new Date(review.created_at).toLocaleDateString()}</span>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>

        {/* Featured Sections */}
        <section class="mt-16">
          <div class="bg-gradient-to-r from-primary/10 to-accent/10 rounded-lg p-8 text-center">
            <h2 class="text-2xl font-bold text-gray-900 mb-4">Professional Player Equipment</h2>
            <p class="text-gray-700 mb-6 max-w-2xl mx-auto">
              Discover what equipment the world's top players are using. From Ma Long's setup to Fan
              Zhendong's rubbers, get insights into professional choices.
            </p>
            <a
              href="/players"
              class="inline-flex items-center px-6 py-3 bg-primary text-white font-medium rounded-lg hover:bg-primary/90 transition-colors"
            >
              Browse Player Setups →
            </a>
          </div>
        </section>
      </div>
    </Layout>
  )
}

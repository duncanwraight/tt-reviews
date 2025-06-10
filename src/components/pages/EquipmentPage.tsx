import { EquipmentPageProps } from '../../types/components'
import { Layout } from '../Layout'
import { Breadcrumb, generateBreadcrumbs } from '../ui/Breadcrumb'
import { RatingStars, RatingBars } from '../ui/RatingStars'

export function EquipmentPage({
  equipment,
  reviews,
  usedByPlayers = [],
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
      <div class="main-container py-8">
        <div class="space-y-8">
          {/* Reviews Header & Action Button */}
          <div class="flex justify-between items-center">
            <h2 class="text-2xl font-bold text-gray-900">Reviews ({reviews.length})</h2>

            <button
              id="login-to-review-btn"
              class="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              Login to Review
            </button>
          </div>

          {/* Review Form */}
          <div
            id="review-form"
            class="hidden bg-white rounded-lg shadow-md p-6 border border-gray-200"
          >
            <h3 class="text-xl font-semibold text-gray-900 mb-4">
              Write a Review for {equipment.name}
            </h3>

            <div
              id="review-error"
              class="hidden mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded"
            ></div>
            <div
              id="review-success"
              class="hidden mb-4 bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded"
            ></div>

            <form id="review-submit-form">
              {/* Overall Rating */}
              <div class="mb-6">
                <label class="block text-sm font-medium text-gray-700 mb-2">
                  Overall Rating (1-10)
                </label>
                <input
                  type="range"
                  id="overall-rating"
                  min="1"
                  max="10"
                  step="0.5"
                  value="5"
                  class="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                />
                <div class="flex justify-between text-xs text-gray-500 mt-1">
                  <span>1</span>
                  <span id="overall-rating-value" class="font-medium text-blue-600">
                    5
                  </span>
                  <span>10</span>
                </div>
              </div>

              {/* Category Ratings */}
              <div class="mb-6">
                <h4 class="text-lg font-medium text-gray-900 mb-3">Category Ratings</h4>
                <div class="space-y-4">
                  <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Spin (1-10)</label>
                    <input
                      type="range"
                      id="spin-rating"
                      min="1"
                      max="10"
                      step="0.5"
                      value="5"
                      class="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                    />
                    <div class="flex justify-between text-xs text-gray-500 mt-1">
                      <span>1</span>
                      <span id="spin-rating-value" class="font-medium text-blue-600">
                        5
                      </span>
                      <span>10</span>
                    </div>
                  </div>
                  <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Speed (1-10)</label>
                    <input
                      type="range"
                      id="speed-rating"
                      min="1"
                      max="10"
                      step="0.5"
                      value="5"
                      class="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                    />
                    <div class="flex justify-between text-xs text-gray-500 mt-1">
                      <span>1</span>
                      <span id="speed-rating-value" class="font-medium text-blue-600">
                        5
                      </span>
                      <span>10</span>
                    </div>
                  </div>
                  <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">
                      Control (1-10)
                    </label>
                    <input
                      type="range"
                      id="control-rating"
                      min="1"
                      max="10"
                      step="0.5"
                      value="5"
                      class="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                    />
                    <div class="flex justify-between text-xs text-gray-500 mt-1">
                      <span>1</span>
                      <span id="control-rating-value" class="font-medium text-blue-600">
                        5
                      </span>
                      <span>10</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Review Text */}
              <div class="mb-6">
                <label class="block text-sm font-medium text-gray-700 mb-2">Your Review</label>
                <textarea
                  id="review-text"
                  rows={4}
                  class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Share your experience with this equipment..."
                ></textarea>
              </div>

              {/* Reviewer Context */}
              <div class="mb-6">
                <h4 class="text-lg font-medium text-gray-900 mb-3">About You & Your Testing</h4>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">
                      Playing Level
                    </label>
                    <input
                      type="text"
                      id="playing-level"
                      class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="e.g., 2000 USATT, 1800 TTR"
                    />
                  </div>
                  <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">
                      Style of Play
                    </label>
                    <input
                      type="text"
                      id="style-of-play"
                      class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="e.g., Offensive looper, All-round"
                    />
                  </div>
                  <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">
                      Testing Duration
                    </label>
                    <input
                      type="text"
                      id="testing-duration"
                      class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="e.g., 3 months, 6 weeks"
                    />
                  </div>
                  <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">
                      Other Equipment Used
                    </label>
                    <input
                      type="text"
                      id="other-equipment"
                      class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="e.g., Butterfly Timo Boll ALC blade"
                    />
                  </div>
                </div>
              </div>

              {/* Submit Buttons */}
              <div class="flex justify-end space-x-3">
                <button
                  type="button"
                  id="cancel-review"
                  class="px-4 py-2 text-gray-700 bg-gray-200 rounded-md hover:bg-gray-300 focus:outline-none focus:ring-2 focus:ring-gray-500"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  id="submit-review"
                  class="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Submit Review
                </button>
              </div>
            </form>

            <div class="mt-4 text-sm text-gray-600">
              <p>
                Your review will be submitted for moderation and will appear publicly once approved.
              </p>
            </div>
          </div>

          {/* Reviews List */}
          {reviews.length === 0 ? (
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
          ) : (
            <div class="space-y-6">
              {reviews.map(review => (
                <div
                  key={review.id}
                  class="bg-white rounded-lg shadow-md p-6 border border-gray-200"
                >
                  <div class="flex justify-between items-start mb-4">
                    <div>
                      <div class="flex items-center space-x-3">
                        <RatingStars rating={review.overall_rating / 2} />
                        <span class="text-lg font-semibold text-gray-900">
                          {review.overall_rating}/10
                        </span>
                      </div>
                    </div>
                    <div class="text-right">
                      <span
                        class={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                          review.status === 'approved'
                            ? 'bg-green-100 text-green-800'
                            : review.status === 'pending'
                              ? 'bg-yellow-100 text-yellow-800'
                              : 'bg-red-100 text-red-800'
                        }`}
                      >
                        {review.status.charAt(0).toUpperCase() + review.status.slice(1)}
                      </span>
                      <p class="text-sm text-gray-500 mt-1">
                        {new Date(review.created_at).toLocaleDateString()}
                      </p>
                    </div>
                  </div>

                  {review.review_text && (
                    <p class="text-gray-700 leading-relaxed mb-4">{review.review_text}</p>
                  )}

                  {Object.keys(review.category_ratings).length > 0 && (
                    <div class="border-t border-gray-200 pt-4">
                      <h5 class="text-sm font-medium text-gray-700 mb-2">Category Ratings</h5>
                      <div class="grid grid-cols-2 md:grid-cols-3 gap-3">
                        {Object.entries(review.category_ratings).map(([category, rating]) => (
                          <div key={category} class="flex justify-between items-center">
                            <span class="text-sm text-gray-600 capitalize">{category}:</span>
                            <span class="font-medium text-gray-900">{rating}/10</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <script
        dangerouslySetInnerHTML={{
          __html: `
          document.addEventListener('DOMContentLoaded', function() {
            const loginBtn = document.getElementById('login-to-review-btn');
            const reviewForm = document.getElementById('review-form');
            const reviewSubmitForm = document.getElementById('review-submit-form');
            const cancelReviewBtn = document.getElementById('cancel-review');
            const submitReviewBtn = document.getElementById('submit-review');
            const reviewError = document.getElementById('review-error');
            const reviewSuccess = document.getElementById('review-success');
            
            // Rating sliders
            const overallRating = document.getElementById('overall-rating');
            const spinRating = document.getElementById('spin-rating');
            const speedRating = document.getElementById('speed-rating');
            const controlRating = document.getElementById('control-rating');
            
            // Rating value displays
            const overallRatingValue = document.getElementById('overall-rating-value');
            const spinRatingValue = document.getElementById('spin-rating-value');
            const speedRatingValue = document.getElementById('speed-rating-value');
            const controlRatingValue = document.getElementById('control-rating-value');
            
            let showingForm = false;
            
            function showError(message) {
              reviewError.textContent = message;
              reviewError.classList.remove('hidden');
              reviewSuccess.classList.add('hidden');
            }
            
            function showSuccess(message) {
              reviewSuccess.textContent = message;
              reviewSuccess.classList.remove('hidden');
              reviewError.classList.add('hidden');
            }
            
            function hideMessages() {
              reviewError.classList.add('hidden');
              reviewSuccess.classList.add('hidden');
            }
            
            function updateRatingValues() {
              overallRatingValue.textContent = overallRating.value;
              spinRatingValue.textContent = spinRating.value;
              speedRatingValue.textContent = speedRating.value;
              controlRatingValue.textContent = controlRating.value;
            }
            
            function updateAuthButton() {
              const token = localStorage.getItem('access_token');
              
              if (token) {
                loginBtn.textContent = showingForm ? 'Cancel Review' : 'Write Review';
                loginBtn.onclick = function() {
                  showingForm = !showingForm;
                  if (showingForm) {
                    reviewForm.classList.remove('hidden');
                    loginBtn.textContent = 'Cancel Review';
                    hideMessages();
                  } else {
                    reviewForm.classList.add('hidden');
                    loginBtn.textContent = 'Write Review';
                    hideMessages();
                  }
                };
              } else {
                loginBtn.textContent = 'Login to Review';
                loginBtn.onclick = function() {
                  window.location.href = '/login?return=' + encodeURIComponent(window.location.pathname);
                };
              }
            }
            
            // Update rating displays when sliders move
            overallRating.addEventListener('input', updateRatingValues);
            spinRating.addEventListener('input', updateRatingValues);
            speedRating.addEventListener('input', updateRatingValues);
            controlRating.addEventListener('input', updateRatingValues);
            
            // Cancel button
            cancelReviewBtn.addEventListener('click', function() {
              showingForm = false;
              reviewForm.classList.add('hidden');
              updateAuthButton();
              hideMessages();
            });
            
            // Form submission
            reviewSubmitForm.addEventListener('submit', async function(e) {
              e.preventDefault();
              
              const token = localStorage.getItem('access_token');
              if (!token) {
                showError('Please log in to submit a review');
                return;
              }
              
              // Get form data
              const reviewData = {
                equipment_id: '${equipment.id}',
                overall_rating: parseFloat(overallRating.value),
                category_ratings: {
                  spin: parseFloat(spinRating.value),
                  speed: parseFloat(speedRating.value),
                  control: parseFloat(controlRating.value)
                },
                review_text: document.getElementById('review-text').value.trim(),
                reviewer_context: {
                  playing_level: document.getElementById('playing-level').value.trim(),
                  style_of_play: document.getElementById('style-of-play').value.trim(),
                  testing_duration: document.getElementById('testing-duration').value.trim(),
                  other_equipment: document.getElementById('other-equipment').value.trim()
                }
              };
              
              // Basic validation
              if (!reviewData.review_text) {
                showError('Please write a review');
                return;
              }
              
              submitReviewBtn.disabled = true;
              submitReviewBtn.textContent = 'Submitting...';
              hideMessages();
              
              try {
                const response = await fetch('/api/reviews', {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer ' + token
                  },
                  body: JSON.stringify(reviewData)
                });
                
                const result = await response.json();
                
                if (!response.ok) {
                  throw new Error(result.error || 'Failed to submit review');
                }
                
                showSuccess('Review submitted successfully! It will appear after moderation.');
                
                // Reset form
                reviewSubmitForm.reset();
                overallRating.value = '5';
                spinRating.value = '5';
                speedRating.value = '5';
                controlRating.value = '5';
                updateRatingValues();
                
                // Hide form after a delay
                setTimeout(() => {
                  showingForm = false;
                  reviewForm.classList.add('hidden');
                  updateAuthButton();
                  
                  // Optionally reload the page to show the new review
                  setTimeout(() => {
                    window.location.reload();
                  }, 2000);
                }, 3000);
                
              } catch (error) {
                showError(error.message);
              } finally {
                submitReviewBtn.disabled = false;
                submitReviewBtn.textContent = 'Submit Review';
              }
            });
            
            // Initialize
            updateRatingValues();
            updateAuthButton();
          });
        `,
        }}
      />
    </Layout>
  )
}

function EquipmentHeader({ equipment, usedByPlayers }: { equipment: { name: string; brand: string; category: string }; usedByPlayers: { name: string; slug: string }[] }) {
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

function ReviewsSection({ equipment, reviews }: { equipment: { name: string }; reviews: { id: string; rating: number; comment: string; reviewer: string }[] }) {
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

import { FC } from 'hono/jsx'
import { Equipment, EquipmentReview } from '../../types/database.js'
import { ReviewForm } from './ReviewForm.js'
import { ReviewList } from './ReviewList.js'

interface ReviewSectionProps {
  equipment: Equipment
  reviews: EquipmentReview[]
  userReview?: EquipmentReview | null
}

export const ReviewSection: FC<ReviewSectionProps> = ({ equipment, reviews, userReview }) => {
  return (
    <div class="space-y-8" data-equipment-id={equipment.id}>
      {/* Reviews Header & Action Button */}
      <div class="flex justify-between items-center">
        <h2 class="text-2xl font-bold text-gray-900">Reviews ({reviews.length})</h2>

        <div class="space-x-3">
          {userReview ? (
            <div class="text-sm text-gray-600">You've already reviewed this equipment</div>
          ) : (
            <div>
              <button
                id="write-review-btn"
                class="hidden bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                Write Review
              </button>
              <a
                href="/login"
                id="login-link"
                class="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 inline-block"
              >
                Login to Review
              </a>
            </div>
          )}
          <button id="logout-btn" class="hidden text-gray-600 hover:text-gray-800 text-sm">
            Logout
          </button>
        </div>
      </div>

      {/* Review Form - Hidden by default, shown via JS */}
      <div id="review-form-container" class="hidden">
        <ReviewForm equipment={equipment} />
      </div>

      {/* Reviews List */}
      <ReviewList reviews={reviews} />

      {/* Client-side Script for Interactivity */}
      <script
        dangerouslySetInnerHTML={{
          __html: `
          (function() {
            const token = localStorage.getItem('access_token');
            const writeReviewBtn = document.getElementById('write-review-btn');
            const loginLink = document.getElementById('login-link');
            const logoutBtn = document.getElementById('logout-btn');
            const reviewFormContainer = document.getElementById('review-form-container');

            if (token) {
              // User is authenticated
              writeReviewBtn.classList.remove('hidden');
              loginLink.classList.add('hidden');
              logoutBtn.classList.remove('hidden');

              writeReviewBtn.onclick = function() {
                reviewFormContainer.classList.toggle('hidden');
                writeReviewBtn.textContent = reviewFormContainer.classList.contains('hidden') 
                  ? 'Write Review' 
                  : 'Cancel Review';
              };

              logoutBtn.onclick = function() {
                localStorage.removeItem('access_token');
                location.reload();
              };
            }
          })();
        `,
        }}
      />
    </div>
  )
}

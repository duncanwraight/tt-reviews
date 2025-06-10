import type { FC } from 'hono/jsx'
import { Layout } from '../Layout'
import { EquipmentReview } from '../../types/database'
import { getModalScript } from '../ui/Modal'

interface AdminReviewsPageProps {
  reviews: EquipmentReview[]
  total: number
}

export const AdminReviewsPage: FC<AdminReviewsPageProps> = ({ reviews, total }) => {
  return (
    <Layout title="Review Moderation - TT Reviews">
      <div class="container mx-auto px-4 py-8">
        <div class="max-w-6xl mx-auto">
          <div class="mb-8">
            <div class="flex justify-between items-center">
              <div>
                <h1 class="text-3xl font-bold text-gray-900 mb-2">Review Moderation</h1>
                <p class="text-gray-600">
                  {total} pending review{total !== 1 ? 's' : ''} awaiting moderation
                </p>
              </div>
              <a
                href="/admin"
                class="bg-gray-600 text-white px-4 py-2 rounded-lg hover:bg-gray-700 transition-colors"
              >
                ← Back to Dashboard
              </a>
            </div>
          </div>

          {reviews.length === 0 ? (
            <div class="bg-white rounded-lg shadow p-8 text-center">
              <svg
                class="w-16 h-16 text-gray-400 mx-auto mb-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                ></path>
              </svg>
              <h3 class="text-lg font-medium text-gray-900 mb-2">All caught up!</h3>
              <p class="text-gray-600">No pending reviews to moderate at this time.</p>
            </div>
          ) : (
            <div class="space-y-6">
              {reviews.map(review => (
                <div key={review.id} class="bg-white rounded-lg shadow overflow-hidden">
                  <div class="p-6">
                    <div class="flex justify-between items-start mb-4">
                      <div class="flex-1">
                        <h3 class="text-xl font-semibold text-gray-900 mb-2">
                          {review.equipment?.name || 'Unknown Equipment'}
                        </h3>
                        <div class="flex items-center space-x-4 text-sm text-gray-600">
                          <span>By: {review.user_id.substring(0, 8)}...</span>
                          <span>Submitted: {new Date(review.created_at).toLocaleDateString()}</span>
                          <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                            {review.status}
                          </span>
                        </div>
                      </div>
                      <div class="flex items-center space-x-2">
                        <button
                          onclick={`approveReview('${review.id}')`}
                          class="bg-green-600 text-white px-4 py-2 rounded-md hover:bg-green-700 transition-colors text-sm font-medium"
                        >
                          Approve
                        </button>
                        <button
                          onclick={`rejectReview('${review.id}')`}
                          class="bg-red-600 text-white px-4 py-2 rounded-md hover:bg-red-700 transition-colors text-sm font-medium"
                        >
                          Reject
                        </button>
                      </div>
                    </div>

                    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
                      <div>
                        <h4 class="font-medium text-gray-900 mb-3">Overall Rating</h4>
                        <div class="flex items-center space-x-2 mb-4">
                          <div class="flex text-yellow-400">
                            {Array.from({ length: 10 }, (_, i) => (
                              <span
                                key={i}
                                class={`text-lg ${
                                  i < Math.floor(review.overall_rating)
                                    ? 'text-yellow-400'
                                    : 'text-gray-300'
                                }`}
                              >
                                ★
                              </span>
                            ))}
                          </div>
                          <span class="text-lg font-semibold text-gray-900">
                            {review.overall_rating}/10
                          </span>
                        </div>

                        <h4 class="font-medium text-gray-900 mb-3">Category Ratings</h4>
                        <div class="space-y-2">
                          {Object.entries(review.category_ratings as Record<string, number>).map(
                            ([category, rating]) => (
                              <div key={category} class="flex justify-between items-center">
                                <span class="text-sm text-gray-600 capitalize">{category}</span>
                                <span class="text-sm font-medium text-gray-900">{rating}/10</span>
                              </div>
                            )
                          )}
                        </div>
                      </div>

                      <div>
                        <h4 class="font-medium text-gray-900 mb-3">Review Text</h4>
                        <p class="text-gray-700 mb-4 leading-relaxed">
                          {review.review_text || 'No review text provided.'}
                        </p>

                        <h4 class="font-medium text-gray-900 mb-3">Reviewer Context</h4>
                        <div class="space-y-1 text-sm">
                          {Object.entries(review.reviewer_context as Record<string, string>).map(
                            ([key, value]) => (
                              <div key={key} class="flex justify-between">
                                <span class="text-gray-600 capitalize">
                                  {key.replace(/_/g, ' ')}:
                                </span>
                                <span class="text-gray-900">{value}</span>
                              </div>
                            )
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <script dangerouslySetInnerHTML={{ __html: getModalScript() }} />
      <script
        dangerouslySetInnerHTML={{
          __html: `
            async function approveReview(reviewId) {
              showConfirmModal(
                'Approve Review', 
                'Are you sure you want to approve this review?',
                'performApproval("' + reviewId + '")'
              );
            }
            
            async function performApproval(reviewId) {
              try {
                const session = localStorage.getItem('session');
                if (!session) {
                  showErrorModal('Session Expired', 'Please log in again.', 'window.location.href = "/login"');
                  return;
                }
                
                const sessionData = JSON.parse(session);
                const response = await fetch('/api/admin/reviews/' + reviewId + '/approve', {
                  method: 'POST',
                  headers: {
                    'Authorization': 'Bearer ' + sessionData.access_token,
                    'Content-Type': 'application/json'
                  }
                });
                
                if (response.ok) {
                  showSuccessModal('Review Approved', 'Review approved successfully!', 'window.location.reload()');
                } else {
                  const error = await response.json();
                  showErrorModal('Approval Failed', 'Failed to approve review: ' + (error.error || 'Unknown error'));
                }
              } catch (error) {
                showErrorModal('Network Error', 'Error approving review: ' + error.message);
              }
            }
            
            async function rejectReview(reviewId) {
              // Create a custom modal for rejection reason input
              const modal = document.createElement('div');
              modal.className = 'fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50';
              modal.onclick = function(e) { if (e.target === this) { document.body.removeChild(this); document.body.style.overflow = ''; } };
              
              modal.innerHTML = \`
                <div class="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white">
                  <div class="mt-3">
                    <div class="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-red-100 mb-4">
                      <svg class="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
                      </svg>
                    </div>
                    <h3 class="text-lg leading-6 font-medium text-gray-900 mb-4 text-center">Reject Review</h3>
                    <div class="mt-2 px-4 py-3">
                      <label class="block text-sm font-medium text-gray-700 mb-2">Reason for rejection (optional):</label>
                      <textarea
                        id="rejection-reason"
                        class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent"
                        rows="3"
                        placeholder="Enter reason for rejection..."
                      ></textarea>
                    </div>
                    <div class="items-center px-4 py-3">
                      <div class="flex justify-between space-x-4">
                        <button
                          onclick="document.body.removeChild(this.closest('.fixed')); document.body.style.overflow = '';"
                          class="px-4 py-2 bg-gray-500 text-white text-base font-medium rounded-md shadow-sm hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-gray-300"
                        >
                          Cancel
                        </button>
                        <button
                          onclick="performRejection('\${reviewId}', document.getElementById('rejection-reason').value); document.body.removeChild(this.closest('.fixed')); document.body.style.overflow = '';"
                          class="px-4 py-2 bg-red-600 text-white text-base font-medium rounded-md shadow-sm hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500"
                        >
                          Reject Review
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              \`;
              
              document.body.appendChild(modal);
              document.body.style.overflow = 'hidden';
              document.getElementById('rejection-reason').focus();
            }
            
            async function performRejection(reviewId, reason) {
              try {
                const session = localStorage.getItem('session');
                if (!session) {
                  showErrorModal('Session Expired', 'Please log in again.', 'window.location.href = "/login"');
                  return;
                }
                
                const sessionData = JSON.parse(session);
                const response = await fetch('/api/admin/reviews/' + reviewId + '/reject', {
                  method: 'POST',
                  headers: {
                    'Authorization': 'Bearer ' + sessionData.access_token,
                    'Content-Type': 'application/json'
                  },
                  body: JSON.stringify({ reason: reason || undefined })
                });
                
                if (response.ok) {
                  showSuccessModal('Review Rejected', 'Review rejected successfully!', 'window.location.reload()');
                } else {
                  const error = await response.json();
                  showErrorModal('Rejection Failed', 'Failed to reject review: ' + (error.error || 'Unknown error'));
                }
              } catch (error) {
                showErrorModal('Network Error', 'Error rejecting review: ' + error.message);
              }
            }
          `,
        }}
      />
    </Layout>
  )
}

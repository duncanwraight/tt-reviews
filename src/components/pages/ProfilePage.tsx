import type { FC } from 'hono/jsx'
import { Layout } from '../Layout'

export const ProfilePage: FC = () => {
  return (
    <Layout title="Profile - TT Reviews">
      <div class="container mx-auto px-4 py-8">
        <div class="max-w-4xl mx-auto">
          <div class="mb-8">
            <h1 class="text-3xl font-bold text-gray-900 mb-2">Profile</h1>
            <p class="text-gray-600">Manage your account and review history</p>
          </div>

          <div class="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div class="lg:col-span-2">
              <div class="bg-white rounded-lg shadow p-6 mb-6">
                <h2 class="text-lg font-semibold text-gray-900 mb-4">Account Information</h2>
                <div class="space-y-4">
                  <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Email</label>
                    <div id="user-email" class="text-gray-900">
                      Loading...
                    </div>
                  </div>
                  <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Member Since</label>
                    <div id="user-created" class="text-gray-900">
                      Loading...
                    </div>
                  </div>
                </div>
              </div>

              <div class="bg-white rounded-lg shadow p-6">
                <h2 class="text-lg font-semibold text-gray-900 mb-4">Recent Reviews</h2>
                <div id="user-reviews" class="space-y-4">
                  <div class="text-center py-8 text-gray-500">Loading your reviews...</div>
                </div>
              </div>
            </div>

            <div class="lg:col-span-1">
              <div class="bg-white rounded-lg shadow p-6">
                <h2 class="text-lg font-semibold text-gray-900 mb-4">Quick Actions</h2>
                <div class="space-y-3">
                  <a
                    href="/equipment"
                    class="block w-full bg-purple-600 text-white text-center py-2 px-4 rounded-lg hover:bg-purple-700 transition-colors"
                  >
                    Submit New Review
                  </a>
                  <button
                    onclick="signOut()"
                    class="block w-full bg-gray-600 text-white text-center py-2 px-4 rounded-lg hover:bg-gray-700 transition-colors"
                  >
                    Sign Out
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <script
        dangerouslySetInnerHTML={{
          __html: `
            async function loadProfile() {
              try {
                // Load user info - authenticatedFetch will handle token validation and redirects
                const userResponse = await window.authenticatedFetch('/api/auth/me');

                if (userResponse.ok) {
                  const userData = await userResponse.json();
                  document.getElementById('user-email').textContent = userData.user.email;
                  document.getElementById('user-created').textContent = new Date(userData.user.created_at).toLocaleDateString();
                }

                // Load user reviews
                const reviewsResponse = await window.authenticatedFetch('/api/reviews/user');

                if (reviewsResponse.ok) {
                  const reviewsData = await reviewsResponse.json();
                  displayReviews(reviewsData.reviews || []);
                }
              } catch (error) {
                // authenticatedFetch handles auth errors and redirects automatically
                console.error('Error loading profile:', error);
                document.getElementById('user-email').textContent = 'Error loading profile';
              }
            }

            function displayReviews(reviews) {
              const container = document.getElementById('user-reviews');
              
              if (reviews.length === 0) {
                container.innerHTML = '<div class="text-center py-8 text-gray-500">No reviews yet. <a href="/submit-review" class="text-purple-600 hover:underline">Submit your first review!</a></div>';
                return;
              }

              container.innerHTML = reviews.map(review => \`
                <div class="border border-gray-200 rounded-lg p-4">
                  <div class="flex justify-between items-start mb-2">
                    <h3 class="font-medium text-gray-900">\${review.equipment?.name || 'Unknown Equipment'}</h3>
                    <span class="text-sm px-2 py-1 rounded \${review.status === 'approved' ? 'bg-green-100 text-green-800' : review.status === 'rejected' ? 'bg-red-100 text-red-800' : 'bg-yellow-100 text-yellow-800'}">\${review.status}</span>
                  </div>
                  <div class="flex items-center mb-2">
                    <div class="flex text-yellow-400">
                      \${Array.from({length: 5}, (_, i) => \`<span class="\${i < Math.floor(review.overall_rating) ? 'text-yellow-400' : 'text-gray-300'}">★</span>\`).join('')}
                    </div>
                    <span class="ml-2 text-sm text-gray-600">\${review.overall_rating}/10</span>
                  </div>
                  <p class="text-gray-600 text-sm">\${review.review_text ? review.review_text.substring(0, 100) + (review.review_text.length > 100 ? '...' : '') : 'No review text'}</p>
                  <div class="text-xs text-gray-500 mt-2">
                    Submitted on \${new Date(review.created_at).toLocaleDateString()}
                  </div>
                </div>
              \`).join('');
            }

            async function signOut() {
              try {
                await window.authenticatedFetch('/api/auth/signout', {
                  method: 'POST'
                });
              } catch (error) {
                console.error('Error signing out:', error);
                // Still clear local storage even if API call fails
              }
              
              localStorage.removeItem('session');
              localStorage.removeItem('access_token');
              window.location.href = '/';
            }

            document.addEventListener('DOMContentLoaded', loadProfile);
          `,
        }}
      />
    </Layout>
  )
}

import type { FC } from 'hono/jsx'
import { Layout } from '../Layout'

interface AdminPageProps {
  stats: {
    pending: number
    approved: number
    rejected: number
    total: number
    playerEditsPending: number
    playerEditsApproved: number
    playerEditsRejected: number
    playerEditsTotal: number
    equipmentSubmissionsPending: number
    equipmentSubmissionsApproved: number
    equipmentSubmissionsRejected: number
    equipmentSubmissionsTotal: number
  }
}

export const AdminPage: FC<AdminPageProps> = ({ stats }) => {
  return (
    <Layout title="Admin Dashboard - TT Reviews">
      <div class="container mx-auto px-4 py-8">
        <div class="max-w-6xl mx-auto">
          <div class="mb-8">
            <h1 class="text-3xl font-bold text-gray-900 mb-2">Admin Dashboard</h1>
            <p class="text-gray-600">Manage content moderation and site administration</p>
          </div>

          <div class="mb-6">
            <h2 class="text-xl font-semibold text-gray-900 mb-4">Equipment Reviews</h2>
            <div class="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
              <div class="bg-white rounded-lg shadow p-6">
                <div class="flex items-center">
                  <div class="p-2 bg-yellow-100 rounded-md">
                    <svg
                      class="w-6 h-6 text-yellow-600"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                      ></path>
                    </svg>
                  </div>
                  <div class="ml-4">
                    <p class="text-sm font-medium text-gray-600">Pending Reviews</p>
                    <p class="text-2xl font-semibold text-gray-900">{stats.pending}</p>
                  </div>
                </div>
              </div>

              <div class="bg-white rounded-lg shadow p-6">
                <div class="flex items-center">
                  <div class="p-2 bg-green-100 rounded-md">
                    <svg
                      class="w-6 h-6 text-green-600"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M5 13l4 4L19 7"
                      ></path>
                    </svg>
                  </div>
                  <div class="ml-4">
                    <p class="text-sm font-medium text-gray-600">Approved</p>
                    <p class="text-2xl font-semibold text-gray-900">{stats.approved}</p>
                  </div>
                </div>
              </div>

              <div class="bg-white rounded-lg shadow p-6">
                <div class="flex items-center">
                  <div class="p-2 bg-red-100 rounded-md">
                    <svg
                      class="w-6 h-6 text-red-600"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M6 18L18 6M6 6l12 12"
                      ></path>
                    </svg>
                  </div>
                  <div class="ml-4">
                    <p class="text-sm font-medium text-gray-600">Rejected</p>
                    <p class="text-2xl font-semibold text-gray-900">{stats.rejected}</p>
                  </div>
                </div>
              </div>

              <div class="bg-white rounded-lg shadow p-6">
                <div class="flex items-center">
                  <div class="p-2 bg-blue-100 rounded-md">
                    <svg
                      class="w-6 h-6 text-blue-600"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                      ></path>
                    </svg>
                  </div>
                  <div class="ml-4">
                    <p class="text-sm font-medium text-gray-600">Total Reviews</p>
                    <p class="text-2xl font-semibold text-gray-900">{stats.total}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div class="mb-6">
            <h2 class="text-xl font-semibold text-gray-900 mb-4">Player Edits</h2>
            <div class="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
              <div class="bg-white rounded-lg shadow p-6">
                <div class="flex items-center">
                  <div class="p-2 bg-yellow-100 rounded-md">
                    <svg
                      class="w-6 h-6 text-yellow-600"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                      ></path>
                    </svg>
                  </div>
                  <div class="ml-4">
                    <p class="text-sm font-medium text-gray-600">Pending Player Edits</p>
                    <p class="text-2xl font-semibold text-gray-900">{stats.playerEditsPending}</p>
                  </div>
                </div>
              </div>

              <div class="bg-white rounded-lg shadow p-6">
                <div class="flex items-center">
                  <div class="p-2 bg-green-100 rounded-md">
                    <svg
                      class="w-6 h-6 text-green-600"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M5 13l4 4L19 7"
                      ></path>
                    </svg>
                  </div>
                  <div class="ml-4">
                    <p class="text-sm font-medium text-gray-600">Approved</p>
                    <p class="text-2xl font-semibold text-gray-900">{stats.playerEditsApproved}</p>
                  </div>
                </div>
              </div>

              <div class="bg-white rounded-lg shadow p-6">
                <div class="flex items-center">
                  <div class="p-2 bg-red-100 rounded-md">
                    <svg
                      class="w-6 h-6 text-red-600"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M6 18L18 6M6 6l12 12"
                      ></path>
                    </svg>
                  </div>
                  <div class="ml-4">
                    <p class="text-sm font-medium text-gray-600">Rejected</p>
                    <p class="text-2xl font-semibold text-gray-900">{stats.playerEditsRejected}</p>
                  </div>
                </div>
              </div>

              <div class="bg-white rounded-lg shadow p-6">
                <div class="flex items-center">
                  <div class="p-2 bg-blue-100 rounded-md">
                    <svg
                      class="w-6 h-6 text-blue-600"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                      ></path>
                    </svg>
                  </div>
                  <div class="ml-4">
                    <p class="text-sm font-medium text-gray-600">Total Player Edits</p>
                    <p class="text-2xl font-semibold text-gray-900">{stats.playerEditsTotal}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div class="mb-6">
            <h2 class="text-xl font-semibold text-gray-900 mb-4">Equipment Submissions</h2>
            <div class="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
              <div class="bg-white rounded-lg shadow p-6">
                <div class="flex items-center">
                  <div class="p-2 bg-purple-100 rounded-md">
                    <svg
                      class="w-6 h-6 text-purple-600"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                      ></path>
                    </svg>
                  </div>
                  <div class="ml-4">
                    <p class="text-sm font-medium text-gray-600">Pending Equipment</p>
                    <p class="text-2xl font-semibold text-gray-900">
                      {stats.equipmentSubmissionsPending}
                    </p>
                  </div>
                </div>
              </div>

              <div class="bg-white rounded-lg shadow p-6">
                <div class="flex items-center">
                  <div class="p-2 bg-green-100 rounded-md">
                    <svg
                      class="w-6 h-6 text-green-600"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M5 13l4 4L19 7"
                      ></path>
                    </svg>
                  </div>
                  <div class="ml-4">
                    <p class="text-sm font-medium text-gray-600">Approved</p>
                    <p class="text-2xl font-semibold text-gray-900">
                      {stats.equipmentSubmissionsApproved}
                    </p>
                  </div>
                </div>
              </div>

              <div class="bg-white rounded-lg shadow p-6">
                <div class="flex items-center">
                  <div class="p-2 bg-red-100 rounded-md">
                    <svg
                      class="w-6 h-6 text-red-600"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M6 18L18 6M6 6l12 12"
                      ></path>
                    </svg>
                  </div>
                  <div class="ml-4">
                    <p class="text-sm font-medium text-gray-600">Rejected</p>
                    <p class="text-2xl font-semibold text-gray-900">
                      {stats.equipmentSubmissionsRejected}
                    </p>
                  </div>
                </div>
              </div>

              <div class="bg-white rounded-lg shadow p-6">
                <div class="flex items-center">
                  <div class="p-2 bg-blue-100 rounded-md">
                    <svg
                      class="w-6 h-6 text-blue-600"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z"
                      ></path>
                    </svg>
                  </div>
                  <div class="ml-4">
                    <p class="text-sm font-medium text-gray-600">Total Equipment</p>
                    <p class="text-2xl font-semibold text-gray-900">
                      {stats.equipmentSubmissionsTotal}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div class="bg-white rounded-lg shadow">
            <div class="px-6 py-4 border-b border-gray-200">
              <h2 class="text-lg font-semibold text-gray-900">Quick Actions</h2>
            </div>
            <div class="p-6">
              <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
                <a
                  href="/admin/reviews"
                  class="flex items-center justify-between p-4 border border-gray-200 rounded-lg hover:border-blue-300 hover:bg-blue-50 transition-colors"
                >
                  <div class="flex items-center">
                    <svg
                      class="w-5 h-5 text-gray-500 mr-3"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M9 5H7a2 2 0 00-2 2v6a2 2 0 002 2h6a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
                      ></path>
                    </svg>
                    <span class="font-medium text-gray-900">Review Pending Submissions</span>
                  </div>
                  <svg
                    class="w-5 h-5 text-gray-400"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="2"
                      d="M9 5l7 7-7 7"
                    ></path>
                  </svg>
                </a>

                <a
                  href="/admin/player-edits"
                  class="flex items-center justify-between p-4 border border-gray-200 rounded-lg hover:border-blue-300 hover:bg-blue-50 transition-colors"
                >
                  <div class="flex items-center">
                    <svg
                      class="w-5 h-5 text-gray-500 mr-3"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
                      ></path>
                    </svg>
                    <span class="font-medium text-gray-900">Review Player Edits</span>
                  </div>
                  <svg
                    class="w-5 h-5 text-gray-400"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="2"
                      d="M9 5l7 7-7 7"
                    ></path>
                  </svg>
                </a>

                <a
                  href="/admin/equipment-submissions"
                  class="flex items-center justify-between p-4 border border-gray-200 rounded-lg hover:border-blue-300 hover:bg-blue-50 transition-colors"
                >
                  <div class="flex items-center">
                    <svg
                      class="w-5 h-5 text-gray-500 mr-3"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z"
                      ></path>
                    </svg>
                    <span class="font-medium text-gray-900">Review Equipment Submissions</span>
                  </div>
                  <svg
                    class="w-5 h-5 text-gray-400"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="2"
                      d="M9 5l7 7-7 7"
                    ></path>
                  </svg>
                </a>

                <a
                  href="/admin/users"
                  class="flex items-center justify-between p-4 border border-gray-200 rounded-lg hover:border-blue-300 hover:bg-blue-50 transition-colors"
                >
                  <div class="flex items-center">
                    <svg
                      class="w-5 h-5 text-gray-500 mr-3"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5 0a4 4 0 01-6-3.505"
                      ></path>
                    </svg>
                    <span class="font-medium text-gray-900">Manage Users</span>
                  </div>
                  <svg
                    class="w-5 h-5 text-gray-400"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="2"
                      d="M9 5l7 7-7 7"
                    ></path>
                  </svg>
                </a>
              </div>
            </div>
          </div>

          <div class="bg-white rounded-lg shadow mt-8">
            <div class="px-6 py-4 border-b border-gray-200">
              <h2 class="text-lg font-semibold text-gray-900">Account</h2>
            </div>
            <div class="p-6">
              <button
                onclick="signOut()"
                class="bg-gray-600 text-white px-4 py-2 rounded-lg hover:bg-gray-700 transition-colors"
              >
                Sign Out
              </button>
            </div>
          </div>
        </div>
      </div>

      <script
        dangerouslySetInnerHTML={{
          __html: `
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
          `,
        }}
      />
    </Layout>
  )
}

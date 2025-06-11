import type { FC } from 'hono/jsx'
import { Layout } from '../Layout'
import { EquipmentSubmission } from '../../types/database'

interface AdminEquipmentSubmissionsPageProps {
  equipmentSubmissions: EquipmentSubmission[]
  total: number
}

export const AdminEquipmentSubmissionsPage: FC<AdminEquipmentSubmissionsPageProps> = ({
  equipmentSubmissions,
  total,
}) => {
  const breadcrumbs = [
    { label: 'Admin', href: '/admin' },
    { label: 'Equipment Submissions', href: '/admin/equipment-submissions' },
  ]

  return (
    <Layout
      title="Equipment Submissions - Admin"
      description="Review and moderate equipment submissions"
    >
      <div class="container mx-auto px-4 py-8">
        <div class="max-w-6xl mx-auto">
          <div class="mb-8">
            <h1 class="text-3xl font-bold text-gray-900 mb-2">Equipment Submissions</h1>
            <p class="text-gray-600">
              Review and moderate equipment submissions from users ({total} total pending)
            </p>
          </div>

          {equipmentSubmissions.length === 0 ? (
            <div class="bg-white rounded-lg shadow p-8 text-center">
              <div class="text-gray-400 mb-4">
                <svg
                  class="w-16 h-16 mx-auto"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="1"
                    d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z"
                  ></path>
                </svg>
              </div>
              <h3 class="text-lg font-medium text-gray-900 mb-2">
                No pending equipment submissions
              </h3>
              <p class="text-gray-600">All equipment submissions have been processed!</p>
            </div>
          ) : (
            <div class="space-y-6">
              {equipmentSubmissions.map(submission => (
                <div key={submission.id} class="bg-white rounded-lg shadow border border-gray-200">
                  <div class="p-6">
                    <div class="flex justify-between items-start mb-4">
                      <div>
                        <h3 class="text-lg font-semibold text-gray-900">{submission.name}</h3>
                        <p class="text-sm text-gray-600">by {submission.manufacturer}</p>
                      </div>
                      <div class="flex items-center space-x-2">
                        <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800">
                          {submission.category.charAt(0).toUpperCase() +
                            submission.category.slice(1)}
                        </span>
                        <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                          Pending
                        </span>
                      </div>
                    </div>

                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                      <div>
                        <p class="text-sm font-medium text-gray-700">Category</p>
                        <p class="text-sm text-gray-900">
                          {submission.category.charAt(0).toUpperCase() +
                            submission.category.slice(1)}
                          {submission.subcategory &&
                            ` - ${submission.subcategory.replace('_', ' ')}`}
                        </p>
                      </div>
                      <div>
                        <p class="text-sm font-medium text-gray-700">Submitted</p>
                        <p class="text-sm text-gray-900">
                          {new Date(submission.created_at).toLocaleDateString('en-US', {
                            year: 'numeric',
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </p>
                      </div>
                    </div>

                    {submission.specifications &&
                      typeof submission.specifications === 'object' &&
                      'description' in submission.specifications &&
                      submission.specifications.description && (
                        <div class="mb-4">
                          <p class="text-sm font-medium text-gray-700 mb-1">Specifications</p>
                          <p class="text-sm text-gray-900 bg-gray-50 p-3 rounded">
                            {submission.specifications.description}
                          </p>
                        </div>
                      )}

                    <div class="flex items-center justify-between pt-4 border-t border-gray-200">
                      <div class="text-sm text-gray-600">ID: {submission.id}</div>
                      <div class="flex space-x-3">
                        <form
                          method="post"
                          action={`/api/admin/equipment-submissions/${submission.id}/reject`}
                          style="display: inline;"
                        >
                          <button
                            type="submit"
                            class="px-4 py-2 text-sm font-medium text-red-700 bg-red-100 hover:bg-red-200 rounded-md transition-colors"
                            onclick="return confirm('Are you sure you want to reject this equipment submission?')"
                          >
                            Reject
                          </button>
                        </form>
                        <form
                          method="post"
                          action={`/api/admin/equipment-submissions/${submission.id}/approve`}
                          style="display: inline;"
                        >
                          <button
                            type="submit"
                            class="px-4 py-2 text-sm font-medium text-white bg-green-600 hover:bg-green-700 rounded-md transition-colors"
                            onclick="return confirm('Are you sure you want to approve this equipment submission? This will create a new equipment entry in the database.')"
                          >
                            Approve & Publish
                          </button>
                        </form>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div class="mt-8 text-center">
            <a
              href="/admin"
              class="inline-flex items-center px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
            >
              <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M10 19l-7-7m0 0l7-7m-7 7h18"
                ></path>
              </svg>
              Back to Admin Dashboard
            </a>
          </div>
        </div>
      </div>
    </Layout>
  )
}

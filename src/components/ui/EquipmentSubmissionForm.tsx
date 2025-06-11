import type { FC } from 'hono/jsx'

interface EquipmentSubmissionFormProps {
  baseUrl: string
}

export const EquipmentSubmissionForm: FC<EquipmentSubmissionFormProps> = ({ baseUrl }) => {
  return (
    <div class="max-w-2xl mx-auto">
      <div class="bg-white rounded-lg shadow-md p-6">
        <h2 class="text-2xl font-bold text-gray-900 mb-6">Submit New Equipment</h2>

        <form method="post" action={`${baseUrl}/api/equipment/submit`} class="space-y-6">
          <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Equipment Name */}
            <div class="md:col-span-2">
              <label for="name" class="block text-sm font-medium text-gray-700 mb-2">
                Equipment Name *
              </label>
              <input
                type="text"
                id="name"
                name="name"
                required
                class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="e.g., Hurricane 3"
              />
            </div>

            {/* Manufacturer */}
            <div>
              <label for="manufacturer" class="block text-sm font-medium text-gray-700 mb-2">
                Manufacturer *
              </label>
              <input
                type="text"
                id="manufacturer"
                name="manufacturer"
                required
                class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="e.g., DHS, Butterfly, Yasaka"
              />
            </div>

            {/* Category */}
            <div>
              <label for="category" class="block text-sm font-medium text-gray-700 mb-2">
                Category *
              </label>
              <select
                id="category"
                name="category"
                required
                class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="">Select category</option>
                <option value="blade">Blade</option>
                <option value="rubber">Rubber</option>
                <option value="ball">Ball</option>
              </select>
            </div>

            {/* Subcategory (for rubbers) */}
            <div class="md:col-span-2">
              <label for="subcategory" class="block text-sm font-medium text-gray-700 mb-2">
                Subcategory (for rubbers)
              </label>
              <select
                id="subcategory"
                name="subcategory"
                class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="">Select subcategory (optional)</option>
                <option value="inverted">Inverted</option>
                <option value="long_pips">Long Pips</option>
                <option value="anti">Anti</option>
                <option value="short_pips">Short Pips</option>
              </select>
            </div>

            {/* Specifications */}
            <div class="md:col-span-2">
              <label for="specifications" class="block text-sm font-medium text-gray-700 mb-2">
                Additional Specifications (Optional)
              </label>
              <textarea
                id="specifications"
                name="specifications"
                rows={4}
                class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Any additional details about the equipment (e.g., speed, spin, control ratings, weight, etc.)"
              />
              <p class="mt-1 text-sm text-gray-500">
                Optional: Add any technical specifications, ratings, or other relevant information
              </p>
            </div>
          </div>

          {/* Submission Guidelines */}
          <div class="bg-blue-50 border border-blue-200 rounded-md p-4">
            <h3 class="text-sm font-medium text-blue-800 mb-2">Submission Guidelines</h3>
            <ul class="text-sm text-blue-700 space-y-1">
              <li>• Ensure the equipment name and manufacturer are accurate</li>
              <li>• Check if the equipment already exists before submitting</li>
              <li>• Submissions will be reviewed by moderators before being published</li>
              <li>• You will receive a Discord notification once your submission is reviewed</li>
            </ul>
          </div>

          {/* Submit Button */}
          <div class="flex items-center justify-between">
            <button
              type="button"
              onclick="history.back()"
              class="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              class="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-md transition-colors"
            >
              Submit Equipment
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

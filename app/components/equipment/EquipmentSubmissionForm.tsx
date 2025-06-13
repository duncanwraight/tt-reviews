import { Form, useActionData, useNavigation } from "react-router";

export function EquipmentSubmissionForm() {
  const actionData = useActionData();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";


  return (
    <div className="max-w-2xl mx-auto">
      <div className="bg-white rounded-lg shadow-md p-6">
        {actionData?.error && (
          <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-md">
            <p className="text-red-800">{actionData.error}</p>
          </div>
        )}

        <h2 className="text-2xl font-bold text-gray-900 mb-6">
          Submit New Equipment
        </h2>

        <Form method="post" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Equipment Name */}
            <div className="md:col-span-2">
              <label
                htmlFor="name"
                className="block text-sm font-medium text-gray-700 mb-2"
              >
                Equipment Name *
              </label>
              <input
                type="text"
                id="name"
                name="name"
                required
                disabled={isSubmitting}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent disabled:bg-gray-100"
                placeholder="e.g., Hurricane 3"
              />
            </div>

            {/* Manufacturer */}
            <div>
              <label
                htmlFor="manufacturer"
                className="block text-sm font-medium text-gray-700 mb-2"
              >
                Manufacturer *
              </label>
              <input
                type="text"
                id="manufacturer"
                name="manufacturer"
                required
                disabled={isSubmitting}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent disabled:bg-gray-100"
                placeholder="e.g., DHS, Butterfly, Yasaka"
              />
            </div>

            {/* Category */}
            <div>
              <label
                htmlFor="category"
                className="block text-sm font-medium text-gray-700 mb-2"
              >
                Category *
              </label>
              <select
                id="category"
                name="category"
                required
                disabled={isSubmitting}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent disabled:bg-gray-100"
              >
                <option value="">Select category</option>
                <option value="blade">Blade</option>
                <option value="rubber">Rubber</option>
                <option value="ball">Ball</option>
              </select>
            </div>

            {/* Subcategory (for rubbers) */}
            <div className="md:col-span-2">
              <label
                htmlFor="subcategory"
                className="block text-sm font-medium text-gray-700 mb-2"
              >
                Subcategory (for rubbers)
              </label>
              <select
                id="subcategory"
                name="subcategory"
                disabled={isSubmitting}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent disabled:bg-gray-100"
              >
                <option value="">Select subcategory (optional)</option>
                <option value="inverted">Inverted</option>
                <option value="long_pips">Long Pips</option>
                <option value="anti">Anti</option>
                <option value="short_pips">Short Pips</option>
              </select>
            </div>

            {/* Specifications */}
            <div className="md:col-span-2">
              <label
                htmlFor="specifications"
                className="block text-sm font-medium text-gray-700 mb-2"
              >
                Additional Specifications (Optional)
              </label>
              <textarea
                id="specifications"
                name="specifications"
                rows={4}
                disabled={isSubmitting}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent disabled:bg-gray-100"
                placeholder="Any additional details about the equipment (e.g., speed, spin, control ratings, weight, etc.)"
              />
            </div>
          </div>

          {/* Submit Button */}
          <div className="flex justify-end space-x-3">
            <a
              href="/equipment"
              className="px-6 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-purple-500"
            >
              Cancel
            </a>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-6 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-purple-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? "Submitting..." : "Submit Equipment"}
            </button>
          </div>
        </Form>
      </div>
    </div>
  );
}

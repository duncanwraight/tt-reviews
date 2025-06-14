import { Form, useNavigate } from "react-router";
import { useState, useEffect } from "react";
import { RouterFormModalWrapper } from "~/components/ui/RouterFormModalWrapper";
import { ImageUpload } from "~/components/ui/ImageUpload";
import type { CategoryOption } from "~/lib/categories.server";
import { createBrowserClient } from "@supabase/ssr";

interface EquipmentSubmissionFormProps {
  categories: CategoryOption[];
  env: {
    SUPABASE_URL: string;
    SUPABASE_ANON_KEY: string;
  };
}

export function EquipmentSubmissionForm({ categories, env }: EquipmentSubmissionFormProps) {
  const navigate = useNavigate();
  const [selectedCategory, setSelectedCategory] = useState<string>("");
  const [subcategories, setSubcategories] = useState<CategoryOption[]>([]);
  const [loadingSubcategories, setLoadingSubcategories] = useState(false);

  // Load subcategories when category changes
  useEffect(() => {
    if (!selectedCategory) {
      setSubcategories([]);
      return;
    }

    const loadSubcategories = async () => {
      setLoadingSubcategories(true);
      try {
        const supabase = createBrowserClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY);
        const { data, error } = await supabase
          .rpc('get_subcategories_by_parent', { parent_category_value: selectedCategory });

        if (error) {
          console.error('Error loading subcategories:', error);
          setSubcategories([]);
        } else {
          setSubcategories(data || []);
        }
      } catch (error) {
        console.error('Exception loading subcategories:', error);
        setSubcategories([]);
      } finally {
        setLoadingSubcategories(false);
      }
    };

    loadSubcategories();
  }, [selectedCategory, env]);

  return (
    <div className="max-w-2xl mx-auto">
      <div className="bg-white rounded-lg shadow-md p-6">
        <RouterFormModalWrapper
          loadingTitle="Submitting Equipment"
          loadingMessage="Please wait while we submit your equipment to our database..."
          successTitle="Equipment Submitted!"
          successMessage="Your equipment has been successfully submitted and will be reviewed by our team. Thank you for contributing to our database!"
          errorTitle="Submission Failed"
          successRedirect={() => navigate("/equipment")}
          successRedirectDelay={3000}
          successActions={
            <button
              onClick={() => navigate("/equipment")}
              className="bg-green-600 hover:bg-green-700 text-white font-medium py-2 px-6 rounded-lg transition-colors"
            >
              View Equipment List
            </button>
          }
        >
          {({ isLoading }) => (
            <>
              <h2 className="text-2xl font-bold text-gray-900 mb-6">
                Submit New Equipment
              </h2>

              <Form method="post" encType="multipart/form-data" className="space-y-6">
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
                disabled={isLoading}
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
                disabled={isLoading}
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
                disabled={isLoading}
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent disabled:bg-gray-100"
              >
                <option value="">Select category</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.value}>
                    {category.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Subcategory */}
            {selectedCategory && subcategories.length > 0 && (
              <div className="md:col-span-2">
                <label
                  htmlFor="subcategory"
                  className="block text-sm font-medium text-gray-700 mb-2"
                >
                  Subcategory
                </label>
                <select
                  id="subcategory"
                  name="subcategory"
                  disabled={isLoading || loadingSubcategories}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent disabled:bg-gray-100"
                >
                  <option value="">Select subcategory (optional)</option>
                  {subcategories.map((subcategory) => (
                    <option key={subcategory.id} value={subcategory.value}>
                      {subcategory.name}
                    </option>
                  ))}
                </select>
                {loadingSubcategories && (
                  <p className="mt-1 text-xs text-gray-500">Loading subcategories...</p>
                )}
              </div>
            )}

            {/* Equipment Image */}
            <div className="md:col-span-2">
              <ImageUpload
                name="image"
                label="Equipment Image (Optional)"
                disabled={isLoading}
                maxSize={10}
                preview={true}
              />
              <p className="mt-1 text-xs text-gray-500">
                Upload a clear photo of the equipment. This helps with identification and moderation.
              </p>
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
                disabled={isLoading}
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
              disabled={isLoading}
              className="px-6 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-purple-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? "Submitting..." : "Submit Equipment"}
            </button>
          </div>
              </Form>
            </>
          )}
        </RouterFormModalWrapper>
      </div>
    </div>
  );
}

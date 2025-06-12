import { useState } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { useNavigate } from "react-router";

interface EquipmentSubmissionFormProps {
  env: {
    SUPABASE_URL: string;
    SUPABASE_ANON_KEY: string;
  };
  userId: string;
}

export function EquipmentSubmissionForm({ env, userId }: EquipmentSubmissionFormProps) {
  const navigate = useNavigate();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);
    setSuccess(null);

    const formData = new FormData(event.currentTarget);
    const name = formData.get('name') as string;
    const manufacturer = formData.get('manufacturer') as string;
    const category = formData.get('category') as string;
    const subcategory = formData.get('subcategory') as string;
    const specificationsText = formData.get('specifications') as string;

    // Validate required fields
    if (!name || !manufacturer || !category) {
      setError('Please fill in all required fields.');
      setIsSubmitting(false);
      return;
    }

    // Parse specifications as JSON if provided
    let specifications = {};
    if (specificationsText.trim()) {
      try {
        // Try to parse as JSON, fallback to simple object
        specifications = JSON.parse(specificationsText);
      } catch {
        // If not valid JSON, treat as description
        specifications = { description: specificationsText.trim() };
      }
    }

    try {
      const supabase = createBrowserClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY);
      
      const { data, error: submitError } = await supabase
        .from('equipment_submissions')
        .insert({
          user_id: userId,
          name: name.trim(),
          manufacturer: manufacturer.trim(),
          category: category as 'blade' | 'rubber' | 'ball',
          subcategory: subcategory || null,
          specifications,
          status: 'pending'
        })
        .select()
        .single();

      if (submitError) {
        throw submitError;
      }

      setSuccess('Equipment submitted successfully! It will be reviewed by our team.');
      
      // Reset form
      (event.target as HTMLFormElement).reset();
      
      // Redirect after a short delay
      setTimeout(() => {
        navigate('/equipment');
      }, 2000);

    } catch (err) {
      console.error('Submission error:', err);
      setError('Failed to submit equipment. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto">
      <div className="bg-white rounded-lg shadow-md p-6">
        <h2 className="text-2xl font-bold text-gray-900 mb-6">Submit New Equipment</h2>

        {error && (
          <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
            {error}
          </div>
        )}
        
        {success && (
          <div className="mb-4 bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded">
            {success}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Equipment Name */}
            <div className="md:col-span-2">
              <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-2">
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
              <label htmlFor="manufacturer" className="block text-sm font-medium text-gray-700 mb-2">
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
              <label htmlFor="category" className="block text-sm font-medium text-gray-700 mb-2">
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
              <label htmlFor="subcategory" className="block text-sm font-medium text-gray-700 mb-2">
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
              <label htmlFor="specifications" className="block text-sm font-medium text-gray-700 mb-2">
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
            <button
              type="button"
              onClick={() => navigate('/equipment')}
              disabled={isSubmitting}
              className="px-6 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-purple-500 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-6 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-purple-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? 'Submitting...' : 'Submit Equipment'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
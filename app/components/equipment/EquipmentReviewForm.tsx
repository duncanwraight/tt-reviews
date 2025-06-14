import { useNavigate } from "react-router";
import { useState } from "react";
import { RouterFormModalWrapper } from "~/components/ui/RouterFormModalWrapper";
import { ImageUpload } from "~/components/ui/ImageUpload";
import { RatingInput } from "~/components/ui/RatingInput";
import type { CategoryOption } from "~/lib/categories.server";
import type { Equipment } from "~/lib/types";

interface EquipmentReviewFormProps {
  equipment: Equipment;
  playingStyles: CategoryOption[];
  ratingCategories: CategoryOption[];
  generalRatingCategories: CategoryOption[];
  env: {
    SUPABASE_URL: string;
    SUPABASE_ANON_KEY: string;
  };
}

export function EquipmentReviewForm({
  equipment,
  playingStyles,
  ratingCategories,
  generalRatingCategories,
  env,
}: EquipmentReviewFormProps) {
  const navigate = useNavigate();
  const [overallRating, setOverallRating] = useState<number>(5);
  const [categoryRatings, setCategoryRatings] = useState<Record<string, number>>({});

  // Combine all rating categories (general + equipment-specific)
  const allRatingCategories = [
    ...generalRatingCategories,
    ...ratingCategories,
  ].sort((a, b) => a.display_order - b.display_order);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    
    const formData = new FormData(event.currentTarget);
    
    // Add overall rating to form data
    formData.set("overall_rating", overallRating.toString());
    
    // Add category ratings to form data
    Object.entries(categoryRatings).forEach(([category, rating]) => {
      formData.set(`rating_${category}`, rating.toString());
    });

    try {
      const response = await fetch(window.location.pathname, {
        method: "POST",
        body: formData,
      });

      if (response.ok) {
        navigate(`/equipment/${equipment.slug}`);
      } else {
        throw new Error("Failed to submit review");
      }
    } catch (error) {
      console.error("Error submitting review:", error);
      // The RouterFormModalWrapper will handle error display
      throw error;
    }
  };

  const handleCategoryRatingChange = (category: string, rating: number) => {
    setCategoryRatings(prev => ({ ...prev, [category]: rating }));
  };

  return (
    <RouterFormModalWrapper
      loadingTitle="Submitting Review"
      loadingMessage="Please wait while we submit your review..."
      successTitle="Review Submitted!"
      successMessage="Your review has been submitted and will be reviewed by our team."
      successRedirect={() => navigate(`/equipment/${equipment.slug}`)}
      successRedirectDelay={3000}
    >
      {({ isLoading }) => (
        <form onSubmit={handleSubmit} encType="multipart/form-data" className="space-y-8">
          {/* Equipment Info Header */}
          <div className="bg-gray-50 p-6 rounded-lg">
            <div className="flex items-center gap-4">
              {equipment.image_url && (
                <img
                  src={equipment.image_url}
                  alt={equipment.name}
                  className="w-16 h-16 object-cover rounded"
                />
              )}
              <div>
                <h3 className="text-lg font-semibold text-gray-900">
                  {equipment.name}
                </h3>
                <p className="text-gray-600">
                  {equipment.manufacturer} • {equipment.category}
                  {equipment.subcategory && ` • ${equipment.subcategory}`}
                </p>
              </div>
            </div>
          </div>

          {/* Overall Rating */}
          <div className="space-y-3">
            <label className="block text-sm font-semibold text-gray-900">
              Overall Rating <span className="text-red-500">*</span>
            </label>
            <div className="flex items-center gap-4">
              <RatingInput
                value={overallRating}
                onChange={setOverallRating}
                disabled={isLoading}
              />
              <span className="text-sm text-gray-600">
                {overallRating}/10
              </span>
            </div>
          </div>

          {/* Category Ratings */}
          {allRatingCategories.length > 0 && (
            <div className="space-y-6">
              <h3 className="text-lg font-semibold text-gray-900">
                Detailed Ratings
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {allRatingCategories.map((category) => (
                  <div key={category.value} className="space-y-3">
                    <label className="block text-sm font-medium text-gray-700">
                      {category.name}
                    </label>
                    <div className="flex items-center gap-4">
                      <RatingInput
                        value={categoryRatings[category.value] || 5}
                        onChange={(rating) => handleCategoryRatingChange(category.value, rating)}
                        disabled={isLoading}
                      />
                      <span className="text-sm text-gray-600">
                        {categoryRatings[category.value] || 5}/10
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Review Text */}
          <div className="space-y-3">
            <label htmlFor="review_text" className="block text-sm font-medium text-gray-700">
              Your Review
            </label>
            <textarea
              id="review_text"
              name="review_text"
              rows={6}
              disabled={isLoading}
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-purple-500 focus:border-purple-500 disabled:opacity-50"
              placeholder="Share your detailed experience with this equipment..."
            />
            <p className="text-sm text-gray-500">
              Tell others about your experience: How does it perform? What do you like or dislike about it?
            </p>
          </div>

          {/* Reviewer Context */}
          <div className="space-y-6">
            <h3 className="text-lg font-semibold text-gray-900">
              About You (Optional)
            </h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Playing Level */}
              <div className="space-y-3">
                <label htmlFor="playing_level" className="block text-sm font-medium text-gray-700">
                  Playing Level
                </label>
                <select
                  id="playing_level"
                  name="playing_level"
                  disabled={isLoading}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-purple-500 focus:border-purple-500 disabled:opacity-50"
                >
                  <option value="">Select level</option>
                  <option value="beginner">Beginner</option>
                  <option value="intermediate">Intermediate</option>
                  <option value="advanced">Advanced</option>
                  <option value="professional">Professional</option>
                </select>
              </div>

              {/* Playing Style */}
              <div className="space-y-3">
                <label htmlFor="style_of_play" className="block text-sm font-medium text-gray-700">
                  Playing Style
                </label>
                <select
                  id="style_of_play"
                  name="style_of_play"
                  disabled={isLoading}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-purple-500 focus:border-purple-500 disabled:opacity-50"
                >
                  <option value="">Select style</option>
                  {playingStyles.map((style) => (
                    <option key={style.value} value={style.value}>
                      {style.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Testing Duration */}
              <div className="space-y-3">
                <label htmlFor="testing_duration" className="block text-sm font-medium text-gray-700">
                  How long have you been using this equipment?
                </label>
                <select
                  id="testing_duration"
                  name="testing_duration"
                  disabled={isLoading}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-purple-500 focus:border-purple-500 disabled:opacity-50"
                >
                  <option value="">Select duration</option>
                  <option value="less_than_1_month">Less than 1 month</option>
                  <option value="1_3_months">1-3 months</option>
                  <option value="3_6_months">3-6 months</option>
                  <option value="6_12_months">6-12 months</option>
                  <option value="more_than_1_year">More than 1 year</option>
                </select>
              </div>
            </div>
          </div>

          {/* Image Upload */}
          <div className="space-y-3">
            <label className="block text-sm font-medium text-gray-700">
              Photo (Optional)
            </label>
            <ImageUpload
              name="image"
              label="Upload a photo of your equipment setup"
              disabled={isLoading}
              maxSize={10}
              preview={true}
            />
            <p className="text-sm text-gray-500">
              Share a photo of your equipment setup to help other players visualize your review.
            </p>
          </div>

          {/* Submit Button */}
          <div className="flex items-center justify-end gap-4 pt-6 border-t border-gray-200">
            <button
              type="button"
              onClick={() => navigate(`/equipment/${equipment.slug}`)}
              disabled={isLoading}
              className="px-6 py-2 text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isLoading}
              className="px-6 py-2 bg-purple-600 text-white font-semibold rounded-md hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500 disabled:opacity-50"
            >
              {isLoading ? "Submitting..." : "Submit Review"}
            </button>
          </div>
        </form>
      )}
    </RouterFormModalWrapper>
  );
}
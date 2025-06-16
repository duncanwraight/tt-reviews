import { Form, useNavigate } from "react-router";
import { useState } from "react";
import { RouterFormModalWrapper } from "~/components/ui/RouterFormModalWrapper";
import { ImageUpload } from "~/components/ui/ImageUpload";
import { RatingInput } from "~/components/ui/RatingInput";
import { CSRFToken } from "~/components/ui/CSRFToken";
import type { CategoryOption } from "~/lib/categories.server";
import type { Equipment } from "~/lib/types";

interface EquipmentReviewFormProps {
  equipment: Equipment;
  playingStyles: CategoryOption[];
  ratingCategories: CategoryOption[];
  generalRatingCategories: CategoryOption[];
  csrfToken: string;
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
  csrfToken,
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
        <Form method="POST" encType="multipart/form-data" className="space-y-8">
          {/* CSRF Token */}
          <CSRFToken token={csrfToken} />
          
          {/* Hidden inputs for ratings */}
          <input type="hidden" name="overall_rating" value={overallRating} />
          {Object.entries(categoryRatings).map(([category, rating]) => (
            <input key={category} type="hidden" name={`rating_${category}`} value={rating} />
          ))}

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
            <p className="text-sm text-gray-500">
              Rate this equipment from 1 (terrible) to 10 (excellent)
            </p>
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
                    <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
                      {category.name}
                      {category.description && (
                        <div className="relative group">
                          <svg 
                            className="w-4 h-4 text-gray-400 hover:text-gray-600 cursor-help" 
                            fill="currentColor" 
                            viewBox="0 0 20 20"
                          >
                            <path 
                              fillRule="evenodd" 
                              d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-3a1 1 0 00-.867.5 1 1 0 11-1.731-1A3 3 0 0113 8a3.001 3.001 0 01-2 2.83V11a1 1 0 11-2 0v-1a1 1 0 011-1 1 1 0 100-2zm0 8a1 1 0 100-2 1 1 0 000 2z" 
                              clipRule="evenodd" 
                            />
                          </svg>
                          <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-3 py-2 bg-gray-900 text-white text-xs rounded-lg shadow-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none w-64 text-center z-10">
                            {category.description}
                            <div className="absolute top-full left-1/2 transform -translate-x-1/2 border-4 border-transparent border-t-gray-900"></div>
                          </div>
                        </div>
                      )}
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
              About You
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
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
                  Testing Duration
                </label>
                <select
                  id="testing_duration"
                  name="testing_duration"
                  disabled={isLoading}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-purple-500 focus:border-purple-500 disabled:opacity-50"
                >
                  <option value="less_than_week">Less than a week</option>
                  <option value="week_to_month">1 week - 1 month</option>
                  <option value="month_to_6months">1 - 6 months</option>
                  <option value="more_than_6months">More than 6 months</option>
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
              env={env}
              disabled={isLoading}
            />
            <p className="text-sm text-gray-500">
              Upload a photo of your equipment setup or the equipment in use
            </p>
          </div>

          {/* Submit Button */}
          <div className="pt-6">
            <button
              type="submit"
              disabled={isLoading}
              className="px-6 py-2 bg-purple-600 text-white font-semibold rounded-md hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500 disabled:opacity-50"
            >
              {isLoading ? "Submitting..." : "Submit Review"}
            </button>
          </div>
        </Form>
      )}
    </RouterFormModalWrapper>
  );
}
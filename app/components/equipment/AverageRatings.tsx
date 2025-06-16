import { memo, useMemo, useCallback } from "react";

interface Review {
  id: string;
  overall_rating: number;
  category_ratings: Record<string, number>;
}

interface AverageRatingsProps {
  reviews: Review[];
  ratingCategories: Array<{
    name: string;
    value: string;
  }>;
}

export const AverageRatings = memo(function AverageRatings({ reviews, ratingCategories }: AverageRatingsProps) {
  // Memoize category averages calculation - most expensive operation
  const categoryAverages = useMemo(() => {
    const averages: Record<string, { average: number; count: number }> = {};
    
    reviews.forEach(review => {
      Object.entries(review.category_ratings).forEach(([category, rating]) => {
        if (!averages[category]) {
          averages[category] = { average: 0, count: 0 };
        }
        averages[category].average += rating;
        averages[category].count += 1;
      });
    });

    // Calculate final averages
    Object.keys(averages).forEach(category => {
      averages[category].average = averages[category].average / averages[category].count;
    });

    return averages;
  }, [reviews]);

  // Memoize overall average calculation
  const overallAverage = useMemo(() => {
    if (reviews.length === 0) return 0;
    return reviews.reduce((sum, review) => sum + review.overall_rating, 0) / reviews.length;
  }, [reviews]);

  // Memoize category label lookup function
  const getCategoryLabel = useCallback((value: string) => {
    const category = ratingCategories.find(cat => cat.value === value);
    return category?.name || value.charAt(0).toUpperCase() + value.slice(1).replace(/_/g, ' ');
  }, [ratingCategories]);

  // Memoize sorted category entries for display
  const sortedCategoryEntries = useMemo(() => {
    return Object.entries(categoryAverages)
      .sort(([a], [b]) => {
        // Sort by the order defined in ratingCategories, then alphabetically
        const orderA = ratingCategories.findIndex(cat => cat.value === a);
        const orderB = ratingCategories.findIndex(cat => cat.value === b);
        if (orderA !== -1 && orderB !== -1) return orderA - orderB;
        if (orderA !== -1) return -1;
        if (orderB !== -1) return 1;
        return a.localeCompare(b);
      });
  }, [categoryAverages, ratingCategories]);

  if (reviews.length === 0) {
    return null;
  }

  return (
    <div className="bg-gray-50 rounded-lg p-6 mb-8">
      <h3 className="text-lg font-semibold text-gray-900 mb-6">
        Average Ratings ({reviews.length} review{reviews.length !== 1 ? 's' : ''})
      </h3>
      
      {/* Overall Rating */}
      <div className="mb-6 pb-4 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <span className="text-base font-medium text-gray-900">Overall Rating</span>
          <div className="flex items-center gap-3">
            <div className="w-32 bg-gray-200 rounded-full h-3">
              <div
                className="bg-purple-600 h-3 rounded-full"
                style={{ width: `${(overallAverage / 10) * 100}%` }}
              ></div>
            </div>
            <span className="text-base font-semibold text-gray-900 w-12">
              {overallAverage.toFixed(1)}/10
            </span>
          </div>
        </div>
      </div>

      {/* Category Ratings */}
      {sortedCategoryEntries.length > 0 && (
        <div className="space-y-4">
          {sortedCategoryEntries.map(([category, { average, count }]) => (
            <div key={category} className="flex items-center justify-between">
              <span className="text-sm text-gray-600">
                {getCategoryLabel(category)}
                <span className="text-xs text-gray-400 ml-1">({count})</span>
              </span>
              <div className="flex items-center gap-3">
                <div className="w-24 bg-gray-200 rounded-full h-2">
                  <div
                    className="bg-purple-600 h-2 rounded-full"
                    style={{ width: `${(average / 10) * 100}%` }}
                  ></div>
                </div>
                <span className="text-sm font-medium text-gray-900 w-8">
                  {average.toFixed(1)}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
});
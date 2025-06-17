import type { Equipment } from "~/lib/types";

interface ComparisonTableProps {
  equipment1: Equipment;
  equipment2: Equipment;
  reviews1: any[];
  reviews2: any[];
  averageRating1?: number | null;
  averageRating2?: number | null;
}

export function ComparisonTable({
  equipment1,
  equipment2,
  reviews1,
  reviews2,
  averageRating1,
  averageRating2,
}: ComparisonTableProps) {
  // Helper function to render specification value
  const renderSpecValue = (value: any) => {
    if (value === null || value === undefined || value === "") {
      return <span className="text-gray-400">Not specified</span>;
    }
    if (typeof value === "boolean") {
      return value ? "Yes" : "No";
    }
    return String(value);
  };

  // Helper function to get category-specific rating breakdown
  const getCategoryRatings = (reviews: any[], category: string) => {
    const ratings = reviews
      .map(review => review.ratings?.[category])
      .filter(rating => rating !== null && rating !== undefined);

    if (ratings.length === 0) return null;

    const average =
      ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length;
    return average.toFixed(1);
  };

  // Get all specification keys from both equipment
  const allSpecKeys = new Set([
    ...Object.keys(equipment1.specifications || {}),
    ...Object.keys(equipment2.specifications || {}),
  ]);

  // Get rating categories based on equipment category
  const getRatingCategories = () => {
    if (equipment1.category === "rubber") {
      return ["speed", "spin", "control", "durability"];
    } else if (equipment1.category === "blade") {
      return ["speed", "control", "feeling", "consistency"];
    }
    return [];
  };

  const ratingCategories = getRatingCategories();

  return (
    <div className="bg-white rounded-lg shadow-sm overflow-hidden">
      <div className="px-6 py-4 bg-gray-50 border-b">
        <h2 className="text-xl font-semibold text-gray-900">
          Detailed Comparison
        </h2>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Specification
              </th>
              <th className="px-6 py-3 text-center text-xs font-medium text-purple-600 uppercase tracking-wider">
                {equipment1.name}
              </th>
              <th className="px-6 py-3 text-center text-xs font-medium text-blue-600 uppercase tracking-wider">
                {equipment2.name}
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {/* Basic Information */}
            <tr>
              <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                Manufacturer
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-center">
                {equipment1.manufacturer}
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-center">
                {equipment2.manufacturer}
              </td>
            </tr>

            <tr className="bg-gray-50">
              <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                Category
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-center capitalize">
                {equipment1.category}
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-center capitalize">
                {equipment2.category}
              </td>
            </tr>

            {(equipment1.subcategory || equipment2.subcategory) && (
              <tr>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                  Subcategory
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-center capitalize">
                  {equipment1.subcategory || "Not specified"}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-center capitalize">
                  {equipment2.subcategory || "Not specified"}
                </td>
              </tr>
            )}

            {/* Community Ratings */}
            <tr className="bg-purple-50">
              <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                Overall Rating
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-center">
                {averageRating1 ? (
                  <div className="flex items-center justify-center space-x-2">
                    <span className="font-semibold">
                      {averageRating1.toFixed(1)}
                    </span>
                    <span className="text-gray-500">
                      ({reviews1.length} reviews)
                    </span>
                  </div>
                ) : (
                  <span className="text-gray-400">No ratings yet</span>
                )}
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-center">
                {averageRating2 ? (
                  <div className="flex items-center justify-center space-x-2">
                    <span className="font-semibold">
                      {averageRating2.toFixed(1)}
                    </span>
                    <span className="text-gray-500">
                      ({reviews2.length} reviews)
                    </span>
                  </div>
                ) : (
                  <span className="text-gray-400">No ratings yet</span>
                )}
              </td>
            </tr>

            {/* Category-specific ratings */}
            {ratingCategories.map((category, index) => {
              const rating1 = getCategoryRatings(reviews1, category);
              const rating2 = getCategoryRatings(reviews2, category);

              return (
                <tr
                  key={category}
                  className={index % 2 === 0 ? "bg-gray-50" : ""}
                >
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 capitalize">
                    {category}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-center">
                    {rating1 || (
                      <span className="text-gray-400">No ratings</span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-center">
                    {rating2 || (
                      <span className="text-gray-400">No ratings</span>
                    )}
                  </td>
                </tr>
              );
            })}

            {/* Technical Specifications */}
            {Array.from(allSpecKeys).map((key, index) => {
              const value1 = equipment1.specifications?.[key];
              const value2 = equipment2.specifications?.[key];

              return (
                <tr key={key} className={index % 2 === 0 ? "bg-gray-50" : ""}>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 capitalize">
                    {key.replace(/_/g, " ")}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-center">
                    {renderSpecValue(value1)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-center">
                    {renderSpecValue(value2)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

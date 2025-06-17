import { Link } from "react-router";
import type { Equipment } from "~/lib/types";

interface ComparisonHeaderProps {
  equipment1: Equipment;
  equipment2: Equipment;
  averageRating1?: number | null;
  averageRating2?: number | null;
  reviewCount1: number;
  reviewCount2: number;
}

export function ComparisonHeader({
  equipment1,
  equipment2,
  averageRating1,
  averageRating2,
  reviewCount1,
  reviewCount2,
}: ComparisonHeaderProps) {
  const renderStars = (rating: number) => {
    return Array.from({ length: 5 }, (_, i) => (
      <svg
        key={i}
        className={`w-4 h-4 ${
          i < Math.floor(rating) ? "text-yellow-400" : "text-gray-300"
        }`}
        fill="currentColor"
        viewBox="0 0 20 20"
      >
        <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
      </svg>
    ));
  };

  return (
    <div className="bg-white rounded-lg shadow-sm p-6 mb-8">
      <div className="text-center mb-6">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">
          Equipment Comparison
        </h1>
        <p className="text-gray-600">
          Detailed side-by-side comparison of {equipment1.category}{" "}
          specifications and performance
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* Equipment 1 */}
        <div className="text-center">
          <div className="bg-purple-50 rounded-lg p-6">
            <Link to={`/equipment/${equipment1.slug}`} className="group">
              <h2 className="text-2xl font-bold text-gray-900 group-hover:text-purple-600 transition-colors mb-2">
                {equipment1.name}
              </h2>
            </Link>
            <p className="text-lg text-gray-600 mb-4">
              by {equipment1.manufacturer}
            </p>

            <div className="flex items-center justify-center space-x-2 mb-2">
              {averageRating1 ? (
                <>
                  <div className="flex">{renderStars(averageRating1)}</div>
                  <span className="text-sm font-medium text-gray-700">
                    {averageRating1.toFixed(1)}
                  </span>
                </>
              ) : (
                <span className="text-sm text-gray-500">No ratings yet</span>
              )}
            </div>

            <p className="text-sm text-gray-500">
              {reviewCount1} {reviewCount1 === 1 ? "review" : "reviews"}
            </p>

            {equipment1.subcategory && (
              <div className="mt-3">
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800">
                  {equipment1.subcategory}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* VS Divider */}
        <div className="hidden md:block absolute left-1/2 top-1/2 transform -translate-x-1/2 -translate-y-1/2 z-10">
          <div className="bg-white border-4 border-purple-600 rounded-full p-3">
            <span className="text-purple-600 font-bold text-lg">VS</span>
          </div>
        </div>
        <div className="md:hidden text-center py-4">
          <span className="inline-block bg-purple-600 text-white px-4 py-2 rounded-full font-bold">
            VS
          </span>
        </div>

        {/* Equipment 2 */}
        <div className="text-center">
          <div className="bg-blue-50 rounded-lg p-6">
            <Link to={`/equipment/${equipment2.slug}`} className="group">
              <h2 className="text-2xl font-bold text-gray-900 group-hover:text-blue-600 transition-colors mb-2">
                {equipment2.name}
              </h2>
            </Link>
            <p className="text-lg text-gray-600 mb-4">
              by {equipment2.manufacturer}
            </p>

            <div className="flex items-center justify-center space-x-2 mb-2">
              {averageRating2 ? (
                <>
                  <div className="flex">{renderStars(averageRating2)}</div>
                  <span className="text-sm font-medium text-gray-700">
                    {averageRating2.toFixed(1)}
                  </span>
                </>
              ) : (
                <span className="text-sm text-gray-500">No ratings yet</span>
              )}
            </div>

            <p className="text-sm text-gray-500">
              {reviewCount2} {reviewCount2 === 1 ? "review" : "reviews"}
            </p>

            {equipment2.subcategory && (
              <div className="mt-3">
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                  {equipment2.subcategory}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

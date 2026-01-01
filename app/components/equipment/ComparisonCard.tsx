import { Link } from "react-router";
import { useComparison } from "~/contexts/ComparisonContext";
import { LazyImage } from "~/components/ui/LazyImage";

interface Equipment {
  id: string;
  name: string;
  slug: string;
  category: string;
  subcategory?: string;
  manufacturer: string;
  rating?: number;
  reviewCount?: number;
  image_key?: string;
}

interface ComparisonCardProps {
  equipment: Equipment;
}

export function ComparisonCard({ equipment }: ComparisonCardProps) {
  const { isCompareMode, selectedEquipment, toggleEquipment } = useComparison();

  const isSelected = selectedEquipment.find(item => item.id === equipment.id);
  const canSelect = selectedEquipment.length < 2 || isSelected;

  // Check if we can select this equipment (same category as already selected)
  const categoryMatch =
    selectedEquipment.length === 0 ||
    selectedEquipment.every(
      selected => selected.category === equipment.category
    );

  const handleCompareClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (canSelect && categoryMatch) {
      toggleEquipment(equipment);
    }
  };

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case "blade":
        return "🏓";
      case "rubber":
        return "⚫";
      case "ball":
        return "🟠";
      default:
        return "📋";
    }
  };

  const getSubcategoryName = (subcategory?: string) => {
    if (!subcategory) return null;
    switch (subcategory) {
      case "inverted":
        return "Inverted";
      case "long_pips":
        return "Long Pips";
      case "anti":
        return "Anti-Spin";
      case "short_pips":
        return "Short Pips";
      default:
        return subcategory.charAt(0).toUpperCase() + subcategory.slice(1);
    }
  };

  return (
    <div
      className={`relative bg-white rounded-lg shadow-sm border transition-all duration-200 hover:shadow-md ${
        isSelected
          ? "border-purple-500 bg-purple-50"
          : "border-gray-200 hover:border-gray-300"
      }`}
    >
      {isCompareMode && (
        <div className="absolute top-3 right-3 z-10">
          <button
            onClick={handleCompareClick}
            disabled={!canSelect || !categoryMatch}
            className={`w-8 h-8 rounded-full border-2 flex items-center justify-center transition-all ${
              isSelected
                ? "border-purple-500 bg-purple-500 text-white"
                : canSelect && categoryMatch
                  ? "border-gray-300 bg-white hover:border-purple-500 hover:bg-purple-50"
                  : "border-gray-200 bg-gray-100 cursor-not-allowed opacity-50"
            }`}
          >
            {isSelected ? (
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                <path
                  fillRule="evenodd"
                  d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                  clipRule="evenodd"
                />
              </svg>
            ) : (
              <div className="w-3 h-3 rounded-full border border-current"></div>
            )}
          </button>
        </div>
      )}

      <Link to={`/equipment/${equipment.slug}`} className="block p-6">
        <div className="flex items-start space-x-4">
          {/* Equipment Image/Icon */}
          <div className="flex-shrink-0 w-16 h-16 rounded-lg bg-gray-100 overflow-hidden flex items-center justify-center">
            {equipment.image_key ? (
              <LazyImage
                src={`/api/images/${equipment.image_key}`}
                alt={equipment.name}
                className="w-full h-full"
                placeholder="skeleton"
                fallbackIcon={
                  <span className="text-3xl text-gray-300">{getCategoryIcon(equipment.category)}</span>
                }
              />
            ) : (
              <span className="text-3xl text-gray-300">{getCategoryIcon(equipment.category)}</span>
            )}
          </div>

          <div className="flex-1 min-w-0">
            <h3 className="text-lg font-semibold text-gray-900 mb-1 truncate">
              {equipment.name}
            </h3>

            <p className="text-sm text-gray-600 mb-2">
              {equipment.manufacturer}
            </p>

            {equipment.subcategory && (
              <div className="mb-3">
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                  {getSubcategoryName(equipment.subcategory)}
                </span>
              </div>
            )}

            {equipment.rating && equipment.reviewCount ? (
              <div className="flex items-center space-x-2">
                <div className="flex">
                  {Array.from({ length: 5 }, (_, i) => (
                    <svg
                      key={i}
                      className={`w-4 h-4 ${
                        i < Math.floor(equipment.rating!)
                          ? "text-yellow-400"
                          : "text-gray-300"
                      }`}
                      fill="currentColor"
                      viewBox="0 0 20 20"
                    >
                      <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                    </svg>
                  ))}
                </div>
                <span className="text-sm text-gray-600">
                  {equipment.rating.toFixed(1)} ({equipment.reviewCount}{" "}
                  reviews)
                </span>
              </div>
            ) : (
              <div className="text-sm text-gray-500">No reviews yet</div>
            )}
          </div>
        </div>
      </Link>
    </div>
  );
}

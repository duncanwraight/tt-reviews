import { Link } from "react-router";
import { memo, useMemo } from "react";
import { LazyImage } from "./LazyImage";

interface EquipmentCardProps {
  equipment: {
    id: string;
    name: string;
    slug: string;
    category: string;
    manufacturer: string;
    rating?: number;
    reviewCount?: number;
    image_key?: string;
  };
}

export const EquipmentCard = memo(function EquipmentCard({
  equipment,
}: EquipmentCardProps) {
  // Memoize the rating display logic to avoid unnecessary recalculations
  const ratingDisplay = useMemo(() => {
    if (!equipment.rating || !equipment.reviewCount) return null;

    return (
      <div className="flex items-center text-yellow-400">
        <span className="text-sm mr-1">★</span>
        <span className="text-sm font-medium text-gray-700">
          {equipment.rating} ({equipment.reviewCount})
        </span>
      </div>
    );
  }, [equipment.rating, equipment.reviewCount]);

  // Get category-specific icon
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

  // Memoize image URL
  const imageUrl = useMemo(() => {
    return equipment.image_key ? `/api/images/${equipment.image_key}` : null;
  }, [equipment.image_key]);

  const categoryIcon = getCategoryIcon(equipment.category);

  return (
    <Link
      to={`/equipment/${equipment.slug}`}
      className="group bg-white rounded-xl shadow-md hover:shadow-xl transition-all duration-300 transform hover:-translate-y-1 border border-gray-100"
    >
      {/* Equipment Image */}
      <div className="h-40 bg-gray-100 rounded-t-xl overflow-hidden flex items-center justify-center">
        {imageUrl ? (
          <LazyImage
            src={imageUrl}
            alt={equipment.name}
            className="w-full h-full"
            placeholder="skeleton"
            fallbackIcon={
              <span className="text-5xl text-gray-300">{categoryIcon}</span>
            }
          />
        ) : (
          <span className="text-5xl text-gray-300">{categoryIcon}</span>
        )}
      </div>

      <div className="p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="inline-block px-2 py-0.5 text-xs font-semibold text-purple-800 bg-purple-100 rounded-full capitalize">
            {equipment.category}
          </span>
          {ratingDisplay}
        </div>
        <h3 className="text-lg font-bold text-gray-900 mb-1 group-hover:text-purple-600 transition-colors truncate">
          {equipment.name}
        </h3>
        <p className="text-sm text-gray-600 mb-3">{equipment.manufacturer}</p>
        <div className="flex items-center justify-between">
          <span className="text-purple-600 text-sm font-semibold group-hover:text-purple-800">
            View Details →
          </span>
        </div>
      </div>
    </Link>
  );
});

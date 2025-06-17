import { Link } from "react-router";
import { memo, useMemo } from "react";

interface EquipmentCardProps {
  equipment: {
    id: string;
    name: string;
    slug: string;
    category: string;
    manufacturer: string;
    rating?: number;
    reviewCount?: number;
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

  return (
    <Link
      to={`/equipment/${equipment.slug}`}
      className="group bg-white rounded-xl shadow-md hover:shadow-xl transition-all duration-300 transform hover:-translate-y-1 border border-gray-100"
    >
      <div className="p-6">
        <div className="flex items-center justify-between mb-4">
          <span className="inline-block px-3 py-1 text-xs font-semibold text-purple-800 bg-purple-100 rounded-full capitalize">
            {equipment.category}
          </span>
          {ratingDisplay}
        </div>
        <h3 className="text-xl font-bold text-gray-900 mb-2 group-hover:text-purple-600 transition-colors">
          {equipment.name}
        </h3>
        <p className="text-gray-600 mb-4">{equipment.manufacturer}</p>
        <div className="flex items-center justify-between">
          <span className="text-purple-600 font-semibold group-hover:text-purple-800">
            View Reviews →
          </span>
        </div>
      </div>
    </Link>
  );
});

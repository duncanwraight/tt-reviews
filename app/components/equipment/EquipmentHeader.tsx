import { Link } from "react-router";
import { RatingStars } from "../ui/RatingStars";
import { LazyImage } from "../ui/LazyImage";

interface Equipment {
  id: string;
  name: string;
  slug: string;
  category: string;
  subcategory?: string;
  manufacturer: string;
  specifications: Record<string, unknown>;
}

interface Player {
  name: string;
  slug: string;
}

interface EquipmentHeaderProps {
  equipment: Equipment;
  averageRating?: number;
  reviewCount?: number;
  usedByPlayers?: Player[];
}

export function EquipmentHeader({
  equipment,
  averageRating = 0,
  reviewCount = 0,
  usedByPlayers = [],
}: EquipmentHeaderProps) {
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

  const getCategoryName = (category: string) => {
    return category.charAt(0).toUpperCase() + category.slice(1);
  };

  const getSubcategoryName = (subcategory: string) => {
    switch (subcategory) {
      case "inverted":
        return "Inverted";
      case "long_pips":
        return "Long Pips";
      case "short_pips":
        return "Short Pips";
      case "anti":
        return "Anti-Spin";
      default:
        return subcategory?.charAt(0).toUpperCase() + subcategory?.slice(1);
    }
  };

  const imageUrl = equipment.specifications?.image_url as string;

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8">
      <div className="grid md:grid-cols-2 gap-8">
        <div className="h-64 overflow-hidden">
          <LazyImage
            src={imageUrl || ""}
            alt={`${equipment.name} by ${equipment.manufacturer}`}
            className="w-full h-full"
            placeholder="skeleton"
            fallbackIcon={
              <span className="text-6xl">
                {getCategoryIcon(equipment.category)}
              </span>
            }
          />
        </div>

        <div>
          <div className="flex items-center gap-3 mb-4">
            <span className="inline-block px-3 py-1 text-sm font-semibold text-purple-800 bg-purple-100 rounded-full">
              {getCategoryName(equipment.category)}
            </span>
            {equipment.subcategory && (
              <span className="inline-block px-3 py-1 text-sm font-semibold text-blue-800 bg-blue-100 rounded-full">
                {getSubcategoryName(equipment.subcategory)}
              </span>
            )}
          </div>

          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            {equipment.name}
          </h1>

          <p className="text-xl text-gray-600 mb-4">{equipment.manufacturer}</p>

          {reviewCount > 0 && (
            <div className="mb-6">
              <RatingStars
                rating={averageRating}
                count={reviewCount}
                size="large"
              />
            </div>
          )}

          {usedByPlayers.length > 0 && (
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-3">
                Used by Professional Players
              </h3>
              <div className="flex flex-wrap gap-3">
                {usedByPlayers.map(player => (
                  <Link
                    key={player.slug}
                    to={`/players/${player.slug}`}
                    className="flex items-center justify-center w-12 h-12 bg-gradient-to-br from-teal-500 to-teal-600 text-white font-bold text-sm rounded-full hover:from-teal-600 hover:to-teal-700 transition-all duration-200 transform hover:scale-110"
                    title={player.name}
                  >
                    {player.name
                      .split(" ")
                      .map(n => n[0])
                      .join("")
                      .substring(0, 2)}
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

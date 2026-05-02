import type { ReactNode } from "react";
import { Link } from "react-router";
import { RatingStars } from "../ui/RatingStars";
import { formatRelativeTime } from "~/lib/date";

interface Equipment {
  id: string;
  name: string;
  slug: string;
  category: string;
  subcategory?: string;
  manufacturer: string;
  specifications: Record<string, unknown>;
  image_key?: string;
  image_trim_kind?: string | null;
  updated_at?: string;
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
  actions?: ReactNode;
}

export function EquipmentHeader({
  equipment,
  averageRating = 0,
  reviewCount = 0,
  usedByPlayers = [],
  actions,
}: EquipmentHeaderProps) {
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

  return (
    <header>
      <div className="flex items-start justify-between gap-3 mb-3 flex-wrap">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="inline-block px-3 py-1 text-sm font-semibold text-purple-800 bg-purple-100 rounded-full">
            {getCategoryName(equipment.category)}
          </span>
          {equipment.subcategory && (
            <span className="inline-block px-3 py-1 text-sm font-semibold text-blue-800 bg-blue-100 rounded-full">
              {getSubcategoryName(equipment.subcategory)}
            </span>
          )}
        </div>
        {actions ? (
          <div className="flex items-center gap-2 flex-wrap">{actions}</div>
        ) : null}
      </div>

      <h1 className="text-3xl font-bold text-gray-900">{equipment.name}</h1>

      {equipment.updated_at && (
        <p className="mt-1 text-sm text-gray-500">
          Last updated{" "}
          <time dateTime={equipment.updated_at}>
            {formatRelativeTime(equipment.updated_at)}
          </time>
        </p>
      )}

      {reviewCount > 0 && (
        <div className="mt-3">
          <RatingStars
            rating={averageRating}
            count={reviewCount}
            size="large"
          />
        </div>
      )}

      {usedByPlayers.length > 0 && (
        <div className="mt-6">
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
    </header>
  );
}

import { Link } from "react-router";
import type { Equipment, Player } from "~/lib/database.server";
import { LazyImage } from "~/components/ui/LazyImage";

interface ResultCardProps {
  item: Equipment | Player;
  type: "equipment" | "players";
}

function isPlayer(item: Equipment | Player): item is Player {
  return "highest_rating" in item || "playing_style" in item;
}

// Get category-specific icon for equipment
function getEquipmentIcon(category: string): string {
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
}

export function ResultCard({ item, type }: ResultCardProps) {
  const href = `/${type}/${item.slug}`;

  if (type === "equipment" && !isPlayer(item)) {
    const equipment = item as Equipment;
    const categoryIcon = getEquipmentIcon(equipment.category);
    const imageUrl = equipment.image_key ? `/api/images/${equipment.image_key}` : null;

    return (
      <Link
        to={href}
        className="result-card bg-white rounded-lg p-4 border border-gray-200 hover:shadow-md transition-all duration-200 block"
      >
        <div className="flex items-center gap-4">
          {/* Equipment Image/Icon */}
          <div className="flex-shrink-0 w-16 h-16 rounded-lg bg-gray-100 overflow-hidden flex items-center justify-center">
            {imageUrl ? (
              <LazyImage
                src={imageUrl}
                alt={equipment.name}
                className="w-full h-full"
                placeholder="skeleton"
                fallbackIcon={<span className="text-3xl text-gray-300">{categoryIcon}</span>}
              />
            ) : (
              <span className="text-3xl text-gray-300">{categoryIcon}</span>
            )}
          </div>

          <div className="item-content flex-1 min-w-0">
            <h3 className="text-lg font-semibold text-gray-900 mb-1 truncate">
              {equipment.name}
            </h3>
            <p className="text-sm text-gray-600">
              {equipment.manufacturer} • {equipment.category}
            </p>
          </div>
        </div>
      </Link>
    );
  }

  if (type === "players" && isPlayer(item)) {
    const player = item as Player;
    const imageUrl = player.image_key ? `/api/images/${player.image_key}` : null;

    return (
      <Link
        to={href}
        className="result-card bg-white rounded-lg p-4 border border-gray-200 hover:shadow-md transition-all duration-200 block"
      >
        <div className="flex items-center gap-4">
          {/* Player Image/Icon */}
          <div className="flex-shrink-0 w-16 h-16 rounded-full bg-gray-100 overflow-hidden flex items-center justify-center">
            {imageUrl ? (
              <LazyImage
                src={imageUrl}
                alt={player.name}
                className="w-full h-full rounded-full"
                placeholder="skeleton"
                fallbackIcon={<span className="text-3xl text-gray-300">👤</span>}
              />
            ) : (
              <span className="text-3xl text-gray-300">👤</span>
            )}
          </div>

          <div className="item-content flex-1 min-w-0">
            <h3 className="text-lg font-semibold text-gray-900 mb-1 truncate">
              {player.name}
            </h3>
            <div className="text-sm text-gray-600">
              {player.highest_rating && (
                <span className="mr-3">Rating: {player.highest_rating}</span>
              )}
              {player.active_years && (
                <span>Active: {player.active_years}</span>
              )}
            </div>
          </div>
        </div>
      </Link>
    );
  }

  return null;
}

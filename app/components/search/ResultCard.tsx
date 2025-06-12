import { Link } from "react-router";
import type { Equipment, Player } from "~/lib/database.server";

interface ResultCardProps {
  item: Equipment | Player;
  type: 'equipment' | 'players';
}

function isPlayer(item: Equipment | Player): item is Player {
  return 'highest_rating' in item || 'playing_style' in item;
}

export function ResultCard({ item, type }: ResultCardProps) {
  const href = `/${type}/${item.slug}`;

  if (type === 'equipment' && !isPlayer(item)) {
    const equipment = item as Equipment;
    return (
      <Link
        to={href}
        className="result-card bg-white rounded-lg p-6 border border-gray-200 hover:shadow-md transition-all duration-200 block"
      >
        <div className="flex items-start gap-4">
          <div className="item-icon text-3xl text-gray-400">🏓</div>
          <div className="item-content flex-1">
            <h3 className="text-lg font-semibold text-gray-900 mb-1">{equipment.name}</h3>
            <p className="text-sm text-gray-600 mb-2">
              {equipment.manufacturer} • {equipment.category}
            </p>
            <p className="text-sm text-gray-700 mt-2 line-clamp-2">
              High-performance equipment with excellent reviews from the community.
            </p>
          </div>
        </div>
      </Link>
    );
  }

  if (type === 'players' && isPlayer(item)) {
    const player = item as Player;
    return (
      <Link
        to={href}
        className="result-card bg-white rounded-lg p-6 border border-gray-200 hover:shadow-md transition-all duration-200 block"
      >
        <div className="flex items-start gap-4">
          <div className="item-icon text-3xl text-gray-400">👤</div>
          <div className="item-content flex-1">
            <h3 className="text-lg font-semibold text-gray-900 mb-1">{player.name}</h3>
            <div className="space-y-1 text-sm text-gray-600">
              {player.highest_rating && (
                <p>
                  <span className="font-medium">Highest Rating:</span> {player.highest_rating}
                </p>
              )}
              {player.active_years && (
                <p>
                  <span className="font-medium">Active:</span> {player.active_years}
                </p>
              )}
              <p className="text-gray-700 mt-2">
                Professional player with detailed equipment setup history and specifications.
              </p>
            </div>
          </div>
        </div>
      </Link>
    );
  }

  return null;
}
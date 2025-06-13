import { Link } from "react-router";
import type { Player } from "~/lib/database.server";

interface PlayerCardProps {
  player: Player;
}

export function PlayerCard({ player }: PlayerCardProps) {
  const getPlayingStyleLabel = (style: string | undefined) => {
    if (!style || style === "unknown") return "Pro Player";
    return style.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());
  };

  return (
    <div className="player-card bg-white rounded-lg border border-gray-200 shadow-sm hover:shadow-md transition-shadow">
      <div className="p-6">
        <div className="flex items-start justify-between mb-4">
          <div className="flex-1">
            <h3 className="text-lg font-semibold text-gray-900 mb-1">
              <Link
                to={`/players/${player.slug}`}
                className="hover:text-purple-600"
              >
                {player.name}
              </Link>
            </h3>
            {player.highest_rating && (
              <p className="text-sm text-gray-600 mb-2">
                Peak Rating: {player.highest_rating}
              </p>
            )}
            {player.active_years && (
              <p className="text-sm text-gray-600 mb-2">
                Active: {player.active_years}
              </p>
            )}
            {player.playing_style && player.playing_style !== "unknown" && (
              <p className="text-sm text-gray-600 mb-2">
                Style: {getPlayingStyleLabel(player.playing_style)}
              </p>
            )}
          </div>
          <div className="ml-4">
            <span
              className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                player.active
                  ? "bg-green-100 text-green-800"
                  : "bg-gray-100 text-gray-800"
              }`}
            >
              {player.active ? "Active" : "Retired"}
            </span>
          </div>
        </div>

        <div className="flex items-center justify-between">
          <Link
            to={`/players/${player.slug}`}
            className="text-purple-600 hover:text-purple-700 text-sm font-medium"
          >
            View Profile →
          </Link>
          <div className="text-xs text-gray-500">
            Added {new Date(player.created_at).toLocaleDateString()}
          </div>
        </div>
      </div>
    </div>
  );
}

import { Link } from "react-router";
import { memo, useMemo, useCallback } from "react";
import { LazyImage } from "./LazyImage";

// Minimum fields required for PlayerCard display
interface PlayerCardPlayer {
  id: string;
  name: string;
  slug: string;
  highest_rating?: string;
  active_years?: string;
  active?: boolean;
  playing_style?: string;
  currentSetup?: string;
  created_at?: string;
  image_key?: string;
}

interface PlayerCardProps {
  player: PlayerCardPlayer;
}

export const PlayerCard = memo(function PlayerCard({
  player,
}: PlayerCardProps) {
  // Memoize playing style label transformation to avoid recalculation
  const getPlayingStyleLabel = useCallback((style: string | undefined) => {
    if (!style || style === "unknown") return "Pro Player";
    return style.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase());
  }, []);

  // Memoize formatted date to avoid recalculation
  const formattedDate = useMemo(() => {
    return player.created_at
      ? new Date(player.created_at).toLocaleDateString()
      : null;
  }, [player.created_at]);

  // Memoize playing style label for this specific player
  const playingStyleLabel = useMemo(() => {
    return getPlayingStyleLabel(player.playing_style);
  }, [getPlayingStyleLabel, player.playing_style]);

  // Memoize status badge styling (only shown if active status is known)
  const statusBadge = useMemo(() => {
    if (player.active === undefined) return null;
    const className = `inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
      player.active
        ? "bg-green-100 text-green-800"
        : "bg-gray-100 text-gray-800"
    }`;
    return { className, label: player.active ? "Active" : "Retired" };
  }, [player.active]);

  // Memoize image URL
  const imageUrl = useMemo(() => {
    return player.image_key ? `/api/images/${player.image_key}` : null;
  }, [player.image_key]);

  return (
    <div className="player-card bg-white rounded-lg border border-gray-200 shadow-sm hover:shadow-md transition-shadow">
      <div className="p-6">
        <div className="flex items-start gap-4 mb-4">
          {/* Player Photo */}
          <div className="flex-shrink-0">
            {imageUrl ? (
              <LazyImage
                src={imageUrl}
                alt={player.name}
                className="w-16 h-16 rounded-full"
                placeholder="skeleton"
                fallbackIcon={
                  <div className="w-16 h-16 rounded-full bg-gray-200 flex items-center justify-center text-2xl text-gray-400">
                    👤
                  </div>
                }
              />
            ) : (
              <div className="w-16 h-16 rounded-full bg-gray-200 flex items-center justify-center text-2xl text-gray-400">
                👤
              </div>
            )}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between">
              <h3 className="text-lg font-semibold text-gray-900 mb-1 truncate">
                <Link
                  to={`/players/${player.slug}`}
                  className="hover:text-purple-600"
                >
                  {player.name}
                </Link>
              </h3>
              {statusBadge && (
                <span className={`ml-2 flex-shrink-0 ${statusBadge.className}`}>
                  {statusBadge.label}
                </span>
              )}
            </div>
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
                Style: {playingStyleLabel}
              </p>
            )}
            {player.currentSetup && (
              <p className="text-sm text-gray-600 mb-1">
                Setup: {player.currentSetup}
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between">
          <Link
            to={`/players/${player.slug}`}
            className="text-purple-600 hover:text-purple-700 text-sm font-medium"
          >
            View Profile →
          </Link>
          {formattedDate && (
            <div className="text-xs text-gray-500">Added {formattedDate}</div>
          )}
        </div>
      </div>
    </div>
  );
});

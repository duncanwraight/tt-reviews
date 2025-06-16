import { Link } from "react-router";
import { memo, useMemo, useCallback } from "react";
import type { Player } from "~/lib/database.server";

interface PlayerCardProps {
  player: Player & {
    currentSetup?: string;
  };
}

export const PlayerCard = memo(function PlayerCard({ player }: PlayerCardProps) {
  // Memoize playing style label transformation to avoid recalculation
  const getPlayingStyleLabel = useCallback((style: string | undefined) => {
    if (!style || style === "unknown") return "Pro Player";
    return style.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());
  }, []);

  // Memoize formatted date to avoid recalculation
  const formattedDate = useMemo(() => {
    return new Date(player.created_at).toLocaleDateString();
  }, [player.created_at]);

  // Memoize playing style label for this specific player
  const playingStyleLabel = useMemo(() => {
    return getPlayingStyleLabel(player.playing_style);
  }, [getPlayingStyleLabel, player.playing_style]);

  // Memoize status badge styling
  const statusBadgeClassName = useMemo(() => {
    return `inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
      player.active
        ? "bg-green-100 text-green-800"
        : "bg-gray-100 text-gray-800"
    }`;
  }, [player.active]);

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
                Style: {playingStyleLabel}
              </p>
            )}
            {player.currentSetup && (
              <p className="text-sm text-gray-600 mb-2">
                Setup: {player.currentSetup}
              </p>
            )}
          </div>
          <div className="ml-4">
            <span className={statusBadgeClassName}>
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
            Added {formattedDate}
          </div>
        </div>
      </div>
    </div>
  );
});

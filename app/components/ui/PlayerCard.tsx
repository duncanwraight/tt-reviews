import { Link } from "react-router";
import { memo, useMemo, useCallback } from "react";
import { LazyImage } from "./LazyImage";
import { ImagePlaceholder } from "./ImagePlaceholder";
import { formatDate } from "~/lib/date";
import { buildImageUrl } from "~/lib/imageUrl";

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
  image_etag?: string;
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
    return player.created_at ? formatDate(player.created_at) : null;
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

  // Memoize image URL — `?v=<etag>` busts browser cache when the
  // photo-sourcing pipeline replaces the bytes at the same R2 key.
  const imageUrl = useMemo(
    () => buildImageUrl(player.image_key, player.image_etag),
    [player.image_key, player.image_etag]
  );

  return (
    <Link
      to={`/players/${player.slug}`}
      className="player-card group block bg-white rounded-lg border border-gray-200 shadow-sm transition-all duration-200 hover:shadow-md hover:border-teal-400"
    >
      <div className="p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-3 group-hover:text-teal-700 transition-colors">
          {player.name}
        </h3>
        <div className="flex items-start gap-4 mb-4">
          {/* Player Photo + status badge */}
          <div className="flex-shrink-0 flex flex-col items-center gap-2">
            {imageUrl ? (
              <LazyImage
                src={imageUrl}
                alt={player.name}
                className="w-16 h-16 rounded-full"
                imgClassName="object-top"
                placeholder="skeleton"
                fallbackIcon={
                  <ImagePlaceholder
                    kind="player"
                    className="w-16 h-16 rounded-full"
                    iconClassName="size-7"
                  />
                }
              />
            ) : (
              <ImagePlaceholder
                kind="player"
                className="w-16 h-16 rounded-full"
                iconClassName="size-7"
              />
            )}
            {statusBadge && (
              <span className={statusBadge.className}>{statusBadge.label}</span>
            )}
          </div>

          <div className="flex-1 min-w-0">
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

        {formattedDate && (
          <div className="text-xs text-gray-500">Added {formattedDate}</div>
        )}
      </div>
    </Link>
  );
});

import type { Player } from "~/lib/database.server";
import type { PlayerCurrentSetup } from "~/lib/database/players";
import { PlayerCard } from "~/components/ui/PlayerCard";
import { Users } from "lucide-react";

// TT-242: PlayersGrid optionally accepts a per-id setup map so each
// PlayerCard can render its "Setup: <blade> / <FH> / <BH>" line
// without forcing every Player consumer to attach the setup eagerly.
// Cards whose player_id isn't in the map render no Setup line.
interface PlayersGridProps {
  players: Player[];
  // TT-224: kind context drives the "empty state" copy so the
  // amateur section doesn't show "Submit First Player" when it's
  // simply unpopulated (placeholder seeds were still expected during
  // the rollout).
  emptyKind?: "professional" | "amateur";
  setupsByPlayerId?: Map<string, PlayerCurrentSetup>;
}

export function PlayersGrid({
  players,
  emptyKind,
  setupsByPlayerId,
}: PlayersGridProps) {
  if (players.length === 0) {
    if (emptyKind === "amateur") {
      return (
        <div className="text-center py-12 border border-dashed border-gray-300 rounded-lg">
          <Users
            className="size-12 text-gray-300 mx-auto mb-3"
            aria-hidden
            strokeWidth={1.5}
          />
          <p className="text-gray-600">
            No amateur players matching the current filters.
          </p>
        </div>
      );
    }
    return (
      <div className="text-center py-12">
        <Users
          className="size-16 text-gray-300 mx-auto mb-4"
          aria-hidden
          strokeWidth={1.5}
        />
        <h3 className="text-xl font-semibold text-gray-900 mb-2">
          No Players Yet
        </h3>
        <p className="text-gray-600 mb-6">
          Be the first to submit a professional player profile to our database.
        </p>
        <a
          href="/submissions/player/submit"
          className="inline-flex items-center px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700"
        >
          Submit First Player
        </a>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {players.map(player => (
        <PlayerCard
          key={player.id}
          player={{
            ...player,
            currentSetup: setupsByPlayerId?.get(player.id),
          }}
        />
      ))}
    </div>
  );
}

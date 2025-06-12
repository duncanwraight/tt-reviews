import type { Player } from "~/lib/database.server";
import { PlayerCard } from "~/components/ui/PlayerCard";

interface PlayersGridProps {
  players: Player[];
}

export function PlayersGrid({ players }: PlayersGridProps) {
  if (players.length === 0) {
    return (
      <div className="text-center py-12">
        <div className="text-gray-400 text-6xl mb-4">🏓</div>
        <h3 className="text-xl font-semibold text-gray-900 mb-2">No Players Yet</h3>
        <p className="text-gray-600 mb-6">
          Be the first to submit a professional player profile to our database.
        </p>
        <a
          href="/players/submit"
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
        <PlayerCard key={player.id} player={player} />
      ))}
    </div>
  );
}
import { Link } from "react-router";
import { PlayerCard } from "../ui/PlayerCard";

interface PlayerDisplay {
  id: string;
  name: string;
  slug: string;
  highest_rating?: string;
  playing_style?: string;
  currentSetup?: string;
}

interface PopularPlayersSectionProps {
  players: PlayerDisplay[];
}

export function PopularPlayersSection({ players }: PopularPlayersSectionProps) {
  return (
    <section className="py-16 bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold text-gray-900 mb-4">
            Popular Players
          </h2>
          <p className="text-lg text-gray-600">
            Explore setups used by professional players
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
          {players.map(player => (
            <PlayerCard key={player.id} player={player} />
          ))}
        </div>

        <div className="text-center mt-12">
          <Link
            to="/players"
            className="inline-flex items-center px-6 py-3 border border-teal-600 text-teal-600 font-semibold rounded-lg hover:bg-teal-600 hover:text-white transition-colors"
          >
            View All Players
          </Link>
        </div>
      </div>
    </section>
  );
}

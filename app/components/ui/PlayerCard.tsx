import { Link } from "react-router";

interface PlayerCardProps {
  player: {
    id: string;
    name: string;
    slug: string;
    highest_rating?: string;
    playing_style?: string;
    currentSetup?: string;
  };
}

export function PlayerCard({ player }: PlayerCardProps) {
  return (
    <Link
      to={`/players/${player.slug}`}
      className="group bg-white rounded-xl shadow-md hover:shadow-xl transition-all duration-300 transform hover:-translate-y-1 border border-gray-100"
    >
      <div className="p-6">
        <div className="flex items-center justify-between mb-4">
          <span className="inline-block px-3 py-1 text-xs font-semibold text-teal-800 bg-teal-100 rounded-full capitalize">
            {player.playing_style?.replace('_', ' ') || 'Pro Player'}
          </span>
          {player.highest_rating && (
            <span className="text-sm font-medium text-gray-600">
              Rating: {player.highest_rating}
            </span>
          )}
        </div>
        <h3 className="text-xl font-bold text-gray-900 mb-2 group-hover:text-teal-600 transition-colors">
          {player.name}
        </h3>
        <p className="text-gray-600 mb-4">{player.currentSetup}</p>
        <div className="flex items-center justify-between">
          <span className="text-teal-600 font-semibold group-hover:text-teal-800">
            View Setup →
          </span>
        </div>
      </div>
    </Link>
  );
}
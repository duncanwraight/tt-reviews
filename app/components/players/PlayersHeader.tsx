interface PlayersHeaderProps {
  totalPlayers: number;
}

export function PlayersHeader({ totalPlayers }: PlayersHeaderProps) {
  return (
    <div className="flex justify-between items-end mb-8">
      <div>
        <h1 className="text-3xl font-bold text-gray-900 mb-4">Professional Players</h1>
        <p className="text-lg text-gray-600 max-w-3xl">
          Discover the equipment setups and playing styles of professional table tennis
          players from around the world. Learn what gear the pros use to dominate at the
          highest level.
        </p>
        {totalPlayers > 0 && (
          <p className="text-sm text-gray-500 mt-2">
            {totalPlayers} player{totalPlayers !== 1 ? 's' : ''} in our database
          </p>
        )}
      </div>
      <div className="flex space-x-3">
        <a
          href="/players/submit"
          className="px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-purple-500"
        >
          Submit Player
        </a>
      </div>
    </div>
  );
}
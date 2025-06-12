interface PlayersFooterProps {
  hasPlayers: boolean;
}

export function PlayersFooter({ hasPlayers }: PlayersFooterProps) {
  if (!hasPlayers) {
    return null;
  }

  return (
    <div className="mt-12 text-center">
      <p className="text-gray-600 mb-4">
        Know of a player that's missing? Help us expand our database.
      </p>
      <a
        href="/players/submit"
        className="inline-flex items-center px-6 py-3 bg-purple-600 text-white rounded-md hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-purple-500"
      >
        Submit New Player
      </a>
    </div>
  );
}
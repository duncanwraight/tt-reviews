import { FC } from 'hono/jsx'
import { Layout } from '../Layout'
import { Breadcrumb, generateBreadcrumbs } from '../ui/Breadcrumb'
import { Player } from '../../types/database'

interface PlayersListPageProps {
  players: Player[]
}

export const PlayersListPage: FC<PlayersListPageProps> = ({ players }) => {
  const breadcrumbs = generateBreadcrumbs('/players')

  return (
    <Layout
      title="Professional Table Tennis Players - TT Reviews"
      description="Browse professional table tennis players and discover their equipment setups, playing styles, and career achievements."
    >
      <Breadcrumb items={breadcrumbs} />

      <section class="py-8">
        <div class="main-container">
          <div class="page-header mb-8 flex justify-between items-end">
            <div>
              <h1 class="text-3xl font-bold text-gray-900 mb-4">Professional Players</h1>
              <p class="text-lg text-gray-600 max-w-3xl">
                Discover the equipment setups and playing styles of professional table tennis
                players from around the world. Learn what gear the pros use to dominate at the
                highest level.
              </p>
            </div>
            <div class="flex space-x-3">
              <a
                href="/players/submit"
                class="px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-purple-500"
              >
                Submit Player
              </a>
            </div>
          </div>

          <div class="players-grid">
            {players.length === 0 ? (
              <div class="text-center py-12">
                <div class="text-gray-400 text-6xl mb-4">🏓</div>
                <h3 class="text-xl font-semibold text-gray-900 mb-2">No Players Yet</h3>
                <p class="text-gray-600 mb-6">
                  Be the first to submit a professional player profile to our database.
                </p>
                <a
                  href="/players/submit"
                  class="inline-flex items-center px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700"
                >
                  Submit First Player
                </a>
              </div>
            ) : (
              <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {players.map(player => (
                  <div
                    key={player.id}
                    class="player-card bg-white rounded-lg border border-gray-200 shadow-sm hover:shadow-md transition-shadow"
                  >
                    <div class="p-6">
                      <div class="flex items-start justify-between mb-4">
                        <div class="flex-1">
                          <h3 class="text-lg font-semibold text-gray-900 mb-1">
                            <a href={`/players/${player.slug}`} class="hover:text-purple-600">
                              {player.name}
                            </a>
                          </h3>
                          {player.highest_rating && (
                            <p class="text-sm text-gray-600 mb-2">
                              Peak Rating: {player.highest_rating}
                            </p>
                          )}
                          {player.active_years && (
                            <p class="text-sm text-gray-600 mb-2">Active: {player.active_years}</p>
                          )}
                        </div>
                        <div class="ml-4">
                          <span
                            class={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                              player.active
                                ? 'bg-green-100 text-green-800'
                                : 'bg-gray-100 text-gray-800'
                            }`}
                          >
                            {player.active ? 'Active' : 'Retired'}
                          </span>
                        </div>
                      </div>

                      <div class="flex items-center justify-between">
                        <a
                          href={`/players/${player.slug}`}
                          class="text-purple-600 hover:text-purple-700 text-sm font-medium"
                        >
                          View Profile →
                        </a>
                        <div class="text-xs text-gray-500">
                          Added {new Date(player.created_at).toLocaleDateString()}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {players.length > 0 && (
            <div class="mt-12 text-center">
              <p class="text-gray-600 mb-4">
                Know of a player that's missing? Help us expand our database.
              </p>
              <a
                href="/players/submit"
                class="inline-flex items-center px-6 py-3 bg-purple-600 text-white rounded-md hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-purple-500"
              >
                Submit New Player
              </a>
            </div>
          )}
        </div>
      </section>
    </Layout>
  )
}

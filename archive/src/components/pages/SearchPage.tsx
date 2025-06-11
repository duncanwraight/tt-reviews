import { SearchPageProps } from '../../types/components'
import { Layout } from '../Layout'
import { Breadcrumb, generateBreadcrumbs } from '../ui/Breadcrumb'
import { RatingStars } from '../ui/RatingStars'

export function SearchPage({ query = '', results, filters }: SearchPageProps) {
  const breadcrumbs = generateBreadcrumbs('/search')
  const hasResults = results && (results.equipment.length > 0 || results.players.length > 0)
  const totalResults = results ? results.equipment.length + results.players.length : 0

  return (
    <Layout
      title={query ? `Search Results for "${query}"` : 'Search Table Tennis Equipment & Players'}
      description={
        query
          ? `Find table tennis equipment and players matching "${query}". Browse reviews, specs, and professional setups.`
          : 'Search our comprehensive database of table tennis equipment reviews and professional player setups.'
      }
    >
      <Breadcrumb items={breadcrumbs} />
      <SearchHeader query={query} totalResults={totalResults} />
      {hasResults ? (
        <SearchResults results={results} />
      ) : query ? (
        <NoResults query={query} />
      ) : (
        <SearchLanding />
      )}
    </Layout>
  )
}

function SearchHeader({ query, totalResults }: { query: string; totalResults: number }) {
  return (
    <section class="search-header bg-white border-b border-gray-200 py-6">
      <div class="main-container">
        <div class="max-w-2xl mx-auto">
          <div class="search-input-container relative">
            <input
              type="text"
              class="search-input w-full py-3 px-4 text-lg border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              placeholder="Search equipment, players, or reviews..."
              value={query}
              id="main-search"
            />
            <button class="search-button absolute right-2 top-1/2 transform -translate-y-1/2 bg-purple-600 text-white px-4 py-2 rounded-md hover:bg-purple-700 transition-colors">
              Search
            </button>
          </div>

          {query && (
            <div class="search-meta mt-4 text-sm text-gray-600">
              {totalResults > 0 ? (
                <span>
                  Found {totalResults} result{totalResults !== 1 ? 's' : ''} for "{query}"
                </span>
              ) : (
                <span>No results found for "{query}"</span>
              )}
            </div>
          )}
        </div>
      </div>
    </section>
  )
}

function SearchResults({ results }: { results: any }) {
  return (
    <section class="search-results py-8">
      <div class="main-container">
        <div class="grid grid-cols-1 lg:grid-cols-4 gap-8">
          <SearchFilters />

          <div class="results-content lg:col-span-3 space-y-8">
            {results.equipment.length > 0 && (
              <ResultsSection
                title="Equipment"
                items={results.equipment}
                type="equipment"
                icon="🏓"
              />
            )}

            {results.players.length > 0 && (
              <ResultsSection title="Players" items={results.players} type="players" icon="👤" />
            )}
          </div>
        </div>
      </div>
    </section>
  )
}

function SearchFilters() {
  return (
    <div class="search-filters bg-white rounded-lg p-6 border border-gray-200 h-fit sticky top-24">
      <h3 class="text-lg font-semibold text-gray-900 mb-4">Filters</h3>

      <div class="filter-group mb-6">
        <h4 class="font-medium text-gray-700 mb-2">Type</h4>
        <div class="space-y-2">
          <label class="flex items-center">
            <input
              type="checkbox"
              class="rounded border-gray-300 text-purple-600 focus:ring-purple-500"
              checked
            />
            <span class="ml-2 text-sm text-gray-700">Equipment</span>
          </label>
          <label class="flex items-center">
            <input
              type="checkbox"
              class="rounded border-gray-300 text-purple-600 focus:ring-purple-500"
              checked
            />
            <span class="ml-2 text-sm text-gray-700">Players</span>
          </label>
        </div>
      </div>

      <div class="filter-group mb-6">
        <h4 class="font-medium text-gray-700 mb-2">Category</h4>
        <select class="w-full p-2 border border-gray-300 rounded-md text-sm">
          <option>All Categories</option>
          <option>Blades</option>
          <option>Rubbers</option>
          <option>Balls</option>
        </select>
      </div>

      <div class="filter-group mb-6">
        <h4 class="font-medium text-gray-700 mb-2">Rating</h4>
        <select class="w-full p-2 border border-gray-300 rounded-md text-sm">
          <option>Any Rating</option>
          <option>4+ Stars</option>
          <option>3+ Stars</option>
          <option>2+ Stars</option>
        </select>
      </div>

      <div class="filter-group">
        <h4 class="font-medium text-gray-700 mb-2">Sort By</h4>
        <select class="w-full p-2 border border-gray-300 rounded-md text-sm">
          <option>Relevance</option>
          <option>Highest Rated</option>
          <option>Most Reviews</option>
          <option>Name A-Z</option>
        </select>
      </div>
    </div>
  )
}

function ResultsSection({
  title,
  items,
  type,
  icon,
}: {
  title: string
  items: any[]
  type: 'equipment' | 'players'
  icon: string
}) {
  return (
    <div class="results-section">
      <div class="section-header flex items-center gap-3 mb-6">
        <span class="text-2xl">{icon}</span>
        <h2 class="text-2xl font-semibold text-gray-900">{title}</h2>
        <span class="text-sm text-gray-500 bg-gray-100 px-2 py-1 rounded-full">
          {items.length} result{items.length !== 1 ? 's' : ''}
        </span>
      </div>

      <div class="results-grid grid grid-cols-1 md:grid-cols-2 gap-6">
        {items.map(item => (
          <ResultCard key={item.id || item.slug} item={item} type={type} />
        ))}
      </div>
    </div>
  )
}

function ResultCard({ item, type }: { item: any; type: 'equipment' | 'players' }) {
  const href = `/${type}/${item.slug}`

  if (type === 'equipment') {
    return (
      <div
        class="result-card bg-white rounded-lg p-6 border border-gray-200 hover:shadow-md transition-all duration-200 cursor-pointer"
        onclick={`navigate('${href}'); return false;`}
      >
        <div class="flex items-start gap-4">
          <div class="item-icon text-3xl text-gray-400">🏓</div>
          <div class="item-content flex-1">
            <h3 class="text-lg font-semibold text-gray-900 mb-1">{item.name}</h3>
            <p class="text-sm text-gray-600 mb-2">
              {item.manufacturer} • {item.category}
            </p>
            {item.rating && <RatingStars rating={item.rating} size="small" />}
            <p class="text-sm text-gray-700 mt-2 line-clamp-2">
              High-performance equipment with excellent reviews from the community.
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div
      class="result-card bg-white rounded-lg p-6 border border-gray-200 hover:shadow-md transition-all duration-200 cursor-pointer"
      onclick={`navigate('${href}'); return false;`}
    >
      <div class="flex items-start gap-4">
        <div class="item-icon text-3xl text-gray-400">👤</div>
        <div class="item-content flex-1">
          <h3 class="text-lg font-semibold text-gray-900 mb-1">{item.name}</h3>
          <div class="space-y-1 text-sm text-gray-600">
            {item.highest_rating && (
              <p>
                <span class="font-medium">Highest Rating:</span> {item.highest_rating}
              </p>
            )}
            {item.active_years && (
              <p>
                <span class="font-medium">Active:</span> {item.active_years}
              </p>
            )}
            <p class="text-gray-700 mt-2">
              Professional player with detailed equipment setup history and specifications.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

function NoResults({ query }: { query: string }) {
  return (
    <section class="no-results py-16">
      <div class="main-container text-center">
        <div class="text-6xl text-gray-300 mb-6">🔍</div>
        <h2 class="text-2xl font-semibold text-gray-900 mb-4">No results found</h2>
        <p class="text-gray-600 mb-8 max-w-md mx-auto">
          We couldn't find anything matching "{query}". Try adjusting your search terms or browse
          our categories below.
        </p>

        <div class="suggested-searches">
          <h3 class="text-lg font-medium text-gray-900 mb-4">Popular searches:</h3>
          <div class="flex flex-wrap justify-center gap-3">
            {['Butterfly Tenergy', 'Long Pips', 'Ma Long', 'Stiga Clipper', 'TSP Curl'].map(
              suggestion => (
                <button
                  key={suggestion}
                  class="suggestion-tag bg-gray-100 hover:bg-purple-100 text-gray-700 hover:text-purple-700 px-4 py-2 rounded-full text-sm transition-colors"
                  onclick={`document.getElementById('main-search').value = '${suggestion}'; document.querySelector('.search-button').click();`}
                >
                  {suggestion}
                </button>
              )
            )}
          </div>
        </div>
      </div>
    </section>
  )
}

function SearchLanding() {
  return (
    <section class="search-landing py-16">
      <div class="main-container">
        <div class="text-center mb-12">
          <h2 class="text-3xl font-semibold text-gray-900 mb-4">Discover Table Tennis Equipment</h2>
          <p class="text-lg text-gray-600 max-w-2xl mx-auto">
            Search our comprehensive database of equipment reviews and professional player setups.
            Find the perfect gear for your playing style.
          </p>
        </div>

        <div class="popular-categories grid grid-cols-2 md:grid-cols-4 gap-6 mb-12">
          {[
            { name: 'Blades', icon: '🏓', href: '/equipment/blades' },
            { name: 'Rubbers', icon: '🔴', href: '/equipment/rubbers' },
            { name: 'Long Pips', icon: '🎯', href: '/equipment/long-pips' },
            { name: 'Players', icon: '👤', href: '/players' },
          ].map(category => (
            <div
              key={category.name}
              class="category-quick-link bg-white rounded-lg p-6 text-center border border-gray-200 hover:shadow-md hover:border-purple-300 transition-all duration-200 cursor-pointer"
              onclick={`navigate('${category.href}'); return false;`}
            >
              <div class="text-3xl mb-2">{category.icon}</div>
              <h3 class="font-semibold text-gray-900">{category.name}</h3>
            </div>
          ))}
        </div>

        <div class="popular-searches text-center">
          <h3 class="text-lg font-medium text-gray-900 mb-4">Popular searches:</h3>
          <div class="flex flex-wrap justify-center gap-3">
            {[
              'Butterfly Tenergy 64',
              'TSP Curl P1-R',
              'Ma Long equipment',
              'Stiga Clipper',
              'Best long pips',
              'Joo Saehyuk setup',
            ].map(search => (
              <button
                key={search}
                class="popular-search bg-purple-50 hover:bg-purple-100 text-purple-700 px-4 py-2 rounded-full text-sm transition-colors"
                onclick={`document.getElementById('main-search').value = '${search}'; document.querySelector('.search-button').click();`}
              >
                {search}
              </button>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}

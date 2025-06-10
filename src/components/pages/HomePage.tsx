import { FC } from 'hono/jsx'
import { HomePageProps } from '../../types/components'
import { Equipment, Player } from '../../types/database'
import { Layout } from '../Layout'
import { RatingStars } from '../ui/RatingStars'

export const HomePage: FC<HomePageProps> = ({ featuredEquipment = [], popularPlayers = [] }) => {
  return (
    <Layout
      title="Trusted Table Tennis Equipment Reviews"
      description="Community-driven equipment reviews by real players. Find the perfect blade, rubber, and setup for your playing style."
      structuredData={generateHomePageSchema()}
    >
      <HeroSection />
      <FeaturedReviews equipment={featuredEquipment} />
      <PopularPlayers players={popularPlayers} />
      <EquipmentCategories />
    </Layout>
  )
}

const HeroSection: FC = () => {
  return (
    <section class="hero text-center py-16 bg-gradient-to-br from-purple-50 to-teal-50">
      <div class="main-container">
        <h1 class="text-4xl font-bold text-gray-900 mb-4">Trusted Table Tennis Reviews</h1>
        <p class="text-xl text-gray-600 mb-8 max-w-2xl mx-auto">
          Community-driven equipment reviews by real players
        </p>
        <div class="hero-search max-w-2xl mx-auto">
          <input
            type="text"
            class="search-input w-full py-4 px-6 text-lg border border-gray-300 rounded-xl bg-white shadow-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            placeholder="Search for equipment, players, or reviews..."
          />
        </div>
      </div>
    </section>
  )
}

interface FeaturedReviewsProps {
  equipment: Equipment[]
}

const FeaturedReviews: FC<FeaturedReviewsProps> = ({ equipment }) => {
  const mockEquipment = equipment.length
    ? equipment
    : [
        {
          slug: 'butterfly-tenergy-64',
          name: 'Butterfly Tenergy 64',
          rating: 4.5,
          reviewCount: 23,
          description: 'High-performance forehand rubber with excellent spin generation and speed.',
        },
        {
          slug: 'tsp-curl-p1-r',
          name: 'TSP Curl P1-R',
          rating: 4.2,
          reviewCount: 18,
          description: 'Classic long pips rubber perfect for defensive play and spin reversal.',
        },
        {
          slug: 'stiga-clipper',
          name: 'Stiga Clipper',
          rating: 4.7,
          reviewCount: 31,
          description: 'Legendary blade combining speed and control for all-round players.',
        },
      ]

  return (
    <section class="section py-12">
      <div class="main-container">
        <div class="section-header text-center mb-8">
          <h2 class="text-3xl font-semibold text-gray-900 mb-2">Featured Reviews</h2>
          <p class="text-lg text-gray-600">
            Latest highly-rated equipment reviews from our community
          </p>
        </div>
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {mockEquipment.map(item => (
            <EquipmentCard key={item.slug} equipment={item} />
          ))}
        </div>
      </div>
    </section>
  )
}

interface PopularPlayersProps {
  players: Player[]
}

const PopularPlayers: FC<PopularPlayersProps> = ({ players }) => {
  const mockPlayers = players.length
    ? players
    : [
        {
          slug: 'joo-saehyuk',
          name: 'Joo Saehyuk',
          highestRating: 'WR6',
          style: 'Defensive chopper',
          currentSetup: 'Butterfly Diode, Tenergy 64 FH',
        },
        {
          slug: 'ma-long',
          name: 'Ma Long',
          highestRating: 'WR1',
          style: 'Offensive all-round',
          currentSetup: 'Hurricane Long 5, Hurricane 3',
        },
        {
          slug: 'timo-boll',
          name: 'Timo Boll',
          highestRating: 'WR1',
          style: 'Classic European',
          currentSetup: 'Butterfly Timo Boll ALC',
        },
      ]

  return (
    <section class="section py-12 bg-white">
      <div class="main-container">
        <div class="section-header text-center mb-8">
          <h2 class="text-3xl font-semibold text-gray-900 mb-2">Popular Players</h2>
          <p class="text-lg text-gray-600">Explore equipment setups from professional players</p>
        </div>
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {mockPlayers.map(player => (
            <PlayerCard key={player.slug} player={player} />
          ))}
        </div>
      </div>
    </section>
  )
}

const EquipmentCategories: FC = () => {
  const categories = [
    {
      icon: '🏓',
      name: 'Blades',
      href: '/equipment/blades',
      description: 'Wooden and composite blades for all playing styles',
    },
    {
      icon: '🔴',
      name: 'Forehand Rubbers',
      href: '/equipment/forehand-rubbers',
      description: 'Inverted rubbers for attack and spin generation',
    },
    {
      icon: '⚫',
      name: 'Backhand Rubbers',
      href: '/equipment/backhand-rubbers',
      description: 'All rubber types for backhand play',
    },
    {
      icon: '🎯',
      name: 'Long Pips',
      href: '/equipment/long-pips',
      description: 'Defensive rubbers for spin reversal',
    },
    {
      icon: '🛡️',
      name: 'Anti-Spin',
      href: '/equipment/anti-spin',
      description: 'Low-friction rubbers for defensive play',
    },
    {
      icon: '📚',
      name: 'Training Equipment',
      href: '/equipment/training',
      description: 'Practice aids and training tools',
    },
  ]

  return (
    <section class="section py-12">
      <div class="main-container">
        <div class="section-header text-center mb-8">
          <h2 class="text-3xl font-semibold text-gray-900 mb-2">Equipment Categories</h2>
          <p class="text-lg text-gray-600">Find the right equipment for your playing style</p>
        </div>
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {categories.map(category => (
            <CategoryCard key={category.href} category={category} />
          ))}
        </div>
      </div>
    </section>
  )
}

interface EquipmentCardProps {
  equipment: Equipment
}

const EquipmentCard: FC<EquipmentCardProps> = ({ equipment }) => {
  return (
    <a
      class="card bg-white rounded-lg p-6 border border-gray-200 shadow-sm hover:shadow-md transition-all duration-200 cursor-pointer hover:-translate-y-1 block"
      href={`/equipment/${equipment.slug}`}
    >
      <h3 class="text-xl font-semibold text-gray-900 mb-2">{equipment.name}</h3>
      <RatingStars rating={equipment.rating} count={equipment.reviewCount} />
      <p class="text-gray-600 mt-3">{equipment.description}</p>
    </a>
  )
}

interface PlayerCardProps {
  player: Player
}

const PlayerCard: FC<PlayerCardProps> = ({ player }) => {
  return (
    <a
      class="card bg-white rounded-lg p-6 border border-gray-200 shadow-sm hover:shadow-md transition-all duration-200 cursor-pointer hover:-translate-y-1 block"
      href={`/players/${player.slug}`}
    >
      <h3 class="text-xl font-semibold text-gray-900 mb-3">{player.name}</h3>
      <div class="space-y-2 text-sm">
        <p>
          <span class="font-medium text-gray-700">Highest Rating:</span> {player.highestRating}
        </p>
        <p>
          <span class="font-medium text-gray-700">Style:</span> {player.style}
        </p>
        <p>
          <span class="font-medium text-gray-700">Current Setup:</span> {player.currentSetup}
        </p>
      </div>
    </a>
  )
}

interface CategoryCardProps {
  category: {
    icon: string
    name: string
    href: string
    description: string
  }
}

const CategoryCard: FC<CategoryCardProps> = ({ category }) => {
  return (
    <a
      class="category-card bg-white rounded-lg p-8 text-center border border-gray-200 shadow-sm hover:shadow-md hover:border-purple-300 transition-all duration-200 cursor-pointer block"
      href={category.href}
    >
      <div class="category-icon text-4xl mb-4">{category.icon}</div>
      <h3 class="text-xl font-semibold text-gray-900 mb-2">{category.name}</h3>
      <p class="text-gray-600">{category.description}</p>
    </a>
  )
}

function generateHomePageSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: 'TT Reviews',
    description: 'Community-driven table tennis equipment reviews by real players',
    url: 'https://tt-reviews.local',
    potentialAction: {
      '@type': 'SearchAction',
      target: 'https://tt-reviews.local/search?q={search_term_string}',
      'query-input': 'required name=search_term_string',
    },
  }
}

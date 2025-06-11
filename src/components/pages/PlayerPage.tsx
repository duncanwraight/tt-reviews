import { PlayerPageProps } from '../../types/components'
import { Layout } from '../Layout'
import { Breadcrumb, generateBreadcrumbs } from '../ui/Breadcrumb'

// Helper function to get country flag emoji
function getCountryFlag(countryCode: string): string {
  const flags: Record<string, string> = {
    CHN: '🇨🇳',
    JPN: '🇯🇵',
    GER: '🇩🇪',
    KOR: '🇰🇷',
    SWE: '🇸🇪',
    FRA: '🇫🇷',
    HKG: '🇭🇰',
    TPE: '🇹🇼',
    SGP: '🇸🇬',
    USA: '🇺🇸',
    BRA: '🇧🇷',
    EGY: '🇪🇬',
    NIG: '🇳🇬',
    IND: '🇮🇳',
    AUS: '🇦🇺',
    POL: '🇵🇱',
    ROU: '🇷🇴',
    AUT: '🇦🇹',
    DEN: '🇩🇰',
    CRO: '🇭🇷',
    SVK: '🇸🇰',
  }
  return flags[countryCode] || '🏳️'
}

export function PlayerPage({ player, equipmentSetups, videos = [], careerStats }: PlayerPageProps) {
  const breadcrumbs = generateBreadcrumbs(`/players/${player.slug}`)

  return (
    <Layout
      title={`${player.name} Equipment & Setup`}
      description={`Complete equipment setup for ${player.name}. See what blade, forehand and backhand rubbers the pro uses, with historical changes and sources.`}
      structuredData={generatePlayerSchema(player, equipmentSetups)}
    >
      <Breadcrumb items={breadcrumbs} />
      <PlayerHeader player={player} />
      <PlayerTabs
        player={player}
        equipmentSetups={equipmentSetups}
        videos={videos}
        careerStats={careerStats}
      />
      <script
        dangerouslySetInnerHTML={{
          __html: `
          document.addEventListener('DOMContentLoaded', function() {
            // Show edit buttons if user is logged in
            const session = localStorage.getItem('session');
            let token = null;
            
            if (session) {
              try {
                const sessionData = JSON.parse(session);
                token = sessionData.access_token;
              } catch (e) {
                console.warn('Invalid session data');
              }
            }
            
            const editBtn = document.getElementById('edit-player-btn');
            const addEquipmentBtn = document.getElementById('add-equipment-btn');
            
            if (token) {
              if (editBtn) {
                editBtn.classList.remove('hidden');
              }
              if (addEquipmentBtn) {
                addEquipmentBtn.classList.remove('hidden');
              }
            }
          });
        `,
        }}
      />
    </Layout>
  )
}

function PlayerHeader({ player }: { player: any }) {
  return (
    <section class="player-header bg-white border-b border-gray-200 py-8">
      <div class="main-container">
        <div class="player-info grid grid-cols-1 lg:grid-cols-6 gap-8 items-center">
          <div class="player-photo lg:col-span-1">
            <div class="w-36 h-36 bg-gray-200 rounded-lg flex items-center justify-center text-6xl text-gray-400 mx-auto lg:mx-0">
              📷
            </div>
          </div>

          <div class="player-details lg:col-span-4 text-center lg:text-left">
            <h1 class="text-3xl font-bold text-gray-900 mb-4">{player.name}</h1>
            <div class="player-meta flex flex-wrap justify-center lg:justify-start gap-6 mb-4 text-sm">
              {(player.represents || player.birth_country) && (
                <span>
                  <span class="font-medium text-gray-700">Represents:</span>{' '}
                  {getCountryFlag(player.represents || player.birth_country)}{' '}
                  {player.represents || player.birth_country}
                </span>
              )}
              {player.highest_rating && (
                <span>
                  <span class="font-medium text-gray-700">Highest Rating:</span>{' '}
                  {player.highest_rating}
                </span>
              )}
              {player.active_years && (
                <span>
                  <span class="font-medium text-gray-700">Active:</span> {player.active_years}
                </span>
              )}
              {player.playing_style && (
                <span>
                  <span class="font-medium text-gray-700">Style:</span>{' '}
                  {player.playing_style
                    .replace('_', ' ')
                    .replace(/\b\w/g, (l: string) => l.toUpperCase())}
                </span>
              )}
            </div>
          </div>

          <div class="player-stats lg:col-span-1 text-center lg:text-right">
            <div class="mb-4">
              <button
                id="edit-player-btn"
                class="hidden px-4 py-2 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                onclick={`window.location.href='/players/${player.slug}/edit'`}
              >
                Edit Player
              </button>
            </div>
            <p class="text-sm text-gray-600 mb-2">
              <span class="font-medium text-gray-900">Notable Achievements</span>
            </p>
            <p class="text-sm text-gray-600">
              World Championship semifinalist, Olympic bronze medalist
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}

function PlayerTabs({
  player,
  equipmentSetups,
  videos,
  careerStats,
}: {
  player: any
  equipmentSetups: any[]
  videos: any[]
  careerStats: any
}) {
  return (
    <>
      <section class="tabs bg-white border-b border-gray-200">
        <div class="tab-nav flex max-w-7xl mx-auto px-4">
          <button
            class="tab-button px-6 py-4 font-medium text-gray-700 border-b-2 border-transparent hover:text-gray-900 hover:border-gray-300 focus:outline-none focus:text-purple-600 focus:border-purple-600 active border-purple-600 text-purple-600"
            onclick="switchTab('timeline')"
          >
            Equipment Timeline
          </button>
          <button
            class="tab-button px-6 py-4 font-medium text-gray-700 border-b-2 border-transparent hover:text-gray-900 hover:border-gray-300 focus:outline-none focus:text-purple-600 focus:border-purple-600"
            onclick="switchTab('videos')"
          >
            Videos
          </button>
          <button
            class="tab-button px-6 py-4 font-medium text-gray-700 border-b-2 border-transparent hover:text-gray-900 hover:border-gray-300 focus:outline-none focus:text-purple-600 focus:border-purple-600"
            onclick="switchTab('stats')"
          >
            Career Stats
          </button>
        </div>
      </section>

      <section class="tab-content py-8">
        <div id="timeline-content">
          <EquipmentTimeline
            equipmentSetups={equipmentSetups}
            playerId={player.slug}
            playerName={player.name}
          />
        </div>
        <div id="videos-content" style="display: none;">
          <VideosSection videos={videos} />
        </div>
        <div id="stats-content" style="display: none;">
          <CareerStats stats={careerStats} />
        </div>
      </section>
    </>
  )
}

function EquipmentTimeline({
  equipmentSetups,
  playerId,
  playerName,
}: {
  equipmentSetups: any[]
  playerId: string
  playerName: string
}) {
  // Mock data if no setups provided
  const mockSetups = equipmentSetups.length
    ? equipmentSetups
    : [
        {
          year: 2019,
          blade: { name: 'Butterfly Diode', slug: 'butterfly-diode' },
          forehand: { name: 'Butterfly Tenergy 64 (red, max)', slug: 'butterfly-tenergy-64' },
          backhand: { name: 'Victas Curl P3aV (black, 1.5mm)', slug: 'victas-curl-p3av' },
          source: { text: 'YouTube video', url: 'https://youtube.com/watch' },
        },
        {
          year: 2007,
          blade: { name: 'Butterfly Diode', slug: 'butterfly-diode' },
          forehand: { name: 'Butterfly Tenergy 64 (red, max)', slug: 'butterfly-tenergy-64' },
          backhand: { name: 'TSP Curl P1-R (black, 1.5mm)', slug: 'tsp-curl-p1-r' },
          source: { text: 'Player interview', url: 'https://example.com/interview' },
        },
      ]

  return (
    <div class="main-container">
      {/* Timeline Header with Add Equipment Button */}
      <div class="timeline-header flex justify-between items-center mb-6">
        <h2 class="text-2xl font-bold text-gray-900">Equipment Timeline</h2>
        <button
          id="add-equipment-btn"
          class="hidden px-4 py-2 bg-green-600 text-white text-sm rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500"
          onclick={`window.location.href='/players/${playerId}/edit#add-equipment'`}
        >
          Add Equipment Setup
        </button>
      </div>

      <div class="timeline relative pl-8">
        <div class="timeline-line absolute left-3 top-0 bottom-0 w-0.5 bg-gray-300"></div>

        {mockSetups.map((setup, index) => (
          <TimelineItem key={index} setup={setup} />
        ))}
      </div>
    </div>
  )
}

function TimelineItem({ setup }: { setup: any }) {
  return (
    <div class="timeline-item relative mb-8 bg-white rounded-lg p-6 border border-gray-200 shadow-sm">
      <div class="timeline-marker absolute -left-7 top-6 w-3 h-3 bg-purple-600 rounded-full border-2 border-white"></div>

      <div class="timeline-year text-xl font-semibold text-purple-600 mb-4">{setup.year}</div>

      <div class="equipment-setup space-y-3">
        <EquipmentItem label="Blade" item={setup.blade} />
        <EquipmentItem label="Forehand" item={setup.forehand} />
        <EquipmentItem label="Backhand" item={setup.backhand} />
      </div>

      {setup.source && (
        <a
          href={setup.source.url}
          class="source-link inline-block mt-4 text-sm text-blue-600 hover:text-blue-800 hover:underline"
          target="_blank"
          rel="noopener noreferrer"
        >
          Source: {setup.source.text}
        </a>
      )}
    </div>
  )
}

function EquipmentItem({ label, item }: { label: string; item: any }) {
  if (!item) return null

  return (
    <div class="equipment-item flex justify-between items-center p-3 bg-gray-50 rounded-md border border-gray-100">
      <span class="equipment-label font-medium text-gray-700">{label}:</span>
      <a
        href={`/equipment/${item.slug}`}
        class="equipment-name font-semibold text-purple-600 hover:text-purple-800 hover:underline"
        onclick={`navigate('/equipment/${item.slug}'); return false;`}
      >
        {item.name}
      </a>
    </div>
  )
}

function VideosSection({ videos }: { videos: any[] }) {
  return (
    <div class="main-container">
      <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div class="card bg-white rounded-lg p-6 border border-gray-200">
          <h3 class="text-xl font-semibold text-gray-900 mb-3">Training Videos</h3>
          <p class="text-gray-600">Professional training footage and technique analysis</p>
        </div>
        <div class="card bg-white rounded-lg p-6 border border-gray-200">
          <h3 class="text-xl font-semibold text-gray-900 mb-3">Match Highlights</h3>
          <p class="text-gray-600">Tournament matches and competitive play</p>
        </div>
      </div>
    </div>
  )
}

function CareerStats({ stats }: { stats: any }) {
  return (
    <div class="main-container">
      <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div class="card bg-white rounded-lg p-6 border border-gray-200">
          <h3 class="text-xl font-semibold text-gray-900 mb-3">Rankings</h3>
          <p class="text-gray-600">Historical world ranking progression</p>
        </div>
        <div class="card bg-white rounded-lg p-6 border border-gray-200">
          <h3 class="text-xl font-semibold text-gray-900 mb-3">Achievements</h3>
          <p class="text-gray-600">Major tournament wins and medals</p>
        </div>
      </div>
    </div>
  )
}

function generatePlayerSchema(player: any, equipmentSetups: any[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Person',
    name: player.name,
    description: `Professional table tennis player equipment setup and profile`,
    sport: 'Table Tennis',
    nationality: 'Unknown', // TODO: Add to player data
    award: 'World Championship semifinalist, Olympic bronze medalist',
    url: `https://tt-reviews.local/players/${player.slug}`,
    mainEntityOfPage: {
      '@type': 'WebPage',
      '@id': `https://tt-reviews.local/players/${player.slug}`,
    },
  }
}

// Add tab switching functionality via inline script
function addTabScript() {
  return `
    function switchTab(tabName) {
      // Remove active class from all buttons
      document.querySelectorAll('.tab-button').forEach(btn => {
        btn.classList.remove('active', 'border-purple-600', 'text-purple-600');
        btn.classList.add('border-transparent', 'text-gray-700');
      });
      
      // Hide all content
      document.querySelectorAll('[id$="-content"]').forEach(content => {
        content.style.display = 'none';
      });
      
      // Show selected content and activate button
      const button = document.querySelector(\`[onclick="switchTab('\${tabName}')"]\`);
      const content = document.getElementById(\`\${tabName}-content\`);
      
      if (button && content) {
        button.classList.add('active', 'border-purple-600', 'text-purple-600');
        button.classList.remove('border-transparent', 'text-gray-700');
        content.style.display = 'block';
      }
    }
  `
}

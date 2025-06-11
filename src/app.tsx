import { Hono } from 'hono'
import { jsxRenderer } from 'hono/jsx-renderer'
import { errorHandler } from './middleware/error'
import { requestLogger } from './middleware/logger'
import { corsMiddleware } from './middleware/cors'
import { Variables } from './middleware/auth'

// Import routes
import { auth } from './routes/auth'
import { equipment } from './routes/equipment'
import { equipmentSubmissions } from './routes/equipment-submissions'
import { players } from './routes/players'
import { search } from './routes/search'
import { health } from './routes/health'
import { createReviewsRoutes } from './routes/reviews'
import { moderation } from './routes/moderation'
import { discord } from './routes/discord'

// Import page components
import { HomePage } from './components/pages/HomePage'
import { EquipmentPage } from './components/pages/EquipmentPage'
import { PlayerPage } from './components/pages/PlayerPage'
import { PlayersListPage } from './components/pages/PlayersListPage'
import { PlayerSubmitPage } from './components/pages/PlayerSubmitPage'
import { PlayerEditPage } from './components/pages/PlayerEditPage'
import { SearchPage } from './components/pages/SearchPage'
import { LoginPage } from './components/pages/LoginPage'
import { AdminPage } from './components/pages/AdminPage'
import { AdminReviewsPage } from './components/pages/AdminReviewsPage'
import { AdminPlayerEditsPage } from './components/pages/AdminPlayerEditsPage'
import { AdminEquipmentSubmissionsPage } from './components/pages/AdminEquipmentSubmissionsPage'
import { ProfilePage } from './components/pages/ProfilePage'
import { EquipmentIndexPage } from './components/pages/EquipmentIndexPage'
import { EquipmentSubmitPage } from './components/pages/EquipmentSubmitPage'

// Import services for data fetching
import { PlayerService, Equipment, Player } from './lib/supabase'
import { EquipmentService } from './services/equipment.service'
import { ModerationService } from './services/moderation.service'
import { VideoItem, CareerStats } from './types/components'
import { createSupabaseClient } from './config/database'
import { validateEnvironment } from './config/environment'
import { NotFoundError } from './utils/errors'
import { createClient } from '@supabase/supabase-js'

export function createApp(): Hono<{ Variables: Variables }> {
  const app = new Hono<{ Variables: Variables }>()

  // Global middleware
  app.use('*', corsMiddleware)
  app.use('*', requestLogger)
  app.use('*', errorHandler)

  // JSX renderer setup
  app.use('*', jsxRenderer())

  // API routes
  app.route('/api', health)
  app.route('/api/auth', auth)
  app.route('/api/equipment', equipment)
  app.route('/api/equipment-submissions', equipmentSubmissions)
  app.route('/api/players', players)
  app.route('/api/search', search)
  app.route('/api/reviews', createReviewsRoutes())
  app.route('/api/admin', moderation)
  app.route('/api/discord', discord)

  // Frontend routes with JSX rendering
  app.get('/', async c => {
    // TODO: Fetch featured equipment and popular players
    const featuredEquipment: Equipment[] = []
    const popularPlayers: Player[] = []

    return c.render(
      <HomePage featuredEquipment={featuredEquipment} popularPlayers={popularPlayers} />
    )
  })

  // Equipment submission page (must come before /:slug pattern)
  app.get('/equipment/submit', c => {
    const baseUrl = new globalThis.URL(c.req.url).origin
    return c.render(<EquipmentSubmitPage baseUrl={baseUrl} />)
  })

  app.get('/equipment/:slug', async c => {
    const slug = c.req.param('slug')

    try {
      const env = validateEnvironment(c.env)
      const supabase = createSupabaseClient(env)
      const equipmentService = new EquipmentService(supabase)

      const equipment = await equipmentService.getEquipment(slug)
      if (!equipment) {
        throw new NotFoundError('Equipment not found')
      }

      const reviews = await equipmentService.getEquipmentReviews(equipment.id)

      // TODO: Fetch players who use this equipment
      const usedByPlayers: Player[] = []
      const similarEquipment: Equipment[] = []

      return c.render(
        <EquipmentPage
          equipment={equipment}
          reviews={reviews}
          usedByPlayers={usedByPlayers}
          similarEquipment={similarEquipment}
        />
      )
    } catch (error) {
      if (error instanceof NotFoundError) {
        c.status(404)
        return c.render(
          <div>
            <h1>Equipment Not Found</h1>
            <p>The equipment you're looking for doesn't exist.</p>
          </div>
        )
      }
      throw error
    }
  })

  // Player submission and edit routes (must come before /:slug to avoid conflicts)
  app.get('/players/submit', c => {
    return c.render(<PlayerSubmitPage />)
  })

  app.get('/players/:slug/edit', async c => {
    const slug = c.req.param('slug')

    try {
      const env = validateEnvironment(c.env)
      const supabase = createSupabaseClient(env)
      const playerService = new PlayerService(supabase)

      const player = await playerService.getPlayer(slug)
      if (!player) {
        throw new NotFoundError('Player not found')
      }

      return c.render(<PlayerEditPage player={player} />)
    } catch (error) {
      if (error instanceof NotFoundError) {
        c.status(404)
        return c.render(
          <div>
            <h1>Player Not Found</h1>
            <p>The player you're looking for doesn't exist.</p>
          </div>
        )
      }
      throw error
    }
  })

  app.get('/players/:slug', async c => {
    const slug = c.req.param('slug')

    try {
      const env = validateEnvironment(c.env)
      const supabase = createSupabaseClient(env)
      const playerService = new PlayerService(supabase)

      const player = await playerService.getPlayer(slug)
      if (!player) {
        throw new NotFoundError('Player not found')
      }

      const equipmentSetups = await playerService.getPlayerEquipmentSetups(player.id)

      // TODO: Fetch videos and career stats
      const videos: VideoItem[] = []
      const careerStats: CareerStats | undefined = undefined

      return c.render(
        <PlayerPage
          player={player}
          equipmentSetups={equipmentSetups}
          videos={videos}
          careerStats={careerStats}
        />
      )
    } catch (error) {
      if (error instanceof NotFoundError) {
        c.status(404)
        return c.render(
          <div>
            <h1>Player Not Found</h1>
            <p>The player you're looking for doesn't exist.</p>
          </div>
        )
      }
      throw error
    }
  })

  app.get('/search', async c => {
    const query = c.req.query('q') || ''

    let results: { equipment: Equipment[]; players: Player[] } | undefined = undefined
    if (query) {
      try {
        const env = validateEnvironment(c.env)
        const supabase = createSupabaseClient(env)
        const equipmentService = new EquipmentService(supabase)
        const playerService = new PlayerService(supabase)

        const [equipment, players] = await Promise.all([
          equipmentService.searchEquipment(query),
          playerService.searchPlayers(query),
        ])

        results = { equipment, players }
      } catch (error) {
        console.error('Search error:', error)
        results = { equipment: [], players: [] }
      }
    }

    return c.render(<SearchPage query={query} results={results} />)
  })

  // Category pages
  app.get('/equipment', async c => {
    try {
      const env = validateEnvironment(c.env)
      const supabase = createSupabaseClient(env)
      const equipmentService = new EquipmentService(supabase)

      const [recentEquipment, recentReviews, categories] = await Promise.all([
        equipmentService.getRecentEquipment(8),
        equipmentService.getRecentReviews(6),
        equipmentService.getEquipmentCategories(),
      ])

      return c.render(
        <EquipmentIndexPage
          recentEquipment={recentEquipment}
          recentReviews={recentReviews}
          categories={categories}
        />
      )
    } catch (error) {
      console.error('Error loading equipment index:', error)
      return c.render(
        <EquipmentIndexPage recentEquipment={[]} recentReviews={[]} categories={[]} />
      )
    }
  })

  app.get('/players', async c => {
    try {
      const env = validateEnvironment(c.env)
      const supabase = createSupabaseClient(env)
      const playerService = new PlayerService(supabase)

      const players = await playerService.getAllPlayers()

      return c.render(<PlayersListPage players={players} />)
    } catch (error) {
      console.error('Error fetching players:', error)
      return c.render(<PlayersListPage players={[]} />)
    }
  })

  // Authentication pages
  app.get('/login', c => {
    return c.render(<LoginPage />)
  })

  app.get('/profile', c => {
    return c.render(<ProfilePage />)
  })

  // Admin pages
  app.get('/admin', async c => {
    try {
      const env = validateEnvironment(c.env)
      const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)
      const moderationService = new ModerationService(supabase)

      const stats = await moderationService.getModerationStats()

      return c.render(<AdminPage stats={stats} />)
    } catch (error) {
      console.error('Error loading admin dashboard:', error)
      return c.render(
        <AdminPage
          stats={{
            pending: 0,
            approved: 0,
            rejected: 0,
            total: 0,
            playerEditsPending: 0,
            playerEditsApproved: 0,
            playerEditsRejected: 0,
            playerEditsTotal: 0,
            equipmentSubmissionsPending: 0,
            equipmentSubmissionsApproved: 0,
            equipmentSubmissionsRejected: 0,
            equipmentSubmissionsTotal: 0,
          }}
        />
      )
    }
  })

  app.get('/admin/reviews', async c => {
    try {
      const env = validateEnvironment(c.env)
      const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)
      const moderationService = new ModerationService(supabase)

      const { reviews, total } = await moderationService.getPendingReviews(50, 0)

      return c.render(<AdminReviewsPage reviews={reviews} total={total} />)
    } catch (error) {
      console.error('Error loading pending reviews:', error)
      return c.render(<AdminReviewsPage reviews={[]} total={0} />)
    }
  })

  app.get('/admin/player-edits', async c => {
    try {
      const env = validateEnvironment(c.env)
      const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)
      const moderationService = new ModerationService(supabase)

      const { playerEdits, total } = await moderationService.getPendingPlayerEdits(50, 0)

      return c.render(<AdminPlayerEditsPage playerEdits={playerEdits} total={total} />)
    } catch (error) {
      console.error('Error loading pending player edits:', error)
      return c.render(<AdminPlayerEditsPage playerEdits={[]} total={0} />)
    }
  })

  app.get('/admin/equipment-submissions', async c => {
    try {
      const env = validateEnvironment(c.env)
      const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)
      const moderationService = new ModerationService(supabase)

      const { equipmentSubmissions, total } =
        await moderationService.getPendingEquipmentSubmissions(50, 0)

      return c.render(
        <AdminEquipmentSubmissionsPage equipmentSubmissions={equipmentSubmissions} total={total} />
      )
    } catch (error) {
      console.error('Error loading pending equipment submissions:', error)
      return c.render(<AdminEquipmentSubmissionsPage equipmentSubmissions={[]} total={0} />)
    }
  })

  // Built-in error handler for unhandled errors
  app.onError((err, c) => {
    console.error('Unhandled error:', err)
    c.header('Content-Type', 'application/json')
    c.status(500)
    return c.json({
      error: err.message || 'Internal Server Error',
      timestamp: new Date().toISOString(),
    })
  })

  // 404 handler for unmatched routes
  app.notFound(c => {
    if (c.req.path.startsWith('/api/')) {
      c.header('Content-Type', 'application/json')
      return c.json({ error: 'Not Found', timestamp: new Date().toISOString() }, 404)
    }
    c.status(404)
    return c.render(
      <div>
        <h1>404 - Page Not Found</h1>
        <p>The page you're looking for doesn't exist.</p>
      </div>
    )
  })

  return app
}

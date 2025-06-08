import { Hono, Context } from 'hono'
import { createSupabaseClient, EquipmentService, PlayerService, AuthService } from './lib/supabase'
import { User } from '@supabase/supabase-js'

type Variables = {
  user: User
}

const app = new Hono<{ Variables: Variables }>()

// Authentication middleware
const requireAuth = async (c: Context<{ Variables: Variables }>, next: () => Promise<void>) => {
  try {
    const authHeader = c.req.header('Authorization')

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return c.json({ error: 'Authentication required' }, 401)
    }

    const token = authHeader.substring(7) // Remove 'Bearer ' prefix
    const supabase = createSupabaseClient(c.env)

    // Verify the JWT token
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser(token)

    if (error || !user) {
      return c.json({ error: 'Invalid or expired token' }, 401)
    }

    // Add user to context for use in protected routes
    c.set('user', user)
    await next()
  } catch (error) {
    console.error('Auth middleware error:', error)
    return c.json({ error: 'Authentication failed' }, 401)
  }
}

// API routes
app.get('/api/health', async c => {
  try {
    const supabase = createSupabaseClient(c.env)

    // Simple database connection test
    const { error } = await supabase.from('equipment').select('count').limit(1)

    if (error) {
      return c.json(
        {
          status: 'error',
          timestamp: new Date().toISOString(),
          database: 'disconnected',
          error: error.message,
        },
        500
      )
    }

    return c.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      database: 'connected',
      supabase_url: (c.env as Record<string, string>).SUPABASE_URL || 'not_set',
    })
  } catch (error) {
    return c.json(
      {
        status: 'error',
        timestamp: new Date().toISOString(),
        database: 'error',
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      500
    )
  }
})

app.get('/api/hello', c => {
  return c.json({ message: 'Hello from Hono + Cloudflare Workers!' })
})

// Authentication API
app.post('/api/auth/signup', async c => {
  try {
    const { email, password } = await c.req.json()

    if (!email || !password) {
      return c.json({ error: 'Email and password are required' }, 400)
    }

    const supabase = createSupabaseClient(c.env)
    const authService = new AuthService(supabase)

    const { user, error } = await authService.signUp(email, password)

    if (error) {
      return c.json({ error: error.message }, 400)
    }

    return c.json({ user, message: 'User created successfully' })
  } catch (error) {
    console.error('Signup error:', error)
    return c.json({ error: 'Internal server error' }, 500)
  }
})

app.post('/api/auth/signin', async c => {
  try {
    const { email, password } = await c.req.json()

    if (!email || !password) {
      return c.json({ error: 'Email and password are required' }, 400)
    }

    const supabase = createSupabaseClient(c.env)
    const authService = new AuthService(supabase)

    const { user, session, error } = await authService.signIn(email, password)

    if (error) {
      return c.json({ error: error.message }, 400)
    }

    return c.json({ user, session })
  } catch (error) {
    console.error('Signin error:', error)
    return c.json({ error: 'Internal server error' }, 500)
  }
})

app.post('/api/auth/signout', async c => {
  try {
    const supabase = createSupabaseClient(c.env)
    const authService = new AuthService(supabase)

    const { error } = await authService.signOut()

    if (error) {
      return c.json({ error: error.message }, 400)
    }

    return c.json({ message: 'Signed out successfully' })
  } catch (error) {
    console.error('Signout error:', error)
    return c.json({ error: 'Internal server error' }, 500)
  }
})

app.get('/api/auth/user', async c => {
  try {
    const supabase = createSupabaseClient(c.env)
    const authService = new AuthService(supabase)

    const { user, error } = await authService.getUser()

    if (error) {
      return c.json({ error: error.message }, 400)
    }

    return c.json({ user })
  } catch (error) {
    console.error('Get user error:', error)
    return c.json({ error: 'Internal server error' }, 500)
  }
})

app.post('/api/auth/reset-password', async c => {
  try {
    const { email } = await c.req.json()

    if (!email) {
      return c.json({ error: 'Email is required' }, 400)
    }

    const supabase = createSupabaseClient(c.env)
    const authService = new AuthService(supabase)

    const { error } = await authService.resetPassword(email)

    if (error) {
      return c.json({ error: error.message }, 400)
    }

    return c.json({ message: 'Password reset email sent' })
  } catch (error) {
    console.error('Reset password error:', error)
    return c.json({ error: 'Internal server error' }, 500)
  }
})

// Protected routes (require authentication)
app.get('/api/auth/profile', requireAuth, async c => {
  try {
    const user = c.get('user')
    return c.json({
      user,
      message: 'This is a protected route - you are authenticated!',
    })
  } catch (error) {
    console.error('Profile error:', error)
    return c.json({ error: 'Internal server error' }, 500)
  }
})

// Equipment API
app.get('/api/equipment/:slug', async c => {
  try {
    const slug = c.req.param('slug')
    const supabase = createSupabaseClient(c.env)
    const equipmentService = new EquipmentService(supabase)

    const equipment = await equipmentService.getEquipment(slug)
    if (!equipment) {
      return c.json({ error: 'Equipment not found' }, 404)
    }

    const reviews = await equipmentService.getEquipmentReviews(equipment.id)

    return c.json({ equipment, reviews })
  } catch (error) {
    console.error('Equipment API error:', error)
    return c.json({ error: 'Internal server error' }, 500)
  }
})

// Players API
app.get('/api/players/:slug', async c => {
  try {
    const slug = c.req.param('slug')
    const supabase = createSupabaseClient(c.env)
    const playerService = new PlayerService(supabase)

    const player = await playerService.getPlayer(slug)
    if (!player) {
      return c.json({ error: 'Player not found' }, 404)
    }

    const equipmentSetups = await playerService.getPlayerEquipmentSetups(player.id)

    return c.json({ player, equipmentSetups })
  } catch (error) {
    console.error('Player API error:', error)
    return c.json({ error: 'Internal server error' }, 500)
  }
})

// Search API
app.get('/api/search', async c => {
  try {
    const query = c.req.query('q')
    if (!query) {
      return c.json({ error: 'Search query required' }, 400)
    }

    const supabase = createSupabaseClient(c.env)
    const equipmentService = new EquipmentService(supabase)
    const playerService = new PlayerService(supabase)

    const [equipment, players] = await Promise.all([
      equipmentService.searchEquipment(query),
      playerService.searchPlayers(query),
    ])

    return c.json({ equipment, players })
  } catch (error) {
    console.error('Search API error:', error)
    return c.json({ error: 'Internal server error' }, 500)
  }
})

// SPA fallback - serve index.html for any unmatched routes
app.get('*', c => {
  return c.html(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>TT Reviews</title>
      <link rel="preconnect" href="https://fonts.googleapis.com">
      <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
      <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@200;300;400;500;600;700;800&display=swap" rel="stylesheet">
      <style>
        * {
          margin: 0;
          padding: 0;
          box-sizing: border-box;
        }
        
        :root {
          --primary: #7c3aed;
          --secondary: #64748b;
          --accent: #14b8a6;
          --background: #fafafa;
          --text: #18181b;
          --success: #10b981;
          --warning: #f59e0b;
          --error: #ef4444;
          --info: #3b82f6;
          --card-bg: #ffffff;
          --border: #f1f5f9;
        }
        
        body {
          font-family: "Plus Jakarta Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          background-color: var(--background);
          color: var(--text);
          line-height: 1.5;
        }
        
        /* Header */
        .header {
          background: var(--card-bg);
          border-bottom: 1px solid var(--border);
          padding: 1rem 0;
          position: sticky;
          top: 0;
          z-index: 50;
        }
        
        .header-container {
          max-width: 1200px;
          margin: 0 auto;
          padding: 0 1rem;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 2rem;
        }
        
        .logo {
          font-size: 1.5rem;
          font-weight: 700;
          color: var(--primary);
          text-decoration: none;
        }
        
        .search-container {
          flex: 1;
          max-width: 500px;
          position: relative;
        }
        
        .search-input {
          width: 100%;
          padding: 0.75rem 1rem;
          border: 1px solid var(--border);
          border-radius: 8px;
          font-size: 1rem;
          background: var(--background);
          transition: all 0.2s;
        }
        
        .search-input:focus {
          outline: none;
          border-color: var(--primary);
          box-shadow: 0 0 0 3px rgba(124, 58, 237, 0.1);
        }
        
        .nav-menu {
          display: flex;
          gap: 2rem;
          align-items: center;
        }
        
        .nav-link {
          text-decoration: none;
          color: var(--secondary);
          font-weight: 500;
          padding: 0.5rem 1rem;
          border-radius: 6px;
          transition: all 0.2s;
        }
        
        .nav-link:hover,
        .nav-link.active {
          color: var(--primary);
          background: rgba(124, 58, 237, 0.1);
        }
        
        .login-btn {
          background: var(--primary);
          color: white;
          padding: 0.5rem 1rem;
          border-radius: 6px;
          text-decoration: none;
          font-weight: 500;
          transition: all 0.2s;
        }
        
        .login-btn:hover {
          background: #6d28d9;
        }
        
        .discord-link {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.5rem 1rem;
          border-radius: 6px;
          color: #5865f2;
          transition: all 0.2s;
          text-decoration: none;
        }
        
        .discord-link svg {
          flex-shrink: 0;
          vertical-align: middle;
          margin-bottom: 2px;
        }
        
        .discord-link:hover {
          background: rgba(88, 101, 242, 0.1);
          transform: scale(1.05);
        }
        
        .discord-text {
          font-family: 'Courier New', 'Monaco', 'Menlo', monospace;
          font-weight: 700;
          font-size: 1.125rem;
          letter-spacing: 0.05em;
          line-height: 1;
          transform: translateY(1px);
        }
        
        /* Mobile menu */
        .mobile-menu-toggle {
          display: none;
          background: none;
          border: none;
          font-size: 1.5rem;
          cursor: pointer;
          color: var(--text);
        }
        
        /* Main content */
        .main-container {
          max-width: 1200px;
          margin: 0 auto;
          padding: 0 1rem;
        }
        
        /* Hero section */
        .hero {
          text-align: center;
          padding: 4rem 0;
          background: linear-gradient(135deg, rgba(124, 58, 237, 0.05) 0%, rgba(20, 184, 166, 0.05) 100%);
        }
        
        .hero h1 {
          font-size: 2.5rem;
          font-weight: 700;
          margin-bottom: 1rem;
        }
        
        .hero p {
          font-size: 1.25rem;
          color: var(--secondary);
          margin-bottom: 2rem;
        }
        
        .hero-search {
          max-width: 600px;
          margin: 0 auto;
          position: relative;
        }
        
        .hero-search input {
          width: 100%;
          padding: 1rem 1.5rem;
          font-size: 1.125rem;
          border: 1px solid var(--border);
          border-radius: 12px;
          background: var(--card-bg);
          box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
        }
        
        /* Grid layouts */
        .grid {
          display: grid;
          gap: 1.5rem;
        }
        
        .grid-3 {
          grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
        }
        
        .grid-2 {
          grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
        }
        
        /* Cards */
        .card {
          background: var(--card-bg);
          border-radius: 8px;
          padding: 1.5rem;
          box-shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.1);
          border: 1px solid var(--border);
          transition: all 0.2s;
        }
        
        .card:hover {
          box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
          transform: translateY(-1px);
        }
        
        .card h3 {
          font-size: 1.25rem;
          font-weight: 600;
          margin-bottom: 0.5rem;
        }
        
        .card p {
          color: var(--secondary);
        }
        
        /* Section headers */
        .section {
          padding: 3rem 0;
        }
        
        .section-header {
          text-align: center;
          margin-bottom: 2rem;
        }
        
        .section-header h2 {
          font-size: 2rem;
          font-weight: 600;
          margin-bottom: 0.5rem;
        }
        
        .section-header p {
          color: var(--secondary);
          font-size: 1.125rem;
        }
        
        /* Equipment categories */
        .category-card {
          background: var(--card-bg);
          border-radius: 8px;
          padding: 2rem;
          text-align: center;
          border: 1px solid var(--border);
          transition: all 0.2s;
          cursor: pointer;
        }
        
        .category-card:hover {
          border-color: var(--primary);
          box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
        }
        
        .category-icon {
          font-size: 2rem;
          margin-bottom: 1rem;
        }
        
        /* Rating stars */
        .rating {
          display: flex;
          gap: 0.25rem;
          align-items: center;
        }
        
        .star {
          color: var(--warning);
        }
        
        .rating-text {
          margin-left: 0.5rem;
          font-size: 0.875rem;
          color: var(--secondary);
        }
        
        /* Player profile styles */
        .player-header {
          background: var(--card-bg);
          border-bottom: 1px solid var(--border);
          padding: 2rem 0;
        }
        
        .player-info {
          display: grid;
          grid-template-columns: 150px 1fr auto;
          gap: 2rem;
          align-items: center;
        }
        
        .player-photo {
          width: 150px;
          height: 150px;
          border-radius: 8px;
          background: var(--border);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 3rem;
          color: var(--secondary);
        }
        
        .player-details h1 {
          font-size: 2rem;
          font-weight: 700;
          margin-bottom: 0.5rem;
        }
        
        .player-meta {
          display: flex;
          gap: 2rem;
          margin-bottom: 1rem;
        }
        
        .player-meta span {
          color: var(--secondary);
          font-size: 0.875rem;
        }
        
        .player-meta strong {
          color: var(--text);
          font-weight: 600;
        }
        
        .player-stats {
          text-align: right;
        }
        
        .player-stats p {
          margin-bottom: 0.5rem;
          color: var(--secondary);
        }
        
        .player-stats strong {
          color: var(--text);
        }
        
        /* Tab navigation */
        .tabs {
          background: var(--card-bg);
          border-bottom: 1px solid var(--border);
        }
        
        .tab-nav {
          display: flex;
          max-width: 1200px;
          margin: 0 auto;
          padding: 0 1rem;
        }
        
        .tab-button {
          background: none;
          border: none;
          padding: 1rem 1.5rem;
          font-family: inherit;
          font-size: 1rem;
          font-weight: 500;
          color: var(--secondary);
          border-bottom: 2px solid transparent;
          cursor: pointer;
          transition: all 0.2s;
        }
        
        .tab-button:hover {
          color: var(--text);
        }
        
        .tab-button.active {
          color: var(--primary);
          border-bottom-color: var(--primary);
        }
        
        .tab-content {
          padding: 2rem 0;
        }
        
        /* Equipment timeline */
        .timeline {
          position: relative;
          padding-left: 2rem;
        }
        
        .timeline::before {
          content: '';
          position: absolute;
          left: 0.75rem;
          top: 0;
          bottom: 0;
          width: 2px;
          background: var(--border);
        }
        
        .timeline-item {
          position: relative;
          margin-bottom: 2rem;
          background: var(--card-bg);
          border-radius: 8px;
          padding: 1.5rem;
          border: 1px solid var(--border);
        }
        
        .timeline-item::before {
          content: '';
          position: absolute;
          left: -1.75rem;
          top: 1.5rem;
          width: 12px;
          height: 12px;
          background: var(--primary);
          border-radius: 50%;
          border: 2px solid var(--card-bg);
        }
        
        .timeline-year {
          font-size: 1.25rem;
          font-weight: 600;
          color: var(--primary);
          margin-bottom: 1rem;
        }
        
        .equipment-setup {
          display: grid;
          gap: 1rem;
          margin-bottom: 1rem;
        }
        
        .equipment-item {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 0.75rem;
          background: var(--background);
          border-radius: 6px;
          border: 1px solid var(--border);
        }
        
        .equipment-label {
          font-weight: 500;
          color: var(--secondary);
        }
        
        .equipment-name {
          font-weight: 600;
          color: var(--primary);
          cursor: pointer;
          text-decoration: none;
        }
        
        .equipment-name:hover {
          text-decoration: underline;
        }
        
        .source-link {
          font-size: 0.875rem;
          color: var(--info);
          text-decoration: none;
        }
        
        .source-link:hover {
          text-decoration: underline;
        }
        
        /* Equipment review styles */
        .equipment-header {
          background: var(--card-bg);
          border-bottom: 1px solid var(--border);
          padding: 2rem 0;
        }
        
        .equipment-info {
          display: grid;
          grid-template-columns: 200px 1fr;
          gap: 2rem;
          align-items: start;
        }
        
        .equipment-image {
          width: 200px;
          height: 200px;
          border-radius: 8px;
          background: var(--border);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 4rem;
          color: var(--secondary);
        }
        
        .equipment-details h1 {
          font-size: 2rem;
          font-weight: 700;
          margin-bottom: 0.5rem;
        }
        
        .equipment-meta {
          display: flex;
          gap: 2rem;
          margin-bottom: 1rem;
          flex-wrap: wrap;
        }
        
        .equipment-meta span {
          color: var(--secondary);
          font-size: 0.875rem;
        }
        
        .equipment-rating {
          display: flex;
          align-items: center;
          gap: 1rem;
          margin-bottom: 1rem;
        }
        
        .used-by {
          margin-top: 1rem;
        }
        
        .used-by h3 {
          font-size: 1rem;
          font-weight: 600;
          margin-bottom: 0.5rem;
          color: var(--secondary);
        }
        
        .player-avatars {
          display: flex;
          gap: 0.5rem;
          flex-wrap: wrap;
        }
        
        .player-avatar {
          width: 40px;
          height: 40px;
          border-radius: 50%;
          background: var(--primary);
          color: white;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 0.875rem;
          font-weight: 600;
          text-decoration: none;
          transition: all 0.2s;
        }
        
        .player-avatar:hover {
          transform: scale(1.1);
        }
        
        .review-layout {
          display: grid;
          grid-template-columns: 300px 1fr;
          gap: 2rem;
          max-width: 1200px;
          margin: 0 auto;
          padding: 0 1rem;
        }
        
        .review-sidebar {
          background: var(--card-bg);
          border-radius: 8px;
          padding: 1.5rem;
          border: 1px solid var(--border);
          height: fit-content;
          position: sticky;
          top: 100px;
        }
        
        .filter-section {
          margin-bottom: 2rem;
        }
        
        .filter-section h3 {
          font-size: 1rem;
          font-weight: 600;
          margin-bottom: 1rem;
          color: var(--text);
        }
        
        .filter-section select,
        .filter-section input {
          width: 100%;
          padding: 0.5rem;
          border: 1px solid var(--border);
          border-radius: 6px;
          font-size: 0.875rem;
          margin-bottom: 0.5rem;
        }
        
        .review-content {
          display: flex;
          flex-direction: column;
          gap: 1.5rem;
        }
        
        .rating-breakdown {
          background: var(--card-bg);
          border-radius: 8px;
          padding: 1.5rem;
          border: 1px solid var(--border);
        }
        
        .rating-bars {
          display: grid;
          gap: 1rem;
        }
        
        .rating-bar {
          display: flex;
          align-items: center;
          gap: 1rem;
        }
        
        .rating-label {
          min-width: 80px;
          font-weight: 500;
          color: var(--secondary);
        }
        
        .rating-progress {
          flex: 1;
          height: 8px;
          background: var(--border);
          border-radius: 4px;
          overflow: hidden;
        }
        
        .rating-fill {
          height: 100%;
          background: var(--accent);
          transition: width 0.3s ease;
        }
        
        .rating-value {
          min-width: 30px;
          text-align: right;
          font-weight: 600;
          color: var(--text);
        }
        
        .review-card {
          background: var(--card-bg);
          border-radius: 8px;
          padding: 1.5rem;
          border: 1px solid var(--border);
        }
        
        .reviewer-info {
          display: flex;
          justify-content: space-between;
          margin-bottom: 1rem;
          padding-bottom: 1rem;
          border-bottom: 1px solid var(--border);
        }
        
        .reviewer-context {
          font-size: 0.875rem;
          color: var(--secondary);
        }
        
        .review-ratings {
          display: flex;
          gap: 1rem;
          margin-bottom: 1rem;
        }
        
        .review-text {
          line-height: 1.6;
          margin-bottom: 1rem;
        }
        
        .review-equipment {
          font-size: 0.875rem;
          color: var(--secondary);
          background: var(--background);
          padding: 0.75rem;
          border-radius: 6px;
        }

        /* Breadcrumb navigation */
        .breadcrumb {
          background: var(--card-bg);
          border-bottom: 1px solid var(--border);
          padding: 0.75rem 0;
          font-size: 0.875rem;
        }
        
        .breadcrumb-container {
          max-width: 1200px;
          margin: 0 auto;
          padding: 0 1rem;
        }
        
        .breadcrumb-nav {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          color: var(--secondary);
        }
        
        .breadcrumb-link {
          color: var(--secondary);
          text-decoration: none;
          transition: color 0.2s;
        }
        
        .breadcrumb-link:hover {
          color: var(--primary);
          text-decoration: underline;
        }
        
        .breadcrumb-separator {
          color: var(--border);
          font-weight: bold;
        }
        
        .breadcrumb-current {
          color: var(--text);
          font-weight: 500;
        }

        /* Responsive design */
        @media (max-width: 768px) {
          .header-container {
            gap: 1rem;
          }
          
          .search-container {
            display: none;
          }
          
          .nav-menu {
            display: none;
          }
          
          .mobile-menu-toggle {
            display: block;
          }
          
          .hero h1 {
            font-size: 2rem;
          }
          
          .hero p {
            font-size: 1rem;
          }
          
          .grid-3 {
            grid-template-columns: 1fr;
          }
          
          .grid-2 {
            grid-template-columns: repeat(2, 1fr);
          }
          
          .player-info {
            grid-template-columns: 100px 1fr;
            gap: 1rem;
          }
          
          .player-photo {
            width: 100px;
            height: 100px;
            font-size: 2rem;
          }
          
          .player-meta {
            flex-direction: column;
            gap: 0.5rem;
          }
          
          .player-stats {
            text-align: left;
          }
          
          .tab-nav {
            overflow-x: auto;
          }
          
          .tab-button {
            white-space: nowrap;
            padding: 1rem;
          }
          
          .timeline {
            padding-left: 1rem;
          }
          
          .timeline::before {
            left: 0.5rem;
          }
          
          .timeline-item::before {
            left: -1.25rem;
          }
          
          .equipment-info {
            grid-template-columns: 1fr;
            gap: 1rem;
          }
          
          .equipment-image {
            width: 150px;
            height: 150px;
            margin: 0 auto;
            font-size: 3rem;
          }
          
          .equipment-meta {
            gap: 1rem;
          }
          
          .review-layout {
            grid-template-columns: 1fr;
            gap: 1rem;
          }
          
          .review-sidebar {
            position: static;
          }
        }
        
        @media (max-width: 480px) {
          .grid-2 {
            grid-template-columns: 1fr;
          }
          
          .player-info {
            grid-template-columns: 1fr;
            text-align: center;
          }
          
          .player-meta {
            justify-content: center;
          }
          
          .equipment-item {
            flex-direction: column;
            align-items: flex-start;
            gap: 0.5rem;
          }
        }
      </style>
    </head>
    <body>
      <header class="header">
        <div class="header-container">
          <a href="/" class="logo" onclick="navigate('/')">TT Reviews</a>
          
          <div class="search-container">
            <input type="text" class="search-input" placeholder="Search equipment, players, or reviews...">
          </div>
          
          <nav class="nav-menu">
            <a href="/equipment" class="nav-link" onclick="navigate('/equipment')">Equipment</a>
            <a href="/players" class="nav-link" onclick="navigate('/players')">Players</a>
            <a href="https://discord.gg/Ycp7mKA3Yw" class="discord-link" target="_blank" rel="noopener noreferrer">
              <svg width="20" height="20" viewBox="0 0 127.14 96.36" fill="currentColor">
                <path d="M107.7,8.07A105.15,105.15,0,0,0,81.47,0a72.06,72.06,0,0,0-3.36,6.83A97.68,97.68,0,0,0,49,6.83,72.37,72.37,0,0,0,45.64,0,105.89,105.89,0,0,0,19.39,8.09C2.79,32.65-1.71,56.6.54,80.21h0A105.73,105.73,0,0,0,32.71,96.36,77.7,77.7,0,0,0,39.6,85.25a68.42,68.42,0,0,1-10.85-5.18c.91-.66,1.8-1.34,2.66-2a75.57,75.57,0,0,0,64.32,0c.87.71,1.76,1.39,2.66,2a68.68,68.68,0,0,1-10.87,5.19,77,77,0,0,0,6.89,11.1A105.25,105.25,0,0,0,126.6,80.22h0C129.24,52.84,122.09,29.11,107.7,8.07ZM42.45,65.69C36.18,65.69,31,60,31,53s5-12.74,11.43-12.74S54,46,53.89,53,48.84,65.69,42.45,65.69Zm42.24,0C78.41,65.69,73.25,60,73.25,53s5-12.74,11.44-12.74S96.23,46,96.12,53,91.08,65.69,84.69,65.69Z"/>
              </svg>
              <span class="discord-text">OOAK</span>
            </a>
            <a href="/login" class="login-btn" id="authButton" onclick="window.handleAuthButton()">Login</a>
          </nav>
          
          <button class="mobile-menu-toggle">☰</button>
        </div>
      </header>
      
      <main id="content">
        <!-- Content will be rendered here -->
      </main>
      
      <script>
        function navigate(path) {
          history.pushState({}, '', path);
          render();
          updateActiveNav();
          return false;
        }
        
        function updateActiveNav() {
          const path = window.location.pathname;
          document.querySelectorAll('.nav-link').forEach(link => {
            link.classList.remove('active');
            if (link.getAttribute('href') === path) {
              link.classList.add('active');
            }
          });
        }
        
        function generateBreadcrumb(path) {
          const segments = path.split('/').filter(segment => segment);
          if (segments.length === 0) return '';
          
          const breadcrumbs = [{ label: 'Home', path: '/' }];
          
          // Equipment breadcrumbs
          if (segments[0] === 'equipment') {
            breadcrumbs.push({ label: 'Equipment', path: '/equipment' });
            
            if (segments[1]) {
              const equipmentNames = {
                'butterfly-tenergy-64': 'Butterfly Tenergy 64',
                'tsp-curl-p1-r': 'TSP Curl P1-R',
                'stiga-clipper': 'Stiga Clipper',
                'blades': 'Blades',
                'forehand-rubbers': 'Forehand Rubbers',
                'backhand-rubbers': 'Backhand Rubbers',
                'long-pips': 'Long Pips',
                'anti-spin': 'Anti-Spin',
                'training': 'Training Equipment'
              };
              
              const equipmentName = equipmentNames[segments[1]] || segments[1];
              breadcrumbs.push({ label: equipmentName, path: path, current: true });
            }
          }
          
          // Player breadcrumbs
          if (segments[0] === 'players') {
            breadcrumbs.push({ label: 'Players', path: '/players' });
            
            if (segments[1]) {
              const playerNames = {
                'joo-saehyuk': 'Joo Saehyuk',
                'ma-long': 'Ma Long',
                'timo-boll': 'Timo Boll'
              };
              
              const playerName = playerNames[segments[1]] || segments[1];
              breadcrumbs.push({ label: playerName, path: path, current: true });
            }
          }
          
          
          return \`
            <nav class="breadcrumb">
              <div class="breadcrumb-container">
                <div class="breadcrumb-nav">
                  \${breadcrumbs.map((crumb, index) => {
                    if (crumb.current) {
                      return \`<span class="breadcrumb-current">\${crumb.label}</span>\`;
                    } else {
                      const separator = index < breadcrumbs.length - 1 ? '<span class="breadcrumb-separator">›</span>' : '';
                      return \`<a href="\${crumb.path}" class="breadcrumb-link" onclick="navigate('\${crumb.path}')">\${crumb.label}</a>\${separator}\`;
                    }
                  }).join('')}
                </div>
              </div>
            </nav>
          \`;
        }
        
        function createRating(rating, count) {
          const stars = '★'.repeat(Math.floor(rating)) + '☆'.repeat(5 - Math.floor(rating));
          return \`
            <div class="rating">
              <span class="star">\${stars}</span>
              <span class="rating-text">(\${count} reviews)</span>
            </div>
          \`;
        }
        
        function switchTab(tabName) {
          document.querySelectorAll('.tab-button').forEach(btn => btn.classList.remove('active'));
          document.querySelector(\`[onclick="switchTab('\${tabName}')"]\`).classList.add('active');
          
          const content = document.querySelector('.tab-content');
          const playerId = window.location.pathname.split('/')[2];
          
          switch(tabName) {
            case 'timeline':
              content.innerHTML = renderEquipmentTimeline(playerId);
              break;
            case 'videos':
              content.innerHTML = renderVideos(playerId);
              break;
            case 'stats':
              content.innerHTML = renderCareerStats(playerId);
              break;
          }
        }
        
        function renderEquipmentTimeline(playerId) {
          const timelines = {
            'joo-saehyuk': [
              {
                year: '2019',
                blade: { name: 'Butterfly Diode', link: '/equipment/butterfly-diode' },
                forehand: { name: 'Butterfly Tenergy 64 (red, max)', link: '/equipment/butterfly-tenergy-64' },
                backhand: { name: 'Victas Curl P3aV (black, 1.5mm)', link: '/equipment/victas-curl-p3av' },
                source: { text: 'YouTube video', url: 'https://youtube.com/watch' }
              },
              {
                year: '2007',
                blade: { name: 'Butterfly Diode', link: '/equipment/butterfly-diode' },
                forehand: { name: 'Butterfly Tenergy 64 (red, max)', link: '/equipment/butterfly-tenergy-64' },
                backhand: { name: 'TSP Curl P1-R (black, 1.5mm)', link: '/equipment/tsp-curl-p1-r' },
                source: { text: 'Player interview', url: 'https://example.com/interview' }
              }
            ],
            'ma-long': [
              {
                year: '2021',
                blade: { name: 'DHS Hurricane Long 5', link: '/equipment/dhs-hurricane-long-5' },
                forehand: { name: 'DHS Hurricane 3 (red, 2.15mm)', link: '/equipment/dhs-hurricane-3' },
                backhand: { name: 'DHS Hurricane 3 (black, 2.15mm)', link: '/equipment/dhs-hurricane-3' },
                source: { text: 'Equipment sponsor', url: 'https://example.com/sponsor' }
              }
            ],
            'timo-boll': [
              {
                year: '2020',
                blade: { name: 'Butterfly Timo Boll ALC', link: '/equipment/butterfly-timo-boll-alc' },
                forehand: { name: 'Butterfly Dignics 05 (red, 2.1mm)', link: '/equipment/butterfly-dignics-05' },
                backhand: { name: 'Butterfly Dignics 05 (black, 2.1mm)', link: '/equipment/butterfly-dignics-05' },
                source: { text: 'Equipment sponsor', url: 'https://example.com/sponsor' }
              }
            ]
          };
          
          const timeline = timelines[playerId] || [];
          
          return \`
            <div class="main-container">
              <div class="timeline">
                \${timeline.map(entry => \`
                  <div class="timeline-item">
                    <div class="timeline-year">\${entry.year}</div>
                    <div class="equipment-setup">
                      <div class="equipment-item">
                        <span class="equipment-label">Blade:</span>
                        <a href="\${entry.blade.link}" class="equipment-name" onclick="navigate('\${entry.blade.link}')">\${entry.blade.name}</a>
                      </div>
                      <div class="equipment-item">
                        <span class="equipment-label">Forehand:</span>
                        <a href="\${entry.forehand.link}" class="equipment-name" onclick="navigate('\${entry.forehand.link}')">\${entry.forehand.name}</a>
                      </div>
                      <div class="equipment-item">
                        <span class="equipment-label">Backhand:</span>
                        <a href="\${entry.backhand.link}" class="equipment-name" onclick="navigate('\${entry.backhand.link}')">\${entry.backhand.name}</a>
                      </div>
                    </div>
                    <a href="\${entry.source.url}" class="source-link" target="_blank">Source: \${entry.source.text}</a>
                  </div>
                \`).join('')}
              </div>
            </div>
          \`;
        }
        
        function renderVideos(playerId) {
          return \`
            <div class="main-container">
              <div class="grid grid-2">
                <div class="card">
                  <h3>Training Videos</h3>
                  <p>Professional training footage and technique analysis</p>
                </div>
                <div class="card">
                  <h3>Match Highlights</h3>
                  <p>Tournament matches and competitive play</p>
                </div>
              </div>
            </div>
          \`;
        }
        
        function renderCareerStats(playerId) {
          return \`
            <div class="main-container">
              <div class="grid grid-2">
                <div class="card">
                  <h3>Rankings</h3>
                  <p>Historical world ranking progression</p>
                </div>
                <div class="card">
                  <h3>Achievements</h3>
                  <p>Major tournament wins and medals</p>
                </div>
              </div>
            </div>
          \`;
        }
        
        function renderRatingBars(ratings) {
          return Object.entries(ratings).map(([metric, value]) => \`
            <div class="rating-bar">
              <span class="rating-label">\${metric}</span>
              <div class="rating-progress">
                <div class="rating-fill" style="width: \${(value / 10) * 100}%"></div>
              </div>
              <span class="rating-value">\${value}/10</span>
            </div>
          \`).join('');
        }
        
        function render() {
          const path = window.location.pathname;
          const content = document.getElementById('content');
          const breadcrumbHtml = generateBreadcrumb(path);
          
          // Check for email verification success
          const urlParams = new URLSearchParams(window.location.search);
          const urlHash = window.location.hash;
          
          if (urlParams.get('type') === 'email' || urlHash.includes('access_token')) {
            showSuccessOverlay('Email verified successfully! Welcome to TT Reviews.');
            // Clean up URL parameters
            const cleanUrl = window.location.pathname;
            window.history.replaceState({}, document.title, cleanUrl);
          }
          
          switch(path) {
            case '/':
              content.innerHTML = \`
                <section class="hero">
                  <div class="main-container">
                    <h1>Trusted Table Tennis Reviews</h1>
                    <p>Community-driven equipment reviews by real players</p>
                    <div class="hero-search">
                      <input type="text" placeholder="Search for equipment, players, or reviews...">
                    </div>
                  </div>
                </section>
                
                <section class="section">
                  <div class="main-container">
                    <div class="section-header">
                      <h2>Featured Reviews</h2>
                      <p>Latest highly-rated equipment reviews from our community</p>
                    </div>
                    <div class="grid grid-3">
                      <div class="card" style="cursor: pointer;" onclick="navigate('/equipment/butterfly-tenergy-64')">
                        <h3>Butterfly Tenergy 64</h3>
                        \${createRating(4.5, 23)}
                        <p>High-performance forehand rubber with excellent spin generation and speed.</p>
                      </div>
                      <div class="card" style="cursor: pointer;" onclick="navigate('/equipment/tsp-curl-p1-r')">
                        <h3>TSP Curl P1-R</h3>
                        \${createRating(4.2, 18)}
                        <p>Classic long pips rubber perfect for defensive play and spin reversal.</p>
                      </div>
                      <div class="card" style="cursor: pointer;" onclick="navigate('/equipment/stiga-clipper')">
                        <h3>Stiga Clipper</h3>
                        \${createRating(4.7, 31)}
                        <p>Legendary blade combining speed and control for all-round players.</p>
                      </div>
                    </div>
                  </div>
                </section>
                
                <section class="section" style="background: var(--card-bg);">
                  <div class="main-container">
                    <div class="section-header">
                      <h2>Popular Players</h2>
                      <p>Explore equipment setups from professional players</p>
                    </div>
                    <div class="grid grid-3">
                      <div class="card" style="cursor: pointer;" onclick="navigate('/players/joo-saehyuk')">
                        <h3>Joo Saehyuk</h3>
                        <p><strong>Highest Rating:</strong> WR6</p>
                        <p><strong>Style:</strong> Defensive chopper</p>
                        <p><strong>Current Setup:</strong> Butterfly Diode, Tenergy 64 FH</p>
                      </div>
                      <div class="card" style="cursor: pointer;" onclick="navigate('/players/ma-long')">
                        <h3>Ma Long</h3>
                        <p><strong>Highest Rating:</strong> WR1</p>
                        <p><strong>Style:</strong> Offensive all-round</p>
                        <p><strong>Current Setup:</strong> Hurricane Long 5, Hurricane 3</p>
                      </div>
                      <div class="card" style="cursor: pointer;" onclick="navigate('/players/timo-boll')">
                        <h3>Timo Boll</h3>
                        <p><strong>Highest Rating:</strong> WR1</p>
                        <p><strong>Style:</strong> Classic European</p>
                        <p><strong>Current Setup:</strong> Butterfly Timo Boll ALC</p>
                      </div>
                    </div>
                  </div>
                </section>
                
                <section class="section">
                  <div class="main-container">
                    <div class="section-header">
                      <h2>Equipment Categories</h2>
                      <p>Find the right equipment for your playing style</p>
                    </div>
                    <div class="grid grid-2">
                      <div class="category-card" onclick="navigate('/equipment/blades')">
                        <div class="category-icon">🏓</div>
                        <h3>Blades</h3>
                        <p>Wooden and composite blades for all playing styles</p>
                      </div>
                      <div class="category-card" onclick="navigate('/equipment/forehand-rubbers')">
                        <div class="category-icon">🔴</div>
                        <h3>Forehand Rubbers</h3>
                        <p>Inverted rubbers for attack and spin generation</p>
                      </div>
                      <div class="category-card" onclick="navigate('/equipment/backhand-rubbers')">
                        <div class="category-icon">⚫</div>
                        <h3>Backhand Rubbers</h3>
                        <p>All rubber types for backhand play</p>
                      </div>
                      <div class="category-card" onclick="navigate('/equipment/long-pips')">
                        <div class="category-icon">🎯</div>
                        <h3>Long Pips</h3>
                        <p>Defensive rubbers for spin reversal</p>
                      </div>
                      <div class="category-card" onclick="navigate('/equipment/anti-spin')">
                        <div class="category-icon">🛡️</div>
                        <h3>Anti-Spin</h3>
                        <p>Low-friction rubbers for defensive play</p>
                      </div>
                      <div class="category-card" onclick="navigate('/equipment/training')">
                        <div class="category-icon">📚</div>
                        <h3>Training Equipment</h3>
                        <p>Practice aids and training tools</p>
                      </div>
                    </div>
                  </div>
                </section>
              \`;
              break;
              
            case '/equipment':
              content.innerHTML = \`
                \${breadcrumbHtml}
                <section class="section">
                  <div class="main-container">
                    <div class="section-header">
                      <h1>Equipment Reviews</h1>
                      <p>Browse trusted equipment reviews from our community</p>
                    </div>
                    <div class="grid grid-3">
                      <div class="card">
                        <h3>All Equipment</h3>
                        <p>Browse our complete database of reviewed equipment</p>
                      </div>
                      <div class="card">
                        <h3>Top Rated</h3>
                        <p>Equipment with the highest community ratings</p>
                      </div>
                      <div class="card">
                        <h3>Latest Reviews</h3>
                        <p>Most recently added equipment reviews</p>
                      </div>
                    </div>
                  </div>
                </section>
              \`;
              break;
              
            case '/players':
              content.innerHTML = \`
                \${breadcrumbHtml}
                <section class="section">
                  <div class="main-container">
                    <div class="section-header">
                      <h1>Player Profiles</h1>
                      <p>Explore professional player equipment setups</p>
                    </div>
                    <div class="grid grid-3">
                      <div class="card">
                        <h3>Professional Players</h3>
                        <p>Equipment used by world-ranked professionals</p>
                      </div>
                      <div class="card">
                        <h3>YouTube Players</h3>
                        <p>Setups from popular table tennis content creators</p>
                      </div>
                      <div class="card">
                        <h3>Amateur Champions</h3>
                        <p>High-level amateur players and their equipment</p>
                      </div>
                    </div>
                  </div>
                </section>
              \`;
              break;
              
              
            case '/login':
              content.innerHTML = \`
                <section class="section">
                  <div class="main-container">
                    <div class="section-header">
                      <h1>Login</h1>
                      <p>Sign in to submit reviews and access personalized features</p>
                    </div>
                    <div class="card" style="max-width: 400px; margin: 0 auto;">
                      <form id="loginForm" onsubmit="window.handleLogin(event); return false;">
                        <div style="margin-bottom: 1rem;">
                          <label for="email" style="display: block; margin-bottom: 0.5rem; font-weight: 500;">Email</label>
                          <input 
                            type="email" 
                            id="email" 
                            name="email" 
                            required 
                            style="width: 100%; padding: 0.75rem; border: 1px solid var(--border); border-radius: 6px; font-size: 1rem;"
                            placeholder="Enter your email"
                          >
                        </div>
                        <div style="margin-bottom: 1.5rem;">
                          <label for="password" style="display: block; margin-bottom: 0.5rem; font-weight: 500;">Password</label>
                          <input 
                            type="password" 
                            id="password" 
                            name="password" 
                            required 
                            style="width: 100%; padding: 0.75rem; border: 1px solid var(--border); border-radius: 6px; font-size: 1rem;"
                            placeholder="Enter your password"
                          >
                        </div>
                        <button 
                          type="submit" 
                          style="width: 100%; background: var(--primary); color: white; padding: 0.75rem; border: none; border-radius: 6px; font-size: 1rem; font-weight: 500; cursor: pointer; margin-bottom: 1rem;"
                        >
                          Sign In
                        </button>
                        <div style="text-align: center; margin-bottom: 1rem;">
                          <a href="#" onclick="window.showSignupForm(); return false;" style="color: var(--primary); text-decoration: none;">
                            Don't have an account? Sign up
                          </a>
                        </div>
                        <div style="text-align: center;">
                          <a href="#" onclick="window.showResetForm(); return false;" style="color: var(--secondary); text-decoration: none; font-size: 0.875rem;">
                            Forgot your password?
                          </a>
                        </div>
                      </form>
                      
                      <form id="signupForm" onsubmit="window.handleSignup(event); return false;" style="display: none;">
                        <div style="margin-bottom: 1rem;">
                          <label for="signupEmail" style="display: block; margin-bottom: 0.5rem; font-weight: 500;">Email</label>
                          <input 
                            type="email" 
                            id="signupEmail" 
                            name="email" 
                            required 
                            style="width: 100%; padding: 0.75rem; border: 1px solid var(--border); border-radius: 6px; font-size: 1rem;"
                            placeholder="Enter your email"
                          >
                        </div>
                        <div style="margin-bottom: 1.5rem;">
                          <label for="signupPassword" style="display: block; margin-bottom: 0.5rem; font-weight: 500;">Password</label>
                          <input 
                            type="password" 
                            id="signupPassword" 
                            name="password" 
                            required 
                            minlength="6"
                            style="width: 100%; padding: 0.75rem; border: 1px solid var(--border); border-radius: 6px; font-size: 1rem;"
                            placeholder="Create a password (min 6 characters)"
                          >
                        </div>
                        <button 
                          type="submit" 
                          style="width: 100%; background: var(--accent); color: white; padding: 0.75rem; border: none; border-radius: 6px; font-size: 1rem; font-weight: 500; cursor: pointer; margin-bottom: 1rem;"
                        >
                          Sign Up
                        </button>
                        <div style="text-align: center;">
                          <a href="#" onclick="window.showLoginForm(); return false;" style="color: var(--primary); text-decoration: none;">
                            Already have an account? Sign in
                          </a>
                        </div>
                      </form>
                      
                      <div id="authMessage" style="display: none; margin-top: 1rem; padding: 0.75rem; border-radius: 6px; text-align: center;"></div>
                    </div>
                  </div>
                </section>
              \`;
              break;
              
            case '/submit-review':
              const session = checkAuthState();
              if (!session || !session.access_token) {
                navigate('/login');
                return;
              }
              
              content.innerHTML = \`
                <section class="section">
                  <div class="main-container">
                    <div class="section-header">
                      <h1>Submit Equipment Review</h1>
                      <p>Share your experience with table tennis equipment</p>
                    </div>
                    <div class="card" style="max-width: 600px; margin: 0 auto;">
                      <p>Review submission form coming soon!</p>
                      <p>You are logged in as: <strong>\${session.user?.email || 'Unknown'}</strong></p>
                      <button onclick="window.logout()" style="background: var(--error); color: white; padding: 0.5rem 1rem; border: none; border-radius: 6px; cursor: pointer;">
                        Logout
                      </button>
                    </div>
                  </div>
                </section>
              \`;
              break;
              
            default:
              // Handle player profiles
              if (path.startsWith('/players/')) {
                const playerId = path.split('/')[2];
                const players = {
                  'joo-saehyuk': {
                    name: 'Joo Saehyuk',
                    rating: 'WR6',
                    active: '2004-2020',
                    country: 'South Korea',
                    style: 'Defensive chopper',
                    achievements: 'World Championship semifinalist, Olympic bronze medalist'
                  },
                  'ma-long': {
                    name: 'Ma Long',
                    rating: 'WR1',
                    active: '2004-present',
                    country: 'China',
                    style: 'Offensive all-round',
                    achievements: 'Olympic champion, World champion, Grand Slam winner'
                  },
                  'timo-boll': {
                    name: 'Timo Boll',
                    rating: 'WR1',
                    active: '1997-present',
                    country: 'Germany',
                    style: 'Classic European topspin',
                    achievements: 'World Championship silver, European champion'
                  }
                };
                
                const player = players[playerId];
                if (player) {
                  content.innerHTML = \`
                    \${breadcrumbHtml}
                    <section class="player-header">
                      <div class="main-container">
                        <div class="player-info">
                          <div class="player-photo">📷</div>
                          <div class="player-details">
                            <h1>\${player.name}</h1>
                            <div class="player-meta">
                              <span><strong>Highest Rating:</strong> \${player.rating}</span>
                              <span><strong>Active:</strong> \${player.active}</span>
                              <span><strong>Country:</strong> \${player.country}</span>
                            </div>
                            <p><strong>Playing Style:</strong> \${player.style}</p>
                          </div>
                          <div class="player-stats">
                            <p><strong>Notable Achievements</strong></p>
                            <p>\${player.achievements}</p>
                          </div>
                        </div>
                      </div>
                    </section>
                    
                    <section class="tabs">
                      <div class="tab-nav">
                        <button class="tab-button active" onclick="switchTab('timeline')">Equipment Timeline</button>
                        <button class="tab-button" onclick="switchTab('videos')">Videos</button>
                        <button class="tab-button" onclick="switchTab('stats')">Career Stats</button>
                      </div>
                    </section>
                    
                    <section class="tab-content">
                      \${renderEquipmentTimeline(playerId)}
                    </section>
                  \`;
                  break;
                } else {
                  content.innerHTML = \`
                    \${breadcrumbHtml}
                    <section class="section">
                      <div class="main-container">
                        <div class="section-header">
                          <h1>Player Not Found</h1>
                          <p>The player profile you're looking for doesn't exist.</p>
                        </div>
                      </div>
                    </section>
                  \`;
                  break;
                }
              }
              
              // Handle equipment reviews
              if (path.startsWith('/equipment/')) {
                const equipmentId = path.split('/')[2];
                const equipment = {
                  'butterfly-tenergy-64': {
                    name: 'Butterfly Tenergy 64',
                    manufacturer: 'Butterfly',
                    type: 'Inverted Rubber',
                    rating: 4.5,
                    reviewCount: 23,
                    usedBy: ['ma-long', 'joo-saehyuk'],
                    ratings: { Spin: 9, Speed: 8, Control: 7 }
                  },
                  'tsp-curl-p1-r': {
                    name: 'TSP Curl P1-R',
                    manufacturer: 'TSP',
                    type: 'Long Pips Rubber',
                    rating: 4.2,
                    reviewCount: 18,
                    usedBy: ['joo-saehyuk'],
                    ratings: { 'Spin Gen': 3, 'Spin Rev': 9, Control: 8 }
                  },
                  'stiga-clipper': {
                    name: 'Stiga Clipper',
                    manufacturer: 'Stiga',
                    type: 'All-Round Blade',
                    rating: 4.7,
                    reviewCount: 31,
                    usedBy: [],
                    ratings: { Speed: 7, Control: 9, Feel: 8 }
                  }
                };
                
                const item = equipment[equipmentId];
                if (item) {
                  content.innerHTML = \`
                    \${breadcrumbHtml}
                    <section class="equipment-header">
                      <div class="main-container">
                        <div class="equipment-info">
                          <div class="equipment-image">🏓</div>
                          <div class="equipment-details">
                            <h1>\${item.name}</h1>
                            <div class="equipment-meta">
                              <span><strong>Manufacturer:</strong> \${item.manufacturer}</span>
                              <span><strong>Type:</strong> \${item.type}</span>
                            </div>
                            <div class="equipment-rating">
                              \${createRating(item.rating, item.reviewCount)}
                            </div>
                            \${item.usedBy.length > 0 ? \`
                              <div class="used-by">
                                <h3>Used by</h3>
                                <div class="player-avatars">
                                  \${item.usedBy.map(playerId => \`
                                    <a href="/players/\${playerId}" class="player-avatar" onclick="navigate('/players/\${playerId}')">\${playerId.charAt(0).toUpperCase()}</a>
                                  \`).join('')}
                                </div>
                              </div>
                            \` : ''}
                          </div>
                        </div>
                      </div>
                    </section>
                    
                    <section class="section">
                      <div class="review-layout">
                        <div class="review-sidebar">
                          <div class="filter-section">
                            <h3>Filter Reviews</h3>
                            <select>
                              <option>All Levels</option>
                              <option>Beginner</option>
                              <option>Intermediate</option>
                              <option>Advanced</option>
                              <option>Professional</option>
                            </select>
                            <select>
                              <option>All Styles</option>
                              <option>Offensive</option>
                              <option>All-Round</option>
                              <option>Defensive</option>
                            </select>
                          </div>
                          <div class="filter-section">
                            <h3>Sort By</h3>
                            <select>
                              <option>Most Recent</option>
                              <option>Highest Rated</option>
                              <option>Most Helpful</option>
                            </select>
                          </div>
                        </div>
                        
                        <div class="review-content">
                          <div class="rating-breakdown">
                            <h3>Rating Breakdown</h3>
                            <div class="rating-bars">
                              \${renderRatingBars(item.ratings)}
                            </div>
                          </div>
                          
                          <div class="review-card">
                            <div class="reviewer-info">
                              <div>
                                <strong>Advanced Player</strong>
                                <div class="reviewer-context">USATT 2100 • Offensive style • 3 months testing</div>
                              </div>
                              <div class="review-ratings">
                                \${createRating(4.5, 0)}
                              </div>
                            </div>
                            <div class="review-text">
                              Excellent rubber with great spin potential. The speed is impressive but still controllable for loop rallies. Perfect for offensive players looking for a reliable FH rubber.
                            </div>
                            <div class="review-equipment">
                              <strong>Setup:</strong> Butterfly Innerforce Layer ZLC, Tenergy 64 FH, Tenergy 05 BH
                            </div>
                          </div>
                          
                          <div class="review-card">
                            <div class="reviewer-info">
                              <div>
                                <strong>Intermediate Player</strong>
                                <div class="reviewer-context">Club level • All-round style • 6 months testing</div>
                              </div>
                              <div class="review-ratings">
                                \${createRating(4.0, 0)}
                              </div>
                            </div>
                            <div class="review-text">
                              Great rubber but requires good technique. Can be unforgiving for beginners but rewards consistent practice. Excellent for training loop consistency.
                            </div>
                            <div class="review-equipment">
                              <strong>Setup:</strong> Stiga Clipper, Tenergy 64 FH, Mark V BH
                            </div>
                          </div>
                        </div>
                      </div>
                    </section>
                  \`;
                  break;
                } else {
                  content.innerHTML = \`
                    \${breadcrumbHtml}
                    <section class="section">
                      <div class="main-container">
                        <div class="section-header">
                          <h1>Equipment Not Found</h1>
                          <p>The equipment review you're looking for doesn't exist.</p>
                        </div>
                      </div>
                    </section>
                  \`;
                  break;
                }
              }
              
              // Default 404 page
              content.innerHTML = \`
                <section class="section">
                  <div class="main-container">
                    <div class="section-header">
                      <h1>404 - Page Not Found</h1>
                      <p>The page you're looking for doesn't exist.</p>
                    </div>
                  </div>
                </section>
              \`;
          }
        }
        
        // Authentication state management
        function checkAuthState() {
          const session = localStorage.getItem('session');
          return session ? JSON.parse(session) : null;
        }
        
        function updateAuthButton() {
          const authButton = document.getElementById('authButton');
          const session = checkAuthState();
          
          if (session && session.access_token) {
            authButton.textContent = 'Submit Review';
            authButton.style.background = 'var(--accent)';
            authButton.href = '/submit-review';
          } else {
            authButton.textContent = 'Login';
            authButton.style.background = 'var(--primary)';
            authButton.href = '/login';
          }
        }
        
        window.handleAuthButton = function() {
          const session = checkAuthState();
          
          if (session && session.access_token) {
            // User is logged in, navigate to submit review page
            navigate('/submit-review');
          } else {
            // User is not logged in, navigate to login page
            navigate('/login');
          }
          return false;
        }
        
        window.logout = async function() {
          try {
            await fetch('/api/auth/signout', {
              method: 'POST',
            });
            localStorage.removeItem('session');
            updateAuthButton();
            navigate('/');
          } catch (error) {
            console.error('Logout error:', error);
          }
        }

        // Authentication functions
        window.showSignupForm = function() {
          document.getElementById('loginForm').style.display = 'none';
          document.getElementById('signupForm').style.display = 'block';
          document.querySelector('.section-header h1').textContent = 'Sign Up';
          document.querySelector('.section-header p').textContent = 'Create an account to submit reviews and access personalized features';
        }
        
        window.showLoginForm = function() {
          document.getElementById('signupForm').style.display = 'none';
          document.getElementById('loginForm').style.display = 'block';
          document.querySelector('.section-header h1').textContent = 'Login';
          document.querySelector('.section-header p').textContent = 'Sign in to submit reviews and access personalized features';
        }
        
        window.showMessage = function(message, isError = false) {
          const messageDiv = document.getElementById('authMessage');
          messageDiv.textContent = message;
          messageDiv.style.display = 'block';
          messageDiv.style.backgroundColor = isError ? 'var(--error)' : 'var(--success)';
          messageDiv.style.color = 'white';
        }
        
        window.showSuccessOverlay = function(message) {
          // Create overlay
          const overlay = document.createElement('div');
          overlay.style.cssText = 
            'position: fixed;' +
            'top: 0;' +
            'left: 0;' +
            'width: 100%;' +
            'height: 100%;' +
            'background: rgba(0, 0, 0, 0.5);' +
            'display: flex;' +
            'align-items: center;' +
            'justify-content: center;' +
            'z-index: 10000;' +
            'animation: fadeIn 0.3s ease-out;';
          
          // Create success popup
          const popup = document.createElement('div');
          popup.style.cssText = 
            'background: white;' +
            'padding: 2rem;' +
            'border-radius: 12px;' +
            'box-shadow: 0 20px 40px rgba(0, 0, 0, 0.15);' +
            'text-align: center;' +
            'max-width: 400px;' +
            'margin: 0 1rem;' +
            'animation: slideUp 0.3s ease-out;';
          
          // Create success icon
          const icon = document.createElement('div');
          icon.style.cssText = 
            'width: 60px;' +
            'height: 60px;' +
            'background: var(--success);' +
            'border-radius: 50%;' +
            'margin: 0 auto 1rem;' +
            'display: flex;' +
            'align-items: center;' +
            'justify-content: center;' +
            'color: white;' +
            'font-size: 24px;' +
            'font-weight: bold;';
          icon.innerHTML = '✓';
          
          // Create message
          const messageEl = document.createElement('p');
          messageEl.style.cssText = 
            'margin: 0 0 1.5rem;' +
            'font-size: 1.125rem;' +
            'font-weight: 500;' +
            'color: var(--text);';
          messageEl.textContent = message;
          
          // Create continue button
          const button = document.createElement('button');
          button.style.cssText = 
            'background: var(--primary);' +
            'color: white;' +
            'border: none;' +
            'padding: 0.75rem 2rem;' +
            'border-radius: 6px;' +
            'font-size: 1rem;' +
            'font-weight: 500;' +
            'cursor: pointer;' +
            'transition: all 0.2s ease;';
          button.textContent = 'Continue';
          button.onclick = function() {
            overlay.style.animation = 'fadeOut 0.3s ease-out';
            setTimeout(() => overlay.remove(), 300);
          };
          
          // Add CSS animations
          const style = document.createElement('style');
          style.textContent = 
            '@keyframes fadeIn {' +
              'from { opacity: 0; }' +
              'to { opacity: 1; }' +
            '}' +
            '@keyframes fadeOut {' +
              'from { opacity: 1; }' +
              'to { opacity: 0; }' +
            '}' +
            '@keyframes slideUp {' +
              'from { opacity: 0; transform: translateY(20px) scale(0.95); }' +
              'to { opacity: 1; transform: translateY(0) scale(1); }' +
            '}';
          
          // Assemble and add to page
          popup.appendChild(icon);
          popup.appendChild(messageEl);
          popup.appendChild(button);
          overlay.appendChild(popup);
          document.head.appendChild(style);
          document.body.appendChild(overlay);
          
          // Auto-close after 5 seconds
          setTimeout(() => {
            if (overlay.parentNode) {
              button.click();
            }
          }, 5000);
        }
        
        window.handleLogin = async function(event) {
          event.preventDefault();
          
          const email = document.getElementById('email').value;
          const password = document.getElementById('password').value;
          
          try {
            const response = await fetch('/api/auth/signin', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ email, password }),
            });
            
            const data = await response.json();
            
            if (response.ok) {
              // Store session info and update UI
              localStorage.setItem('session', JSON.stringify(data.session));
              updateAuthButton();
              showSuccessOverlay('Welcome back! You are now signed in.');
              setTimeout(() => navigate('/'), 2000);
            } else {
              window.showMessage(data.error || 'Login failed', true);
            }
          } catch (error) {
            window.showMessage('Network error. Please try again.', true);
          }
        }
        
        window.handleSignup = async function(event) {
          event.preventDefault();
          
          const email = document.getElementById('signupEmail').value;
          const password = document.getElementById('signupPassword').value;
          
          try {
            const response = await fetch('/api/auth/signup', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ email, password }),
            });
            
            const data = await response.json();
            
            if (response.ok) {
              window.showMessage('Account created successfully! You can now sign in.');
              setTimeout(() => window.showLoginForm(), 2000);
            } else {
              window.showMessage(data.error || 'Signup failed', true);
            }
          } catch (error) {
            window.showMessage('Network error. Please try again.', true);
          }
        }

        // Handle browser back/forward
        window.addEventListener('popstate', render);
        
        // Initial render
        render();
        updateActiveNav();
        updateAuthButton();
      </script>
    </body>
    </html>
  `)
})

export default app

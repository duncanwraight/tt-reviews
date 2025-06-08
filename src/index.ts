import { Hono } from 'hono'

const app = new Hono()

// API routes
app.get('/api/health', (c) => {
  return c.json({ status: 'ok', timestamp: new Date().toISOString() })
})

app.get('/api/hello', (c) => {
  return c.json({ message: 'Hello from Hono + Cloudflare Workers!' })
})

// SPA fallback - serve index.html for any unmatched routes
app.get('*', (c) => {
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
        }
        
        @media (max-width: 480px) {
          .grid-2 {
            grid-template-columns: 1fr;
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
            <a href="/about" class="nav-link" onclick="navigate('/about')">About</a>
            <a href="/login" class="login-btn" onclick="navigate('/login')">Login</a>
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
        
        function createRating(rating, count) {
          const stars = '★'.repeat(Math.floor(rating)) + '☆'.repeat(5 - Math.floor(rating));
          return \`
            <div class="rating">
              <span class="star">\${stars}</span>
              <span class="rating-text">(\${count} reviews)</span>
            </div>
          \`;
        }
        
        function render() {
          const path = window.location.pathname;
          const content = document.getElementById('content');
          
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
                      <div class="card">
                        <h3>Butterfly Tenergy 64</h3>
                        \${createRating(4.5, 23)}
                        <p>High-performance forehand rubber with excellent spin generation and speed.</p>
                      </div>
                      <div class="card">
                        <h3>TSP Curl P1-R</h3>
                        \${createRating(4.2, 18)}
                        <p>Classic long pips rubber perfect for defensive play and spin reversal.</p>
                      </div>
                      <div class="card">
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
                      <div class="card">
                        <h3>Joo Saehyuk</h3>
                        <p><strong>Highest Rating:</strong> WR6</p>
                        <p><strong>Style:</strong> Defensive chopper</p>
                        <p><strong>Current Setup:</strong> Butterfly Diode, Tenergy 64 FH</p>
                      </div>
                      <div class="card">
                        <h3>Ma Long</h3>
                        <p><strong>Highest Rating:</strong> WR1</p>
                        <p><strong>Style:</strong> Offensive all-round</p>
                        <p><strong>Current Setup:</strong> Hurricane Long 5, Hurricane 3</p>
                      </div>
                      <div class="card">
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
              
            case '/about':
              content.innerHTML = \`
                <section class="section">
                  <div class="main-container">
                    <div class="section-header">
                      <h1>About TT Reviews</h1>
                      <p>Community-moderated table tennis equipment reviews</p>
                    </div>
                    <div class="card">
                      <h3>Our Mission</h3>
                      <p>We provide trusted equipment reviews through community moderation and transparent reviewer context.</p>
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
                      <p>Authentication system coming soon!</p>
                    </div>
                  </div>
                </section>
              \`;
              break;
              
            default:
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
        
        // Handle browser back/forward
        window.addEventListener('popstate', render);
        
        // Initial render
        render();
        updateActiveNav();
      </script>
    </body>
    </html>
  `)
})

export default app
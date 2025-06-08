import { Hono } from 'hono'

const app = new Hono()

// API routes
app.get('/api/health', c => {
  return c.json({ status: 'ok', timestamp: new Date().toISOString() })
})

app.get('/api/hello', c => {
  return c.json({ message: 'Hello from Hono + Cloudflare Workers!' })
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
          
          // About breadcrumb
          if (segments[0] === 'about') {
            breadcrumbs.push({ label: 'About', path: '/about', current: true });
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
              
            case '/about':
              content.innerHTML = \`
                \${breadcrumbHtml}
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

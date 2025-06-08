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
      <style>
        body { font-family: Arial, sans-serif; margin: 0; padding: 20px; }
        nav { margin-bottom: 20px; }
        nav a { margin-right: 10px; padding: 10px; text-decoration: none; background: #f0f0f0; }
        #content { padding: 20px; border: 1px solid #ccc; }
      </style>
    </head>
    <body>
      <nav>
        <a href="/" onclick="navigate('/')">Home</a>
        <a href="/reviews" onclick="navigate('/reviews')">Reviews</a>
        <a href="/players" onclick="navigate('/players')">Players</a>
        <a href="/about" onclick="navigate('/about')">About</a>
      </nav>
      <div id="content">
        <h1>Loading...</h1>
      </div>
      
      <script>
        // Simple client-side router
        function navigate(path) {
          history.pushState({}, '', path);
          render();
          return false;
        }
        
        function render() {
          const path = window.location.pathname;
          const content = document.getElementById('content');
          
          switch(path) {
            case '/':
              content.innerHTML = '<h1>TT Reviews</h1><p>Welcome to the table tennis equipment review platform!</p>';
              break;
            case '/reviews':
              content.innerHTML = '<h1>Equipment Reviews</h1><p>Browse trusted equipment reviews.</p>';
              break;
            case '/players':
              content.innerHTML = '<h1>Player Profiles</h1><p>Explore professional player equipment setups.</p>';
              break;
            case '/about':
              content.innerHTML = '<h1>About</h1><p>Community-moderated table tennis equipment reviews.</p>';
              break;
            default:
              content.innerHTML = '<h1>404</h1><p>Page not found</p>';
          }
        }
        
        // Handle browser back/forward
        window.addEventListener('popstate', render);
        
        // Initial render
        render();
      </script>
    </body>
    </html>
  `)
})
export default app

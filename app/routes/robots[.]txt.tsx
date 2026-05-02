import type { Route } from "./+types/robots[.]txt";

export async function loader({ request, context }: Route.LoaderArgs) {
  const env = context.cloudflare.env as Cloudflare.Env;
  const baseUrl = env.SITE_URL || "https://tabletennis.reviews";

  const robotsTxt = `User-agent: *
Allow: /

# Sitemaps — point to the index only (TT-139). The legacy
# /sitemap.xml route is kept for back-compat but isn't advertised.
Sitemap: ${baseUrl}/sitemap-index.xml

# Disallow admin and API routes
Disallow: /admin/
Disallow: /api/

# Disallow authentication and authed-only pages
Disallow: /login
Disallow: /logout
Disallow: /reset-password
Disallow: /auth/
Disallow: /profile
Disallow: /submissions/
Disallow: /e2e-

# Allow all other content
Allow: /players/
Allow: /equipment/
Allow: /search

# Crawl delay (optional)
Crawl-delay: 1`;

  return new Response(robotsTxt, {
    headers: {
      "Content-Type": "text/plain",
      "Cache-Control": "public, max-age=86400", // Cache for 24 hours
    },
  });
}

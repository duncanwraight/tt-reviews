import type { Route } from "./+types/robots[.]txt";

export async function loader({ request, context }: Route.LoaderArgs) {
  const env = context.cloudflare.env as Record<string, string>;
  const baseUrl = env.SITE_URL || "https://tabletennis.reviews";

  const robotsTxt = `User-agent: *
Allow: /

# Sitemaps
Sitemap: ${baseUrl}/sitemap.xml
Sitemap: ${baseUrl}/sitemap-index.xml

# Disallow admin and API routes
Disallow: /admin/
Disallow: /api/

# Disallow authentication pages
Disallow: /login
Disallow: /logout

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

import type { Route } from "./+types/sitemap-index[.]xml";
import { sitemapService } from "~/lib/sitemap.server";

export async function loader({ request, context }: Route.LoaderArgs) {
  const now = new Date().toISOString();

  // For now, we have a single sitemap, but this structure allows for multiple sitemaps
  // if the site grows large enough to need splitting (e.g., separate sitemaps for players, equipment)
  const sitemaps = [
    {
      url: `${sitemapService.baseUrl}/sitemap.xml`,
      lastmod: now,
    },
  ];

  // Generate XML sitemap index using the service
  const xml = sitemapService.generateSitemapIndexXml(sitemaps);

  return new Response(xml, {
    headers: {
      "Content-Type": "application/xml",
      "Cache-Control": "public, max-age=86400", // Cache for 24 hours
      "X-Sitemaps-Count": sitemaps.length.toString(),
    },
  });
}

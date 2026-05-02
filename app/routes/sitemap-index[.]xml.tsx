import type { Route } from "./+types/sitemap-index[.]xml";
import { DatabaseService } from "~/lib/database.server";
import { getSitemapService } from "~/lib/sitemap.server";

// Sitemap index (TT-139). Splits the single combined sitemap into
// per-type sitemaps so growth past 50K URLs in any one type doesn't
// require another migration. /sitemap.xml stays as a back-compat
// combined feed for legacy crawlers that may have cached the URL —
// robots.txt now points only here.
export async function loader({ context }: Route.LoaderArgs) {
  const db = new DatabaseService(context);
  const sitemapService = getSitemapService(context);

  // Build the same URL slices as each per-type sitemap so we can pick
  // the max(lastmod) per slice. Cheaper than fetching the per-type
  // sitemap routes ourselves and parsing them.
  const [allPlayers, allEquipment] = await Promise.all([
    db.getPlayersWithoutFilters(),
    db.getAllEquipment(),
  ]);

  const playerUrls = sitemapService.generatePlayerPages(allPlayers);
  const equipmentUrls = sitemapService.generateEquipmentPages(allEquipment);
  const staticUrls = sitemapService.generateStaticPages();

  const sitemaps = [
    {
      url: `${sitemapService.baseUrl}/sitemap-static.xml`,
      lastmod: sitemapService.computeMaxLastmod(staticUrls),
    },
    {
      url: `${sitemapService.baseUrl}/sitemap-equipment.xml`,
      lastmod: sitemapService.computeMaxLastmod(equipmentUrls),
    },
    {
      url: `${sitemapService.baseUrl}/sitemap-players.xml`,
      lastmod: sitemapService.computeMaxLastmod(playerUrls),
    },
  ];

  const xml = sitemapService.generateSitemapIndexXml(sitemaps);

  return new Response(xml, {
    headers: {
      "Content-Type": "application/xml",
      "Cache-Control": "public, max-age=86400",
      "X-Sitemaps-Count": sitemaps.length.toString(),
    },
  });
}

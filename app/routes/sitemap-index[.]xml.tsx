import type { Route } from "./+types/sitemap-index[.]xml";
import { DatabaseService } from "~/lib/database.server";
import {
  getSitemapService,
  fetchSitemapLastmodMaps,
} from "~/lib/sitemap.server";

// Sitemap index (TT-139). Splits the single combined sitemap into
// per-type sitemaps so growth past 50K URLs in any one type doesn't
// require another migration. /sitemap.xml stays as a back-compat
// combined feed for legacy crawlers that may have cached the URL —
// robots.txt now points only here.
//
// TT-155: each per-type entry's lastmod is the max across that
// slice's URL set, including the child-content folds (reviews on
// equipment, setups + active footage on players). Static-pages
// lastmod = sitewide max so the index doesn't lie about freshness.
export async function loader({ context }: Route.LoaderArgs) {
  const db = new DatabaseService(context);
  const sitemapService = getSitemapService(context);

  const [allPlayers, allEquipment, lastmodMaps] = await Promise.all([
    db.getPlayersWithoutFilters(),
    db.getAllEquipment(),
    fetchSitemapLastmodMaps(context),
  ]);
  const { reviewLastmods, activityLastmods } = lastmodMaps;

  const siteWideLastmod = sitemapService.computeSiteWideLastmod(
    allEquipment,
    allPlayers,
    reviewLastmods,
    activityLastmods
  );

  const playerUrls = sitemapService.generatePlayerPages(
    allPlayers,
    activityLastmods
  );
  const equipmentUrls = sitemapService.generateEquipmentPages(
    allEquipment,
    reviewLastmods
  );
  const staticUrls = sitemapService.generateStaticPages(siteWideLastmod);

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

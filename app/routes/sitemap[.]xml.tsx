import type { Route } from "./+types/sitemap[.]xml";
import { getServerClient } from "~/lib/supabase.server";
import { DatabaseService } from "~/lib/database.server";
import {
  getSitemapService,
  fetchSitemapLastmodMaps,
} from "~/lib/sitemap.server";
import { Logger, createLogContext } from "~/lib/logger.server";

// Legacy combined sitemap. robots.txt advertises only the index
// (sitemap-index.xml); this route is kept for back-compat in case
// any external crawler cached the URL pre-TT-139. New URLs must also
// be added to the appropriate per-type sitemap (sitemap-equipment /
// sitemap-players / sitemap-static), which is what the index points
// crawlers at. TT-155 mirrors the per-type lastmod logic here so the
// legacy feed isn't trained-out by stale-now timestamps.
export async function loader({ request, context }: Route.LoaderArgs) {
  const sbServerClient = getServerClient(request, context);
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

  const staticPages = sitemapService.generateStaticPages(siteWideLastmod);
  const playerPages = sitemapService.generatePlayerPages(
    allPlayers,
    activityLastmods
  );
  const equipmentPages = sitemapService.generateEquipmentPages(
    allEquipment,
    reviewLastmods
  );
  const categoryPages = sitemapService.generateCategoryPages(allEquipment);
  const subcategoryPages =
    sitemapService.generateSubcategoryPages(allEquipment);
  const manufacturerPages =
    sitemapService.generateManufacturerPages(allEquipment);
  const comparisonPages = sitemapService.generatePopularComparisonPages(
    allEquipment,
    reviewLastmods
  );

  const allPages = [
    ...staticPages,
    ...playerPages,
    ...equipmentPages,
    ...categoryPages,
    ...subcategoryPages,
    ...manufacturerPages,
    ...comparisonPages,
  ];

  const xml = sitemapService.generateSitemapXml(allPages);

  const logContext = createLogContext(
    request.headers.get("X-Request-ID") || "sitemap-generation",
    { route: "/sitemap.xml", method: "GET" }
  );
  Logger.info(`Generated sitemap with ${allPages.length} URLs`, logContext);

  return new Response(xml, {
    headers: {
      "Content-Type": "application/xml",
      "Cache-Control": "public, max-age=3600",
      "X-Sitemap-URLs": allPages.length.toString(),
      ...sbServerClient.headers,
    },
  });
}

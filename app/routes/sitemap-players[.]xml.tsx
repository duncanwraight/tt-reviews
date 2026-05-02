import type { Route } from "./+types/sitemap-players[.]xml";
import { DatabaseService } from "~/lib/database.server";
import { getSitemapService } from "~/lib/sitemap.server";

// Per-type sitemap (TT-139): one URL per active player. Inactive
// players are filtered by SitemapService.generatePlayerPages.
export async function loader({ context }: Route.LoaderArgs) {
  const db = new DatabaseService(context);
  const sitemapService = getSitemapService(context);

  const players = await db.getPlayersWithoutFilters();
  const urls = sitemapService.generatePlayerPages(players);
  const xml = sitemapService.generateSitemapXml(urls);

  return new Response(xml, {
    headers: {
      "Content-Type": "application/xml",
      "Cache-Control": "public, max-age=3600",
      "X-Sitemap-URLs": urls.length.toString(),
    },
  });
}

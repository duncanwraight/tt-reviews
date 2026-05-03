import type { Route } from "./+types/sitemap-players[.]xml";
import { DatabaseService } from "~/lib/database.server";
import {
  getSitemapService,
  fetchSitemapLastmodMaps,
} from "~/lib/sitemap.server";

// Per-type sitemap (TT-139): one URL per active player. Inactive
// players are filtered by SitemapService.generatePlayerPages.
//
// TT-155: lastmod for each entry combines the parent player row with
// the latest of (approved equipment-setup change, latest active
// footage) — a new video or setup correctly bumps the page's lastmod
// even though the player row didn't change.
export async function loader({ context }: Route.LoaderArgs) {
  const db = new DatabaseService(context);
  const sitemapService = getSitemapService(context);

  const [players, lastmodMaps] = await Promise.all([
    db.getPlayersWithoutFilters(),
    fetchSitemapLastmodMaps(context),
  ]);

  const urls = sitemapService.generatePlayerPages(
    players,
    lastmodMaps.activityLastmods
  );
  const xml = sitemapService.generateSitemapXml(urls);

  return new Response(xml, {
    headers: {
      "Content-Type": "application/xml",
      "Cache-Control": "public, max-age=3600",
      "X-Sitemap-URLs": urls.length.toString(),
    },
  });
}

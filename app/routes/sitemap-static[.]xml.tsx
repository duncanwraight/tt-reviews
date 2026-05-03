import type { Route } from "./+types/sitemap-static[.]xml";
import { DatabaseService } from "~/lib/database.server";
import {
  getSitemapService,
  fetchSitemapLastmodMaps,
} from "~/lib/sitemap.server";

// Per-type sitemap (TT-139): static landing pages — home, listings,
// /credits. Detail content lives in sitemap-equipment.xml /
// sitemap-players.xml. Cache 1h to match the legacy combined sitemap.
//
// /, /equipment, /players use a sitewide max-lastmod so they advance
// when anything material on the site changes (TT-155). /credits is
// hand-edited copy with a hardcoded constant — Google's lastmod trust
// is binary, so a perpetually-now timestamp would teach Google to
// ignore lastmod from this site entirely.
export async function loader({ context }: Route.LoaderArgs) {
  const db = new DatabaseService(context);
  const sitemapService = getSitemapService(context);

  const [allEquipment, allPlayers, lastmodMaps] = await Promise.all([
    db.getAllEquipment(),
    db.getPlayersWithoutFilters(),
    fetchSitemapLastmodMaps(context),
  ]);

  const siteWideLastmod = sitemapService.computeSiteWideLastmod(
    allEquipment,
    allPlayers,
    lastmodMaps.reviewLastmods,
    lastmodMaps.activityLastmods
  );

  const urls = sitemapService.generateStaticPages(siteWideLastmod);
  const xml = sitemapService.generateSitemapXml(urls);

  return new Response(xml, {
    headers: {
      "Content-Type": "application/xml",
      "Cache-Control": "public, max-age=3600",
      "X-Sitemap-URLs": urls.length.toString(),
    },
  });
}

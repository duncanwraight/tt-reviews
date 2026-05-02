import type { Route } from "./+types/sitemap-static[.]xml";
import { getSitemapService } from "~/lib/sitemap.server";

// Per-type sitemap (TT-139): static landing pages — home, listings,
// /credits, /search. Detail content lives in sitemap-equipment.xml /
// sitemap-players.xml. Cache 1h to match the legacy combined sitemap.
export async function loader({ context }: Route.LoaderArgs) {
  const sitemapService = getSitemapService(context);
  const urls = sitemapService.generateStaticPages();
  const xml = sitemapService.generateSitemapXml(urls);

  return new Response(xml, {
    headers: {
      "Content-Type": "application/xml",
      "Cache-Control": "public, max-age=3600",
      "X-Sitemap-URLs": urls.length.toString(),
    },
  });
}

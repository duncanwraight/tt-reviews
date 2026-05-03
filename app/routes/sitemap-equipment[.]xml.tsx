import type { Route } from "./+types/sitemap-equipment[.]xml";
import { DatabaseService } from "~/lib/database.server";
import {
  getSitemapService,
  fetchSitemapLastmodMaps,
} from "~/lib/sitemap.server";

// Per-type sitemap (TT-139): equipment detail pages plus the
// category / subcategory / manufacturer listing variants and the
// curated comparison pages.
//
// TT-155: lastmod for each entry combines the parent equipment row
// with the latest approved review for that equipment, so a fresh
// review correctly bumps the page's lastmod even though equipment
// row didn't change. Listing/manufacturer/comparison pages aggregate
// max(updated_at) across the slice — see SitemapService.
export async function loader({ context }: Route.LoaderArgs) {
  const db = new DatabaseService(context);
  const sitemapService = getSitemapService(context);

  const [allEquipment, lastmodMaps] = await Promise.all([
    db.getAllEquipment(),
    fetchSitemapLastmodMaps(context),
  ]);
  const { reviewLastmods } = lastmodMaps;

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

  const urls = [
    ...equipmentPages,
    ...categoryPages,
    ...subcategoryPages,
    ...manufacturerPages,
    ...comparisonPages,
  ];
  const xml = sitemapService.generateSitemapXml(urls);

  return new Response(xml, {
    headers: {
      "Content-Type": "application/xml",
      "Cache-Control": "public, max-age=3600",
      "X-Sitemap-URLs": urls.length.toString(),
    },
  });
}

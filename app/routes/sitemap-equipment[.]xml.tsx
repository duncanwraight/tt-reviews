import type { Route } from "./+types/sitemap-equipment[.]xml";
import { DatabaseService } from "~/lib/database.server";
import { getSitemapService } from "~/lib/sitemap.server";

// Per-type sitemap (TT-139): equipment detail pages plus the
// category / subcategory / manufacturer listing variants and the
// curated comparison pages. Mirrors the slices the combined sitemap
// already emits — just sliced out so the index can hand each off
// independently when the catalog grows.
export async function loader({ context }: Route.LoaderArgs) {
  const db = new DatabaseService(context);
  const sitemapService = getSitemapService(context);

  const allEquipment = await db.getAllEquipment();

  const equipmentPages = sitemapService.generateEquipmentPages(allEquipment);

  const equipmentCategories = [...new Set(allEquipment.map(e => e.category))];
  const categoryPages =
    sitemapService.generateCategoryPages(equipmentCategories);

  const categorySubcategories = allEquipment
    .filter(e => e.subcategory)
    .map(e => ({ category: e.category, subcategory: e.subcategory! }))
    .filter(
      (item, index, arr) =>
        arr.findIndex(
          other =>
            other.category === item.category &&
            other.subcategory === item.subcategory
        ) === index
    );
  const subcategoryPages = sitemapService.generateSubcategoryPages(
    categorySubcategories
  );

  const equipmentManufacturers = [
    ...new Set(allEquipment.map(e => e.manufacturer)),
  ];
  const manufacturerPages = sitemapService.generateManufacturerPages(
    equipmentManufacturers
  );

  const comparisonPages =
    sitemapService.generatePopularComparisonPages(allEquipment);

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

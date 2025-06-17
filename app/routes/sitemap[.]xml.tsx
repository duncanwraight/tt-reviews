import type { Route } from "./+types/sitemap[.]xml";
import { getServerClient } from "~/lib/supabase.server";
import { DatabaseService } from "~/lib/database.server";
import { sitemapService } from "~/lib/sitemap.server";

export async function loader({ request, context }: Route.LoaderArgs) {
  const sbServerClient = getServerClient(request, context);
  const db = new DatabaseService(context);

  // Get all content for sitemap
  const [allPlayers, allEquipment] = await Promise.all([
    db.getPlayersWithoutFilters(),
    db.getAllEquipment(),
  ]);

  // Generate sitemap entries using the service
  const staticPages = sitemapService.generateStaticPages();
  const playerPages = sitemapService.generatePlayerPages(allPlayers);
  const equipmentPages = sitemapService.generateEquipmentPages(allEquipment);

  // Get unique equipment categories for category pages
  const equipmentCategories = [...new Set(allEquipment.map(e => e.category))];
  const categoryPages =
    sitemapService.generateCategoryPages(equipmentCategories);

  // Get unique category-subcategory combinations for subcategory pages
  const categorySubcategories = allEquipment
    .filter(e => e.subcategory) // Only equipment with subcategories
    .map(e => ({ category: e.category, subcategory: e.subcategory! }))
    .filter(
      (item, index, arr) =>
        // Remove duplicates by comparing stringified objects
        arr.findIndex(
          other =>
            other.category === item.category &&
            other.subcategory === item.subcategory
        ) === index
    );

  const subcategoryPages = sitemapService.generateSubcategoryPages(
    categorySubcategories
  );

  // Get unique manufacturers for manufacturer pages
  const equipmentManufacturers = [
    ...new Set(allEquipment.map(e => e.manufacturer)),
  ];
  const manufacturerPages = sitemapService.generateManufacturerPages(
    equipmentManufacturers
  );

  // Generate popular comparison pages for SEO
  const comparisonPages =
    sitemapService.generatePopularComparisonPages(allEquipment);

  // Combine all pages
  const allPages = [
    ...staticPages,
    ...playerPages,
    ...equipmentPages,
    ...categoryPages,
    ...subcategoryPages,
    ...manufacturerPages,
    ...comparisonPages,
  ];

  // Generate XML sitemap
  const xml = sitemapService.generateSitemapXml(allPages);

  // Log sitemap statistics for monitoring
  const stats = sitemapService.generateSitemapStats(allPages);
  console.log(`Generated sitemap with ${stats.totalUrls} URLs`, {
    priorities: stats.priorities,
    changeFrequencies: stats.changeFrequencies,
  });

  return new Response(xml, {
    headers: {
      "Content-Type": "application/xml",
      "Cache-Control": "public, max-age=3600", // Cache for 1 hour
      "X-Sitemap-URLs": stats.totalUrls.toString(),
      "X-Sitemap-Generated": stats.lastModified,
      ...sbServerClient.headers,
    },
  });
}

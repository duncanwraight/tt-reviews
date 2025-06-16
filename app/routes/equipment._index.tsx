import type { Route } from "./+types/equipment._index";
import { getServerClient } from "~/lib/supabase.server";
import { DatabaseService } from "~/lib/database.server";
import { schemaService } from "~/lib/schema.server";
import { data } from "react-router";
import { Link } from "react-router";

import { Breadcrumb } from "~/components/ui/Breadcrumb";
import { ComparisonCard } from "~/components/equipment/ComparisonCard";
import { SafeHtml } from "~/lib/sanitize";
import { PageSection } from "~/components/layout/PageSection";

interface EquipmentDisplay {
  id: string;
  name: string;
  slug: string;
  category: string;
  manufacturer: string;
  rating?: number;
  reviewCount?: number;
}

interface CategoryInfo {
  category: string;
  count: number;
}

export function meta({ data }: Route.MetaArgs) {
  const currentYear = new Date().getFullYear();
  
  // Enhanced SEO title pattern based on research
  const title = `Best Table Tennis Equipment ${currentYear} - Professional Reviews & Comparisons | TT Reviews`;
  
  // Enhanced meta description with current year and value proposition
  const description = `Discover the best table tennis equipment through hundreds of professional reviews. Compare blades, rubbers, and balls used by pros. Updated ${currentYear}.`;
  
  // Enhanced keywords targeting high-volume search terms from research
  const keywords = [
    'best table tennis equipment',
    `table tennis equipment ${currentYear}`,
    'butterfly tenergy',
    'dhs hurricane',
    'table tennis blade reviews',
    'table tennis rubber reviews',
    'professional table tennis equipment',
    'equipment comparison',
    'ping pong gear',
    'tournament equipment'
  ].join(', ');

  return [
    { title },
    { name: "description", content: description },
    { name: "keywords", content: keywords },
    { property: "og:title", content: title },
    { property: "og:description", content: description },
    { property: "og:type", content: "website" },
    // Additional SEO meta tags
    { name: "robots", content: "index, follow" },
    { name: "author", content: "TT Reviews" },
    { property: "og:site_name", content: "TT Reviews" },
    // Category page specific tags
    { name: "category", content: "Table Tennis Equipment" },
    { property: "article:section", content: "Equipment Reviews" },
    // Structured data from loader
    ...(data?.schemaJsonLd ? [{ "script:ld+json": data.schemaJsonLd }] : []),
  ];
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const sbServerClient = getServerClient(request, context);
  const userResponse = await sbServerClient.client.auth.getUser();

  const url = new URL(request.url);
  const category = url.searchParams.get("category");
  const subcategory = url.searchParams.get("subcategory");
  const sortBy =
    (url.searchParams.get("sort") as "name" | "created_at" | "manufacturer" | "rating") ||
    "created_at";
  const sortOrder = (url.searchParams.get("order") as "asc" | "desc") || "desc";

  const db = new DatabaseService(context);

  const promises = [
    db.getAllEquipmentWithStats({
      category: category || undefined,
      subcategory: subcategory || undefined,
      sortBy,
      sortOrder,
      limit: 24,
    }),
    db.getRecentReviews(6),
    db.getEquipmentCategories(),
  ];

  // Add subcategories if a category is selected
  if (category) {
    promises.push(db.getEquipmentSubcategories(category));
  }

  const results = await Promise.all(promises);
  const [allEquipment, recentReviews, categories] = results;
  const subcategories = category ? results[3] as { subcategory: string; count: number }[] : [];

  const equipmentDisplay: EquipmentDisplay[] = allEquipment.map(
    (equipment) => ({
      ...equipment,
      rating: equipment.averageRating || undefined,
      reviewCount: equipment.reviewCount || 0,
    })
  );

  // Generate breadcrumb schema
  const breadcrumbSchema = schemaService.generateBreadcrumbSchema([
    { label: "Home", href: "/" },
    { label: "Equipment", href: "/equipment" }
  ]);
  const schemaJsonLd = schemaService.toJsonLd(breadcrumbSchema);

  return data(
    {
      user: userResponse?.data?.user || null,
      equipment: equipmentDisplay,
      recentReviews,
      categories,
      subcategories,
      currentCategory: category,
      currentSubcategory: subcategory,
      currentSort: sortBy,
      currentOrder: sortOrder,
      schemaJsonLd,
    },
    { headers: sbServerClient.headers }
  );
}

export default function Equipment({ loaderData }: Route.ComponentProps) {
  const {
    user,
    equipment,
    recentReviews,
    categories,
    subcategories,
    currentCategory,
    currentSubcategory,
    currentSort,
    currentOrder,
  } = loaderData;

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case "blade":
        return "🏓";
      case "rubber":
        return "⚫";
      case "ball":
        return "🟠";
      default:
        return "📋";
    }
  };

  const getCategoryName = (category: string) => {
    switch (category) {
      case "blade":
        return "Blades";
      case "rubber":
        return "Rubbers";
      case "ball":
        return "Balls";
      default:
        return category.charAt(0).toUpperCase() + category.slice(1);
    }
  };

  const getSubcategoryName = (subcategory: string) => {
    switch (subcategory) {
      case "inverted":
        return "Inverted";
      case "long_pips":
        return "Long Pips";
      case "anti":
        return "Anti-Spin";
      case "short_pips":
        return "Short Pips";
      default:
        return subcategory.charAt(0).toUpperCase() + subcategory.slice(1);
    }
  };

  const getSubcategoryIcon = (subcategory: string) => {
    switch (subcategory) {
      case "inverted":
        return "🔴";
      case "long_pips":
        return "📍";
      case "anti":
        return "⚪";
      case "short_pips":
        return "🔵";
      default:
        return "⚫";
    }
  };

  const breadcrumbItems = [
    { label: "Home", href: "/" },
    { label: "Equipment", href: "/equipment" },
    ...(currentCategory ? [{ label: getCategoryName(currentCategory), href: `/equipment?category=${currentCategory}` }] : []),
    ...(currentSubcategory ? [{ label: getSubcategoryName(currentSubcategory), href: `/equipment?category=${currentCategory}&subcategory=${currentSubcategory}` }] : []),
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <Breadcrumb items={breadcrumbItems} />

      <PageSection>
        {!user && (
          <div className="mb-8 bg-gradient-to-r from-purple-600 to-purple-800 text-white p-6 rounded-lg shadow-lg">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-xl font-semibold mb-2">Help Expand Our Equipment Database</h3>
                <p className="text-purple-100">
                  Create an account or log in to submit new equipment and contribute to our growing community.
                </p>
              </div>
              <a
                href="/login"
                className="bg-white text-purple-600 hover:bg-purple-50 px-6 py-3 rounded-lg font-semibold transition-all duration-200 hover:scale-105 shadow-lg whitespace-nowrap"
              >
                Get Started
              </a>
            </div>
          </div>
        )}
          
          <div className="flex justify-between items-end mb-8">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 mb-4">
                {currentSubcategory
                  ? `${getSubcategoryName(currentSubcategory)} Reviews`
                  : currentCategory
                  ? `${getCategoryName(currentCategory)} Reviews`
                  : "Equipment Reviews"}
              </h1>
              <p className="text-lg text-gray-600 max-w-3xl">
                {currentSubcategory
                  ? `Discover the best ${getSubcategoryName(
                      currentSubcategory
                    ).toLowerCase()} for your playing style`
                  : currentCategory
                  ? `Discover the best ${getCategoryName(
                      currentCategory
                    ).toLowerCase()} for your playing style`
                  : "Comprehensive reviews of professional table tennis equipment"}
              </p>
              {equipment.length > 0 && (
                <p className="text-sm text-gray-500 mt-2">
                  {equipment.length} item{equipment.length !== 1 ? "s" : ""} {currentSubcategory
                    ? getSubcategoryName(currentSubcategory).toLowerCase()
                    : currentCategory
                    ? getCategoryName(currentCategory).toLowerCase()
                    : "in our database"}
                </p>
              )}
            </div>
            {user && (
              <div className="flex space-x-3">
                <a
                  href="/equipment/submit"
                  className="px-6 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-purple-500 font-semibold transition-all duration-200 hover:scale-105 shadow-lg"
                >
                  Submit Equipment
                </a>
              </div>
            )}
          </div>

          <div className="flex flex-col lg:flex-row gap-8">
            <aside className="lg:w-64 flex-shrink-0">
              <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">
                  Categories
                </h3>
                <div className="space-y-2">
                  <Link
                    to="/equipment"
                    className={`flex items-center justify-between p-3 rounded-lg transition-colors ${
                      !currentCategory
                        ? "bg-purple-100 text-purple-800 font-medium"
                        : "text-gray-700 hover:bg-gray-100"
                    }`}
                  >
                    <span className="flex items-center">
                      <span className="mr-3">📋</span>
                      All Equipment
                    </span>
                    <span className="text-sm bg-gray-200 text-gray-600 px-2 py-1 rounded-full">
                      {categories.reduce((sum, cat) => sum + cat.count, 0)}
                    </span>
                  </Link>
                  {categories.map((cat) => (
                    <Link
                      key={cat.category}
                      to={`/equipment?category=${cat.category}`}
                      className={`flex items-center justify-between p-3 rounded-lg transition-colors ${
                        currentCategory === cat.category && !currentSubcategory
                          ? "bg-purple-100 text-purple-800 font-medium"
                          : "text-gray-700 hover:bg-gray-100"
                      }`}
                    >
                      <span className="flex items-center">
                        <span className="mr-3">
                          {getCategoryIcon(cat.category)}
                        </span>
                        {getCategoryName(cat.category)}
                      </span>
                      <span className="text-sm bg-gray-200 text-gray-600 px-2 py-1 rounded-full">
                        {cat.count}
                      </span>
                    </Link>
                  ))}
                </div>
              </div>

              {/* Subcategories */}
              {currentCategory && subcategories.length > 0 && (
                <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">
                    {getCategoryName(currentCategory)} Types
                  </h3>
                  <div className="space-y-2">
                    <Link
                      to={`/equipment?category=${currentCategory}`}
                      className={`flex items-center justify-between p-3 rounded-lg transition-colors ${
                        currentCategory && !currentSubcategory
                          ? "bg-purple-100 text-purple-800 font-medium"
                          : "text-gray-700 hover:bg-gray-100"
                      }`}
                    >
                      <span className="flex items-center">
                        <span className="mr-3">
                          {getCategoryIcon(currentCategory)}
                        </span>
                        All {getCategoryName(currentCategory)}
                      </span>
                      <span className="text-sm bg-gray-200 text-gray-600 px-2 py-1 rounded-full">
                        {categories.find(c => c.category === currentCategory)?.count || 0}
                      </span>
                    </Link>
                    {subcategories.map((subcat) => (
                      <Link
                        key={subcat.subcategory}
                        to={`/equipment?category=${currentCategory}&subcategory=${subcat.subcategory}`}
                        className={`flex items-center justify-between p-3 rounded-lg transition-colors ${
                          currentSubcategory === subcat.subcategory
                            ? "bg-purple-100 text-purple-800 font-medium"
                            : "text-gray-700 hover:bg-gray-100"
                        }`}
                      >
                        <span className="flex items-center">
                          <span className="mr-3">
                            {getSubcategoryIcon(subcat.subcategory)}
                          </span>
                          {getSubcategoryName(subcat.subcategory)}
                        </span>
                        <span className="text-sm bg-gray-200 text-gray-600 px-2 py-1 rounded-full">
                          {subcat.count}
                        </span>
                      </Link>
                    ))}
                  </div>
                </div>
              )}

              <div className="bg-white rounded-lg border border-gray-200 p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">
                  Sort By
                </h3>
                <div className="space-y-2">
                  <Link
                    to={`/equipment?${new URLSearchParams({
                      ...(currentCategory && { category: currentCategory }),
                      ...(currentSubcategory && { subcategory: currentSubcategory }),
                      sort: "created_at",
                      order: "desc"
                    }).toString()}`}
                    className={`block p-3 rounded-lg transition-colors ${
                      currentSort === "created_at" && currentOrder === "desc"
                        ? "bg-purple-100 text-purple-800 font-medium"
                        : "text-gray-700 hover:bg-gray-100"
                    }`}
                  >
                    Newest First
                  </Link>
                  <Link
                    to={`/equipment?${new URLSearchParams({
                      ...(currentCategory && { category: currentCategory }),
                      ...(currentSubcategory && { subcategory: currentSubcategory }),
                      sort: "name",
                      order: "asc"
                    }).toString()}`}
                    className={`block p-3 rounded-lg transition-colors ${
                      currentSort === "name" && currentOrder === "asc"
                        ? "bg-purple-100 text-purple-800 font-medium"
                        : "text-gray-700 hover:bg-gray-100"
                    }`}
                  >
                    Name A-Z
                  </Link>
                  <Link
                    to={`/equipment?${new URLSearchParams({
                      ...(currentCategory && { category: currentCategory }),
                      ...(currentSubcategory && { subcategory: currentSubcategory }),
                      sort: "manufacturer",
                      order: "asc"
                    }).toString()}`}
                    className={`block p-3 rounded-lg transition-colors ${
                      currentSort === "manufacturer" && currentOrder === "asc"
                        ? "bg-purple-100 text-purple-800 font-medium"
                        : "text-gray-700 hover:bg-gray-100"
                    }`}
                  >
                    Manufacturer
                  </Link>
                </div>
              </div>

            </aside>

            <div className="flex-1">
              {equipment.length > 0 ? (
                <>
                  <div className="mb-6 flex items-center justify-between">
                    <p className="text-gray-600">
                      Showing {equipment.length}{" "}
                      {currentSubcategory
                        ? getSubcategoryName(currentSubcategory).toLowerCase()
                        : currentCategory
                        ? getCategoryName(currentCategory).toLowerCase()
                        : "items"}
                    </p>
                  </div>

                  <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 pb-20">
                    {equipment.map((item) => (
                      <ComparisonCard key={item.id} equipment={item} />
                    ))}
                  </div>
                </>
              ) : (
                <div className="text-center py-12">
                  <div className="text-6xl mb-4">🔍</div>
                  <h3 className="text-xl font-semibold text-gray-900 mb-2">
                    No equipment found
                  </h3>
                  <p className="text-gray-600 mb-6">
                    {currentSubcategory
                      ? `No ${getSubcategoryName(
                          currentSubcategory
                        ).toLowerCase()} available yet.`
                      : currentCategory
                      ? `No ${getCategoryName(
                          currentCategory
                        ).toLowerCase()} available yet.`
                      : "No equipment available yet."}
                  </p>
                  <Link
                    to="/equipment"
                    className="inline-flex items-center px-4 py-2 border border-purple-600 text-purple-600 font-semibold rounded-lg hover:bg-purple-600 hover:text-white transition-colors"
                  >
                    View All Equipment
                  </Link>
                </div>
              )}
            </div>
          </div>
      </PageSection>

      {recentReviews.length > 0 && (
        <section className="py-16 bg-gray-100 -mx-4 sm:-mx-6 lg:-mx-8">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-12">
              <h2 className="text-3xl font-bold text-gray-900 mb-4">
                Recent Reviews
              </h2>
              <p className="text-lg text-gray-600">
                Latest equipment reviews from our community
              </p>
            </div>

            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
              {recentReviews.map((review) => (
                <div
                  key={review.id}
                  className="bg-white rounded-xl shadow-md p-6 border border-gray-100"
                >
                  <div className="flex items-center mb-4">
                    <div className="flex items-center text-yellow-400 mr-3">
                      <span className="text-sm mr-1">★</span>
                      <span className="text-sm font-medium text-gray-700">
                        {review.overall_rating}/5
                      </span>
                    </div>
                    <span className="inline-block px-2 py-1 text-xs font-semibold text-purple-800 bg-purple-100 rounded-full capitalize">
                      {review.equipment?.category}
                    </span>
                  </div>
                  <Link
                    to={`/equipment/${review.equipment?.slug}`}
                    className="block mb-3"
                  >
                    <h3 className="text-lg font-bold text-gray-900 hover:text-purple-600 transition-colors">
                      {review.equipment?.name}
                    </h3>
                    <p className="text-gray-600 text-sm">
                      {review.equipment?.manufacturer}
                    </p>
                  </Link>
                  {review.review_text && (
                    <SafeHtml 
                      content={review.review_text}
                      profile="review"
                      className="text-gray-700 text-sm line-clamp-3"
                    />
                  )}
                </div>
              ))}
            </div>
          </div>
        </section>
      )}
    </div>
  );
}

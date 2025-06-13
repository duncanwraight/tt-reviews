import type { Route } from "./+types/equipment._index";
import { getServerClient } from "~/lib/supabase.server";
import { DatabaseService } from "~/lib/database.server";
import { data } from "react-router";
import { Link } from "react-router";

import { EquipmentCard } from "~/components/ui/EquipmentCard";

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

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Table Tennis Equipment Reviews | TT Reviews" },
    {
      name: "description",
      content:
        "Browse comprehensive reviews of table tennis equipment including blades, rubbers, and balls. Find the perfect gear for your playing style.",
    },
    {
      name: "keywords",
      content:
        "table tennis equipment, ping pong gear, blade reviews, rubber reviews, ball reviews, tournament equipment",
    },
    {
      property: "og:title",
      content: "Table Tennis Equipment Reviews | TT Reviews",
    },
    {
      property: "og:description",
      content:
        "Browse comprehensive reviews of table tennis equipment including blades, rubbers, and balls.",
    },
    { property: "og:type", content: "website" },
  ];
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const sbServerClient = getServerClient(request, context);
  const userResponse = await sbServerClient.client.auth.getUser();

  const url = new URL(request.url);
  const category = url.searchParams.get("category");
  const sortBy =
    (url.searchParams.get("sort") as "name" | "created_at" | "manufacturer") ||
    "created_at";
  const sortOrder = (url.searchParams.get("order") as "asc" | "desc") || "desc";

  const db = new DatabaseService(context);

  const [allEquipment, recentReviews, categories] = await Promise.all([
    db.getAllEquipment({
      category: category || undefined,
      sortBy,
      sortOrder,
      limit: 24,
    }),
    db.getRecentReviews(6),
    db.getEquipmentCategories(),
  ]);

  const equipmentDisplay: EquipmentDisplay[] = allEquipment.map(
    (equipment) => ({
      ...equipment,
      rating: 4.2,
      reviewCount: Math.floor(Math.random() * 20) + 1,
    })
  );

  return data(
    {
      user: userResponse?.data?.user || null,
      equipment: equipmentDisplay,
      recentReviews,
      categories,
      currentCategory: category,
      currentSort: sortBy,
      currentOrder: sortOrder,
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
    currentCategory,
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

  return (
    <main>
      <section className="bg-white py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-8">
            <h1 className="text-4xl font-bold text-gray-900 mb-4">
              {currentCategory
                ? `${getCategoryName(currentCategory)} Reviews`
                : "Equipment Reviews"}
            </h1>
            <p className="text-lg text-gray-600">
              {currentCategory
                ? `Discover the best ${getCategoryName(
                    currentCategory
                  ).toLowerCase()} for your playing style`
                : "Comprehensive reviews of professional table tennis equipment"}
            </p>
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
                        currentCategory === cat.category
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

              <div className="bg-white rounded-lg border border-gray-200 p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">
                  Sort By
                </h3>
                <div className="space-y-2">
                  <Link
                    to={`/equipment${
                      currentCategory ? `?category=${currentCategory}` : ""
                    }${currentCategory ? "&" : "?"}sort=created_at&order=desc`}
                    className={`block p-3 rounded-lg transition-colors ${
                      currentSort === "created_at" && currentOrder === "desc"
                        ? "bg-purple-100 text-purple-800 font-medium"
                        : "text-gray-700 hover:bg-gray-100"
                    }`}
                  >
                    Newest First
                  </Link>
                  <Link
                    to={`/equipment${
                      currentCategory ? `?category=${currentCategory}` : ""
                    }${currentCategory ? "&" : "?"}sort=name&order=asc`}
                    className={`block p-3 rounded-lg transition-colors ${
                      currentSort === "name" && currentOrder === "asc"
                        ? "bg-purple-100 text-purple-800 font-medium"
                        : "text-gray-700 hover:bg-gray-100"
                    }`}
                  >
                    Name A-Z
                  </Link>
                  <Link
                    to={`/equipment${
                      currentCategory ? `?category=${currentCategory}` : ""
                    }${currentCategory ? "&" : "?"}sort=manufacturer&order=asc`}
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
                      {currentCategory
                        ? getCategoryName(currentCategory).toLowerCase()
                        : "items"}
                    </p>
                  </div>

                  <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {equipment.map((item) => (
                      <EquipmentCard key={item.id} equipment={item} />
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
                    {currentCategory
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
        </div>
      </section>

      {recentReviews.length > 0 && (
        <section className="py-16 bg-gray-100">
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
                    <p className="text-gray-700 text-sm line-clamp-3">
                      {review.review_text}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        </section>
      )}
    </main>
  );
}

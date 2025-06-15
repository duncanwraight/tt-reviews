import type { Route } from "./+types/players._index";
import { data } from "react-router";
import { DatabaseService } from "~/lib/database.server";
import { getServerClient } from "~/lib/supabase.server";
import { schemaService } from "~/lib/schema.server";
import { PageSection } from "~/components/layout/PageSection";
import { Breadcrumb } from "~/components/ui/Breadcrumb";
import { PlayersHeader } from "~/components/players/PlayersHeader";
import { PlayersGrid } from "~/components/players/PlayersGrid";
import { PlayersPagination } from "~/components/players/PlayersPagination";
import { createCategoryService } from "~/lib/categories.server";

export function meta({ data }: Route.MetaArgs) {
  const currentYear = new Date().getFullYear();
  
  // Enhanced SEO title pattern based on research
  const title = `Professional Table Tennis Players Database ${currentYear} | Equipment & Rankings | TT Reviews`;
  
  // Enhanced meta description with player count and value proposition
  const description = `Explore ${data?.totalPlayers || 'hundreds of'} professional table tennis players. Discover equipment setups, playing styles, and career achievements. Updated ${currentYear}.`;
  
  // Enhanced keywords targeting player searches from research
  const keywords = [
    'professional table tennis players',
    'table tennis player database',
    'ma long equipment',
    'fan zhendong blade',
    'table tennis player rankings',
    'professional player setups',
    'table tennis equipment used by pros',
    `table tennis players ${currentYear}`,
    'ping pong professionals',
    'tournament players'
  ].join(', ');

  // Generate breadcrumb schema
  const breadcrumbSchema = schemaService.generateBreadcrumbSchema([
    { label: "Home", href: "/" },
    { label: "Players", href: "/players" }
  ]);

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
    { name: "category", content: "Table Tennis Players" },
    { property: "article:section", content: "Player Database" },
    // Structured data
    {
      "script:ld+json": schemaService.toJsonLd(breadcrumbSchema)
    },
  ];
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const country = url.searchParams.get("country") || undefined;
  const playingStyle = url.searchParams.get("style") || undefined;
  const gender = url.searchParams.get("gender") || undefined;
  const activeOnly = url.searchParams.get("active") === "true" ? true : url.searchParams.get("active") === "false" ? false : undefined;
  const sortBy = (url.searchParams.get("sort") as "name" | "created_at" | "highest_rating") || "created_at";
  const sortOrder = (url.searchParams.get("order") as "asc" | "desc") || "desc";
  const page = parseInt(url.searchParams.get("page") || "1", 10);
  const limit = 12; // Players per page
  const offset = (page - 1) * limit;

  const db = new DatabaseService(context);
  const categoryService = createCategoryService(db.supabase);
  
  const [players, totalCount, countries, playingStyles] = await Promise.all([
    db.getAllPlayers({
      country,
      playingStyle,
      gender,
      active: activeOnly,
      sortBy,
      sortOrder,
      limit,
      offset,
    }),
    db.getPlayersCount({
      country,
      playingStyle,
      gender,
      active: activeOnly,
    }),
    db.getPlayerCountries(),
    categoryService.getPlayingStyles(),
  ]);

  const totalPages = Math.ceil(totalCount / limit);

  // Check if user is logged in
  const sbServerClient = getServerClient(request, context);
  const userResponse = await sbServerClient.client.auth.getUser();
  const user = userResponse.data.user;

  return data({
    players,
    user,
    countries,
    playingStyles,
    pagination: {
      currentPage: page,
      totalPages,
      totalCount,
      limit,
    },
    filters: {
      country,
      playingStyle,
      gender,
      activeOnly,
      sortBy,
      sortOrder,
    },
  }, { headers: sbServerClient.headers });
}

export default function PlayersIndex({ loaderData }: Route.ComponentProps) {
  const { players, user, countries, playingStyles, pagination, filters } = loaderData;

  const breadcrumbItems = [
    { label: "Home", href: "/" },
    { label: "Players", href: "/players" },
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <Breadcrumb items={breadcrumbItems} />

      <PageSection>
        {!user && (
          <div className="mb-8 bg-gradient-to-r from-purple-600 to-purple-800 text-white p-6 rounded-lg shadow-lg">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-xl font-semibold mb-2">Help Expand Our Player Database</h3>
                <p className="text-purple-100">
                  Create an account or log in to submit a new player and contribute to our growing community.
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
        <PlayersHeader 
          totalPlayers={pagination.totalCount} 
          user={user} 
          countries={countries}
          playingStyles={playingStyles}
          filters={filters}
          pagination={pagination}
          players={players}
        />
      </PageSection>
    </div>
  );
}

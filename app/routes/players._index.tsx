import type { Route } from "./+types/players._index";
import { data } from "react-router";
import { DatabaseService } from "~/lib/database.server";
import { getServerClient } from "~/lib/supabase.server";
import { schemaService } from "~/lib/schema";
import { PageSection } from "~/components/layout/PageSection";
import { Breadcrumb } from "~/components/ui/Breadcrumb";
import { PlayersHeader } from "~/components/players/PlayersHeader";
import { PlayersGrid } from "~/components/players/PlayersGrid";
import { PlayersPagination } from "~/components/players/PlayersPagination";
import { createCategoryService } from "~/lib/categories.server";
import { useContent } from "~/hooks/useContent";
import { StructuredData } from "~/components/seo/StructuredData";
import {
  buildCanonicalUrl,
  buildOgImageUrl,
  getSiteUrl,
  ogImageMeta,
} from "~/lib/seo";

const PLAYERS_LISTING_PARAMS = [
  "country",
  "style",
  "gender",
  "active",
  "kind",
  "sort",
  "order",
  "page",
] as const;

type KindFilter = "pro" | "amateur" | "all";

function parseKindParam(raw: string | null): KindFilter {
  if (raw === "pro" || raw === "amateur" || raw === "all") return raw;
  return "all";
}

export function meta({ matches, location }: Route.MetaArgs) {
  const currentYear = new Date().getFullYear();
  const siteUrl = getSiteUrl(matches);
  const canonical = buildCanonicalUrl(
    siteUrl,
    location.pathname,
    location.search,
    PLAYERS_LISTING_PARAMS
  );
  const ogImageUrl = buildOgImageUrl(siteUrl, "/og/players.png");

  const title = `Table Tennis Player Setups ${currentYear} — Blade, Rubbers & Style | TT Reviews`;

  const description = `Equipment setups and playing styles for professional table tennis players. Sourced from interviews, tournaments, and the wider community. Updated ${currentYear}.`;

  // Enhanced keywords targeting player searches from research
  const keywords = [
    "professional table tennis players",
    "table tennis player database",
    "ma long equipment",
    "fan zhendong blade",
    "table tennis player rankings",
    "professional player setups",
    "table tennis equipment used by pros",
    `table tennis players ${currentYear}`,
    "ping pong professionals",
    "tournament players",
  ].join(", ");

  return [
    { title },
    { name: "description", content: description },
    { name: "keywords", content: keywords },
    { tagName: "link", rel: "canonical", href: canonical },
    { property: "og:title", content: title },
    { property: "og:description", content: description },
    { property: "og:type", content: "website" },
    { property: "og:url", content: canonical },
    ...ogImageMeta({ siteUrl, title, description, imageUrl: ogImageUrl }),
    // Additional SEO meta tags
    { name: "robots", content: "index, follow" },
    { name: "author", content: "TT Reviews" },
    { property: "og:site_name", content: "TT Reviews" },
    // Category page specific tags
    { name: "category", content: "Table Tennis Players" },
    { property: "article:section", content: "Player Database" },
    // JSON-LD via <StructuredData /> — see equipment.$slug.tsx.
  ];
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const country = url.searchParams.get("country") || undefined;
  const playingStyle = url.searchParams.get("style") || undefined;
  const gender = url.searchParams.get("gender") || undefined;
  const activeOnly =
    url.searchParams.get("active") === "true"
      ? true
      : url.searchParams.get("active") === "false"
        ? false
        : undefined;
  const kind = parseKindParam(url.searchParams.get("kind"));
  // TT-219 / TT-224: "Highest Rating" maps to the typed peak column
  // for whichever kind is in scope (pros: peak_world_rank asc;
  // amateurs: peak_rating_value desc). URL param name stays
  // `highest_rating` for back-compat with TT-219 bookmarks.
  const sortBy =
    (url.searchParams.get("sort") as
      | "name"
      | "created_at"
      | "highest_rating") || "highest_rating";
  const sortOrder = (url.searchParams.get("order") as "asc" | "desc") || "desc";
  const page = parseInt(url.searchParams.get("page") || "1", 10);
  const limit = 12;
  const offset = (page - 1) * limit;

  const sbServerClient = getServerClient(request, context);
  const db = new DatabaseService(context);
  const categoryService = createCategoryService(sbServerClient.client);

  // TT-224: when `kind=all` we render two sections (pros + amateurs)
  // side-by-side. Each section is its own paginated grid in theory,
  // but with the current seed (~52 pros, 2 amateurs) we keep the
  // "all" view non-paginated and capped at LIMIT_ALL_SECTION rows
  // per section. Drill into `?kind=pro` / `?kind=amateur` for full
  // pagination on the single section. Two queries here is still well
  // under the 50-subrequest cap.
  const LIMIT_ALL_SECTION = 24;

  const [pros, amateurs, proCount, amateurCount, countries, playingStyles] =
    await Promise.all([
      kind === "amateur"
        ? Promise.resolve([])
        : db.getAllPlayers({
            country,
            playingStyle,
            gender,
            active: activeOnly,
            playerKind: "professional",
            sortBy,
            sortOrder,
            limit: kind === "pro" ? limit : LIMIT_ALL_SECTION,
            offset: kind === "pro" ? offset : 0,
          }),
      kind === "pro"
        ? Promise.resolve([])
        : db.getAllPlayers({
            country,
            playingStyle,
            gender,
            active: activeOnly,
            playerKind: "amateur",
            sortBy,
            sortOrder,
            limit: kind === "amateur" ? limit : LIMIT_ALL_SECTION,
            offset: kind === "amateur" ? offset : 0,
          }),
      kind === "amateur"
        ? Promise.resolve(0)
        : db.getPlayersCount({
            country,
            playingStyle,
            gender,
            active: activeOnly,
            playerKind: "professional",
          }),
      kind === "pro"
        ? Promise.resolve(0)
        : db.getPlayersCount({
            country,
            playingStyle,
            gender,
            active: activeOnly,
            playerKind: "amateur",
          }),
      db.getPlayerCountries(),
      categoryService.getPlayingStyles(),
    ]);

  // Pagination is per-section; only meaningful when a single kind is
  // selected. When kind=all we still emit a pagination shape so the
  // existing PlayersPagination component renders nothing
  // (totalPages=1).
  const activeTotal =
    kind === "pro" ? proCount : kind === "amateur" ? amateurCount : 0;
  const totalPages = kind === "all" ? 1 : Math.ceil(activeTotal / limit);

  // TT-242: bulk-load setups for every card on the page (pros +
  // amateurs combined) in one PostgREST round-trip. Falls back to
  // an empty array of setups when nothing matches — PlayerCard just
  // doesn't render the Setup line in that case.
  const allPlayerIds = [...pros, ...amateurs].map(p => p.id);
  const setupsByPlayerId = allPlayerIds.length
    ? await db.getMostRecentEquipmentSetupsForPlayers(allPlayerIds)
    : new Map();
  // Map → plain object for the loader payload (Maps don't survive
  // SuperJSON-less serialisation). Re-hydrated on the component side.
  const setupsObject: Record<
    string,
    {
      blade?: { name: string; manufacturer: string };
      forehandRubber?: { name: string; manufacturer: string };
      backhandRubber?: { name: string; manufacturer: string };
    }
  > = {};
  for (const [id, setup] of setupsByPlayerId) {
    setupsObject[id] = setup;
  }

  const userResponse = await sbServerClient.client.auth.getUser();
  const user = userResponse.data.user;

  const breadcrumbSchema = schemaService.generateBreadcrumbSchema([
    { label: "Home", href: "/" },
    { label: "Players", href: "/players" },
  ]);

  return data(
    {
      pros,
      amateurs,
      proCount,
      amateurCount,
      user,
      countries,
      playingStyles,
      setupsByPlayerId: setupsObject,
      pagination: {
        currentPage: page,
        totalPages,
        totalCount: activeTotal,
        limit,
      },
      filters: {
        country,
        playingStyle,
        gender,
        activeOnly,
        kind,
        sortBy,
        sortOrder,
      },
      breadcrumbSchema,
    },
    { headers: sbServerClient.headers }
  );
}

export default function PlayersIndex({ loaderData }: Route.ComponentProps) {
  const {
    pros,
    amateurs,
    proCount,
    amateurCount,
    user,
    countries,
    playingStyles,
    pagination,
    filters,
    breadcrumbSchema,
    setupsByPlayerId,
  } = loaderData;

  // Re-hydrate the loader's plain object back into the Map shape
  // PlayersGrid → PlayerCard wants. (Maps don't survive the
  // loader/serialise boundary.)
  const setupsMap = new Map(Object.entries(setupsByPlayerId ?? {}));

  const { content } = useContent();

  const breadcrumbItems = [
    { label: "Home", href: "/" },
    { label: "Players", href: "/players" },
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      {breadcrumbSchema && <StructuredData schema={breadcrumbSchema} />}
      <Breadcrumb items={breadcrumbItems} />

      <PageSection>
        {!user && (
          <div className="mb-8 bg-gradient-to-r from-purple-600 to-purple-800 text-white p-6 rounded-lg shadow-lg">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-xl font-semibold mb-2">
                  {content(
                    "players.expand_database.title",
                    "Spotted a player we don't have?"
                  )}
                </h3>
                <p className="text-purple-100">
                  {content(
                    "players.expand_database.description",
                    "Sign in to submit a player you don't see on the site. We review every submission."
                  )}
                </p>
              </div>
              <a
                href="/login"
                className="bg-white text-purple-600 hover:bg-purple-50 px-6 py-3 rounded-lg font-semibold transition-all duration-200 hover:scale-105 shadow-lg whitespace-nowrap"
              >
                Sign in
              </a>
            </div>
          </div>
        )}
        <PlayersHeader
          user={user}
          countries={countries}
          playingStyles={playingStyles}
          filters={filters}
          pagination={pagination}
          pros={pros}
          amateurs={amateurs}
          proCount={proCount}
          amateurCount={amateurCount}
          setupsByPlayerId={setupsMap}
        />
      </PageSection>
    </div>
  );
}

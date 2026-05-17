import { Link } from "react-router";
import { useContent } from "~/hooks/useContent";
import { PlayersGrid } from "./PlayersGrid";
import { PlayersPagination } from "./PlayersPagination";
import { CountrySearch } from "./CountrySearch";
import type { Player } from "~/lib/database.server";

interface CategoryOption {
  id: string;
  name: string;
  value: string;
  flag_emoji?: string;
  display_order: number;
}

interface PlayersHeaderProps {
  user?: { id: string; email?: string } | null;
  countries: string[];
  playingStyles: CategoryOption[];
  filters: {
    country?: string;
    playingStyle?: string;
    gender?: string;
    activeOnly?: boolean;
    kind: "pro" | "amateur" | "all";
    sortBy: string;
    sortOrder: string;
  };
  pagination: {
    currentPage: number;
    totalPages: number;
    totalCount: number;
    limit: number;
  };
  pros: Player[];
  amateurs: Player[];
  proCount: number;
  amateurCount: number;
  // TT-242: passed through to each PlayersGrid → PlayerCard. Map keyed
  // by player_id; values are { blade, forehandRubber, backhandRubber }
  // shapes from getMostRecentEquipmentSetupsForPlayers. Optional so
  // any future consumer that doesn't have setups loaded can omit.
  setupsByPlayerId?: Map<
    string,
    {
      blade?: { name: string; manufacturer: string };
      forehandRubber?: { name: string; manufacturer: string };
      backhandRubber?: { name: string; manufacturer: string };
    }
  >;
}

const COUNTRY_NAMES: Record<string, string> = {
  AUT: "Austria",
  BRA: "Brazil",
  CHN: "China",
  DEN: "Denmark",
  EGY: "Egypt",
  FRA: "France",
  GER: "Germany",
  JPN: "Japan",
  KOR: "South Korea",
  MAC: "Macau",
  PUR: "Puerto Rico",
  ROU: "Romania",
  SLO: "Slovenia",
  SWE: "Sweden",
  TPE: "Chinese Taipei",
  UKR: "Ukraine",
};

export function PlayersHeader({
  user,
  countries,
  playingStyles,
  filters,
  pagination,
  pros,
  amateurs,
  proCount,
  amateurCount,
  setupsByPlayerId,
}: PlayersHeaderProps) {
  const { content } = useContent();
  const buildFilterUrl = (newFilters: Partial<typeof filters>) => {
    const params = new URLSearchParams();

    const combined = { ...filters, ...newFilters };

    if (combined.country) params.set("country", combined.country);
    if (combined.playingStyle) params.set("style", combined.playingStyle);
    if (combined.gender) params.set("gender", combined.gender);
    if (combined.activeOnly !== undefined)
      params.set("active", combined.activeOnly.toString());
    if (combined.kind && combined.kind !== "all")
      params.set("kind", combined.kind);
    if (combined.sortBy !== "created_at") params.set("sort", combined.sortBy);
    if (combined.sortOrder !== "desc") params.set("order", combined.sortOrder);

    const qs = params.toString();
    return qs ? `/players?${qs}` : "/players";
  };

  const getPlayingStyleName = (styleValue: string) => {
    const style = playingStyles.find(s => s.value === styleValue);
    return style ? style.name : styleValue;
  };

  // TT-224: sort-label semantics depend on the visible section. When
  // both sections render (`kind=all`), default to the pro framing
  // since that's where most rows live; when filtered to amateurs,
  // reflect "Peak rating" instead. The dropdown's data-attribute lets
  // the e2e spec assert the label without sharing the string.
  const careerBestLabel =
    filters.kind === "amateur" ? "Peak rating" : "Career-best ranking";

  const showPros = filters.kind !== "amateur";
  const showAmateurs = filters.kind !== "pro";

  return (
    <>
      <div className="flex justify-between items-end mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 mb-4">
            {filters.kind === "amateur"
              ? "Amateur Players"
              : filters.kind === "pro"
                ? "Professional Players"
                : "Players"}
          </h1>
          <p className="text-lg text-gray-600 max-w-3xl">
            {content(
              "players.page.description",
              "Equipment setups and playing styles for professional table tennis players from around the world."
            )}
          </p>
          <p className="text-sm text-gray-500 mt-2">
            {proCount} professional{proCount !== 1 ? "s" : ""} · {amateurCount}{" "}
            amateur{amateurCount !== 1 ? "s" : ""}
          </p>
        </div>
        {user && (
          <div className="flex space-x-3">
            <a
              href="/submissions/player/submit"
              className="px-6 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-purple-500 font-semibold transition-all duration-200 hover:scale-105 shadow-lg"
            >
              Submit Player
            </a>
          </div>
        )}
      </div>

      {/* TT-224: kind filter pill row. Default `?kind=all` shows both
          sections; `?kind=pro` or `?kind=amateur` drills into one. */}
      <div
        className="mb-6 flex flex-wrap gap-2"
        data-testid="players-kind-filter"
      >
        {[
          { value: "all" as const, label: "All players" },
          { value: "pro" as const, label: "Pros" },
          { value: "amateur" as const, label: "Amateurs" },
        ].map(opt => (
          <Link
            key={opt.value}
            to={buildFilterUrl({ kind: opt.value })}
            data-testid={`players-kind-${opt.value}`}
            className={`px-4 py-2 rounded-full border text-sm font-medium transition-colors ${
              filters.kind === opt.value
                ? "bg-purple-600 border-purple-600 text-white"
                : "bg-white border-gray-300 text-gray-700 hover:bg-gray-50"
            }`}
          >
            {opt.label}
          </Link>
        ))}
      </div>

      <div className="flex flex-col lg:flex-row gap-8 mb-8">
        <aside className="lg:w-64 flex-shrink-0">
          <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Gender</h3>
            <div className="space-y-2">
              <Link
                to={buildFilterUrl({ gender: undefined })}
                className={`block p-3 rounded-lg transition-colors ${
                  !filters.gender
                    ? "bg-purple-100 text-purple-800 font-medium"
                    : "text-gray-700 hover:bg-gray-100"
                }`}
              >
                All Players
              </Link>
              <Link
                to={buildFilterUrl({ gender: "M" })}
                className={`block p-3 rounded-lg transition-colors ${
                  filters.gender === "M"
                    ? "bg-purple-100 text-purple-800 font-medium"
                    : "text-gray-700 hover:bg-gray-100"
                }`}
              >
                Men
              </Link>
              <Link
                to={buildFilterUrl({ gender: "F" })}
                className={`block p-3 rounded-lg transition-colors ${
                  filters.gender === "F"
                    ? "bg-purple-100 text-purple-800 font-medium"
                    : "text-gray-700 hover:bg-gray-100"
                }`}
              >
                Women
              </Link>
            </div>
          </div>

          <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              Country
            </h3>
            <CountrySearch
              countries={countries}
              currentCountry={filters.country}
              buildFilterUrl={buildFilterUrl}
            />
          </div>

          <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              Playing Style
            </h3>
            <div className="space-y-2">
              <Link
                to={buildFilterUrl({ playingStyle: undefined })}
                className={`block p-3 rounded-lg transition-colors ${
                  !filters.playingStyle
                    ? "bg-purple-100 text-purple-800 font-medium"
                    : "text-gray-700 hover:bg-gray-100"
                }`}
              >
                All Styles
              </Link>
              {playingStyles.map(style => (
                <Link
                  key={style.value}
                  to={buildFilterUrl({ playingStyle: style.value })}
                  className={`block p-3 rounded-lg transition-colors ${
                    filters.playingStyle === style.value
                      ? "bg-purple-100 text-purple-800 font-medium"
                      : "text-gray-700 hover:bg-gray-100"
                  }`}
                >
                  {style.name}
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
                to={buildFilterUrl({ sortBy: "created_at", sortOrder: "desc" })}
                className={`block p-3 rounded-lg transition-colors ${
                  filters.sortBy === "created_at" &&
                  filters.sortOrder === "desc"
                    ? "bg-purple-100 text-purple-800 font-medium"
                    : "text-gray-700 hover:bg-gray-100"
                }`}
              >
                Newest First
              </Link>
              <Link
                to={buildFilterUrl({ sortBy: "name", sortOrder: "asc" })}
                className={`block p-3 rounded-lg transition-colors ${
                  filters.sortBy === "name" && filters.sortOrder === "asc"
                    ? "bg-purple-100 text-purple-800 font-medium"
                    : "text-gray-700 hover:bg-gray-100"
                }`}
              >
                Name A-Z
              </Link>
              <Link
                to={buildFilterUrl({
                  sortBy: "highest_rating",
                  sortOrder: "desc",
                })}
                data-testid="players-sort-peak"
                className={`block p-3 rounded-lg transition-colors ${
                  filters.sortBy === "highest_rating" &&
                  filters.sortOrder === "desc"
                    ? "bg-purple-100 text-purple-800 font-medium"
                    : "text-gray-700 hover:bg-gray-100"
                }`}
              >
                {careerBestLabel}
              </Link>
            </div>
          </div>
        </aside>

        <div className="flex-1">
          <div className="mb-6 flex items-center justify-between">
            <p className="text-gray-600">
              {filters.kind === "all"
                ? `${proCount + amateurCount} player${
                    proCount + amateurCount !== 1 ? "s" : ""
                  } total`
                : `Showing ${Math.min(
                    pagination.limit,
                    pagination.totalCount -
                      (pagination.currentPage - 1) * pagination.limit
                  )} of ${pagination.totalCount} ${
                    filters.kind === "pro" ? "professionals" : "amateurs"
                  }`}
              {filters.gender &&
                ` (${filters.gender === "M" ? "Men" : "Women"})`}
              {filters.country &&
                ` from ${COUNTRY_NAMES[filters.country] || filters.country}`}
              {filters.playingStyle &&
                ` (${getPlayingStyleName(filters.playingStyle)})`}
            </p>
          </div>

          {showPros && (
            <section
              data-testid="players-pro-section"
              className={showAmateurs ? "mb-12" : undefined}
            >
              {filters.kind === "all" && (
                <h2
                  className="text-2xl font-semibold text-gray-900 mb-4"
                  data-testid="players-pro-heading"
                >
                  Professional players
                </h2>
              )}
              <PlayersGrid players={pros} setupsByPlayerId={setupsByPlayerId} />
              {filters.kind === "all" && proCount > pros.length && (
                <div className="mt-4 text-right">
                  <Link
                    to={buildFilterUrl({ kind: "pro" })}
                    className="text-purple-700 font-medium hover:underline"
                  >
                    See all {proCount} professionals →
                  </Link>
                </div>
              )}
              {filters.kind === "pro" && (
                <PlayersPagination pagination={pagination} filters={filters} />
              )}
            </section>
          )}

          {showAmateurs && (
            <section data-testid="players-amateur-section">
              {filters.kind === "all" && (
                <h2
                  className="text-2xl font-semibold text-gray-900 mb-4"
                  data-testid="players-amateur-heading"
                >
                  Notable amateur players
                </h2>
              )}
              <PlayersGrid
                players={amateurs}
                emptyKind="amateur"
                setupsByPlayerId={setupsByPlayerId}
              />
              {filters.kind === "all" && amateurCount > amateurs.length && (
                <div className="mt-4 text-right">
                  <Link
                    to={buildFilterUrl({ kind: "amateur" })}
                    className="text-purple-700 font-medium hover:underline"
                  >
                    See all {amateurCount} amateurs →
                  </Link>
                </div>
              )}
              {filters.kind === "amateur" && (
                <PlayersPagination pagination={pagination} filters={filters} />
              )}
            </section>
          )}
        </div>
      </div>
    </>
  );
}

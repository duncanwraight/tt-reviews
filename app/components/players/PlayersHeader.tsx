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
  totalPlayers: number;
  user?: { id: string; email?: string } | null;
  countries: string[];
  playingStyles: CategoryOption[];
  filters: {
    country?: string;
    playingStyle?: string;
    gender?: string;
    activeOnly?: boolean;
    sortBy: string;
    sortOrder: string;
  };
  pagination: {
    currentPage: number;
    totalPages: number;
    totalCount: number;
    limit: number;
  };
  players: Player[];
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
  totalPlayers,
  user,
  countries,
  playingStyles,
  filters,
  pagination,
  players,
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
    if (combined.sortBy !== "created_at") params.set("sort", combined.sortBy);
    if (combined.sortOrder !== "desc") params.set("order", combined.sortOrder);

    return `/players?${params.toString()}`;
  };

  const getPlayingStyleName = (styleValue: string) => {
    const style = playingStyles.find(s => s.value === styleValue);
    return style ? style.name : styleValue;
  };

  return (
    <>
      <div className="flex justify-between items-end mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 mb-4">
            Professional Players
          </h1>
          <p className="text-lg text-gray-600 max-w-3xl">
            {content("players.page.description", "Discover the equipment setups and playing styles of professional table tennis players from around the world. Learn what gear the pros use to dominate at the highest level.")}
          </p>
          {totalPlayers > 0 && (
            <p className="text-sm text-gray-500 mt-2">
              {totalPlayers} player{totalPlayers !== 1 ? "s" : ""} in our
              database
            </p>
          )}
        </div>
        {user && (
          <div className="flex space-x-3">
            <a
              href="/players/submit"
              className="px-6 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-purple-500 font-semibold transition-all duration-200 hover:scale-105 shadow-lg"
            >
              Submit Player
            </a>
          </div>
        )}
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
                className={`block p-3 rounded-lg transition-colors ${
                  filters.sortBy === "highest_rating" &&
                  filters.sortOrder === "desc"
                    ? "bg-purple-100 text-purple-800 font-medium"
                    : "text-gray-700 hover:bg-gray-100"
                }`}
              >
                Highest Rating
              </Link>
            </div>
          </div>
        </aside>

        <div className="flex-1">
          <div className="mb-6 flex items-center justify-between">
            <p className="text-gray-600">
              Showing{" "}
              {Math.min(
                pagination.limit,
                pagination.totalCount -
                  (pagination.currentPage - 1) * pagination.limit
              )}{" "}
              of {pagination.totalCount} players
              {filters.gender &&
                ` (${filters.gender === "M" ? "Men" : "Women"})`}
              {filters.country &&
                ` from ${COUNTRY_NAMES[filters.country] || filters.country}`}
              {filters.playingStyle &&
                ` (${getPlayingStyleName(filters.playingStyle)})`}
            </p>
          </div>
          <PlayersGrid players={players} />
          <PlayersPagination pagination={pagination} filters={filters} />
        </div>
      </div>
    </>
  );
}

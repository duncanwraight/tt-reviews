import type { Route } from "./+types/search";
import { data } from "react-router";
import { DatabaseService } from "~/lib/database.server";
import { PageLayout } from "~/components/layout/PageLayout";
import { Breadcrumb } from "~/components/ui/Breadcrumb";
import { SearchHeader } from "~/components/search/SearchHeader";
import { SearchResults } from "~/components/search/SearchResults";
import { NoResults } from "~/components/search/NoResults";
import { SearchLanding } from "~/components/search/SearchLanding";

export function meta({ data }: Route.MetaArgs) {
  const query = data?.query;
  
  if (query) {
    return [
      { title: `Search Results for "${query}" | TT Reviews` },
      { name: "description", content: `Find table tennis equipment and players matching "${query}". Browse reviews, specs, and professional setups.` },
      { name: "keywords", content: `${query}, table tennis equipment, player search, equipment reviews` },
    ];
  }

  return [
    { title: "Search Table Tennis Equipment & Players | TT Reviews" },
    { name: "description", content: "Search our comprehensive database of table tennis equipment reviews and professional player setups." },
    { name: "keywords", content: "table tennis search, equipment search, player search, ping pong gear" },
  ];
}

export async function loader({ request, context }: Route.LoaderArgs): Promise<Route.LoaderData> {
  const url = new URL(request.url);
  const query = url.searchParams.get('q');
  
  let results = null;
  
  if (query && query.trim()) {
    const db = new DatabaseService(context);
    const searchResults = await db.search(query.trim());
    results = searchResults;
  }

  return data({
    query: query || '',
    results,
  });
}

export default function Search({ loaderData }: Route.ComponentProps) {
  const { query, results } = loaderData;

  const breadcrumbItems = [
    { label: "Home", href: "/" },
    { label: "Search", href: "/search" },
  ];

  const hasResults = results && (results.equipment.length > 0 || results.players.length > 0);
  const totalResults = results ? results.equipment.length + results.players.length : 0;

  return (
    <PageLayout>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <Breadcrumb items={breadcrumbItems} />
      </div>
      
      <SearchHeader query={query} totalResults={totalResults} />
      
      {hasResults ? (
        <SearchResults results={results} />
      ) : query ? (
        <NoResults query={query} />
      ) : (
        <SearchLanding />
      )}
    </PageLayout>
  );
}
import type { Equipment, Player } from "~/lib/database.server";
import { SearchFilters } from "./SearchFilters";
import { ResultsSection } from "./ResultsSection";

interface SearchResultsProps {
  results: {
    equipment: Equipment[];
    players: Player[];
  };
}

export function SearchResults({ results }: SearchResultsProps) {
  return (
    <section className="search-results py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          <SearchFilters />

          <div className="results-content lg:col-span-3 space-y-8">
            {results.equipment.length > 0 && (
              <ResultsSection
                title="Equipment"
                items={results.equipment}
                type="equipment"
                icon="🏓"
              />
            )}

            {results.players.length > 0 && (
              <ResultsSection
                title="Players"
                items={results.players}
                type="players"
                icon="👤"
              />
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

import { useNavigate } from "react-router";

interface NoResultsProps {
  query: string;
}

export function NoResults({ query }: NoResultsProps) {
  const navigate = useNavigate();

  const handleSuggestionClick = (suggestion: string) => {
    navigate(`/search?q=${encodeURIComponent(suggestion)}`);
  };

  return (
    <section className="no-results py-16">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
        <div className="text-6xl text-gray-300 mb-6">🔍</div>
        <h2 className="text-2xl font-semibold text-gray-900 mb-4">
          No results found
        </h2>
        <p className="text-gray-600 mb-8 max-w-md mx-auto">
          We couldn't find anything matching "{query}". Try adjusting your
          search terms or browse our categories below.
        </p>

        <div className="suggested-searches">
          <h3 className="text-lg font-medium text-gray-900 mb-4">
            Popular searches:
          </h3>
          <div className="flex flex-wrap justify-center gap-3">
            {[
              "Butterfly Tenergy",
              "Long Pips",
              "Ma Long",
              "Stiga Clipper",
              "TSP Curl",
            ].map(suggestion => (
              <button
                key={suggestion}
                className="suggestion-tag bg-gray-100 hover:bg-purple-100 text-gray-700 hover:text-purple-700 px-4 py-2 rounded-full text-sm transition-colors"
                onClick={() => handleSuggestionClick(suggestion)}
              >
                {suggestion}
              </button>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

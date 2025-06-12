import { useState } from "react";
import { useNavigate } from "react-router";

interface SearchHeaderProps {
  query?: string;
  totalResults?: number;
}

export function SearchHeader({ query = "", totalResults = 0 }: SearchHeaderProps) {
  const [searchValue, setSearchValue] = useState(query);
  const navigate = useNavigate();

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchValue.trim()) {
      navigate(`/search?q=${encodeURIComponent(searchValue.trim())}`);
    }
  };

  return (
    <section className="search-header bg-white border-b border-gray-200 py-6">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="max-w-2xl mx-auto">
          <form onSubmit={handleSearch} className="search-input-container relative">
            <input
              type="text"
              className="search-input w-full py-3 px-4 text-lg border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              placeholder="Search equipment, players, or reviews..."
              value={searchValue}
              onChange={(e) => setSearchValue(e.target.value)}
            />
            <button 
              type="submit"
              className="search-button absolute right-2 top-1/2 transform -translate-y-1/2 bg-purple-600 text-white px-4 py-2 rounded-md hover:bg-purple-700 transition-colors"
            >
              Search
            </button>
          </form>

          {query && (
            <div className="search-meta mt-4 text-sm text-gray-600">
              {totalResults > 0 ? (
                <span>
                  Found {totalResults} result{totalResults !== 1 ? 's' : ''} for "{query}"
                </span>
              ) : (
                <span>No results found for "{query}"</span>
              )}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
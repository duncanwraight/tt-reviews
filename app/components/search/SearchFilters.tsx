export function SearchFilters() {
  return (
    <div className="search-filters bg-white rounded-lg p-6 border border-gray-200 h-fit sticky top-24">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">Filters</h3>

      <div className="filter-group mb-6">
        <h4 className="font-medium text-gray-700 mb-2">Type</h4>
        <div className="space-y-2">
          <label className="flex items-center">
            <input
              type="checkbox"
              className="rounded border-gray-300 text-purple-600 focus:ring-purple-500"
              defaultChecked
            />
            <span className="ml-2 text-sm text-gray-700">Equipment</span>
          </label>
          <label className="flex items-center">
            <input
              type="checkbox"
              className="rounded border-gray-300 text-purple-600 focus:ring-purple-500"
              defaultChecked
            />
            <span className="ml-2 text-sm text-gray-700">Players</span>
          </label>
        </div>
      </div>

      <div className="filter-group mb-6">
        <h4 className="font-medium text-gray-700 mb-2">Category</h4>
        <select className="w-full p-2 border border-gray-300 rounded-md text-sm">
          <option>All Categories</option>
          <option>Blades</option>
          <option>Rubbers</option>
          <option>Balls</option>
        </select>
      </div>

      <div className="filter-group mb-6">
        <h4 className="font-medium text-gray-700 mb-2">Rating</h4>
        <select className="w-full p-2 border border-gray-300 rounded-md text-sm">
          <option>Any Rating</option>
          <option>4+ Stars</option>
          <option>3+ Stars</option>
          <option>2+ Stars</option>
        </select>
      </div>

      <div className="filter-group">
        <h4 className="font-medium text-gray-700 mb-2">Sort By</h4>
        <select className="w-full p-2 border border-gray-300 rounded-md text-sm">
          <option>Relevance</option>
          <option>Highest Rated</option>
          <option>Most Reviews</option>
          <option>Name A-Z</option>
        </select>
      </div>
    </div>
  );
}

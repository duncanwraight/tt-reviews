import { Link, useNavigate } from "react-router";

export function SearchLanding() {
  const navigate = useNavigate();

  const handleSearchClick = (search: string) => {
    navigate(`/search?q=${encodeURIComponent(search)}`);
  };

  return (
    <section className="search-landing py-16">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-semibold text-gray-900 mb-4">
            Discover Table Tennis Equipment
          </h2>
          <p className="text-lg text-gray-600 max-w-2xl mx-auto">
            Search our comprehensive database of equipment reviews and
            professional player setups. Find the perfect gear for your playing
            style.
          </p>
        </div>

        <div className="popular-categories grid grid-cols-2 md:grid-cols-4 gap-6 mb-12">
          {[
            { name: "Blades", icon: "🏓", href: "/equipment?category=blade" },
            { name: "Rubbers", icon: "🔴", href: "/equipment?category=rubber" },
            { name: "Balls", icon: "🟠", href: "/equipment?category=ball" },
            { name: "Players", icon: "👤", href: "/players" },
          ].map((category) => (
            <Link
              key={category.name}
              to={category.href}
              className="category-quick-link bg-white rounded-lg p-6 text-center border border-gray-200 hover:shadow-md hover:border-purple-300 transition-all duration-200 block"
            >
              <div className="text-3xl mb-2">{category.icon}</div>
              <h3 className="font-semibold text-gray-900">{category.name}</h3>
            </Link>
          ))}
        </div>

        <div className="popular-searches text-center">
          <h3 className="text-lg font-medium text-gray-900 mb-4">
            Popular searches:
          </h3>
          <div className="flex flex-wrap justify-center gap-3">
            {[
              "Butterfly Tenergy 64",
              "TSP Curl P1-R",
              "Ma Long equipment",
              "Stiga Clipper",
              "Best long pips",
              "Joo Saehyuk setup",
            ].map((search) => (
              <button
                key={search}
                className="popular-search bg-purple-50 hover:bg-purple-100 text-purple-700 px-4 py-2 rounded-full text-sm transition-colors"
                onClick={() => handleSearchClick(search)}
              >
                {search}
              </button>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

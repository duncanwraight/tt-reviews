import { Link } from "react-router";
import { useContent } from "~/hooks/useContent";

export function CategoriesSection() {
  const { content } = useContent();

  return (
    <section className="py-16 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold text-gray-900 mb-4">
            Equipment Categories
          </h2>
          <p className="text-lg text-gray-600">
            {content("homepage.categories.subtitle")}
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          <Link
            to="/equipment?category=blade"
            className="group bg-gradient-to-br from-red-50 to-red-100 rounded-xl p-6 text-center hover:shadow-lg transition-all duration-300 transform hover:-translate-y-1 border border-red-200"
          >
            <h3 className="text-xl font-bold text-gray-900 mb-2 group-hover:text-red-600 transition-colors">
              Blades
            </h3>
            <p className="text-gray-600">
              {content("homepage.categories.blade.description")}
            </p>
          </Link>

          <Link
            to="/equipment?category=rubber&subcategory=inverted"
            className="group bg-gradient-to-br from-blue-50 to-blue-100 rounded-xl p-6 text-center hover:shadow-lg transition-all duration-300 transform hover:-translate-y-1 border border-blue-200"
          >
            <h3 className="text-xl font-bold text-gray-900 mb-2 group-hover:text-blue-600 transition-colors">
              Inverted Rubber
            </h3>
            <p className="text-gray-600">
              {content("homepage.categories.inverted_rubber.description")}
            </p>
          </Link>

          <Link
            to="/equipment?category=rubber&subcategory=long_pips"
            className="group bg-gradient-to-br from-green-50 to-green-100 rounded-xl p-6 text-center hover:shadow-lg transition-all duration-300 transform hover:-translate-y-1 border border-green-200"
          >
            <h3 className="text-xl font-bold text-gray-900 mb-2 group-hover:text-green-600 transition-colors">
              Long Pips
            </h3>
            <p className="text-gray-600">
              {content("homepage.categories.long_pips.description")}
            </p>
          </Link>

          <Link
            to="/equipment?category=rubber&subcategory=medium_pips"
            className="group bg-gradient-to-br from-teal-50 to-teal-100 rounded-xl p-6 text-center hover:shadow-lg transition-all duration-300 transform hover:-translate-y-1 border border-teal-200"
          >
            <h3 className="text-xl font-bold text-gray-900 mb-2 group-hover:text-teal-600 transition-colors">
              Medium Pips
            </h3>
            <p className="text-gray-600">
              {content("homepage.categories.medium_pips.description")}
            </p>
          </Link>

          <Link
            to="/equipment?category=rubber&subcategory=short_pips"
            className="group bg-gradient-to-br from-purple-50 to-purple-100 rounded-xl p-6 text-center hover:shadow-lg transition-all duration-300 transform hover:-translate-y-1 border border-purple-200"
          >
            <h3 className="text-xl font-bold text-gray-900 mb-2 group-hover:text-purple-600 transition-colors">
              Short Pips
            </h3>
            <p className="text-gray-600">
              {content("homepage.categories.short_pips.description")}
            </p>
          </Link>

          <Link
            to="/equipment?category=rubber&subcategory=anti"
            className="group bg-gradient-to-br from-orange-50 to-orange-100 rounded-xl p-6 text-center hover:shadow-lg transition-all duration-300 transform hover:-translate-y-1 border border-orange-200"
          >
            <h3 className="text-xl font-bold text-gray-900 mb-2 group-hover:text-orange-600 transition-colors">
              Anti-Spin
            </h3>
            <p className="text-gray-600">
              {content("homepage.categories.anti_spin.description")}
            </p>
          </Link>
        </div>
      </div>
    </section>
  );
}

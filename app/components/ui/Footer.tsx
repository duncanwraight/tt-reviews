import { Link } from "react-router";

export function Footer() {
  return (
    <footer className="bg-gray-900 text-white py-12">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center">
          <h3 className="text-2xl font-bold mb-4">TT Reviews</h3>
          <p className="text-gray-400 mb-6">
            Your trusted source for table tennis equipment reviews and player information
          </p>
          <div className="flex justify-center space-x-6">
            <Link to="/equipment" className="text-gray-400 hover:text-white transition-colors">
              Equipment
            </Link>
            <Link to="/players" className="text-gray-400 hover:text-white transition-colors">
              Players
            </Link>
            <Link to="/search" className="text-gray-400 hover:text-white transition-colors">
              Search
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
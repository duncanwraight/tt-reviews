import { Link } from "react-router";

interface NavigationProps {
  user?: {
    id: string;
    email?: string;
  } | null;
}

export function Navigation({ user }: NavigationProps) {
  return (
    <nav className="bg-white shadow-sm border-b border-gray-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <Link to="/" className="text-2xl font-bold text-purple-600">
            TT Reviews
          </Link>
          <div className="flex items-center space-x-6">
            <Link to="/equipment" className="text-gray-700 hover:text-purple-600 transition-colors">
              Equipment
            </Link>
            <Link to="/players" className="text-gray-700 hover:text-purple-600 transition-colors">
              Players
            </Link>
            {user ? (
              <>
                <Link to="/equipment/submit" className="text-gray-700 hover:text-purple-600 transition-colors">
                  Submit
                </Link>
                <Link to="/profile" className="text-gray-700 hover:text-purple-600 transition-colors">
                  Profile
                </Link>
                <form method="post" action="/logout" className="inline">
                  <button 
                    type="submit"
                    className="text-red-600 hover:text-red-800 transition-colors bg-none border-none cursor-pointer"
                  >
                    Logout
                  </button>
                </form>
              </>
            ) : (
              <Link to="/login" className="text-purple-600 hover:text-purple-800 transition-colors">
                Login
              </Link>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}
import { Link, useLocation } from "react-router";
import { DiscordIcon } from "./DiscordIcon";
import { CompactSearchForm } from "./CompactSearchForm";

interface NavigationProps {
  user?: {
    id: string;
    email?: string;
    role?: string;
  } | null;
}

export function Navigation({ user }: NavigationProps) {
  const location = useLocation();
  const isHomepage = location.pathname === "/";
  const showSearch = !isHomepage && location.pathname !== "/search";
  
  return (
    <nav className={isHomepage 
      ? "bg-white shadow-sm border-b border-gray-200" 
      : "bg-gradient-to-r from-purple-600 to-purple-800 shadow-lg"
    }>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <Link to="/" className="flex items-center space-x-2">
            <span className={`text-3xl font-extrabold tracking-tight ${
              isHomepage ? "text-purple-600" : "text-white"
            }`}>
              TT Reviews
            </span>
            <span className="text-xl">🏓</span>
          </Link>
          <div className="flex items-center space-x-8">
            <Link
              to="/equipment"
              className={`font-medium transition-all duration-200 hover:scale-105 ${
                isHomepage 
                  ? "text-gray-700 hover:text-purple-600" 
                  : "text-purple-100 hover:text-white"
              }`}
            >
              Equipment
            </Link>
            <Link
              to="/players"
              className={`font-medium transition-all duration-200 hover:scale-105 ${
                isHomepage 
                  ? "text-gray-700 hover:text-purple-600" 
                  : "text-purple-100 hover:text-white"
              }`}
            >
              Players
            </Link>
            <a
              href="https://discord.gg/Ycp7mKA3Yw" // TODO: Move to DISCORD_URL environment variable
              target="_blank"
              rel="noopener noreferrer"
              className={`font-medium transition-all duration-200 hover:scale-105 flex items-center gap-2 ${
                isHomepage 
                  ? "text-gray-700 hover:text-purple-600" 
                  : "text-purple-100 hover:text-white"
              }`}
              title="Join the OOAK Table Tennis Discord Community"
            >
              <DiscordIcon className="w-5 h-5" />
              OOAK
            </a>
            {showSearch && (
              <CompactSearchForm isHomepage={isHomepage} />
            )}
            {user ? (
              <>
                {user.role === "admin" ? (
                  <Link
                    to="/admin"
                    className="bg-yellow-500 hover:bg-yellow-600 text-white px-4 py-2 rounded-lg font-medium transition-all duration-200 hover:scale-105 shadow-lg"
                  >
                    Admin
                  </Link>
                ) : (
                  <Link
                    to="/profile"
                    className={`font-medium transition-all duration-200 hover:scale-105 ${
                      isHomepage 
                        ? "text-gray-700 hover:text-purple-600" 
                        : "text-purple-100 hover:text-white"
                    }`}
                  >
                    Profile
                  </Link>
                )}
                <form method="post" action="/logout" className="inline">
                  <button
                    type="submit"
                    className={`font-medium transition-all duration-200 hover:scale-105 bg-none border-none cursor-pointer ${
                      isHomepage 
                        ? "text-red-600 hover:text-red-800" 
                        : "text-purple-200 hover:text-white"
                    }`}
                  >
                    Logout
                  </button>
                </form>
              </>
            ) : (
              <Link
                to="/login"
                className={`px-6 py-2 rounded-lg font-semibold transition-all duration-200 hover:scale-105 shadow-lg ${
                  isHomepage
                    ? "bg-purple-600 text-white hover:bg-purple-700"
                    : "bg-white text-purple-600 hover:bg-purple-50"
                }`}
              >
                Login
              </Link>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}

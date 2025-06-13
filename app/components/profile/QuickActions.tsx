import { Link } from "react-router";
import { createBrowserClient } from "@supabase/ssr";
import { useNavigate } from "react-router";

interface QuickActionsProps {
  env: {
    SUPABASE_URL: string;
    SUPABASE_ANON_KEY: string;
  };
}

export function QuickActions({ env }: QuickActionsProps) {
  const navigate = useNavigate();

  const handleLogout = async () => {
    const supabase = createBrowserClient(
      env.SUPABASE_URL,
      env.SUPABASE_ANON_KEY
    );
    await supabase.auth.signOut();
    navigate("/login");
  };

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h2 className="text-lg font-semibold text-gray-900 mb-4">
        Quick Actions
      </h2>
      <div className="space-y-3">
        <Link
          to="/equipment/submit"
          className="block w-full bg-purple-600 text-white text-center py-2 px-4 rounded-lg hover:bg-purple-700 transition-colors"
        >
          Submit Equipment
        </Link>
        <Link
          to="/equipment"
          className="block w-full bg-blue-600 text-white text-center py-2 px-4 rounded-lg hover:bg-blue-700 transition-colors"
        >
          Browse Equipment
        </Link>
        <Link
          to="/players"
          className="block w-full bg-green-600 text-white text-center py-2 px-4 rounded-lg hover:bg-green-700 transition-colors"
        >
          Browse Players
        </Link>
        <button
          onClick={handleLogout}
          className="block w-full bg-gray-600 text-white text-center py-2 px-4 rounded-lg hover:bg-gray-700 transition-colors"
        >
          Sign Out
        </button>
      </div>
    </div>
  );
}

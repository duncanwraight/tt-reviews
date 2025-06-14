import type { Route } from "./+types/players._index";
import { data } from "react-router";
import { DatabaseService } from "~/lib/database.server";
import { getServerClient } from "~/lib/supabase.server";
import { PageSection } from "~/components/layout/PageSection";
import { Breadcrumb } from "~/components/ui/Breadcrumb";
import { PlayersHeader } from "~/components/players/PlayersHeader";
import { PlayersGrid } from "~/components/players/PlayersGrid";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Professional Table Tennis Players | TT Reviews" },
    {
      name: "description",
      content:
        "Browse professional table tennis players and discover their equipment setups, playing styles, and career achievements.",
    },
  ];
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const db = new DatabaseService(context);
  const players = await db.getAllPlayers();

  // Check if user is logged in
  const sbServerClient = getServerClient(request, context);
  const userResponse = await sbServerClient.client.auth.getUser();
  const user = userResponse.data.user;

  return data({
    players,
    user,
  }, { headers: sbServerClient.headers });
}

export default function PlayersIndex({ loaderData }: Route.ComponentProps) {
  const { players, user } = loaderData;

  const breadcrumbItems = [
    { label: "Home", href: "/" },
    { label: "Players", href: "/players" },
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <Breadcrumb items={breadcrumbItems} />

      <PageSection>
        {!user && (
          <div className="mb-8 bg-gradient-to-r from-purple-600 to-purple-800 text-white p-6 rounded-lg shadow-lg">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-xl font-semibold mb-2">Help Expand Our Player Database</h3>
                <p className="text-purple-100">
                  Create an account or log in to submit a new player and contribute to our growing community.
                </p>
              </div>
              <a
                href="/login"
                className="bg-white text-purple-600 hover:bg-purple-50 px-6 py-3 rounded-lg font-semibold transition-all duration-200 hover:scale-105 shadow-lg whitespace-nowrap"
              >
                Get Started
              </a>
            </div>
          </div>
        )}
        <PlayersHeader totalPlayers={players.length} user={user} />
        <PlayersGrid players={players} />
      </PageSection>
    </div>
  );
}

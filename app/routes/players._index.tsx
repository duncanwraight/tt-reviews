import type { Route } from "./+types/players._index";
import { data } from "react-router";
import { DatabaseService } from "~/lib/database.server";
import { PageSection } from "~/components/layout/PageSection";
import { Breadcrumb } from "~/components/ui/Breadcrumb";
import { PlayersHeader } from "~/components/players/PlayersHeader";
import { PlayersGrid } from "~/components/players/PlayersGrid";
import { PlayersFooter } from "~/components/players/PlayersFooter";

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

export async function loader({ context }: Route.LoaderArgs) {
  const db = new DatabaseService(context);
  const players = await db.getAllPlayers();

  return data({
    players,
  });
}

export default function PlayersIndex({ loaderData }: Route.ComponentProps) {
  const { players } = loaderData;

  const breadcrumbItems = [
    { label: "Home", href: "/" },
    { label: "Players", href: "/players" },
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <Breadcrumb items={breadcrumbItems} />

      <PageSection>
        <PlayersHeader totalPlayers={players.length} />
        <PlayersGrid players={players} />
        <PlayersFooter hasPlayers={players.length > 0} />
      </PageSection>
    </div>
  );
}

import type { Route } from "./+types/players.$slug";
import { data, redirect } from "react-router";
import { getServerClient } from "~/lib/supabase.server";
import { DatabaseService } from "~/lib/database.server";
import { Breadcrumb } from "~/components/ui/Breadcrumb";
import { PlayerHeader } from "~/components/players/PlayerHeader";
import { PlayerTabs } from "~/components/players/PlayerTabs";

export function meta({ params, data }: Route.MetaArgs) {
  const player = data?.player;
  if (!player) {
    return [
      { title: "Player Not Found | TT Reviews" },
      { name: "description", content: "Player not found" },
    ];
  }

  return [
    { title: `${player.name} Equipment & Setup | TT Reviews` },
    {
      name: "description",
      content: `Complete equipment setup for ${player.name}. See what blade, forehand and backhand rubbers the pro uses, with historical changes and sources.`,
    },
    {
      name: "keywords",
      content: `${player.name}, table tennis equipment, pro player setup, ${
        player.playing_style || "professional"
      }`,
    },
    { property: "og:title", content: `${player.name} Equipment & Setup` },
    {
      property: "og:description",
      content: `Complete equipment setup for ${player.name}. See what blade, forehand and backhand rubbers the pro uses.`,
    },
    { property: "og:type", content: "profile" },
  ];
}

export async function loader({ params, request, context }: Route.LoaderArgs) {
  const sbServerClient = getServerClient(request, context);
  const userResponse = await sbServerClient.client.auth.getUser();

  const db = new DatabaseService(context);

  // Get player data
  const player = await db.getPlayer(params.slug);
  if (!player) {
    throw redirect("/players");
  }

  // Get equipment setups with related equipment data
  const equipmentSetups = await db.getPlayerEquipmentSetups(player.id);

  return data(
    {
      user: userResponse?.data?.user || null,
      player,
      equipmentSetups,
    },
    { headers: sbServerClient.headers }
  );
}

export default function PlayerDetail({ loaderData }: Route.ComponentProps) {
  const { user, player, equipmentSetups } = loaderData;

  const breadcrumbItems = [
    { label: "Home", href: "/" },
    { label: "Players", href: "/players" },
    { label: player.name, href: `/players/${player.slug}` },
  ];

  return (
    <>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <Breadcrumb items={breadcrumbItems} />
      </div>

      <PlayerHeader player={player} showEditButton={!!user} />

      <PlayerTabs
        player={player}
        equipmentSetups={equipmentSetups}
        showEditButtons={!!user}
      />
    </>
  );
}

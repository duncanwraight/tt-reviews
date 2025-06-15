import type { Route } from "./+types/players.$slug";
import { data, redirect } from "react-router";
import { getServerClient } from "~/lib/supabase.server";
import { DatabaseService } from "~/lib/database.server";
import { schemaService } from "~/lib/schema.server";
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

  // Enhanced SEO title pattern based on research
  const titleSuffix = "Equipment Setup & History | Professional Table Tennis Reviews";
  const title = `${player.name} ${titleSuffix}`;
  
  // Enhanced meta description with current equipment details
  const currentSetup = data?.equipmentSetups?.[0];
  const setupDetails = currentSetup 
    ? `Current setup: ${currentSetup.blade_name || 'Professional blade'} + ${currentSetup.fh_rubber_name || 'FH rubber'} + ${currentSetup.bh_rubber_name || 'BH rubber'}.`
    : 'Professional equipment setup.';
  
  const description = `Complete equipment history for ${player.name}. ${setupDetails} Historical changes with sources and tournament usage.`;
  
  // Enhanced keywords targeting high-value search terms
  const keywords = [
    player.name,
    `${player.name} equipment`,
    `${player.name} blade`,
    `${player.name} rubber`,
    'table tennis equipment',
    'professional player setup',
    player.playing_style || 'professional',
    player.country || ''
  ].filter(Boolean).join(', ');

  // Generate structured data schemas
  const playerSchema = schemaService.generatePlayerSchema(player);
  const breadcrumbSchema = schemaService.generateBreadcrumbSchema([
    { label: "Home", href: "/" },
    { label: "Players", href: "/players" },
    { label: player.name, href: `/players/${player.slug}` }
  ]);

  return [
    { title },
    { name: "description", content: description },
    { name: "keywords", content: keywords },
    { property: "og:title", content: `${player.name} Equipment & Setup` },
    { property: "og:description", content: description },
    { property: "og:type", content: "profile" },
    // Additional SEO meta tags
    { name: "robots", content: "index, follow" },
    { name: "author", content: "TT Reviews" },
    { property: "article:author", content: "TT Reviews" },
    { property: "og:site_name", content: "TT Reviews" },
    // Structured data
    {
      "script:ld+json": schemaService.generateMultipleSchemas([playerSchema, breadcrumbSchema])
    },
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

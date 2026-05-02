import type { Route } from "./+types/players.$slug";
import { data, redirect } from "react-router";
import { getServerClient } from "~/lib/supabase.server";
import { DatabaseService } from "~/lib/database.server";
import { schemaService } from "~/lib/schema";
import { Breadcrumb } from "~/components/ui/Breadcrumb";
import { PlayerHeader } from "~/components/players/PlayerHeader";
import { PlayerTabs } from "~/components/players/PlayerTabs";
import { StructuredData } from "~/components/seo/StructuredData";
import {
  buildCanonicalUrl,
  buildOgImageUrl,
  getSiteUrl,
  ogImageMeta,
} from "~/lib/seo";
import { findSlugRedirect } from "~/lib/slug-redirects.server";

export function meta({ params, data, matches, location }: Route.MetaArgs) {
  const player = data?.player;
  if (!player) {
    return [
      { title: "Player Not Found | TT Reviews" },
      { name: "description", content: "Player not found" },
    ];
  }

  const siteUrl = getSiteUrl(matches);
  const canonical = buildCanonicalUrl(siteUrl, location.pathname, "");
  const ogTitle = `${player.name} Equipment & Setup`;
  const ogImageUrl = buildOgImageUrl(siteUrl, `/og/players/${player.slug}.png`);

  // Enhanced SEO title pattern based on research
  const titleSuffix =
    "Equipment Setup & History | Professional Table Tennis Reviews";
  const title = `${player.name} ${titleSuffix}`;

  // Enhanced meta description with current equipment details
  const currentSetup = data?.equipmentSetups?.[0];
  const setupDetails = currentSetup
    ? "Current professional equipment setup with blade and rubbers."
    : "Professional equipment setup.";

  const description = `Complete equipment history for ${player.name}. ${setupDetails} Historical changes with sources and tournament usage.`;

  // Enhanced keywords targeting high-value search terms
  const keywords = [
    player.name,
    `${player.name} equipment`,
    `${player.name} blade`,
    `${player.name} rubber`,
    "table tennis equipment",
    "professional player setup",
    player.playing_style || "professional",
    player.birth_country || player.represents || "",
  ]
    .filter(Boolean)
    .join(", ");

  return [
    { title },
    { name: "description", content: description },
    { name: "keywords", content: keywords },
    { tagName: "link", rel: "canonical", href: canonical },
    { property: "og:title", content: ogTitle },
    { property: "og:description", content: description },
    { property: "og:type", content: "profile" },
    { property: "og:url", content: canonical },
    ...ogImageMeta({
      siteUrl,
      title: ogTitle,
      description,
      imageUrl: ogImageUrl,
    }),
    // Additional SEO meta tags
    { name: "robots", content: "index, follow" },
    { name: "author", content: "TT Reviews" },
    { property: "article:author", content: "TT Reviews" },
    { property: "og:site_name", content: "TT Reviews" },
    // JSON-LD via <StructuredData /> — see equipment.$slug.tsx.
  ];
}

export async function loader({ params, request, context }: Route.LoaderArgs) {
  const sbServerClient = getServerClient(request, context);
  const userResponse = await sbServerClient.client.auth.getUser();

  const db = new DatabaseService(context);

  // Get player data
  const player = await db.getPlayer(params.slug);
  if (!player) {
    // TT-141: slug miss might be a previously-renamed player.
    // Player slug renames aren't currently exposed through any flow,
    // but the lookup is wired up so the redirect path works the
    // moment a row lands in slug_redirects (e.g. via direct DB).
    const newSlug = await findSlugRedirect(
      sbServerClient.client,
      "player",
      params.slug
    );
    if (newSlug) {
      throw redirect(`/players/${newSlug}`, { status: 301 });
    }
    // Status 404 (not 302) — Google treats a bare 302 to /players as
    // a soft-404 and keeps the missing URL in the index. Mirrors the
    // equipment route's behaviour (TT-141 review feedback).
    throw redirect("/players", { status: 404 });
  }

  // Get equipment setups with related equipment data
  const equipmentSetups = await db.getPlayerEquipmentSetups(player.id);

  // Get player footage/videos
  const footage = await db.getPlayerFootage(player.id);

  // Generate structured data schemas
  const playerSchema = schemaService.generatePlayerSchema(player);
  const breadcrumbSchema = schemaService.generateBreadcrumbSchema([
    { label: "Home", href: "/" },
    { label: "Players", href: "/players" },
    { label: player.name, href: `/players/${player.slug}` },
  ]);
  const multipleSchemas = [playerSchema, breadcrumbSchema];

  return data(
    {
      user: userResponse?.data?.user || null,
      player,
      equipmentSetups,
      footage,
      multipleSchemas,
    },
    { headers: sbServerClient.headers }
  );
}

export default function PlayerDetail({ loaderData }: Route.ComponentProps) {
  const { user, player, equipmentSetups, footage, multipleSchemas } =
    loaderData;

  const breadcrumbItems = [
    { label: "Home", href: "/" },
    { label: "Players", href: "/players" },
    { label: player.name, href: `/players/${player.slug}` },
  ];

  return (
    <>
      {multipleSchemas && <StructuredData schema={multipleSchemas} />}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <Breadcrumb items={breadcrumbItems} />
      </div>

      <PlayerHeader player={player} showEditButton={!!user} />

      <PlayerTabs
        player={player}
        equipmentSetups={equipmentSetups}
        footage={footage}
        showEditButtons={!!user}
      />
    </>
  );
}

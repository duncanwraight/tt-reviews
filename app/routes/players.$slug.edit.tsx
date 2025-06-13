import type { Route } from "./+types/players.$slug.edit";
import { getServerClient } from "~/lib/supabase.server";
import { DatabaseService } from "~/lib/database.server";
import { redirect, data } from "react-router";

import { PageSection } from "~/components/layout/PageSection";
import { Breadcrumb } from "~/components/ui/Breadcrumb";
import { PlayerEditForm } from "~/components/players/PlayerEditForm";

export function meta({ params, data }: Route.MetaArgs) {
  const player = data?.player;
  if (!player) {
    return [
      { title: "Player Not Found | TT Reviews" },
      { name: "description", content: "Player not found" },
    ];
  }

  return [
    { title: `Edit ${player.name} | TT Reviews` },
    {
      name: "description",
      content: `Update ${player.name}'s profile information and equipment details.`,
    },
  ];
}

export async function loader({ params, request, context }: Route.LoaderArgs) {
  const sbServerClient = getServerClient(request, context);
  const userResponse = await sbServerClient.client.auth.getUser();

  if (userResponse.error || !userResponse.data.user) {
    throw redirect("/login", { headers: sbServerClient.headers });
  }

  const db = new DatabaseService(context);
  const player = await db.getPlayer(params.slug);

  if (!player) {
    throw redirect("/players");
  }

  return data(
    {
      user: userResponse.data.user,
      player,
      env: {
        SUPABASE_URL: (context.cloudflare.env as Cloudflare.Env).SUPABASE_URL!,
        SUPABASE_ANON_KEY: (context.cloudflare.env as Cloudflare.Env)
          .SUPABASE_ANON_KEY!,
      },
    },
    { headers: sbServerClient.headers }
  );
}

export default function PlayerEdit({ loaderData }: Route.ComponentProps) {
  const { user, player, env } = loaderData;

  const breadcrumbItems = [
    { label: "Home", href: "/" },
    { label: "Players", href: "/players" },
    { label: player.name, href: `/players/${player.slug}` },
    { label: "Edit", href: `/players/${player.slug}/edit` },
  ];

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
      <Breadcrumb items={breadcrumbItems} />

      <PageSection background="white" padding="medium">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-4">
            Edit Player: {player.name}
          </h1>
          <p className="text-lg text-gray-600 max-w-3xl mx-auto">
            Update {player.name}'s profile information. All changes will be
            reviewed before being published.
          </p>
        </div>

        <PlayerEditForm player={player} env={env} userId={user.id} />
      </PageSection>
    </div>
  );
}

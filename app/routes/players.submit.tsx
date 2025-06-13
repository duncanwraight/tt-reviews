import type { Route } from "./+types/players.submit";
import { getServerClient } from "~/lib/supabase.server";
import { redirect, data } from "react-router";

import { PageSection } from "~/components/layout/PageSection";
import { PlayerSubmissionForm } from "~/components/players/PlayerSubmissionForm";

export async function loader({ request, context }: Route.LoaderArgs) {
  const sbServerClient = getServerClient(request, context);
  const userResponse = await sbServerClient.client.auth.getUser();

  if (userResponse.error || !userResponse.data.user) {
    throw redirect("/login", { headers: sbServerClient.headers });
  }

  return data(
    {
      user: userResponse.data.user,
      env: {
        SUPABASE_URL: (context.cloudflare.env as Cloudflare.Env).SUPABASE_URL!,
        SUPABASE_ANON_KEY: (context.cloudflare.env as Cloudflare.Env)
          .SUPABASE_ANON_KEY!,
      },
    },
    { headers: sbServerClient.headers }
  );
}

export default function PlayersSubmit({ loaderData }: Route.ComponentProps) {
  const { user, env } = loaderData;

  return (
    <PageSection background="white" padding="medium">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-4">
            Submit New Player
          </h1>
          <p className="text-lg text-gray-600">
            Help expand our player database by submitting professional table
            tennis players.
          </p>
        </div>

        <PlayerSubmissionForm env={env} userId={user.id} />
      </div>
    </PageSection>
  );
}

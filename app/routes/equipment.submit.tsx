import type { Route } from "./+types/equipment.submit";
import { getServerClient } from "~/lib/supabase.server";
import { redirect, data } from "react-router";

import { PageSection } from "~/components/layout/PageSection";
import { EquipmentSubmissionForm } from "~/components/equipment/EquipmentSubmissionForm";

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

export default function EquipmentSubmit({ loaderData }: Route.ComponentProps) {
  const { user, env } = loaderData;

  return (
    <PageSection background="white" padding="medium">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-4">
            Submit New Equipment
          </h1>
          <p className="text-lg text-gray-600">
            Help expand our equipment database by submitting new table tennis
            equipment.
          </p>
        </div>

        <EquipmentSubmissionForm env={env} userId={user.id} />
      </div>
    </PageSection>
  );
}

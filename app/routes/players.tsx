import { Outlet } from "react-router";
import type { Route } from "./+types/players";
import { getServerClient } from "~/lib/supabase.server";
import { data } from "react-router";

import { PageLayout } from "~/components/layout/PageLayout";

export async function loader({ request, context }: Route.LoaderArgs) {
  const sbServerClient = getServerClient(request, context);
  const userResponse = await sbServerClient.client.auth.getUser();
  
  return data({ 
    user: userResponse?.data?.user || null,
  }, { headers: sbServerClient.headers });
}

export default function PlayersLayout({ loaderData }: Route.ComponentProps) {
  const { user } = loaderData;

  return (
    <PageLayout user={user}>
      <Outlet />
    </PageLayout>
  );
}
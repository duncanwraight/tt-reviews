import { Outlet } from "react-router";
import type { Route } from "./+types/equipment";
import { getServerClient } from "~/lib/supabase.server";
import { getUserWithRole } from "~/lib/auth.server";
import { data } from "react-router";

import { PageLayout } from "~/components/layout/PageLayout";

export async function loader({ request, context }: Route.LoaderArgs) {
  const sbServerClient = getServerClient(request, context);
  const user = await getUserWithRole(sbServerClient);

  return data(
    {
      user,
    },
    { headers: sbServerClient.headers }
  );
}

export default function EquipmentLayout({ loaderData }: Route.ComponentProps) {
  const { user } = loaderData;

  return (
    <PageLayout user={user}>
      <Outlet />
    </PageLayout>
  );
}

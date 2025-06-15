import { Outlet } from "react-router";
import type { Route } from "./+types/equipment";
import { getServerClient } from "~/lib/supabase.server";
import { getUserWithRole } from "~/lib/auth.server";
import { data } from "react-router";

import { PageLayout } from "~/components/layout/PageLayout";
import { ComparisonProvider } from "~/contexts/ComparisonContext";
import { ComparisonBar } from "~/components/equipment/ComparisonBar";

export async function loader({ request, context }: Route.LoaderArgs) {
  const sbServerClient = getServerClient(request, context);
  const user = await getUserWithRole(sbServerClient, context);

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
    <ComparisonProvider>
      <PageLayout user={user}>
        <Outlet />
        <ComparisonBar />
      </PageLayout>
    </ComparisonProvider>
  );
}

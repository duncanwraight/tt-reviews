import { Outlet } from "react-router";
import type { Route } from "./+types/players";
import { getServerClient } from "~/lib/supabase.server";
import { data } from "react-router";

import { PageLayout } from "~/components/layout/PageLayout";

export async function loader({ request, context }: Route.LoaderArgs) {
  const sbServerClient = getServerClient(request, context);
  const userResponse = await sbServerClient.client.auth.getUser();

  let userWithRole = userResponse?.data?.user || null;

  // Add role information if user is logged in
  if (userWithRole) {
    try {
      const session = await sbServerClient.client.auth.getSession();
      if (session.data.session?.access_token) {
        const payload = JSON.parse(
          Buffer.from(
            session.data.session.access_token.split(".")[1],
            "base64"
          ).toString()
        );
        userWithRole = { ...userWithRole, role: payload.user_role || "user" };
      }
    } catch (error) {
      // If JWT decode fails, just use user without role
      console.error("Error decoding JWT for role:", error);
    }
  }

  return data(
    {
      user: userWithRole,
    },
    { headers: sbServerClient.headers }
  );
}

export default function PlayersLayout({ loaderData }: Route.ComponentProps) {
  const { user } = loaderData;

  return (
    <PageLayout user={user}>
      <Outlet />
    </PageLayout>
  );
}

import { redirect } from "react-router";
import type { Route } from "./+types/logout";
import { getServerClient } from "~/lib/supabase.server";

export async function action({ request, context }: Route.ActionArgs) {
  const sbServerClient = getServerClient(request, context);

  try {
    await sbServerClient.client.auth.signOut();
    throw redirect("/login", { headers: sbServerClient.headers });
  } catch (error) {
    if (error instanceof Response) {
      throw error; // Re-throw redirect responses
    }
    console.error("Logout error:", error);
    throw redirect("/login", { headers: sbServerClient.headers });
  }
}

export async function loader() {
  throw redirect("/");
}

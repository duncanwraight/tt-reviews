import { redirect } from "react-router";
import type { Route } from "./+types/logout";
import { getServerClient } from "~/lib/supabase.server";
import { Logger, createLogContext } from "~/lib/logger.server";

export async function action({ request, context }: Route.ActionArgs) {
  const sbServerClient = getServerClient(request, context);

  try {
    await sbServerClient.client.auth.signOut();
    throw redirect("/login", { headers: sbServerClient.headers });
  } catch (error) {
    if (error instanceof Response) {
      throw error; // Re-throw redirect responses
    }
    const logContext = createLogContext(
      request.headers.get("X-Request-ID") || "logout-action",
      { route: "/logout", method: "POST" }
    );
    Logger.error("Logout error", logContext, error instanceof Error ? error : undefined);
    throw redirect("/login", { headers: sbServerClient.headers });
  }
}

export async function loader() {
  throw redirect("/");
}

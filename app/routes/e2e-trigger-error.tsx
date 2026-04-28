import type { Route } from "./+types/e2e-trigger-error";
import { data } from "react-router";
import { Logger, createLogContext } from "~/lib/logger.server";
import { isDevelopment } from "~/lib/env.server";

/**
 * Test-only error trigger. POST a JSON body { marker: string } to fire
 * Logger.error with a unique marker — used by e2e/alerts-discord-error.spec
 * to verify the alerter pipeline. 404s in prod via the isDevelopment gate.
 */
export async function loader({ context }: Route.LoaderArgs) {
  if (!isDevelopment(context)) {
    throw new Response("not found", { status: 404 });
  }
  return new Response("POST { marker } to trigger Logger.error", {
    status: 200,
    headers: { "Content-Type": "text/plain" },
  });
}

export async function action({ request, context }: Route.ActionArgs) {
  if (!isDevelopment(context)) {
    throw new Response("not found", { status: 404 });
  }

  const body = (await request.json().catch(() => ({}))) as { marker?: string };
  const marker = body.marker || "default";

  Logger.error(
    `e2e-trigger-error: ${marker}`,
    createLogContext("e2e-trigger-error", {
      source: "e2e-trigger-error",
      route: "/e2e-trigger-error",
    }),
    new Error(`Synthetic error for e2e marker=${marker}`)
  );

  return data({ ok: true, marker });
}

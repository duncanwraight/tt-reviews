import type { Route } from "./+types/e2e-last-alert";
import { data } from "react-router";
import { isDevelopment } from "~/lib/env.server";
import { getInstalledAlerter } from "~/lib/alerts/discord-alerter.server";

/**
 * Test-only readout of the most recent alert attempt the alerter made
 * in this Worker isolate. 404s in prod. Used by the alerts e2e spec to
 * verify Logger.error was fanned out to the alerter with the right
 * payload + channel — a stand-in for actually round-tripping through
 * Discord, which CI can't do until TT-83 lands.
 */
export async function loader({ context }: Route.LoaderArgs) {
  if (!isDevelopment(context)) {
    throw new Response("not found", { status: 404 });
  }
  const alerter = getInstalledAlerter();
  return data({ lastAttempt: alerter?.getLastAttempt() ?? null });
}

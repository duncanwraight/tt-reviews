// /og/players.png — static fallback for /players listing.

import type { Route } from "./+types/og.players[.]png";
import { renderOgImage } from "~/lib/og/render.server";
import { createLogContext } from "~/lib/logger.server";
import { renderDefaultCard } from "./og.default[.]png";

export async function loader({ request }: Route.LoaderArgs) {
  const ctx = createLogContext(
    request.headers.get("x-request-id") ?? "og.players.static"
  );
  const response = await renderOgImage(
    renderDefaultCard(
      "Professional player setups, equipment changes and tournament gear"
    ),
    { cacheKey: "og:players-listing" },
    ctx
  );
  const headers = new Headers(response.headers);
  headers.set("Cache-Control", "public, max-age=31536000, immutable");
  return new Response(response.body, { status: response.status, headers });
}

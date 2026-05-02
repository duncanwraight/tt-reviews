// /og/equipment.png — static fallback for /equipment listing.

import type { Route } from "./+types/og.equipment[.]png";
import { renderOgImage } from "~/lib/og/render.server";
import { createLogContext } from "~/lib/logger.server";
import { renderDefaultCard } from "./og.default[.]png";

export async function loader({ request }: Route.LoaderArgs) {
  const ctx = createLogContext(
    request.headers.get("x-request-id") ?? "og.equipment.static"
  );
  const response = await renderOgImage(
    renderDefaultCard(
      "Browse blades, rubbers and balls reviewed by the community"
    ),
    { cacheKey: "og:equipment-listing" },
    ctx
  );
  const headers = new Headers(response.headers);
  headers.set("Cache-Control", "public, max-age=31536000, immutable");
  return new Response(response.body, { status: response.status, headers });
}

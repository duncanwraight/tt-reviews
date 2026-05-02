// /og/default.png — site-wide OG fallback. Returned for any indexable
// route that doesn't have a more specific dynamic OG card (home, search,
// credits, listings, anything new). Same workers-og pipeline as the
// dynamic routes; cached forever at the edge since the design only
// changes on deploy.

import type { Route } from "./+types/og.default[.]png";
import { renderOgImage } from "~/lib/og/render.server";
import { createLogContext } from "~/lib/logger.server";

export async function loader({ request }: Route.LoaderArgs) {
  const ctx = createLogContext(
    request.headers.get("x-request-id") ?? "og.default"
  );
  const response = await renderOgImage(
    renderDefaultCard("Table Tennis Equipment Reviews & Player Database"),
    { cacheKey: "og:default" },
    ctx
  );
  // Override the cache header — static fallbacks live forever; only a
  // redeploy changes them, and a redeploy invalidates the CDN cache.
  const headers = new Headers(response.headers);
  headers.set("Cache-Control", "public, max-age=31536000, immutable");
  return new Response(response.body, { status: response.status, headers });
}

export function renderDefaultCard(tagline: string): string {
  return `
    <div style="display:flex;flex-direction:column;width:1200px;height:630px;padding:80px;background:#ffffff;font-family:Inter;justify-content:space-between;">
      <div style="display:flex;align-items:center;color:#dc2626;font-weight:700;font-size:36px;letter-spacing:-1px;">TT REVIEWS</div>
      <div style="display:flex;flex-direction:column;">
        <div style="display:flex;color:#111827;font-size:88px;font-weight:700;line-height:1.05;letter-spacing:-2px;">Table Tennis</div>
        <div style="display:flex;color:#dc2626;font-size:88px;font-weight:700;line-height:1.05;letter-spacing:-2px;">Reviews</div>
        <div style="display:flex;color:#6b7280;font-size:34px;font-weight:400;margin-top:24px;line-height:1.3;">${tagline}</div>
      </div>
      <div style="display:flex;color:#9ca3af;font-size:24px;font-weight:400;">tabletennis.reviews</div>
    </div>
  `;
}

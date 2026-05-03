// /og/players/<slug>.png — dynamic OG card for player detail.
// 1200×630 PNG. ETag from players.updated_at. See render.server.ts.

import type { Route } from "./+types/og.players.$slug[.]png";
import { DatabaseService } from "~/lib/database.server";
import { fetchImageAsDataUrl, renderOgImage } from "~/lib/og/render.server";
import { createLogContext } from "~/lib/logger.server";
import { getServerClient } from "~/lib/supabase.server";

export async function loader({ params, request, context }: Route.LoaderArgs) {
  const ctx = createLogContext(
    request.headers.get("x-request-id") ?? "og.players"
  );
  const slug = params.slug;
  if (!slug) {
    return new Response("not found", { status: 404 });
  }

  const sb = getServerClient(request, context);
  const db = new DatabaseService(context, sb.client, ctx);
  const player = await db.getPlayer(slug);
  if (!player) {
    return new Response("not found", { status: 404 });
  }

  const setups = await db.getPlayerEquipmentSetups(player.id);
  const currentSetup = setups[0];

  let heroDataUrl: string | null = null;
  if (player.image_key) {
    const sourceUrl = `/api/images/${player.image_key}${
      player.image_etag ? `?v=${encodeURIComponent(player.image_etag)}` : ""
    }`;
    heroDataUrl = await fetchImageAsDataUrl(
      sourceUrl,
      { width: 384, format: "png", fit: "cover" },
      request,
      ctx
    );
  }

  const country = player.represents ?? player.birth_country ?? null;

  const html = renderPlayerCard({
    name: player.name,
    country,
    style: humanizeStyle(player.playing_style),
    rating: player.highest_rating ?? null,
    heroDataUrl,
    setupSummary: currentSetup ? summarizeSetup(currentSetup) : null,
  });

  return renderOgImage(
    html,
    {
      cacheKey: `og:player:${slug}`,
      etag: player.updated_at ?? undefined,
    },
    ctx
  );
}

interface PlayerSetupForOg {
  blade_id?: string;
  forehand_rubber_id?: string;
  backhand_rubber_id?: string;
}

function summarizeSetup(setup: PlayerSetupForOg): string | null {
  // The setup row carries equipment IDs; resolving names would mean
  // another DB hit per render. Keep the OG card focused on identity
  // (name, nationality, style) and let the social-share landing page
  // surface the setup detail. Returning a short generic phrase keeps
  // the card layout consistent.
  if (!setup.blade_id && !setup.forehand_rubber_id && !setup.backhand_rubber_id)
    return null;
  return "Equipment & Setup";
}

interface PlayerCardData {
  name: string;
  country: string | null;
  style: string | null;
  rating: string | null;
  heroDataUrl: string | null;
  setupSummary: string | null;
}

function renderPlayerCard(data: PlayerCardData): string {
  const heroBox = data.heroDataUrl
    ? `<div style="display:flex;width:380px;height:380px;align-items:center;justify-content:center;background:#f3f4f6;border-radius:24px;overflow:hidden;">
         <img src="${data.heroDataUrl}" style="width:380px;height:380px;object-fit:cover;" />
       </div>`
    : `<div style="display:flex;width:380px;height:380px;align-items:center;justify-content:center;background:#f3f4f6;border-radius:24px;color:#9ca3af;font-size:32px;font-weight:700;">TT Reviews</div>`;

  const metaParts = [data.country, data.style, data.rating]
    .filter(Boolean)
    .map(s => escapeHtml(s ?? ""));
  const meta = metaParts.length ? metaParts.join(" · ") : "Professional Player";

  const tagline = data.setupSummary ?? "Player profile";

  return `
    <div style="display:flex;flex-direction:column;width:1200px;height:630px;padding:60px;background:#ffffff;font-family:Inter;">
      <div style="display:flex;align-items:center;color:#dc2626;font-weight:700;font-size:28px;letter-spacing:-0.5px;">TT REVIEWS</div>
      <div style="display:flex;flex:1;align-items:center;justify-content:space-between;gap:60px;">
        <div style="display:flex;flex-direction:column;flex:1;">
          <div style="display:flex;color:#6b7280;font-size:24px;font-weight:400;text-transform:uppercase;letter-spacing:1px;">${meta}</div>
          <div style="display:flex;color:#111827;font-size:72px;font-weight:700;line-height:1.05;margin-top:16px;letter-spacing:-1.5px;">${escapeHtml(data.name)}</div>
          <div style="display:flex;color:#dc2626;font-size:32px;font-weight:700;margin-top:32px;">${escapeHtml(tagline)}</div>
        </div>
        ${heroBox}
      </div>
      <div style="display:flex;color:#9ca3af;font-size:22px;font-weight:400;">tabletennis.reviews</div>
    </div>
  `;
}

function humanizeStyle(raw: string | null | undefined): string | null {
  if (!raw) return null;
  return raw
    .split("_")
    .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

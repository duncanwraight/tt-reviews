// /og/equipment/<slug>.png — dynamic OG card for equipment detail.
// 1200×630 PNG, slug-keyed, ETagged from equipment.updated_at so an
// admin edit busts the cached image. See app/lib/og/render.server.ts.

import type { Route } from "./+types/og.equipment.$slug[.]png";
import { DatabaseService } from "~/lib/database.server";
import { fetchImageAsDataUrl, renderOgImage } from "~/lib/og/render.server";
import { createLogContext } from "~/lib/logger.server";

export async function loader({ params, request, context }: Route.LoaderArgs) {
  const ctx = createLogContext(
    request.headers.get("x-request-id") ?? "og.equipment"
  );
  const slug = params.slug;
  if (!slug) {
    return new Response("not found", { status: 404 });
  }

  const db = new DatabaseService(context, ctx);
  const equipment = await db.getEquipment(slug);
  if (!equipment) {
    return new Response("not found", { status: 404 });
  }

  // Fetch reviews to compute average rating + count for the card.
  const reviews = await db.getEquipmentReviews(equipment.id, "approved");
  const reviewCount = reviews.length;
  const averageRating =
    reviewCount === 0
      ? null
      : reviews.reduce((sum, r) => sum + r.overall_rating, 0) / reviewCount;

  // Hero image: Satori only supports PNG/JPEG. Force PNG via Cloudflare
  // Image Transformations (called through `cf.image` on the fetch — the
  // URL-form `/cdn-cgi/image/...` is only intercepted at the edge, not on
  // Worker subrequests on the same zone).
  let heroDataUrl: string | null = null;
  if (equipment.image_key) {
    heroDataUrl = await fetchImageAsDataUrl(
      `/api/images/${equipment.image_key}`,
      {
        width: 512,
        format: "png",
        fit: "scale-down",
        ...(equipment.image_trim_kind ? { trim: "border" as const } : {}),
      },
      request,
      ctx
    );
  }

  const ratingText = averageRating
    ? `${averageRating.toFixed(1)} ★ · ${reviewCount} review${reviewCount === 1 ? "" : "s"}`
    : "Community reviews";

  const html = renderEquipmentCard({
    name: equipment.name,
    manufacturer: equipment.manufacturer,
    category: equipment.category,
    ratingText,
    heroDataUrl,
  });

  return renderOgImage(
    html,
    {
      cacheKey: `og:equipment:${slug}`,
      etag: equipment.updated_at ?? undefined,
    },
    ctx
  );
}

interface CardData {
  name: string;
  manufacturer: string;
  category: string;
  ratingText: string;
  heroDataUrl: string | null;
}

function renderEquipmentCard(data: CardData): string {
  // Satori HTML: every container needs explicit display: flex; dimensions
  // are absolute; only Inter is loaded so the font-family must match.
  // Hero image takes the right half; left column is name + meta.
  const hero = data.heroDataUrl
    ? `<div style="display:flex;width:480px;height:480px;align-items:center;justify-content:center;background:#f3f4f6;border-radius:24px;overflow:hidden;">
         <img src="${data.heroDataUrl}" style="width:440px;height:440px;object-fit:contain;" />
       </div>`
    : `<div style="display:flex;width:480px;height:480px;align-items:center;justify-content:center;background:#f3f4f6;border-radius:24px;color:#9ca3af;font-size:36px;font-weight:700;">TT Reviews</div>`;

  return `
    <div style="display:flex;flex-direction:column;width:1200px;height:630px;padding:60px;background:#ffffff;font-family:Inter;">
      <div style="display:flex;align-items:center;color:#dc2626;font-weight:700;font-size:28px;letter-spacing:-0.5px;">TT REVIEWS</div>
      <div style="display:flex;flex:1;align-items:center;justify-content:space-between;gap:60px;">
        <div style="display:flex;flex-direction:column;flex:1;">
          <div style="display:flex;color:#6b7280;font-size:24px;font-weight:400;text-transform:uppercase;letter-spacing:1px;">${escapeHtml(data.manufacturer)} · ${escapeHtml(data.category)}</div>
          <div style="display:flex;color:#111827;font-size:64px;font-weight:700;line-height:1.05;margin-top:16px;letter-spacing:-1.5px;">${escapeHtml(data.name)}</div>
          <div style="display:flex;color:#dc2626;font-size:32px;font-weight:700;margin-top:32px;">${escapeHtml(data.ratingText)}</div>
        </div>
        ${hero}
      </div>
      <div style="display:flex;color:#9ca3af;font-size:22px;font-weight:400;">tabletennis.reviews</div>
    </div>
  `;
}

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

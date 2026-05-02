// /og/compare/<slug1>-vs-<slug2>.png — dynamic OG card for the
// equipment-comparison page. ETag: max(updated_at) of the two rows so
// either side editing busts the cache. See render.server.ts.

import type { Route } from "./+types/og.compare.$slugs[.]png";
import { DatabaseService } from "~/lib/database.server";
import { renderOgImage } from "~/lib/og/render.server";
import { createLogContext } from "~/lib/logger.server";

export async function loader({ params, request, context }: Route.LoaderArgs) {
  const ctx = createLogContext(
    request.headers.get("x-request-id") ?? "og.compare"
  );
  const raw = params.slugs;
  if (!raw) {
    return new Response("not found", { status: 404 });
  }
  const parts = raw.split("-vs-");
  if (parts.length !== 2 || !parts[0] || !parts[1] || parts[0] === parts[1]) {
    return new Response("not found", { status: 404 });
  }
  const [slugA, slugB] = parts;

  const db = new DatabaseService(context, ctx);
  const [equipA, equipB] = await Promise.all([
    db.getEquipment(slugA),
    db.getEquipment(slugB),
  ]);
  if (!equipA || !equipB) {
    return new Response("not found", { status: 404 });
  }

  const [reviewsA, reviewsB] = await Promise.all([
    db.getEquipmentReviews(equipA.id, "approved"),
    db.getEquipmentReviews(equipB.id, "approved"),
  ]);

  const ratingA = averageRating(reviewsA);
  const ratingB = averageRating(reviewsB);

  // Bust the cache when either side updates.
  const etag = [equipA.updated_at, equipB.updated_at].sort().pop();

  const html = renderCompareCard({
    leftName: equipA.name,
    leftMeta: equipA.manufacturer,
    leftRating: ratingA,
    leftReviewCount: reviewsA.length,
    rightName: equipB.name,
    rightMeta: equipB.manufacturer,
    rightRating: ratingB,
    rightReviewCount: reviewsB.length,
  });

  return renderOgImage(
    html,
    { cacheKey: `og:compare:${slugA}:${slugB}`, etag },
    ctx
  );
}

function averageRating(reviews: { overall_rating: number }[]): number | null {
  if (reviews.length === 0) return null;
  return reviews.reduce((sum, r) => sum + r.overall_rating, 0) / reviews.length;
}

interface CompareCardData {
  leftName: string;
  leftMeta: string;
  leftRating: number | null;
  leftReviewCount: number;
  rightName: string;
  rightMeta: string;
  rightRating: number | null;
  rightReviewCount: number;
}

function renderCompareCard(d: CompareCardData): string {
  return `
    <div style="display:flex;flex-direction:column;width:1200px;height:630px;padding:60px;background:#ffffff;font-family:Inter;">
      <div style="display:flex;align-items:center;color:#dc2626;font-weight:700;font-size:28px;letter-spacing:-0.5px;">TT REVIEWS · COMPARE</div>
      <div style="display:flex;flex:1;align-items:center;justify-content:space-between;gap:32px;">
        ${renderColumn(d.leftName, d.leftMeta, d.leftRating, d.leftReviewCount)}
        <div style="display:flex;color:#dc2626;font-size:64px;font-weight:700;">vs</div>
        ${renderColumn(d.rightName, d.rightMeta, d.rightRating, d.rightReviewCount)}
      </div>
      <div style="display:flex;color:#9ca3af;font-size:22px;font-weight:400;">tabletennis.reviews</div>
    </div>
  `;
}

function renderColumn(
  name: string,
  meta: string,
  rating: number | null,
  reviewCount: number
): string {
  const ratingLine =
    rating !== null
      ? `<div style="display:flex;color:#dc2626;font-size:48px;font-weight:700;">${rating.toFixed(1)} ★</div>
         <div style="display:flex;color:#6b7280;font-size:22px;font-weight:400;">${reviewCount} review${reviewCount === 1 ? "" : "s"}</div>`
      : `<div style="display:flex;color:#9ca3af;font-size:28px;font-weight:700;">No reviews yet</div>`;

  return `
    <div style="display:flex;flex-direction:column;flex:1;align-items:flex-start;gap:16px;">
      <div style="display:flex;color:#6b7280;font-size:22px;font-weight:400;text-transform:uppercase;letter-spacing:1px;">${escapeHtml(meta)}</div>
      <div style="display:flex;color:#111827;font-size:48px;font-weight:700;line-height:1.05;letter-spacing:-1px;">${escapeHtml(name)}</div>
      <div style="display:flex;flex-direction:column;gap:4px;margin-top:16px;">
        ${ratingLine}
      </div>
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

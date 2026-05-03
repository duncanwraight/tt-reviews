// Sitemap generation utility service.
//
// `lastmod` accuracy is the only sitemap signal Google still uses
// (priority/changefreq are explicitly ignored). Trust is binary — once
// Google sees consistent inaccuracy on a site, it ignores all lastmod
// values from that site. So per-row lastmod must reflect the latest
// substantive change to the underlying page, not the response time.
//
// For detail pages (/equipment/:slug, /players/:slug) the freshness
// signal lives partly in the parent row's updated_at and partly in
// child content surfaced on the page (approved reviews on equipment;
// equipment setups + active footage on players). The two RPCs in
// 20260503171419_add_sitemap_lastmod_rpcs.sql return per-row maps so
// the loader can fold them into the parent timestamp without a
// per-row PostgREST query (Cloudflare Workers Free 50-subrequest cap).
//
// For listing/category/subcategory/manufacturer/comparison pages we
// take max(updated_at) across the slice — review activity flows in
// indirectly through equipment.updated_at via approval triggers, and
// keeping the aggregation to the parent table simplifies the
// implementation without losing meaningful accuracy.

import type { AppLoadContext } from "react-router";
import { getEnvVar } from "./env.server";
import { createSupabaseAdminClient } from "./database/client";

export interface SitemapUrl {
  url: string;
  lastmod: string;
}

export interface SitemapEntry {
  url: string;
  lastmod: string;
}

interface EquipmentRow {
  id: string;
  slug: string;
  category: string;
  subcategory?: string | null;
  manufacturer: string;
  updated_at: string;
}

interface PlayerRow {
  id: string;
  slug: string;
  active: boolean;
  updated_at: string;
}

interface ComparisonEquipmentRow extends EquipmentRow {
  name: string;
}

// Hardcoded lastmod for /credits — bump manually when copy actually
// changes. Stamping `now` here would teach Google to ignore lastmod
// across the rest of our sitemap (binary trust).
const CREDITS_LASTMOD = "2026-05-03T00:00:00.000Z";

// Lexicographic compare on ISO 8601 timestamps is chronologically
// correct (assuming all values are normalized to the same offset; our
// sources all serialize as `+00:00` from TIMESTAMPTZ). Returns the
// most recent of the candidates after dropping nullish entries.
// Throws if every candidate is nullish — callers always have at least
// the parent row's updated_at, so that's a programmer error.
function pickLatestLastmod(
  ...candidates: Array<string | null | undefined>
): string {
  let best: string | undefined;
  for (const c of candidates) {
    if (!c) continue;
    if (best === undefined || c > best) best = c;
  }
  if (best === undefined) {
    throw new Error("pickLatestLastmod requires at least one timestamp");
  }
  return best;
}

export class SitemapService {
  public readonly baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl || "https://tabletennis.reviews";
  }

  // Static pages share a sitewide max-lastmod so they advance when
  // anything material on the site changes (most common: a new
  // approved equipment row, a new approved player row, a new approved
  // review). /credits is decoupled — its content is hand-edited copy.
  generateStaticPages(siteWideLastmod: string): SitemapUrl[] {
    return [
      { url: `${this.baseUrl}/`, lastmod: siteWideLastmod },
      { url: `${this.baseUrl}/players`, lastmod: siteWideLastmod },
      { url: `${this.baseUrl}/equipment`, lastmod: siteWideLastmod },
      { url: `${this.baseUrl}/credits`, lastmod: CREDITS_LASTMOD },
    ];
  }

  // Pick the most recent ISO timestamp from a list of sitemap URLs.
  // Used by the sitemap index so each per-type entry's lastmod tracks
  // its underlying content. Falls back to a hardcoded fallback only
  // when given an empty input (shouldn't happen in prod once any of
  // equipment/players has rows).
  computeMaxLastmod(urls: SitemapUrl[]): string {
    if (urls.length === 0) return CREDITS_LASTMOD;
    return urls.reduce(
      (max, u) => (u.lastmod > max ? u.lastmod : max),
      urls[0].lastmod
    );
  }

  // Compute the sitewide lastmod from the data the per-type loaders
  // already fetch. Used by the static-pages generator and the index.
  computeSiteWideLastmod(
    equipment: Array<{ updated_at: string }>,
    players: Array<{ updated_at: string }>,
    reviewLastmods: Record<string, string>,
    activityLastmods: Record<string, string>
  ): string {
    const candidates: string[] = [];
    for (const e of equipment) candidates.push(e.updated_at);
    for (const p of players) candidates.push(p.updated_at);
    for (const v of Object.values(reviewLastmods)) candidates.push(v);
    for (const v of Object.values(activityLastmods)) candidates.push(v);
    if (candidates.length === 0) return CREDITS_LASTMOD;
    return candidates.reduce((max, c) => (c > max ? c : max), candidates[0]);
  }

  // Per-equipment lastmod = max(parent row, latest approved review).
  // reviewLastmods is the JSONB map from get_equipment_review_lastmods()
  // keyed by equipment.id; equipment without approved reviews are
  // simply absent from the map.
  generateEquipmentPages(
    equipment: EquipmentRow[],
    reviewLastmods: Record<string, string> = {}
  ): SitemapUrl[] {
    return equipment.map(item => ({
      url: `${this.baseUrl}/equipment/${item.slug}`,
      lastmod: pickLatestLastmod(item.updated_at, reviewLastmods[item.id]),
    }));
  }

  // Per-player lastmod = max(parent row, latest equipment setup,
  // latest active video). activityLastmods is keyed by player.id;
  // missing keys mean no setups and no active footage.
  generatePlayerPages(
    players: PlayerRow[],
    activityLastmods: Record<string, string> = {}
  ): SitemapUrl[] {
    return players
      .filter(p => p.active)
      .map(p => ({
        url: `${this.baseUrl}/players/${p.slug}`,
        lastmod: pickLatestLastmod(p.updated_at, activityLastmods[p.id]),
      }));
  }

  // /equipment?category=X — lastmod is max(updated_at) of equipment
  // in that category. Reviews don't directly affect what's rendered
  // on the listing card, so we don't fold reviewLastmods in here.
  generateCategoryPages(equipment: EquipmentRow[]): SitemapUrl[] {
    const byCategory = new Map<string, string>();
    for (const item of equipment) {
      const current = byCategory.get(item.category);
      if (!current || item.updated_at > current) {
        byCategory.set(item.category, item.updated_at);
      }
    }
    return Array.from(byCategory.entries()).map(([category, lastmod]) => ({
      url: `${this.baseUrl}/equipment?category=${encodeURIComponent(category)}`,
      lastmod,
    }));
  }

  // /equipment?category=X&subcategory=Y — lastmod is max(updated_at)
  // across the (category, subcategory) slice.
  generateSubcategoryPages(equipment: EquipmentRow[]): SitemapUrl[] {
    const key = (cat: string, sub: string) => `${cat}|${sub}`;
    const byPair = new Map<string, string>();
    for (const item of equipment) {
      if (!item.subcategory) continue;
      const k = key(item.category, item.subcategory);
      const current = byPair.get(k);
      if (!current || item.updated_at > current) {
        byPair.set(k, item.updated_at);
      }
    }
    return Array.from(byPair.entries()).map(([k, lastmod]) => {
      const [category, subcategory] = k.split("|");
      return {
        url: `${this.baseUrl}/equipment?category=${encodeURIComponent(category)}&subcategory=${encodeURIComponent(subcategory)}`,
        lastmod,
      };
    });
  }

  // /equipment?manufacturer=X — same shape, restricted to a curated
  // allow-list of major manufacturers so we don't emit a URL per
  // boutique brand that has only a handful of items in the catalog.
  generateManufacturerPages(equipment: EquipmentRow[]): SitemapUrl[] {
    const popularManufacturers = new Set([
      "Butterfly",
      "DHS",
      "TIBHAR",
      "Yasaka",
      "STIGA",
      "Xiom",
      "Donic",
    ]);
    const byManufacturer = new Map<string, string>();
    for (const item of equipment) {
      if (!popularManufacturers.has(item.manufacturer)) continue;
      const current = byManufacturer.get(item.manufacturer);
      if (!current || item.updated_at > current) {
        byManufacturer.set(item.manufacturer, item.updated_at);
      }
    }
    return Array.from(byManufacturer.entries()).map(
      ([manufacturer, lastmod]) => ({
        url: `${this.baseUrl}/equipment?manufacturer=${encodeURIComponent(manufacturer)}`,
        lastmod,
      })
    );
  }

  // Curated comparison pages. Each pair's lastmod = max across both
  // items' parent updated_at and their latest approved reviews —
  // a comparison page's content is dominated by the two product
  // panels, including their rating averages.
  generatePopularComparisonPages(
    equipment: ComparisonEquipmentRow[],
    reviewLastmods: Record<string, string> = {}
  ): SitemapUrl[] {
    const comparisonUrls: SitemapUrl[] = [];

    const popularComparisons = [
      // Popular rubber comparisons (based on search volume data)
      { slug1: "tenergy-05", slug2: "dignics-09c" },
      { slug1: "tenergy-05", slug2: "hurricane-3" },
      { slug1: "dignics-09c", slug2: "hurricane-3" },
      { slug1: "tenergy-64", slug2: "tenergy-05" },
      { slug1: "hurricane-3", slug2: "hurricane-3-neo" },
      { slug1: "tenergy-05", slug2: "evolution-mx-p" },
      { slug1: "dignics-05", slug2: "dignics-09c" },
      { slug1: "tenergy-80", slug2: "tenergy-05" },
      // Popular blade comparisons
      { slug1: "timo-boll-alc", slug2: "viscaria" },
      { slug1: "ma-long-carbon", slug2: "hurricane-long-5" },
      { slug1: "viscaria", slug2: "innerforce-layer-alc" },
      { slug1: "fan-zhendong-alc", slug2: "timo-boll-alc" },
    ];

    const equipmentBySlug = new Map(equipment.map(e => [e.slug, e]));

    for (const { slug1, slug2 } of popularComparisons) {
      const a = equipmentBySlug.get(slug1);
      const b = equipmentBySlug.get(slug2);
      if (!a || !b) continue;
      comparisonUrls.push({
        url: `${this.baseUrl}/equipment/compare/${slug1}-vs-${slug2}`,
        lastmod: pickLatestLastmod(
          a.updated_at,
          b.updated_at,
          reviewLastmods[a.id],
          reviewLastmods[b.id]
        ),
      });
    }

    // Manufacturer-vs-manufacturer top-3 pairs for rubbers.
    const butterflyRubbers = equipment
      .filter(e => e.category === "rubber" && e.manufacturer === "Butterfly")
      .slice(0, 3);
    const dhsRubbers = equipment
      .filter(e => e.category === "rubber" && e.manufacturer === "DHS")
      .slice(0, 3);
    for (const a of butterflyRubbers) {
      for (const b of dhsRubbers) {
        comparisonUrls.push({
          url: `${this.baseUrl}/equipment/compare/${a.slug}-vs-${b.slug}`,
          lastmod: pickLatestLastmod(
            a.updated_at,
            b.updated_at,
            reviewLastmods[a.id],
            reviewLastmods[b.id]
          ),
        });
      }
    }

    return comparisonUrls.slice(0, 50);
  }

  // Convert sitemap entries to XML. Google ignores <changefreq> and
  // <priority>; emitting them adds bytes for zero SEO benefit, so we
  // only emit <loc> and <lastmod>.
  generateSitemapXml(urls: SitemapUrl[]): string {
    const xmlContent = urls
      .map(
        url => `  <url>
    <loc>${this.escapeXml(url.url)}</loc>
    <lastmod>${url.lastmod}</lastmod>
  </url>`
      )
      .join("\n");

    return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${xmlContent}
</urlset>`;
  }

  // Generate sitemap index XML.
  generateSitemapIndexXml(sitemaps: SitemapEntry[]): string {
    const xmlContent = sitemaps
      .map(
        sitemap => `  <sitemap>
    <loc>${this.escapeXml(sitemap.url)}</loc>
    <lastmod>${sitemap.lastmod}</lastmod>
  </sitemap>`
      )
      .join("\n");

    return `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${xmlContent}
</sitemapindex>`;
  }

  private escapeXml(str: string): string {
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&apos;");
  }
}

// Per-request factory threading SITE_URL through AppLoadContext
// (Phase 5 / TT-14 pattern — process.env is unavailable on Workers).
export function getSitemapService(context: AppLoadContext): SitemapService {
  return new SitemapService(getEnvVar(context, "SITE_URL"));
}

// Fetch the two child-content lastmod maps via SECURITY DEFINER RPCs.
// Uses an admin (service_role) client because the RPCs are EXECUTE-
// granted only to service_role — Equipment review reads are otherwise
// RLS-restricted to status='approved', and the RPC walks all approved
// rows on the caller's behalf. Both maps default to {} on RPC error so
// a sitemap can still ship with parent-row lastmod even if the
// freshness-aggregation path is degraded.
export async function fetchSitemapLastmodMaps(
  context: AppLoadContext
): Promise<{
  reviewLastmods: Record<string, string>;
  activityLastmods: Record<string, string>;
}> {
  const admin = createSupabaseAdminClient(context);
  const [reviewResult, activityResult] = await Promise.all([
    admin.rpc("get_equipment_review_lastmods"),
    admin.rpc("get_player_activity_lastmods"),
  ]);

  return {
    reviewLastmods:
      !reviewResult.error && reviewResult.data
        ? (reviewResult.data as Record<string, string>)
        : {},
    activityLastmods:
      !activityResult.error && activityResult.data
        ? (activityResult.data as Record<string, string>)
        : {},
  };
}

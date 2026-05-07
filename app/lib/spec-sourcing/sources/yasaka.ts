// Yasaka tier-1 manufacturer adapter (TT-180). Targets
// yasakatabletennis.com — like Stiga, the brief's "fetch the category
// index page" approach doesn't apply: yasakatabletennis.com is a
// Nuxt.js SPA with no SSR product anchors. Filter checkboxes ("Sweden",
// "Extra") render server-side but the product grid hydrates client-side
// from a separate API.
//
// The XML sitemap is a flat <urlset> (not an index) listing every
// `/product/<slug>` URL alongside category and CMS pages. Adapter fetches
// the sitemap once per source instance, keeps only `/product/<slug>`
// entries, and caches the parsed list. Title is derived from the slug
// for run-log display; disambiguate.ts uses URL slug tokens for
// matching, same as the Stiga adapter (TT-179).

import { httpFetch, type HttpFetchOptions } from "./http";
import type { EquipmentRef, SpecCandidate, SpecSource } from "./types";

const YASAKA_BASE = "https://yasakatabletennis.com";
const SITEMAP_URL = `${YASAKA_BASE}/sitemap.xml`;

const URL_LOC_RE = /<url\b[^>]*>[\s\S]*?<loc>([^<]+)<\/loc>[\s\S]*?<\/url>/gi;

// Anchored regex: only `/product/<slug>` (no further path segments,
// query, or fragment). Skips category pages, CMS pages, and the
// `/products` listing root.
const PRODUCT_URL_RE =
  /^https:\/\/yasakatabletennis\.com\/product\/[a-z0-9][a-z0-9-]*$/i;

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function slugFromUrl(url: string): string {
  const path = new URL(url).pathname;
  return path.split("/").filter(Boolean).pop() ?? "";
}

function slugToTitle(slug: string): string {
  return slug
    .split("-")
    .filter(Boolean)
    .map(t => (t.length > 0 ? t.charAt(0).toUpperCase() + t.slice(1) : t))
    .join(" ");
}

export function parseYasakaSitemap(xml: string): SpecCandidate[] {
  const seen = new Set<string>();
  const out: SpecCandidate[] = [];
  URL_LOC_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = URL_LOC_RE.exec(xml)) !== null) {
    const url = decodeEntities(m[1].trim());
    if (!PRODUCT_URL_RE.test(url)) continue;
    if (seen.has(url)) continue;
    seen.add(url);
    out.push({ url, title: slugToTitle(slugFromUrl(url)) });
  }
  return out;
}

function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

function urlSlugTokens(url: string): string[] {
  try {
    return tokenize(slugFromUrl(url));
  } catch {
    return [];
  }
}

export interface YasakaDeps {
  fetchImpl?: typeof fetch;
}

export function makeYasakaSource(deps: YasakaDeps = {}): SpecSource {
  const opts: Pick<HttpFetchOptions, "fetchImpl"> = {
    fetchImpl: deps.fetchImpl,
  };
  let catalogPromise: Promise<SpecCandidate[]> | null = null;

  async function buildCatalog(): Promise<SpecCandidate[]> {
    const res = await httpFetch(SITEMAP_URL, opts);
    if (!res.ok) {
      throw new Error(
        `yasaka sitemap ${SITEMAP_URL} returned HTTP ${res.status}`
      );
    }
    return parseYasakaSitemap(await res.text());
  }

  async function getCatalog(): Promise<SpecCandidate[]> {
    if (!catalogPromise) {
      catalogPromise = buildCatalog().catch(err => {
        catalogPromise = null;
        throw err;
      });
    }
    return catalogPromise;
  }

  return {
    id: "yasaka",
    kind: "manufacturer",
    tier: 1,
    brand: "Yasaka",
    searchUrl(): string {
      return SITEMAP_URL;
    },
    async search(equipment: EquipmentRef): Promise<SpecCandidate[]> {
      const seedTokens = tokenize(equipment.name);
      if (seedTokens.length === 0) return [];
      const catalog = await getCatalog();
      const matches: SpecCandidate[] = [];
      for (const c of catalog) {
        const candidateTokens = new Set([
          ...tokenize(c.title),
          ...urlSlugTokens(c.url),
        ]);
        if (seedTokens.every(t => candidateTokens.has(t))) {
          matches.push(c);
          if (matches.length >= 5) break;
        }
      }
      return matches;
    },
    async fetch(candidateUrl: string) {
      const res = await httpFetch(candidateUrl, opts);
      if (!res.ok) {
        throw new Error(
          `yasaka fetch ${candidateUrl} returned HTTP ${res.status}`
        );
      }
      const html = await res.text();
      return { html, finalUrl: res.url || candidateUrl };
    },
  };
}

export const yasakaSource: SpecSource = makeYasakaSource();

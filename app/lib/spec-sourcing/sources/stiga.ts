// Stiga tier-1 manufacturer adapter (TT-179). Targets stigasports.com.
// The brief's "fetch the category index page" shape doesn't apply here:
// stigasports.com is a Next.js shell with Centra eCom on the back end,
// and every category / search page returns the same SSR HTML with no
// product anchors — the product list streams in client-side. RSC fetch,
// guessed JSON endpoints, and `_next/data/*.json` all 404 or echo the
// SPA shell.
//
// The XML sitemap is the only stable, server-rendered surface that lists
// product URLs. /sitemap.xml is a sitemap-index pointing at one urlset
// (~3000 entries, 7 locales). We follow the index, fetch each urlset,
// keep only `/en/product/<slug>` URLs, and cache the parsed list for
// the source instance's lifetime.
//
// Sitemaps don't carry product titles, so each candidate's title is
// derived from the slug ("carbonado-45" → "Carbonado 45"). The
// disambiguate.ts prefilter uses both the title and the URL slug as
// token sources — slug tokens alone are enough to match seed names like
// "Carbonado 45" → /en/product/carbonado-45.

import { httpFetch, type HttpFetchOptions } from "./http";
import type { EquipmentRef, SpecCandidate, SpecSource } from "./types";

const STIGA_BASE = "https://www.stigasports.com";
const SITEMAP_INDEX_URL = `${STIGA_BASE}/sitemap.xml`;

// Sitemap structures (sitemap.org schema). The <sitemap> entries live
// inside <sitemapindex>, the <url> entries inside <urlset>. Parsers
// here are deliberately tag-shape regex rather than full XML — sitemap
// payloads are small and the schema is stable.
const SITEMAP_LOC_RE =
  /<sitemap\b[^>]*>[\s\S]*?<loc>([^<]+)<\/loc>[\s\S]*?<\/sitemap>/gi;
const URL_LOC_RE = /<url\b[^>]*>[\s\S]*?<loc>([^<]+)<\/loc>[\s\S]*?<\/url>/gi;

const EN_PRODUCT_PATH_RE =
  /^https:\/\/www\.stigasports\.com\/en\/product\/[a-z0-9][a-z0-9-]*$/i;

export function parseStigaSitemapIndex(xml: string): string[] {
  const out: string[] = [];
  SITEMAP_LOC_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = SITEMAP_LOC_RE.exec(xml)) !== null) {
    out.push(m[1].trim());
  }
  return out;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function slugFromUrl(url: string): string {
  // Final-segment slug. "/en/product/carbonado-45" → "carbonado-45".
  const path = new URL(url).pathname;
  return path.split("/").filter(Boolean).pop() ?? "";
}

function slugToTitle(slug: string): string {
  // Cosmetic title for run-log / proposal display. Tokens are still
  // derived by disambiguate.ts from the URL slug, so this title is for
  // humans, not for matching logic.
  return slug
    .split("-")
    .filter(Boolean)
    .map(t => (t.length > 0 ? t.charAt(0).toUpperCase() + t.slice(1) : t))
    .join(" ");
}

export function parseStigaProductSitemap(xml: string): SpecCandidate[] {
  const seen = new Set<string>();
  const out: SpecCandidate[] = [];
  URL_LOC_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = URL_LOC_RE.exec(xml)) !== null) {
    const url = decodeEntities(m[1].trim());
    if (!EN_PRODUCT_PATH_RE.test(url)) continue;
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

export interface StigaDeps {
  fetchImpl?: typeof fetch;
}

export function makeStigaSource(deps: StigaDeps = {}): SpecSource {
  const opts: Pick<HttpFetchOptions, "fetchImpl"> = {
    fetchImpl: deps.fetchImpl,
  };
  // Per-source-instance cache of every /en/product/* candidate. Built
  // once, reused for the worker isolate's lifetime. Failed builds
  // self-evict so a transient 5xx doesn't silence the source.
  let catalogPromise: Promise<SpecCandidate[]> | null = null;

  async function fetchXml(url: string): Promise<string> {
    const res = await httpFetch(url, opts);
    if (!res.ok) {
      throw new Error(`stiga fetch ${url} returned HTTP ${res.status}`);
    }
    return res.text();
  }

  async function buildCatalog(): Promise<SpecCandidate[]> {
    const indexXml = await fetchXml(SITEMAP_INDEX_URL);
    const sitemapUrls = parseStigaSitemapIndex(indexXml);
    if (sitemapUrls.length === 0) {
      // The index always points at at least one urlset. Empty means
      // Stiga changed the sitemap shape — surface it loudly rather than
      // silently fall through to "0 candidates" forever.
      throw new Error(
        `stiga sitemap index at ${SITEMAP_INDEX_URL} listed no urlsets`
      );
    }
    const all: SpecCandidate[] = [];
    const seen = new Set<string>();
    for (const url of sitemapUrls) {
      const xml = await fetchXml(url);
      for (const candidate of parseStigaProductSitemap(xml)) {
        if (seen.has(candidate.url)) continue;
        seen.add(candidate.url);
        all.push(candidate);
      }
    }
    return all;
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
    id: "stiga",
    kind: "manufacturer",
    tier: 1,
    brand: "Stiga",
    // Per-equipment URL doesn't exist for sitemap-based discovery — the
    // search hits the index, not a query endpoint. Returning the index
    // URL gives moderators a useful jumping-off point in the run log.
    searchUrl(): string {
      return SITEMAP_INDEX_URL;
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
          `stiga fetch ${candidateUrl} returned HTTP ${res.status}`
        );
      }
      const html = await res.text();
      return { html, finalUrl: res.url || candidateUrl };
    },
  };
}

export const stigaSource: SpecSource = makeStigaSource();

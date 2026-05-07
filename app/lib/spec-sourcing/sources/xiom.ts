// Xiom tier-1 manufacturer adapter (TT-178). Targets xiom.eu — a Wix
// site with no functional /search endpoint. The brand exposes flat-slug
// product URLs at the root domain (e.g. https://www.xiom.eu/omega8-pro)
// that are linked from a small set of category index pages: /rubber and
// /blade. /catalog is a nav page without product anchors and /etc is
// empty of products.
//
// Adapter shape (different from the search-endpoint adapters): on each
// search() the adapter routes equipment.category to a category index
// path, fetches that index page once per source instance, parses every
// gallery anchor, and caches the result. Subsequent searches that route
// to the same category reuse the cached parse. Equipment whose category
// isn't blade or rubber returns no candidates — Xiom's catalogue is
// fully covered by those two pages, so anything else falls outside our
// scope.
//
// Anchor structure (Wix Stores gallery):
//
//   <a data-testid="gallery-item-click-action-link"
//      href="https://www.xiom.eu/<slug>" ...>
//     ... image with alt="PRODUCT NAME" ...
//     <div data-testid="gallery-item-title" ...>PRODUCT NAME</div>
//   </a>
//
// We key on the title-bearing div rather than the image alt because Wix
// occasionally renders alt as a generic placeholder; the panel title is
// the displayed product name and is reliable.
//
// Token filtering inside search() narrows the (typically 30+) products
// in a category page to those whose title or slug contains every token
// from equipment.name. The disambiguate.ts prefilter then runs the
// stricter no-extra-tokens rule on what we return.

import { httpFetch, type HttpFetchOptions } from "./http";
import type { EquipmentRef, SpecCandidate, SpecSource } from "./types";

const XIOM_BASE = "https://www.xiom.eu";

// Anchor regex: matches one gallery product card.
//   group 1 = product URL (https://www.xiom.eu/<slug>)
//   group 2 = displayed product name (gallery-item-title div text)
// The body between is image markup and panel divs — no nested <a>, so
// the lazy `[\s\S]*?` is bounded by the closing </a> per anchor.
const PRODUCT_ANCHOR_RE =
  /<a\s+data-testid=["']gallery-item-click-action-link["']\s+href=["'](https:\/\/www\.xiom\.eu\/[^"']+)["'][^>]*>[\s\S]*?<div\s+data-testid=["']gallery-item-title["'][^>]*>\s*([^<]+?)\s*<\/div>[\s\S]*?<\/a>/gi;

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ");
}

function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

// Final-segment-only URL token extractor. Mirrors disambiguate.ts so
// the in-adapter token filter behaves consistently with the downstream
// prefilter.
function urlSlugTokens(url: string): string[] {
  let pathname: string;
  try {
    pathname = new URL(url).pathname;
  } catch {
    return [];
  }
  const slug = pathname.split("/").filter(Boolean).pop() ?? "";
  return tokenize(slug);
}

export function parseXiomCategoryIndex(html: string): SpecCandidate[] {
  const seen = new Set<string>();
  const out: SpecCandidate[] = [];
  PRODUCT_ANCHOR_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = PRODUCT_ANCHOR_RE.exec(html)) !== null) {
    const url = m[1];
    if (seen.has(url)) continue;
    seen.add(url);
    out.push({
      url,
      title: decodeEntities(m[2]).replace(/\s+/g, " ").trim(),
    });
  }
  return out;
}

function categoryPath(equipment: EquipmentRef): string | null {
  const c = (equipment.category ?? "").toLowerCase();
  if (c === "rubber") return "/rubber";
  if (c === "blade") return "/blade";
  return null;
}

export interface XiomDeps {
  fetchImpl?: typeof fetch;
}

export function makeXiomSource(deps: XiomDeps = {}): SpecSource {
  const opts: Pick<HttpFetchOptions, "fetchImpl"> = {
    fetchImpl: deps.fetchImpl,
  };
  // Per-source-instance cache: category path → in-flight or resolved
  // candidate list. In production the singleton xiomSource lives for
  // the worker isolate's lifetime, so this gives us "fetch each category
  // once per isolate" without leaking state across test instances.
  const indexCache = new Map<string, Promise<SpecCandidate[]>>();

  async function loadCategory(path: string): Promise<SpecCandidate[]> {
    let cached = indexCache.get(path);
    if (!cached) {
      cached = (async () => {
        const url = `${XIOM_BASE}${path}`;
        const res = await httpFetch(url, opts);
        if (!res.ok) {
          throw new Error(`xiom index ${url} returned HTTP ${res.status}`);
        }
        return parseXiomCategoryIndex(await res.text());
      })().catch(err => {
        // Drop the failed promise from the cache so the next search()
        // gets a fresh attempt instead of a permanently-poisoned cache.
        indexCache.delete(path);
        throw err;
      });
      indexCache.set(path, cached);
    }
    return cached;
  }

  return {
    id: "xiom",
    kind: "manufacturer",
    tier: 1,
    brand: "Xiom",
    searchUrl(equipment: EquipmentRef): string {
      const path = categoryPath(equipment) ?? "/catalog";
      return `${XIOM_BASE}${path}`;
    },
    async search(equipment: EquipmentRef): Promise<SpecCandidate[]> {
      const path = categoryPath(equipment);
      if (!path) return [];
      const all = await loadCategory(path);
      const seedTokens = tokenize(equipment.name);
      if (seedTokens.length === 0) return [];
      const matches: SpecCandidate[] = [];
      for (const c of all) {
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
          `xiom fetch ${candidateUrl} returned HTTP ${res.status}`
        );
      }
      const html = await res.text();
      return { html, finalUrl: res.url || candidateUrl };
    },
  };
}

export const xiomSource: SpecSource = makeXiomSource();

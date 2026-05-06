// Joola tier-1 manufacturer adapter (TT-152). Targets joola.com — the
// US Shopify storefront (the .com is JOOLA USA; the German JOOLA site
// runs at joola.de but the .com catalog covers the table-tennis line
// we care about and is reachable from outside the US). Search uses
// `/search?q=<q>` and returns SSR product cards. The parser keys on
// the title-bearing anchor:
//
//   <a class="product-link text-capitalize" role="button"
//      title="..." aria-label="..."
//      href="/products/<slug>?_pos=&_sid=&_ss="> TITLE </a>
//
// Each card also carries a separate image-only anchor at the same
// href; keying on the title-bearing anchor naturally avoids the
// duplicate without href dedup.
//
// The `_pos` / `_sid` / `_ss` query params are Shopify session-tracking
// noise that vary per request. The adapter strips them so the candidate
// URL is the canonical product URL — keeps the proposal row clean and
// the admin UI link sensible.
//
// Joola also sells pickleball gear which mixes into the search
// results; the disambiguate.ts prefilter drops those cleanly because
// "pickleball" / "paddle" are extra tokens not in any blade or rubber
// seed name.

import { httpFetch, type HttpFetchOptions } from "./http";
import type { EquipmentRef, SpecCandidate, SpecSource } from "./types";

const JOOLA_BASE = "https://www.joola.com";

const PRODUCT_LINK_RE =
  /<a\s+class=["']product-link\s+text-capitalize["']\s+role=["']button["']\s+title=["']([^"']+)["']\s+aria-label=["'][^"']*["']\s+href=["'](\/products\/[^"']+)["'][^>]*>\s*([^<]+?)\s*<\/a>/gi;

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ");
}

function stripShopifyTracking(url: string): string {
  // Drop `?_pos=&_sid=&_ss=` query and anything after — these are
  // Shopify per-request session-tracking params, not part of the
  // product's canonical URL.
  const q = url.indexOf("?");
  return q === -1 ? url : url.slice(0, q);
}

export function parseJoolaSearchResults(
  html: string,
  limit = 5
): SpecCandidate[] {
  const seen = new Set<string>();
  const out: SpecCandidate[] = [];
  PRODUCT_LINK_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = PRODUCT_LINK_RE.exec(html)) !== null) {
    const cleanPath = stripShopifyTracking(m[2]);
    const url = `${JOOLA_BASE}${cleanPath}`;
    if (seen.has(url)) continue;
    seen.add(url);
    out.push({
      url,
      title: decodeEntities(m[1]).replace(/\s+/g, " ").trim(),
    });
    if (out.length >= limit) break;
  }
  return out;
}

export interface JoolaDeps {
  fetchImpl?: typeof fetch;
}

export function makeJoolaSource(deps: JoolaDeps = {}): SpecSource {
  const opts: Pick<HttpFetchOptions, "fetchImpl"> = {
    fetchImpl: deps.fetchImpl,
  };
  const queryUrl = (equipment: EquipmentRef): string => {
    const q = encodeURIComponent(equipment.name);
    return `${JOOLA_BASE}/search?q=${q}`;
  };

  return {
    id: "joola",
    kind: "manufacturer",
    tier: 1,
    brand: "Joola",
    searchUrl: queryUrl,
    async search(equipment: EquipmentRef): Promise<SpecCandidate[]> {
      const url = queryUrl(equipment);
      const res = await httpFetch(url, opts);
      if (!res.ok) {
        throw new Error(`joola search ${url} returned HTTP ${res.status}`);
      }
      return parseJoolaSearchResults(await res.text(), 5);
    },
    async fetch(candidateUrl: string) {
      const res = await httpFetch(candidateUrl, opts);
      if (!res.ok) {
        throw new Error(
          `joola fetch ${candidateUrl} returned HTTP ${res.status}`
        );
      }
      const html = await res.text();
      return { html, finalUrl: res.url || candidateUrl };
    },
  };
}

export const joolaSource: SpecSource = makeJoolaSource();

// Nittaku tier-1 manufacturer adapter (TT-183). Targets nittaku.tt — the
// brand's English/EU Shopify storefront. The brief originally referenced
// nittaku.com but that's the Japanese-only manufacturer site whose
// product names are rendered in katakana ('スタリア', 'レグノス'); seed
// names like 'Acoustic' and 'Fastarc G-1' have no Roman surface there
// and disambiguate.ts's tokenizer strips non-ASCII, so matching from
// .com would yield zero hits across the catalog.
//
// nittaku.tt runs the standard Shopify Dawn theme. /en/search?q=<q>
// returns SSR product cards. The title-bearing anchor is:
//
//   <a href="/en/products/<slug>?_pos=…&_sid=…&_ss=…"
//      class="product-item__title text--strong link">
//     Nittaku Acoustic Carbon Inner G-Revision
//   </a>
//
// Each card also carries image, review-badge, and "Choose options"
// anchors at the same href; keying on the product-item__title class
// dedupes naturally without href-equality tracking. The `_pos` / `_sid`
// / `_ss` query params are Shopify per-request session tracking — the
// adapter strips them so the candidate URL is the canonical product
// URL, mirroring the Joola adapter (TT-152).

import { httpFetch, type HttpFetchOptions } from "./http";
import type { EquipmentRef, SpecCandidate, SpecSource } from "./types";

const NITTAKU_BASE = "https://nittaku.tt";

const PRODUCT_LINK_RE =
  /<a\s+href=["'](\/en\/products\/[^"']+)["']\s+class=["'][^"']*\bproduct-item__title\b[^"']*["'][^>]*>\s*([^<]+?)\s*<\/a>/gi;

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
  // Drop `?_pos=&_sid=&_ss=` and anything after — Shopify per-request
  // session-tracking params, not part of the product's canonical URL.
  const q = url.indexOf("?");
  return q === -1 ? url : url.slice(0, q);
}

export function parseNittakuSearchResults(
  html: string,
  limit = 5
): SpecCandidate[] {
  const seen = new Set<string>();
  const out: SpecCandidate[] = [];
  PRODUCT_LINK_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = PRODUCT_LINK_RE.exec(html)) !== null) {
    const cleanPath = stripShopifyTracking(m[1]);
    const url = `${NITTAKU_BASE}${cleanPath}`;
    if (seen.has(url)) continue;
    seen.add(url);
    out.push({
      url,
      title: decodeEntities(m[2]).replace(/\s+/g, " ").trim(),
    });
    if (out.length >= limit) break;
  }
  return out;
}

export interface NittakuDeps {
  fetchImpl?: typeof fetch;
}

export function makeNittakuSource(deps: NittakuDeps = {}): SpecSource {
  const opts: Pick<HttpFetchOptions, "fetchImpl"> = {
    fetchImpl: deps.fetchImpl,
  };
  const queryUrl = (equipment: EquipmentRef): string => {
    const q = encodeURIComponent(equipment.name);
    return `${NITTAKU_BASE}/en/search?q=${q}`;
  };

  return {
    id: "nittaku",
    kind: "manufacturer",
    tier: 1,
    brand: "Nittaku",
    searchUrl: queryUrl,
    async search(equipment: EquipmentRef): Promise<SpecCandidate[]> {
      const url = queryUrl(equipment);
      const res = await httpFetch(url, opts);
      if (!res.ok) {
        throw new Error(`nittaku search ${url} returned HTTP ${res.status}`);
      }
      return parseNittakuSearchResults(await res.text(), 5);
    },
    async fetch(candidateUrl: string) {
      const res = await httpFetch(candidateUrl, opts);
      if (!res.ok) {
        throw new Error(
          `nittaku fetch ${candidateUrl} returned HTTP ${res.status}`
        );
      }
      const html = await res.text();
      return { html, finalUrl: res.url || candidateUrl };
    },
  };
}

export const nittakuSource: SpecSource = makeNittakuSource();

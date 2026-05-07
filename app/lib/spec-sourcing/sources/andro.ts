// Andro tier-1 manufacturer adapter (TT-181). Targets andro.de — a
// Drupal site with a built-in Search API. The brief flagged that
// /en/search?q= returned 0 results; the right param is
// `search_api_fulltext` (Drupal default), not `q`. Once the param is
// correct, search returns SSR HTML with a result list under
// `<div class="search-result__item">` containers.
//
// Each card has one product anchor:
//
//   <div class="search-result__title">
//     <a class="stretched-link" href="/en/<slug>">
//       PRODUCT NAME
//     </a>
//   </div>
//
// Anchoring the regex on the `search-result__title` wrapper keeps us
// out of any unrelated `stretched-link` anchors that might appear in
// banners, related-product blocks, etc. URLs in the markup are
// site-relative; the parser prepends the host.

import { httpFetch, type HttpFetchOptions } from "./http";
import type { EquipmentRef, SpecCandidate, SpecSource } from "./types";

const ANDRO_BASE = "https://www.andro.de";

const PRODUCT_LINK_RE =
  /<div\s+class=["']search-result__title["']\s*>\s*<a\s+class=["']stretched-link["']\s+href=["'](\/en\/[^"']+)["'][^>]*>\s*([^<]+?)\s*<\/a>/gi;

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ");
}

export function parseAndroSearchResults(
  html: string,
  limit = 5
): SpecCandidate[] {
  const seen = new Set<string>();
  const out: SpecCandidate[] = [];
  PRODUCT_LINK_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = PRODUCT_LINK_RE.exec(html)) !== null) {
    const url = `${ANDRO_BASE}${m[1]}`;
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

export interface AndroDeps {
  fetchImpl?: typeof fetch;
}

export function makeAndroSource(deps: AndroDeps = {}): SpecSource {
  const opts: Pick<HttpFetchOptions, "fetchImpl"> = {
    fetchImpl: deps.fetchImpl,
  };
  const queryUrl = (equipment: EquipmentRef): string => {
    const q = encodeURIComponent(equipment.name);
    return `${ANDRO_BASE}/en/search?search_api_fulltext=${q}`;
  };

  return {
    id: "andro",
    kind: "manufacturer",
    tier: 1,
    brand: "Andro",
    searchUrl: queryUrl,
    async search(equipment: EquipmentRef): Promise<SpecCandidate[]> {
      const url = queryUrl(equipment);
      const res = await httpFetch(url, opts);
      if (!res.ok) {
        throw new Error(`andro search ${url} returned HTTP ${res.status}`);
      }
      return parseAndroSearchResults(await res.text(), 5);
    },
    async fetch(candidateUrl: string) {
      const res = await httpFetch(candidateUrl, opts);
      if (!res.ok) {
        throw new Error(
          `andro fetch ${candidateUrl} returned HTTP ${res.status}`
        );
      }
      const html = await res.text();
      return { html, finalUrl: res.url || candidateUrl };
    },
  };
}

export const androSource: SpecSource = makeAndroSource();

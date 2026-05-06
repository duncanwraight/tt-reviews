// Tibhar tier-1 manufacturer adapter (TT-152). Targets the official
// tibhar.info WooCommerce showroom (the .com domain 301-redirects to
// .info). Search uses WordPress's standard `?s=<q>` and returns SSR
// product cards with two anchors per product — an image-only one and
// a title-bearing one. The parser keys on the title anchor:
//
//   <a href="..." class="premium-woo-product__link">
//     <h2 class="woocommerce-loop-product__title">PRODUCT NAME</h2>
//   </a>
//
// keying on the title-bearing anchor naturally dedupes the per-card
// image anchor without tracking href equality.

import { httpFetch, type HttpFetchOptions } from "./http";
import type { EquipmentRef, SpecCandidate, SpecSource } from "./types";

const TIBHAR_BASE = "https://tibhar.info";

const PRODUCT_LINK_RE =
  /<a\s+href=["']([^"']+)["']\s+class=["']premium-woo-product__link["']\s*>\s*<h2\s+class=["']woocommerce-loop-product__title["']\s*>\s*([^<]+?)\s*<\/h2>\s*<\/a>/gi;

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ");
}

export function parseTibharSearchResults(
  html: string,
  limit = 5
): SpecCandidate[] {
  const seen = new Set<string>();
  const out: SpecCandidate[] = [];
  PRODUCT_LINK_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = PRODUCT_LINK_RE.exec(html)) !== null) {
    const url = m[1];
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

export interface TibharDeps {
  fetchImpl?: typeof fetch;
}

export function makeTibharSource(deps: TibharDeps = {}): SpecSource {
  const opts: Pick<HttpFetchOptions, "fetchImpl"> = {
    fetchImpl: deps.fetchImpl,
  };
  const queryUrl = (equipment: EquipmentRef): string => {
    const q = encodeURIComponent(equipment.name);
    return `${TIBHAR_BASE}/?s=${q}`;
  };

  return {
    id: "tibhar",
    kind: "manufacturer",
    tier: 1,
    brand: "Tibhar",
    searchUrl: queryUrl,
    async search(equipment: EquipmentRef): Promise<SpecCandidate[]> {
      const url = queryUrl(equipment);
      const res = await httpFetch(url, opts);
      if (!res.ok) {
        throw new Error(`tibhar search ${url} returned HTTP ${res.status}`);
      }
      return parseTibharSearchResults(await res.text(), 5);
    },
    async fetch(candidateUrl: string) {
      const res = await httpFetch(candidateUrl, opts);
      if (!res.ok) {
        throw new Error(
          `tibhar fetch ${candidateUrl} returned HTTP ${res.status}`
        );
      }
      const html = await res.text();
      return { html, finalUrl: res.url || candidateUrl };
    },
  };
}

export const tibharSource: SpecSource = makeTibharSource();

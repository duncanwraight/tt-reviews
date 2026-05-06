// Donic tier-1 manufacturer adapter (TT-152). Targets the official
// donic.com Shopware storefront. Search uses /search?search=<q> and
// returns SSR product cards whose primary anchor is
// `<a class="product-name stretched-link" href="..." title="...">NAME</a>`.
// Each product card duplicates the href on a "Details" button anchor
// — the parser picks only the title-bearing primary anchor to avoid
// double-counting.

import { httpFetch, type HttpFetchOptions } from "./http";
import type { EquipmentRef, SpecCandidate, SpecSource } from "./types";

const DONIC_BASE = "https://www.donic.com";

// Product card anchor: `class="product-name stretched-link"` (we accept
// any class string containing "product-name" to tolerate Shopware theme
// tweaks), with both `title` and inner text. We key on the title-bearing
// anchor so the per-card "Details" button (no title attribute) is
// ignored — keeps dedupe to one entry per product without relying on
// href equality.
const PRODUCT_LINK_RE =
  /<a\s+href=["']([^"']+)["']\s+title=["']([^"']+)["']\s+class=["'][^"']*product-name[^"']*["'][^>]*>\s*([^<]+?)\s*<\/a>/gi;

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ");
}

export function parseDonicSearchResults(
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

export interface DonicDeps {
  fetchImpl?: typeof fetch;
}

export function makeDonicSource(deps: DonicDeps = {}): SpecSource {
  const opts: Pick<HttpFetchOptions, "fetchImpl"> = {
    fetchImpl: deps.fetchImpl,
  };
  const queryUrl = (equipment: EquipmentRef): string => {
    const q = encodeURIComponent(equipment.name);
    return `${DONIC_BASE}/search?search=${q}`;
  };

  return {
    id: "donic",
    kind: "manufacturer",
    tier: 1,
    brand: "Donic",
    searchUrl: queryUrl,
    async search(equipment: EquipmentRef): Promise<SpecCandidate[]> {
      const url = queryUrl(equipment);
      const res = await httpFetch(url, opts);
      if (!res.ok) {
        throw new Error(`donic search ${url} returned HTTP ${res.status}`);
      }
      return parseDonicSearchResults(await res.text(), 5);
    },
    async fetch(candidateUrl: string) {
      const res = await httpFetch(candidateUrl, opts);
      if (!res.ok) {
        throw new Error(
          `donic fetch ${candidateUrl} returned HTTP ${res.status}`
        );
      }
      const html = await res.text();
      return { html, finalUrl: res.url || candidateUrl };
    },
  };
}

export const donicSource: SpecSource = makeDonicSource();

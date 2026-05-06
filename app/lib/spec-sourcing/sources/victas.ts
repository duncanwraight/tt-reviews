// Victas tier-1 manufacturer adapter (TT-152). Targets victas.com,
// the official Japanese-language manufacturer site. Search uses
// `/products/?keyword=<q>` — categories are siloed by `cat=N` (rubbers
// = 3, blades/rackets = 4, etc.) but querying without `cat` returns
// across categories, which is what we want for spec sourcing.
//
// Two Victas-specific quirks the parser handles:
//
// - Product detail URLs are pure numeric IDs (`/products/detail.html?id=781`)
//   — no slug. Disambiguation prefilter (disambiguate.ts) extracts URL
//   slug tokens, so the URL contributes nothing toward matching. We
//   compensate by populating the SpecCandidate.title with both the
//   Japanese-script name (`<p class="item-list__name">`) and the image
//   alt text (`<img alt="...">`) — the alt is often the Roman name
//   ("V>15 Sticky") that the seed equipment carries.
//
// - The image alt for older / catalogue-only products is the generic
//   '製品画像' ("product image") string. That contributes no Roman
//   tokens but doesn't hurt; the prefilter just falls through and
//   those products simply don't get matched, same as if the alt were
//   empty.

import { httpFetch, type HttpFetchOptions } from "./http";
import type { EquipmentRef, SpecCandidate, SpecSource } from "./types";

const VICTAS_BASE = "https://www.victas.com";

const PRODUCT_ITEM_RE =
  /<a\s+href=["'](\/products\/detail\.html\?id=\d+)["']\s+class=["']item-list__item["'][^>]*>[\s\S]*?<img\s+src=["'][^"']*["']\s+alt=["']([^"']*)["'][^>]*>[\s\S]*?<p\s+class=["']item-list__name["']\s*>\s*([^<]+?)\s*<\/p>/gi;

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ");
}

export function parseVictasSearchResults(
  html: string,
  limit = 5
): SpecCandidate[] {
  const seen = new Set<string>();
  const out: SpecCandidate[] = [];
  PRODUCT_ITEM_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = PRODUCT_ITEM_RE.exec(html)) !== null) {
    const url = `${VICTAS_BASE}${m[1]}`;
    if (seen.has(url)) continue;
    seen.add(url);
    const altRaw = decodeEntities(m[2]).replace(/\s+/g, " ").trim();
    const nameRaw = decodeEntities(m[3]).replace(/\s+/g, " ").trim();
    // Concatenate name + alt so disambiguate.ts has access to both the
    // Japanese-script visible name and the (often Roman) image alt
    // text. Skip the generic '製品画像' alt — it adds zero useful
    // tokens and just clutters the title field shown in run-log
    // diagnostics.
    const title =
      altRaw && altRaw !== "製品画像" ? `${nameRaw} ${altRaw}` : nameRaw;
    out.push({ url, title });
    if (out.length >= limit) break;
  }
  return out;
}

export interface VictasDeps {
  fetchImpl?: typeof fetch;
}

export function makeVictasSource(deps: VictasDeps = {}): SpecSource {
  const opts: Pick<HttpFetchOptions, "fetchImpl"> = {
    fetchImpl: deps.fetchImpl,
  };
  const queryUrl = (equipment: EquipmentRef): string => {
    const q = encodeURIComponent(equipment.name);
    return `${VICTAS_BASE}/products/?keyword=${q}`;
  };

  return {
    id: "victas",
    kind: "manufacturer",
    tier: 1,
    brand: "Victas",
    searchUrl: queryUrl,
    async search(equipment: EquipmentRef): Promise<SpecCandidate[]> {
      const url = queryUrl(equipment);
      const res = await httpFetch(url, opts);
      if (!res.ok) {
        throw new Error(`victas search ${url} returned HTTP ${res.status}`);
      }
      return parseVictasSearchResults(await res.text(), 5);
    },
    async fetch(candidateUrl: string) {
      const res = await httpFetch(candidateUrl, opts);
      if (!res.ok) {
        throw new Error(
          `victas fetch ${candidateUrl} returned HTTP ${res.status}`
        );
      }
      const html = await res.text();
      return { html, finalUrl: res.url || candidateUrl };
    },
  };
}

export const victasSource: SpecSource = makeVictasSource();

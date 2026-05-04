// Butterfly tier-1 manufacturer adapter (TT-147). Targets the
// official English Butterfly online store at en.butterfly.tt — the
// brand's own Magento storefront. The brief originally referenced
// `butterfly-global.com`, but that domain is a regional directory
// only; en.butterfly.tt is the actual product catalogue.
//
// Search hits Magento's catalogsearch endpoint (q=) and the result
// page lists product-item-link anchors that the shared
// parseMagentoSearchResults helper extracts.

import { httpFetch, type HttpFetchOptions } from "./http";
import { parseMagentoSearchResults } from "./magento";
import type { EquipmentRef, SpecCandidate, SpecSource } from "./types";

const BUTTERFLY_BASE = "https://en.butterfly.tt";

export interface ButterflyDeps {
  fetchImpl?: typeof fetch;
}

export function makeButterflySource(deps: ButterflyDeps = {}): SpecSource {
  const opts: Pick<HttpFetchOptions, "fetchImpl"> = {
    fetchImpl: deps.fetchImpl,
  };
  const queryUrl = (equipment: EquipmentRef): string => {
    const q = encodeURIComponent(equipment.name);
    return `${BUTTERFLY_BASE}/catalogsearch/result/?q=${q}`;
  };

  return {
    id: "butterfly",
    kind: "manufacturer",
    tier: 1,
    brand: "Butterfly",
    searchUrl: queryUrl,
    async search(equipment: EquipmentRef): Promise<SpecCandidate[]> {
      // No silent failures (TT-162): throw on transport / non-OK so
      // the queue consumer's catch records a 'search.failed' run-log
      // entry with the actual reason. Returning [] would have looked
      // like "0 organic results" — those have very different fixes.
      const url = queryUrl(equipment);
      const res = await httpFetch(url, opts);
      if (!res.ok) {
        throw new Error(`butterfly search ${url} returned HTTP ${res.status}`);
      }
      return parseMagentoSearchResults(await res.text(), 5);
    },
    async fetch(candidateUrl: string) {
      const res = await httpFetch(candidateUrl, opts);
      if (!res.ok) {
        throw new Error(
          `butterfly fetch ${candidateUrl} returned HTTP ${res.status}`
        );
      }
      const html = await res.text();
      return { html, finalUrl: res.url || candidateUrl };
    },
  };
}

export const butterflySource: SpecSource = makeButterflySource();

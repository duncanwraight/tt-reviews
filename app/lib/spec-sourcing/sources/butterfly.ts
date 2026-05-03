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
  return {
    id: "butterfly",
    kind: "manufacturer",
    tier: 1,
    brand: "Butterfly",
    async search(equipment: EquipmentRef): Promise<SpecCandidate[]> {
      const q = encodeURIComponent(equipment.name);
      const url = `${BUTTERFLY_BASE}/catalogsearch/result/?q=${q}`;
      try {
        const res = await httpFetch(url, opts);
        if (!res.ok) return [];
        return parseMagentoSearchResults(await res.text(), 5);
      } catch {
        return [];
      }
    },
    async fetch(candidateUrl: string) {
      const res = await httpFetch(candidateUrl, opts);
      const html = await res.text();
      return { html, finalUrl: res.url || candidateUrl };
    },
  };
}

export const butterflySource: SpecSource = makeButterflySource();

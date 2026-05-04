// TT11 tier-2 retailer adapter (TT-147). Targets tabletennis11.com,
// the largest English-language Magento storefront for table-tennis
// equipment. Same Magento search shape as Butterfly, just a different
// base URL and slugs that don't carry a .html extension.

import { httpFetch, type HttpFetchOptions } from "./http";
import { parseMagentoSearchResults } from "./magento";
import type { EquipmentRef, SpecCandidate, SpecSource } from "./types";

const TT11_BASE = "https://www.tabletennis11.com";

export interface Tt11Deps {
  fetchImpl?: typeof fetch;
}

export function makeTt11Source(deps: Tt11Deps = {}): SpecSource {
  const opts: Pick<HttpFetchOptions, "fetchImpl"> = {
    fetchImpl: deps.fetchImpl,
  };
  const queryUrl = (equipment: EquipmentRef): string => {
    const q = encodeURIComponent(`${equipment.brand} ${equipment.name}`);
    return `${TT11_BASE}/catalogsearch/result/?q=${q}`;
  };

  return {
    id: "tt11",
    kind: "retailer",
    tier: 2,
    searchUrl: queryUrl,
    async search(equipment: EquipmentRef): Promise<SpecCandidate[]> {
      // No silent failures (TT-162): throw on transport / non-OK.
      const url = queryUrl(equipment);
      const res = await httpFetch(url, opts);
      if (!res.ok) {
        throw new Error(`tt11 search ${url} returned HTTP ${res.status}`);
      }
      return parseMagentoSearchResults(await res.text(), 5);
    },
    async fetch(candidateUrl: string) {
      const res = await httpFetch(candidateUrl, opts);
      if (!res.ok) {
        throw new Error(
          `tt11 fetch ${candidateUrl} returned HTTP ${res.status}`
        );
      }
      const html = await res.text();
      return { html, finalUrl: res.url || candidateUrl };
    },
  };
}

export const tt11Source: SpecSource = makeTt11Source();

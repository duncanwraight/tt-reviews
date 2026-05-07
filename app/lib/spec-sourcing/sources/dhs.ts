// DHS tier-1 manufacturer adapter (TT-182). Targets dhs-tt.com — the
// brand's English Magento storefront. The brief flagged a 403 against
// the site from WebFetch; that's specifically WebFetch's IP, not the
// general internet. curl from a typical client gets 200 OK and the
// site behaves like any other Magento catalogsearch.
//
// Adapter is search-shape (mirrors butterfly.ts): /dhs_en/catalogsearch/
// returns SSR HTML with `<a class="product-item-link">` cards that the
// shared parseMagentoSearchResponse helper extracts. Single-result
// auto-redirect off /catalogsearch/ is already handled by that helper
// (TT-176).
//
// Post-deploy validation is on the brief: confirm the production
// Worker's outbound fetch from Cloudflare edge IPs isn't blocked. If
// it is, file a follow-up to add a User-Agent override or skip DHS
// permanently.

import { httpFetch, type HttpFetchOptions } from "./http";
import { parseMagentoSearchResponse } from "./magento";
import type { EquipmentRef, SpecCandidate, SpecSource } from "./types";

const DHS_BASE = "https://dhs-tt.com";

export interface DhsDeps {
  fetchImpl?: typeof fetch;
}

export function makeDhsSource(deps: DhsDeps = {}): SpecSource {
  const opts: Pick<HttpFetchOptions, "fetchImpl"> = {
    fetchImpl: deps.fetchImpl,
  };
  const queryUrl = (equipment: EquipmentRef): string => {
    const q = encodeURIComponent(equipment.name);
    return `${DHS_BASE}/dhs_en/catalogsearch/result/?q=${q}`;
  };

  return {
    id: "dhs",
    kind: "manufacturer",
    tier: 1,
    brand: "DHS",
    searchUrl: queryUrl,
    async search(equipment: EquipmentRef): Promise<SpecCandidate[]> {
      const url = queryUrl(equipment);
      const res = await httpFetch(url, opts);
      if (!res.ok) {
        throw new Error(`dhs search ${url} returned HTTP ${res.status}`);
      }
      return parseMagentoSearchResponse(
        await res.text(),
        res.url || url,
        url,
        5
      );
    },
    async fetch(candidateUrl: string) {
      const res = await httpFetch(candidateUrl, opts);
      if (!res.ok) {
        throw new Error(
          `dhs fetch ${candidateUrl} returned HTTP ${res.status}`
        );
      }
      const html = await res.text();
      return { html, finalUrl: res.url || candidateUrl };
    },
  };
}

export const dhsSource: SpecSource = makeDhsSource();

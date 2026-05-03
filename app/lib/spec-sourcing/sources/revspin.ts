// RevSpin tier-3 review-database adapter (TT-147). Reuses the
// existing list crawler in app/lib/revspin.server.ts (originally built
// for the photo-sourcing RevSpin provider, TT-94). RevSpin doesn't
// expose a working search endpoint — its /search/ path 404s — so we
// pull the full per-category listing once per Worker isolate, cache
// it for 30 minutes, and match by exact slug or normalised name.
//
// The list-page row carries the rating numbers (speed/spin/control/
// overall) used for the prefilter's plausibility check, but the spec
// extractor (TT-148) wants the product detail page HTML, so `fetch`
// re-fetches the URL via our shared http helper rather than reusing
// the photo-sourcing's image-only `fetchProductImageUrl`.

import {
  fetchProductList,
  type RevspinCategory,
  type RevspinListItem,
} from "../../revspin.server";
import { httpFetch, type HttpFetchOptions } from "./http";
import type { EquipmentRef, SpecCandidate, SpecSource } from "./types";

const LIST_CACHE_TTL_MS = 30 * 60 * 1000;

interface ListCacheEntry {
  items: RevspinListItem[];
  expiresAt: number;
}

const listCache = new Map<RevspinCategory, ListCacheEntry>();

// Test seam — clears the in-memory list cache.
export function _clearRevspinListCache(): void {
  listCache.clear();
}

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function mapCategory(
  category: string | undefined,
  subcategory: string | null | undefined
): RevspinCategory | null {
  if (category === "blade") return "blade";
  if (category === "rubber") {
    if (subcategory === "long_pips") return "pips_long";
    if (subcategory === "short_pips") return "pips_short";
    return "rubber";
  }
  return null;
}

async function getCachedList(
  category: RevspinCategory,
  fetchListFn: typeof fetchProductList,
  now: number
): Promise<RevspinListItem[]> {
  const hit = listCache.get(category);
  if (hit && hit.expiresAt > now) return hit.items;
  const items = await fetchListFn(category);
  listCache.set(category, { items, expiresAt: now + LIST_CACHE_TTL_MS });
  return items;
}

function findMatches(
  items: RevspinListItem[],
  equipment: EquipmentRef,
  limit: number
): RevspinListItem[] {
  const slugKey = equipment.slug;
  const nameKey = normalize(`${equipment.brand} ${equipment.name}`);
  const bareNameKey = normalize(equipment.name);
  const out: RevspinListItem[] = [];
  const seen = new Set<string>();
  for (const item of items) {
    if (out.length >= limit) break;
    const itemNameKey = normalize(item.name);
    const slugMatch = slugKey != null && item.slug === slugKey;
    const nameMatch =
      itemNameKey === nameKey ||
      itemNameKey === bareNameKey ||
      itemNameKey.includes(bareNameKey);
    if (!slugMatch && !nameMatch) continue;
    if (seen.has(item.url)) continue;
    seen.add(item.url);
    out.push(item);
  }
  return out;
}

export interface RevspinSourceDeps {
  fetchListFn?: typeof fetchProductList;
  fetchImpl?: typeof fetch;
  now?: () => number;
}

export function makeRevspinSource(deps: RevspinSourceDeps = {}): SpecSource {
  const fetchListFn = deps.fetchListFn ?? fetchProductList;
  const now = deps.now ?? (() => Date.now());
  const httpOpts: Pick<HttpFetchOptions, "fetchImpl"> = {
    fetchImpl: deps.fetchImpl,
  };

  return {
    id: "revspin",
    kind: "review",
    tier: 3,
    async search(equipment: EquipmentRef): Promise<SpecCandidate[]> {
      const category = mapCategory(equipment.category, equipment.subcategory);
      if (!category) return [];
      let list: RevspinListItem[];
      try {
        list = await getCachedList(category, fetchListFn, now());
      } catch {
        return [];
      }
      const matches = findMatches(list, equipment, 5);
      return matches.map(item => ({ url: item.url, title: item.name }));
    },
    async fetch(candidateUrl: string) {
      const res = await httpFetch(candidateUrl, httpOpts);
      const html = await res.text();
      return { html, finalUrl: res.url || candidateUrl };
    },
  };
}

export const revspinSource: SpecSource = makeRevspinSource();

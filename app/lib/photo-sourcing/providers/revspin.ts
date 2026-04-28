// RevspinProvider — direct-crawl provider for revspin.net (TT-94).
// Reuses the existing crawler in app/lib/revspin.server.ts; this file
// just wraps it in the Provider interface.
//
// Strategy: revspin doesn't expose a search endpoint (its /search/
// path 404s), so we work off the category listing. The list per
// category is large (~3000 blades, ~3000 rubbers) but stable, so we
// memoise it per Worker isolate with a 30-minute TTL. A queue
// consumer running max_concurrency=1 stays in one isolate for a
// while, so the cache pays off across messages.
//
// Matching priority:
//   1. Exact slug match (our DB slug == revspin slug; common case
//      because both follow `<manufacturer>-<product>` shape).
//   2. Normalised name match (lowercase, alphanumeric only) as a
//      fallback for slug drift.
// On match → fetch the product detail page → extract og:image →
// return as a tier-1 trailing candidate.

import {
  fetchProductImageUrl,
  fetchProductList,
  type RevspinCategory,
  type RevspinListItem,
} from "../../revspin.server";
import type { ResolvedCandidate, EquipmentSeed } from "../brave.server";
import type { SourcingEnv } from "../source.server";
import type { Provider, ProviderOptions, ProviderResult } from "./types";

const LIST_CACHE_TTL_MS = 30 * 60 * 1000;

interface ListCacheEntry {
  items: RevspinListItem[];
  expiresAt: number;
}

const listCache = new Map<RevspinCategory, ListCacheEntry>();

// Test seam — clears the in-memory list cache. Production code never
// calls it; isolated unit tests use it to control TTL behaviour.
export function _clearListCache(): void {
  listCache.clear();
}

async function getCachedList(
  category: RevspinCategory,
  fetchFn: typeof fetchProductList,
  now: number
): Promise<RevspinListItem[]> {
  const hit = listCache.get(category);
  if (hit && hit.expiresAt > now) return hit.items;
  const items = await fetchFn(category);
  listCache.set(category, { items, expiresAt: now + LIST_CACHE_TTL_MS });
  return items;
}

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

// Map our DB category/subcategory → revspin's category enum. Returns
// null when the seed maps to something revspin doesn't index (e.g.,
// balls aren't in the listing).
function mapCategory(
  category: string,
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

interface MatchSearchSeed extends EquipmentSeed {
  subcategory?: string | null;
}

function findMatch(
  items: RevspinListItem[],
  seed: MatchSearchSeed
): RevspinListItem | null {
  const exact = items.find(i => i.slug === seed.slug);
  if (exact) return exact;
  const seedKey = normalize(seed.name);
  return items.find(i => normalize(i.name) === seedKey) ?? null;
}

export interface RevspinProviderDeps {
  // Test injection. Defaults to the real crawler.
  fetchListFn?: typeof fetchProductList;
  fetchImageFn?: typeof fetchProductImageUrl;
  now?: () => number;
}

export function makeRevspinProvider(deps: RevspinProviderDeps = {}): Provider {
  const fetchListFn = deps.fetchListFn ?? fetchProductList;
  const fetchImageFn = deps.fetchImageFn ?? fetchProductImageUrl;
  const now = deps.now ?? (() => Date.now());

  return {
    name: "revspin",
    async resolveCandidates(
      item: EquipmentSeed,
      _env: SourcingEnv,
      _options: ProviderOptions = {}
    ): Promise<ProviderResult> {
      const seed = item as MatchSearchSeed;
      const category = mapCategory(seed.category, seed.subcategory);
      if (!category) return { status: "ok", candidates: [] };

      const list = await getCachedList(category, fetchListFn, now());
      if (list.length === 0) return { status: "ok", candidates: [] };

      const match = findMatch(list, seed);
      if (!match) return { status: "ok", candidates: [] };

      const imageUrl = await fetchImageFn(match.url);
      if (!imageUrl) return { status: "ok", candidates: [] };

      const candidate: ResolvedCandidate = {
        match: "trailing",
        tier: 1,
        tierLabel: "revspin",
        host: "revspin.net",
        imageUrl,
        pageUrl: match.url,
        source: "revspin",
        title: match.name,
      };
      return { status: "ok", candidates: [candidate] };
    },
  };
}

export const revspinProvider: Provider = makeRevspinProvider();

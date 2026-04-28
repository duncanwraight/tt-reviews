// MegaspinProvider — search-based direct-crawl provider for
// megaspin.net (TT-95). Unlike revspin, megaspin exposes a working
// search endpoint at /store/?product_search=<q>; results are server-
// rendered HTML with cleanly-shaped product cards we can parse.
//
// Result card shape (from a real search page):
//
//   <a href="/store/default.asp?pid=s-airoc-m"><img
//     src="https://cdn.megaspin.net/store/images/products/zoom_s-airoc-m.jpg"
//     alt="Stiga Airoc M" /></a>
//
// The image URL is already absolute and the alt text matches the
// canonical product name. Matching strategy: normalised-name equality
// against the seed's `<manufacturer> <name>` form. We don't auto-pick
// the first result — false positives are worse than empty results in
// the photo-sourcing context.
//
// Politeness: 1.1s between requests via the same module-level
// throttle as revspin.server.ts. No external API quota; no budget
// wrapping needed.

import type { ResolvedCandidate, EquipmentSeed } from "../brave.server";
import type { SourcingEnv } from "../source.server";
import type { Provider, ProviderOptions, ProviderResult } from "./types";

const MEGASPIN_BASE_URL = "https://www.megaspin.net";
const MIN_REQUEST_INTERVAL_MS = 1100;
const USER_AGENT =
  "Mozilla/5.0 (compatible; TT-Reviews-Bot/1.0; +https://tabletennis.reviews)";

let lastRequestTime = 0;

async function rateLimitedFetch(
  url: string,
  fetchImpl: typeof fetch
): Promise<Response> {
  const now = Date.now();
  const wait = MIN_REQUEST_INTERVAL_MS - (now - lastRequestTime);
  if (wait > 0) await new Promise(r => setTimeout(r, wait));
  lastRequestTime = Date.now();
  return fetchImpl(url, {
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "text/html,application/xhtml+xml",
    },
  });
}

export interface MegaspinSearchHit {
  name: string;
  imageUrl: string;
  pageUrl: string;
}

// Parse <a href="/store/default.asp?pid=..."><img src=... alt=... />
// blocks. The product list page also has the same shape but with
// pagination, so this parser works for both.
export function parseMegaspinSearch(html: string): MegaspinSearchHit[] {
  const hits: MegaspinSearchHit[] = [];
  const seen = new Set<string>();
  // Tolerant matcher: anchor → optional whitespace → img with src + alt.
  const re =
    /<a\s+href=["'](\/store\/default\.asp\?pid=[^"']+)["']\s*>\s*<img[^>]+src=["']([^"']+)["'][^>]*\salt=["']([^"']+)["']/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const [, hrefPath, imageUrl, alt] = m;
    const pageUrl = hrefPath.startsWith("http")
      ? hrefPath
      : `${MEGASPIN_BASE_URL}${hrefPath}`;
    if (seen.has(pageUrl)) continue;
    seen.add(pageUrl);
    hits.push({
      name: decodeEntities(alt).trim(),
      imageUrl,
      pageUrl,
    });
  }
  return hits;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code, 10)))
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) =>
      String.fromCharCode(parseInt(hex, 16))
    );
}

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

export interface MegaspinProviderDeps {
  fetchImpl?: typeof fetch;
}

export function makeMegaspinProvider(
  deps: MegaspinProviderDeps = {}
): Provider {
  const fetchImpl = deps.fetchImpl ?? fetch;
  return {
    name: "megaspin",
    async resolveCandidates(
      item: EquipmentSeed,
      _env: SourcingEnv,
      _options: ProviderOptions = {}
    ): Promise<ProviderResult> {
      const query = item.name;
      const url = `${MEGASPIN_BASE_URL}/store/?product_search=${encodeURIComponent(query)}`;

      let html: string;
      try {
        const res = await rateLimitedFetch(url, fetchImpl);
        if (!res.ok) return { status: "ok", candidates: [] };
        html = await res.text();
      } catch {
        return { status: "ok", candidates: [] };
      }

      const hits = parseMegaspinSearch(html);
      const seedKey = normalize(item.name);
      const match = hits.find(h => normalize(h.name) === seedKey);
      if (!match) return { status: "ok", candidates: [] };

      const candidate: ResolvedCandidate = {
        match: "trailing",
        tier: 1,
        tierLabel: "megaspin",
        host: "megaspin.net",
        imageUrl: match.imageUrl,
        pageUrl: match.pageUrl,
        source: "megaspin",
        title: match.name,
      };
      return { status: "ok", candidates: [candidate] };
    },
  };
}

export const megaspinProvider: Provider = makeMegaspinProvider();

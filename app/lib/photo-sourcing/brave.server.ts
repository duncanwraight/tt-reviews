// Brave Image Search → equipment photo candidates. Worker-compatible
// port of the algorithm validated in scripts/photo-sourcing/test-resolver.ts.
//
// The asymmetric matching is the load-bearing trick: Brave's image
// index returns related-product images shown on a page even when the
// query was for a different SKU. So the *image URL* must contain the
// product slug (the false-positive vector), while the manufacturer can
// appear in either the image or the page URL — Shopify-style CDNs
// frequently host product images under hash paths that don't include
// the brand even when the page does.
//
// Source-tier priorities and skip/reject lists are tuned against the
// initial ~290-row equipment seed; see TT-48 parent for rationale.

const USER_AGENT =
  "tt-reviews-photo-sourcer/0.1 (+https://tabletennis.reviews; duncan@wraight-consulting.co.uk)";

const SOURCE_PRIORITY: Array<{ host: RegExp; tier: number; label: string }> = [
  { host: /(^|\.)revspin\.net$/i, tier: 1, label: "revspin" },
  { host: /(^|\.)megaspin\.net$/i, tier: 1, label: "megaspin" },
  { host: /(^|\.)tt-shop\.com$/i, tier: 1, label: "tt-shop" },
  { host: /(^|\.)tabletennis11\.com$/i, tier: 2, label: "tt11" },
  { host: /(^|\.)topspintt\.com$/i, tier: 2, label: "topspintt" },
  { host: /(^|\.)tabletennisdaily\.com$/i, tier: 2, label: "tabletennisdaily" },
  {
    host: /(^|\.)worldoftabletennis\.com$/i,
    tier: 2,
    label: "worldoftabletennis",
  },
  { host: /(^|\.)customtabletennis\.co\.uk$/i, tier: 2, label: "customtt" },
  { host: /(^|\.)contra\.de$/i, tier: 2, label: "contra" },
  { host: /(^|\.)vsport-tt\.com$/i, tier: 2, label: "vsport-tt" },
  { host: /(^|\.)tt-maximum\.com$/i, tier: 2, label: "tt-maximum" },
  { host: /(^|\.)tt123\.nl$/i, tier: 2, label: "tt123" },
  { host: /(^|\.)spinfactory\.de$/i, tier: 2, label: "spinfactory" },
  { host: /(^|\.)nishohi\.com$/i, tier: 2, label: "nishohi" },
  { host: /(^|\.)tabletennisstore\.(us|eu|com)$/i, tier: 3, label: "tts" },
];

const SKIP_HOSTS = [
  /(^|\.)ebay\.[a-z.]+$/i,
  /(^|\.)amazon\.[a-z.]+$/i,
  /(^|\.)alibaba\.com$/i,
  /(^|\.)aliexpress\.com$/i,
];

const REJECT_FILENAME = [
  /og_image\.(png|jpe?g|webp)$/i,
  /og-image\.(png|jpe?g|webp)$/i,
  /social[-_]share/i,
  /Gemini_Generated/i,
  /dall[-_]?e/i,
  /placeholder/i,
];

export interface EquipmentSeed {
  slug: string;
  name: string;
  manufacturer: string;
  category: string;
}

export interface BraveImageResult {
  title: string | null;
  pageUrl: string | null;
  imageUrl: string | null;
  source: string | null;
}

export type CandidateMatchKind =
  | "trailing"
  | "loose"
  | "no-product"
  | "no-manufacturer";

export interface CandidateEval {
  result: BraveImageResult;
  host: string;
  tier: number;
  tierLabel: string;
  match: CandidateMatchKind;
  rejectReason: string | null;
}

// "Yinhe (Galaxy/Milkyway)" → ["yinhe", "galaxy", "milkyway"].
// "Sauer & Troger" → ["sauer", "troger", "sauer troger"].
// "Dr. Neubauer" → ["dr", "neubauer", "dr neubauer"]. The bare "dr" is
// noisy on its own but cheap to keep — the product-token check still
// has to pass for a candidate to be considered.
export function manufacturerKeys(manufacturer: string): string[] {
  const out = new Set<string>();
  const lower = manufacturer.toLowerCase();
  const canonical = lower.replace(/\(.*?\)/g, "").trim();
  if (canonical) out.add(normalize(canonical));
  for (const word of canonical.split(/[^a-z0-9]+/)) {
    if (word.length >= 2) out.add(word);
  }
  const parens = lower.match(/\(([^)]+)\)/);
  if (parens) {
    for (const part of parens[1].split(/[/\s,]+/)) {
      if (part.length >= 2) out.add(part);
    }
  }
  return [...out];
}

// Strip the manufacturer prefix from the seed's `name`. Most seeds
// store names as "<Manufacturer> <Product Name>" (e.g. "Stiga Airoc M")
// — including the brand twice in a query trashes Brave's results
// (Tibhar Ellen Off returned 0 hits with the duplicated query).
export function productKey(item: EquipmentSeed): string {
  const lowerName = item.name.toLowerCase();
  const lowerManu = item.manufacturer.toLowerCase();
  let stripped = lowerName;
  if (stripped.startsWith(lowerManu)) {
    stripped = stripped.slice(lowerManu.length).trim();
  } else {
    const first = item.manufacturer.split(/\s+/)[0]?.toLowerCase();
    if (first && first.length >= 2 && stripped.startsWith(first)) {
      stripped = stripped.slice(first.length).trim();
    }
  }
  return normalize(stripped);
}

export function buildBraveQuery(item: EquipmentSeed): string {
  const product = productKey(item);
  return `${item.manufacturer} ${product} ${item.category}`
    .replace(/\s+/g, " ")
    .trim();
}

function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function pickHost(result: BraveImageResult): string {
  if (result.pageUrl) {
    try {
      return new URL(result.pageUrl).hostname.toLowerCase();
    } catch {
      // fall through
    }
  }
  return (result.source ?? "").toLowerCase();
}

export function classifyHost(host: string): { tier: number; label: string } {
  for (const entry of SOURCE_PRIORITY) {
    if (entry.host.test(host)) return { tier: entry.tier, label: entry.label };
  }
  return { tier: 4, label: "other" };
}

export function evalCandidate(
  item: EquipmentSeed,
  result: BraveImageResult
): CandidateEval {
  const host = pickHost(result);
  const cls = classifyHost(host);
  const base: Omit<CandidateEval, "match" | "rejectReason"> = {
    result,
    host,
    tier: cls.tier,
    tierLabel: cls.label,
  };

  for (const re of SKIP_HOSTS) {
    if (re.test(host)) {
      return {
        ...base,
        match: "no-product",
        rejectReason: `skip-host:${host}`,
      };
    }
  }
  if (!result.imageUrl) {
    return { ...base, match: "no-product", rejectReason: "no-image-url" };
  }
  let imagePathname: string;
  try {
    imagePathname = new URL(result.imageUrl).pathname;
  } catch {
    return { ...base, match: "no-product", rejectReason: "bad-image-url" };
  }
  for (const re of REJECT_FILENAME) {
    if (re.test(imagePathname)) {
      return {
        ...base,
        match: "no-product",
        rejectReason: `filename:${re.source}`,
      };
    }
  }

  const product = productKey(item);
  if (!product) {
    return { ...base, match: "no-product", rejectReason: "no-product-key" };
  }
  const manu = manufacturerKeys(item.manufacturer);

  const imagePathNorm = normalize(imagePathname);
  const productHaystack = ` ${imagePathNorm} `;
  const productNeedle = ` ${product} `;
  if (!productHaystack.includes(productNeedle)) {
    return { ...base, match: "no-product", rejectReason: null };
  }

  const manuPaths = [imagePathNorm];
  if (result.pageUrl) {
    try {
      manuPaths.push(normalize(new URL(result.pageUrl).pathname));
    } catch {
      // skip bad page url
    }
  }
  const manuHaystack = ` ${manuPaths.join(" ")} `;
  const manuPresent = manu.some(k => manuHaystack.includes(` ${k} `));
  if (!manuPresent) {
    return { ...base, match: "no-manufacturer", rejectReason: null };
  }

  const segments = imagePathname.split("/").filter(Boolean);
  const last = segments[segments.length - 1] ?? "";
  const lastBase = last.replace(/\.[a-z0-9]+$/i, "");
  const lastNorm = normalize(lastBase);
  const trailing =
    lastNorm.endsWith(product) &&
    (lastNorm.length === product.length ||
      lastNorm.charAt(lastNorm.length - product.length - 1) === " ");

  return {
    ...base,
    match: trailing ? "trailing" : "loose",
    rejectReason: null,
  };
}

// Filter to accepted candidates (trailing or loose, no rejectReason)
// then sort: trailing first, then by tier ascending. Stable sort
// preserves Brave's original ranking inside each group.
export function rankCandidates(candidates: CandidateEval[]): CandidateEval[] {
  const accepted = candidates.filter(
    c =>
      c.rejectReason === null && (c.match === "trailing" || c.match === "loose")
  );
  return [...accepted].sort((a, b) => {
    const aTrail = a.match === "trailing" ? 0 : 1;
    const bTrail = b.match === "trailing" ? 0 : 1;
    if (aTrail !== bTrail) return aTrail - bTrail;
    return a.tier - b.tier;
  });
}

export function pickBest(candidates: CandidateEval[]): CandidateEval | null {
  return rankCandidates(candidates)[0] ?? null;
}

export interface ResolvedCandidate {
  match: "trailing" | "loose";
  tier: number;
  tierLabel: string;
  host: string;
  imageUrl: string;
  pageUrl: string | null;
  source: string | null;
  title: string | null;
}

function toResolved(c: CandidateEval): ResolvedCandidate {
  return {
    match: c.match as "trailing" | "loose",
    tier: c.tier,
    tierLabel: c.tierLabel,
    host: c.host,
    imageUrl: c.result.imageUrl ?? "",
    pageUrl: c.result.pageUrl,
    source: c.result.source,
    title: c.result.title,
  };
}

export interface BraveImageSearchOptions {
  // Number of raw Brave results to request. Defaults to 20 — enough
  // headroom that the asymmetric filter usually still leaves >0
  // candidates without burning a separate API call.
  count?: number;
  // Optional fetch override for tests.
  fetchImpl?: typeof fetch;
}

interface BraveApiResponseRaw {
  results?: Array<{
    title?: string;
    url?: string;
    source?: string;
    properties?: { url?: string };
    meta_url?: { hostname?: string };
  }>;
}

export async function braveImageSearchRaw(
  query: string,
  apiKey: string,
  options: BraveImageSearchOptions = {}
): Promise<BraveImageResult[]> {
  const url = new URL("https://api.search.brave.com/res/v1/images/search");
  url.searchParams.set("q", query);
  url.searchParams.set("count", String(options.count ?? 20));
  url.searchParams.set("safesearch", "strict");

  const fetchImpl = options.fetchImpl ?? fetch;
  const res = await fetchImpl(url.toString(), {
    headers: {
      "X-Subscription-Token": apiKey,
      Accept: "application/json",
      "User-Agent": USER_AGENT,
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Brave ${res.status}: ${body.slice(0, 200)}`);
  }
  const json = (await res.json()) as BraveApiResponseRaw;
  return (json.results ?? []).map(r => ({
    title: r.title ?? null,
    pageUrl: r.url ?? null,
    imageUrl: r.properties?.url ?? null,
    source: r.source ?? r.meta_url?.hostname ?? null,
  }));
}

export interface ResolveOptions extends BraveImageSearchOptions {
  // Cap the number of accepted candidates returned. Default 6 (matches
  // TT-48c sourcing endpoint per-item budget).
  limit?: number;
}

// Top-level entry point: query Brave, evaluate, rank, return the top N
// accepted candidates as plain DTOs ready for the candidate staging
// table. Returns [] if nothing matches.
export async function resolveBraveCandidates(
  item: EquipmentSeed,
  apiKey: string,
  options: ResolveOptions = {}
): Promise<ResolvedCandidate[]> {
  const query = buildBraveQuery(item);
  const results = await braveImageSearchRaw(query, apiKey, options);
  if (results.length === 0) return [];
  const evaluated = results.map(r => evalCandidate(item, r));
  const ranked = rankCandidates(evaluated);
  const limit = options.limit ?? 6;
  return ranked.slice(0, limit).map(toResolved);
}

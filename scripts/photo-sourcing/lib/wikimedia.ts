// Wikidata + Wikimedia Commons client used by scan.ts.
//
// Why this file exists separately: Wikimedia's Terms of Use require a
// descriptive User-Agent and discourage hammering the API. Centralising
// fetch + rate limit here means every caller is well-behaved by default.
//
// References:
//   - https://meta.wikimedia.org/wiki/User-Agent_policy
//   - https://www.mediawiki.org/wiki/API:Etiquette

const USER_AGENT =
  "tt-reviews-photo-sourcer/0.1 (+https://tabletennis.reviews; duncan@wraight-consulting.co.uk)";

const MIN_GAP_MS = 1000;

let lastRequestAt = 0;

async function rateLimitedFetch(url: string): Promise<Response> {
  const now = Date.now();
  const wait = lastRequestAt + MIN_GAP_MS - now;
  if (wait > 0) {
    await new Promise(resolve => setTimeout(resolve, wait));
  }
  lastRequestAt = Date.now();

  const response = await fetch(url, {
    headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
  });
  if (!response.ok) {
    throw new Error(`Wikimedia ${url} → ${response.status}`);
  }
  return response;
}

interface WbSearchEntitiesHit {
  id: string;
  label?: string;
  description?: string;
  match?: { type: string; text: string };
}

export interface WikidataEntity {
  id: string;
  label: string | null;
  description: string | null;
  imageFilename: string | null;
  enwikiTitle: string | null;
  enwikiUrl: string | null;
}

export async function searchWikidataPlayer(
  name: string
): Promise<WikidataEntity | null> {
  const search = new URL("https://www.wikidata.org/w/api.php");
  search.searchParams.set("action", "wbsearchentities");
  search.searchParams.set("search", name);
  search.searchParams.set("language", "en");
  search.searchParams.set("format", "json");
  search.searchParams.set("limit", "5");
  search.searchParams.set("origin", "*");

  const searchRes = await rateLimitedFetch(search.toString());
  const searchData = (await searchRes.json()) as {
    search: WbSearchEntitiesHit[];
  };
  const hit = pickPlayerHit(searchData.search, name);
  if (!hit) return null;

  return loadEntity(hit.id);
}

function pickPlayerHit(
  hits: WbSearchEntitiesHit[],
  name: string
): WbSearchEntitiesHit | null {
  if (hits.length === 0) return null;

  // Prefer entries whose description mentions table tennis. The
  // wbsearchentities endpoint returns ranked relevance hits; for common
  // names ("Wang Yidi", "Lin Yun-Ju") it's possible to hit a journalist
  // or different sport's player first, so the description filter is the
  // simplest discriminator.
  const tableTennis = hits.find(h => /table tennis/i.test(h.description ?? ""));
  if (tableTennis) return tableTennis;

  // Fallback: exact label match before giving up to the top hit.
  const exact = hits.find(
    h => (h.label ?? "").toLowerCase() === name.toLowerCase()
  );
  return exact ?? hits[0];
}

interface WbGetEntitiesResponse {
  entities: Record<
    string,
    {
      labels?: Record<string, { value: string }>;
      descriptions?: Record<string, { value: string }>;
      claims?: Record<
        string,
        Array<{ mainsnak?: { datavalue?: { value?: unknown } } }>
      >;
      sitelinks?: Record<string, { title: string; url?: string }>;
    }
  >;
}

async function loadEntity(qid: string): Promise<WikidataEntity | null> {
  const url = new URL("https://www.wikidata.org/w/api.php");
  url.searchParams.set("action", "wbgetentities");
  url.searchParams.set("ids", qid);
  url.searchParams.set("props", "labels|descriptions|claims|sitelinks/urls");
  url.searchParams.set("languages", "en");
  url.searchParams.set("sitefilter", "enwiki");
  url.searchParams.set("format", "json");
  url.searchParams.set("origin", "*");

  const res = await rateLimitedFetch(url.toString());
  const data = (await res.json()) as WbGetEntitiesResponse;
  const entity = data.entities[qid];
  if (!entity) return null;

  const p18 = entity.claims?.P18?.[0]?.mainsnak?.datavalue?.value;
  const enwiki = entity.sitelinks?.enwiki;

  return {
    id: qid,
    label: entity.labels?.en?.value ?? null,
    description: entity.descriptions?.en?.value ?? null,
    imageFilename: typeof p18 === "string" ? p18 : null,
    enwikiTitle: enwiki?.title ?? null,
    enwikiUrl: enwiki?.url ?? null,
  };
}

interface PageImagesResponse {
  query?: {
    pages?: Record<
      string,
      {
        pageimage?: string;
        original?: { source?: string; width?: number; height?: number };
      }
    >;
  };
}

export async function fetchEnwikiPageImage(
  enwikiTitle: string
): Promise<string | null> {
  const url = new URL("https://en.wikipedia.org/w/api.php");
  url.searchParams.set("action", "query");
  url.searchParams.set("titles", enwikiTitle);
  url.searchParams.set("prop", "pageimages");
  url.searchParams.set("piprop", "name|original");
  url.searchParams.set("format", "json");
  url.searchParams.set("origin", "*");

  const res = await rateLimitedFetch(url.toString());
  const data = (await res.json()) as PageImagesResponse;
  const pages = data.query?.pages ?? {};
  for (const page of Object.values(pages)) {
    if (page.pageimage) return page.pageimage;
  }
  return null;
}

export interface CommonsImageInfo {
  filename: string;
  url: string;
  filePageUrl: string;
  width: number | null;
  height: number | null;
  mime: string | null;
  size: number | null;
  license: string | null;
  licenseUrl: string | null;
  artistHtml: string | null;
  credit: string | null;
  attributionRequired: boolean;
  restrictions: string | null;
}

interface CommonsImageInfoResponse {
  query?: {
    pages?: Record<
      string,
      {
        title?: string;
        imageinfo?: Array<{
          url?: string;
          descriptionurl?: string;
          size?: number;
          width?: number;
          height?: number;
          mime?: string;
          extmetadata?: Record<string, { value?: string } | undefined>;
        }>;
      }
    >;
  };
}

export async function fetchCommonsImageInfo(
  filename: string
): Promise<CommonsImageInfo | null> {
  const title = filename.startsWith("File:") ? filename : `File:${filename}`;
  const url = new URL("https://commons.wikimedia.org/w/api.php");
  url.searchParams.set("action", "query");
  url.searchParams.set("titles", title);
  url.searchParams.set("prop", "imageinfo");
  url.searchParams.set("iiprop", "url|size|mime|extmetadata");
  url.searchParams.set("format", "json");
  url.searchParams.set("origin", "*");

  const res = await rateLimitedFetch(url.toString());
  const data = (await res.json()) as CommonsImageInfoResponse;
  const pages = data.query?.pages ?? {};
  for (const page of Object.values(pages)) {
    const info = page.imageinfo?.[0];
    if (!info?.url) continue;
    const ext = info.extmetadata ?? {};
    return {
      filename: page.title?.replace(/^File:/, "") ?? filename,
      url: info.url,
      filePageUrl:
        info.descriptionurl ??
        `https://commons.wikimedia.org/wiki/${encodeURIComponent(title)}`,
      width: info.width ?? null,
      height: info.height ?? null,
      mime: info.mime ?? null,
      size: info.size ?? null,
      license: ext.LicenseShortName?.value ?? null,
      licenseUrl: ext.LicenseUrl?.value ?? null,
      artistHtml: ext.Artist?.value ?? null,
      credit: ext.Credit?.value ?? null,
      attributionRequired: ext.AttributionRequired?.value === "true",
      restrictions: ext.Restrictions?.value ?? null,
    };
  }
  return null;
}

// Free-license short names used by Commons. We only auto-pick images
// whose license falls inside this allow-list; anything else (fair-use
// rationale on enwiki, "non-free" templates) gets surfaced as a
// candidate but never auto-selected.
const FREE_LICENSE_PATTERNS: RegExp[] = [
  /^cc0\b/i,
  /public domain/i,
  /^cc by(\b|-)/i,
  /^cc by-sa(\b|-)/i,
];

export function isFreeLicense(licenseShort: string | null): boolean {
  if (!licenseShort) return false;
  return FREE_LICENSE_PATTERNS.some(re => re.test(licenseShort));
}

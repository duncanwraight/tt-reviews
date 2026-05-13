// WTT roster fetcher (TT-201).
//
// One POST to GetPlayersListByFilters returns all ~800 actively-ranked
// players. Cached for the lifetime of one Worker invocation; subsequent
// callers in the same request reuse the cached array + index. The
// endpoint requires Referer/Origin matching the WTT site; without those
// headers it 307-redirects to the SPA shell.
//
// Lifted from the pre-TT-200 photo-sourcing CLI helper
// (scripts/photo-sourcing/lib/wtt.ts) — same upstream contract, same UA.

import type { WttRosterCandidate } from "./types";

const WTT_LIST_URL =
  "https://wtt-website-api-prod-3-frontdoor-bddnb2haduafdze9.a01.azurefd.net/api/cms/GetPlayersListByFilters/1/0";

const USER_AGENT =
  "tt-reviews-importer/0.1 (+https://tabletennis.reviews; duncan@wraight-consulting.co.uk)";

export interface WttRosterEntry {
  ittfid: number;
  fullName: string;
  nationality: string;
  countryName: string;
  gender: string;
  age: number;
  ranking: string;
  headShot: string;
}

function isWttRosterEntry(value: unknown): value is WttRosterEntry {
  if (typeof value !== "object" || value === null) return false;
  const entry = value as Record<string, unknown>;
  return (
    typeof entry.ittfid === "number" &&
    typeof entry.fullName === "string" &&
    typeof entry.nationality === "string" &&
    typeof entry.gender === "string"
  );
}

export function wttProfileUrl(ittfid: number): string {
  return `https://www.worldtabletennis.com/playerDescription?playerId=${ittfid}`;
}

// "LIN Shidong" → "Lin Shidong". WTT formats surnames in ALL CAPS; we
// normalise to title case for display + slug generation. Non-Latin
// scripts (no obvious surname capitalisation) pass through unchanged.
export function normaliseDisplayName(name: string): string {
  const tokens = name.split(/\s+/).filter(t => t.length > 0);
  const cased = tokens.map(token => {
    if (token.length > 1 && token === token.toUpperCase()) {
      return token.charAt(0) + token.slice(1).toLowerCase();
    }
    return token;
  });
  return cased.join(" ");
}

// Strip diacritics, collapse whitespace, drop punctuation, lowercase.
// Order-preserving so "Lin Shidong" stays distinct from "Shidong Lin".
// findByName falls back to a sorted-tokens key for that naming flip.
function normaliseForMatch(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenSorted(name: string): string {
  return normaliseForMatch(name).split(" ").sort().join(" ");
}

function mapRosterEntry(entry: WttRosterEntry): WttRosterCandidate {
  const gender =
    entry.gender === "M" || entry.gender === "F" ? entry.gender : undefined;
  return {
    source: "wtt",
    ittfid: entry.ittfid,
    name: normaliseDisplayName(entry.fullName),
    raw_name: entry.fullName,
    represents: entry.nationality.length === 3 ? entry.nationality : undefined,
    gender,
    headshot_url: entry.headShot || undefined,
    wtt_profile_url: wttProfileUrl(entry.ittfid),
    fetched_at: new Date().toISOString(),
  };
}

// Per-request cache. Workers spin up fresh isolates so this never
// outlives a single invocation; for one importer run it dedupes
// repeated lookups (roster scan + name fallback both call into this).
interface RosterCache {
  entries: WttRosterEntry[];
  candidates: WttRosterCandidate[];
  byName: Map<string, WttRosterEntry>;
}
let cache: RosterCache | null = null;

async function fetchRoster(fetchImpl: typeof fetch): Promise<WttRosterEntry[]> {
  const res = await fetchImpl(WTT_LIST_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/plain, */*",
      "User-Agent": USER_AGENT,
      Referer: "https://www.worldtabletennis.com/",
      Origin: "https://www.worldtabletennis.com",
    },
    body: JSON.stringify({
      sponsors: [],
      nationality: [],
      isFavourite: false,
      players: [],
      gender: "",
      searchText: "",
    }),
  });
  if (!res.ok) {
    throw new Error(`WTT roster fetch → ${res.status}`);
  }
  const data: unknown = await res.json();
  if (!Array.isArray(data)) {
    throw new Error("WTT roster: unexpected response shape");
  }
  return data.filter(isWttRosterEntry);
}

async function ensureCache(fetchImpl: typeof fetch): Promise<RosterCache> {
  if (cache) return cache;
  const entries = await fetchRoster(fetchImpl);
  const byName = new Map<string, WttRosterEntry>();
  for (const e of entries) {
    byName.set(normaliseForMatch(e.fullName), e);
    byName.set(`sorted:${tokenSorted(e.fullName)}`, e);
  }
  cache = {
    entries,
    candidates: entries.map(mapRosterEntry),
    byName,
  };
  return cache;
}

// Public: full list of WTT-ranked players as importer candidates.
export async function loadRosterCandidates(
  fetchImpl: typeof fetch = fetch
): Promise<WttRosterCandidate[]> {
  const c = await ensureCache(fetchImpl);
  return c.candidates;
}

// Public: legacy-row name fallback. Used to match local players that
// pre-date the ittfid column. New imports always carry ittfid; this
// path only matters when the importer skips an existing local row.
export async function findByName(
  name: string,
  fetchImpl: typeof fetch = fetch
): Promise<WttRosterEntry | null> {
  const c = await ensureCache(fetchImpl);
  return (
    c.byName.get(normaliseForMatch(name)) ??
    c.byName.get(`sorted:${tokenSorted(name)}`) ??
    null
  );
}

// Test-only: reset the module-level cache between specs.
export function __resetRosterCacheForTests(): void {
  cache = null;
}

// Slug generator. Latin-only diacritic strip + lowercase + hyphen-join.
// Non-Latin names (CJK, Arabic, etc.) lose all printable chars; the
// orchestrator falls back to `player-<ittfid>` in that case.
export function deriveSlug(name: string): string {
  const slug = name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug;
}

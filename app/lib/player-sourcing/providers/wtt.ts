// WTT roster provider (TT-168 / TT-197).
//
// One POST to GetPlayersListByFilters returns all ~800 actively-ranked
// players. We pull it, map each entry to a `PlayerCandidate`, and let
// the orchestrator (TT-198) decide which to keep, dedupe against
// existing `players` rows, and stage in `player_proposals`.
//
// The endpoint requires Referer/Origin matching the WTT site; without
// those headers it 307-redirects to the Angular SPA shell. The same
// constraint applies to `scripts/photo-sourcing/lib/wtt.ts`; the two
// stay independent (Node script vs Worker code) — duplication is small
// and intentional.

import type {
  PlayerCandidate,
  PlayerProvider,
  ProviderOptions,
  ProviderResult,
} from "./types";

const WTT_LIST_URL =
  "https://wtt-website-api-prod-3-frontdoor-bddnb2haduafdze9.a01.azurefd.net/api/cms/GetPlayersListByFilters/1/0";

const USER_AGENT =
  "tt-reviews-photo-sourcer/0.1 (+https://tabletennis.reviews; duncan@wraight-consulting.co.uk)";

interface WttRosterEntry {
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

export function normaliseName(name: string): string {
  const tokens = name.split(/\s+/).filter(t => t.length > 0);
  const cased = tokens.map(token => {
    if (token.length > 1 && token === token.toUpperCase()) {
      return token.charAt(0) + token.slice(1).toLowerCase();
    }
    return token;
  });
  return cased.join(" ");
}

export function mapRosterEntry(entry: WttRosterEntry): PlayerCandidate {
  const gender =
    entry.gender === "M" || entry.gender === "F" ? entry.gender : undefined;

  return {
    source: "wtt",
    ittfid: entry.ittfid,
    name: normaliseName(entry.fullName),
    represents: entry.nationality.length === 3 ? entry.nationality : undefined,
    gender,
    wtt_profile_url: wttProfileUrl(entry.ittfid),
    image_source_url: entry.headShot || undefined,
    fetched_at: new Date().toISOString(),
  };
}

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

export const wttProvider: PlayerProvider = {
  name: "wtt",
  async fetchCandidates(
    options: ProviderOptions = {}
  ): Promise<ProviderResult> {
    const fetchImpl = options.fetchImpl ?? fetch;
    const roster = await fetchRoster(fetchImpl);
    const candidates = roster.map(mapRosterEntry);
    const limited =
      typeof options.limit === "number"
        ? candidates.slice(0, options.limit)
        : candidates;
    return { status: "ok", candidates: limited };
  },
};

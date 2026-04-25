// World Table Tennis player roster (TT-36 follow-on).
//
// One POST to GetPlayersListByFilters returns all ~800 actively-ranked
// players. We pull it once, cache it for the lifetime of the scan run,
// and expose a name lookup. The cache lives in memory only — re-run
// scan.ts to refresh.
//
// The endpoint requires a Referer/Origin matching the WTT site; without
// those headers it 307-redirects to the Angular SPA shell.

const WTT_LIST_URL =
  "https://wtt-website-api-prod-3-frontdoor-bddnb2haduafdze9.a01.azurefd.net/api/cms/GetPlayersListByFilters/1/0";

const USER_AGENT =
  "tt-reviews-photo-sourcer/0.1 (+https://tabletennis.reviews; duncan@wraight-consulting.co.uk)";

export interface WttPlayer {
  ittfid: number;
  fullName: string;
  nationality: string;
  countryName: string;
  gender: "M" | "F" | string;
  age: number;
  ranking: string;
  headShot: string;
}

// Profile URL on the public WTT site, used as the source link in the
// /credits page. The id is the same `ittfid` returned by the roster.
export function wttProfileUrl(ittfid: number): string {
  return `https://www.worldtabletennis.com/playerDescription?playerId=${ittfid}`;
}

let cachedRoster: WttPlayer[] | null = null;
let cachedIndex: Map<string, WttPlayer> | null = null;

async function fetchRoster(): Promise<WttPlayer[]> {
  const res = await fetch(WTT_LIST_URL, {
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
  const data = (await res.json()) as WttPlayer[];
  if (!Array.isArray(data)) {
    throw new Error("WTT roster: unexpected response shape");
  }
  return data;
}

// Strip diacritics, collapse whitespace, drop punctuation, lowercase.
// WTT uses ALL-CAPS surnames; the seed sometimes mixes case. The
// normalised form is order-preserving so "LIN Shidong" stays distinct
// from "Shidong LIN" — we add a sorted-tokens index to handle that
// naming flip.
function normalise(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenSorted(name: string): string {
  return normalise(name).split(" ").sort().join(" ");
}

export async function loadRoster(): Promise<WttPlayer[]> {
  if (!cachedRoster) {
    cachedRoster = await fetchRoster();
    cachedIndex = new Map();
    for (const p of cachedRoster) {
      cachedIndex.set(normalise(p.fullName), p);
      // Also index by sorted tokens for "Surname Given" vs "Given Surname".
      cachedIndex.set(`sorted:${tokenSorted(p.fullName)}`, p);
    }
  }
  return cachedRoster;
}

export async function findByName(name: string): Promise<WttPlayer | null> {
  await loadRoster();
  if (!cachedIndex) return null;
  return (
    cachedIndex.get(normalise(name)) ??
    cachedIndex.get(`sorted:${tokenSorted(name)}`) ??
    null
  );
}

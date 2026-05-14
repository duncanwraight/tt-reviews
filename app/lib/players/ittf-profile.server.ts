// ITTF results profile scraper (TT-201).
//
// One GET per player. The page is a public results.ittf.link profile
// and returns HTML with a "Style:" string we parse for handedness +
// grip, a "Birth Year:" line, and a "Career Best**:" line carrying the
// player's peak ITTF world ranking (rank + ISO-week / year). Used only
// for new-player enrichment during the importer run; existing players
// keep whatever they already have in the local DB.
//
// Lifted verbatim from scripts/photo-sourcing/lib/ittf.ts (TT-200).
// The parser stays pure so unit tests can drive it with HTML fixtures
// without hitting the network.
//
// Field format (canonical):
//   Style: <span class='notranslate'>Left-Hand</span>
//          <span class='notranslate'>Attack</span>
//          (<span class='notranslate'>ShakeHand</span>)
//
// Unknown-data fallback ITTF emits for incomplete profiles:
//   Style: <span class='notranslate'>Unknown Handness</span>
//          <span class='notranslate'>Unknown Style</span>
//          (<span class='notranslate'>Unknown Grip</span>)
//
// We map "Unknown ..." segments to null so the orchestrator still
// records what we DID get (e.g. birth year present, style absent).

import type { IttfProfileCandidate, IttfStyle } from "./types";

const ITTF_PROFILE_BASE =
  "https://results.ittf.link/index.php/player-profile/list/60";

const USER_AGENT =
  "tt-reviews-importer/0.1 (+https://tabletennis.reviews; duncan@wraight-consulting.co.uk)";

const STYLE_RE =
  /Style:\s*<span class=['"]notranslate['"]>([^<]+)<\/span>\s*<span class=['"]notranslate['"]>([^<]+)<\/span>\s*\(<span class=['"]notranslate['"]>([^<]+)<\/span>\)/i;

const BIRTH_YEAR_RE =
  /Birth Year:\s*<span class=['"]notranslate['"]>(\d{4})<\/span>/i;

// "Career Best**: <span ...>32</span> | Month: <span ...>11/2022</span>"
// The asterisks are page-foot annotations ("Based on Seniors Singles
// ITTF World Ranking since January 2001"). The second token is
// "MM/YYYY" or (historically) ISO week "WW/YYYY" — accept either and
// keep only the year for the display string. ITTF flipped the public
// page from Week to Month some time before 2026-05; we keep Week
// accepted in case some legacy pages still render it.
const CAREER_BEST_RE =
  /Career Best\*{0,2}:\s*<span class=['"]notranslate['"]>(\d+)<\/span>\s*\|\s*(?:Week|Month):\s*<span class=['"]notranslate['"]>\d{1,2}\/(\d{4})<\/span>/i;

export interface IttfProfile {
  handedness: "left" | "right" | null;
  style: IttfStyle | null;
  grip: "shakehand" | "penhold" | null;
  birth_year: number | null;
  // Career-high world ranking (peak ITTF Seniors Singles rank) and
  // the year in which it was achieved. Both null when the profile
  // line is absent or unparseable.
  peak_world_rank: number | null;
  peak_rank_year: number | null;
}

export function ittfProfileUrl(ittfid: number): string {
  return `${ITTF_PROFILE_BASE}?resetfilters=1&vw_profiles___player_id_raw=${ittfid}`;
}

export function parseIttfProfile(html: string): IttfProfile {
  const profile: IttfProfile = {
    handedness: null,
    style: null,
    grip: null,
    birth_year: null,
    peak_world_rank: null,
    peak_rank_year: null,
  };

  const styleMatch = html.match(STYLE_RE);
  if (styleMatch) {
    profile.handedness = mapHandedness(styleMatch[1]);
    profile.style = mapStyle(styleMatch[2]);
    profile.grip = mapGrip(styleMatch[3]);
  }

  const birthMatch = html.match(BIRTH_YEAR_RE);
  if (birthMatch) {
    const year = Number(birthMatch[1]);
    // Sanity bounds — anyone with a birth year outside this range is
    // almost certainly a data-entry error upstream; better to leave the
    // field null than splice garbage downstream.
    if (year >= 1900 && year <= new Date().getFullYear()) {
      profile.birth_year = year;
    }
  }

  const careerBestMatch = html.match(CAREER_BEST_RE);
  if (careerBestMatch) {
    const rank = Number(careerBestMatch[1]);
    const year = Number(careerBestMatch[2]);
    // World ranks are positive ints; ITTF's published series goes back
    // to Jan 2001 per the page footer. Reject anything outside sane
    // bounds rather than persisting garbage.
    if (
      Number.isFinite(rank) &&
      rank >= 1 &&
      rank <= 10000 &&
      Number.isFinite(year) &&
      year >= 2001 &&
      year <= new Date().getFullYear()
    ) {
      profile.peak_world_rank = rank;
      profile.peak_rank_year = year;
    }
  }

  return profile;
}

function mapHandedness(raw: string): "left" | "right" | null {
  const v = raw.trim().toLowerCase();
  if (v.startsWith("left")) return "left";
  if (v.startsWith("right")) return "right";
  return null;
}

function mapStyle(raw: string): IttfStyle | null {
  const v = raw.trim().toLowerCase();
  if (v.startsWith("unknown")) return null;
  if (v.startsWith("attack")) return "attack";
  if (v.startsWith("defen")) return "defence";
  // Future ITTF additions (chopper, allround, etc) land in "other" so
  // the orchestrator can log + leave playing_style NULL.
  return "other";
}

function mapGrip(raw: string): "shakehand" | "penhold" | null {
  const v = raw.trim().toLowerCase();
  if (v.startsWith("shake")) return "shakehand";
  if (v.startsWith("penhol")) return "penhold";
  return null;
}

// Pace ITTF requests at ≥1s/req per IP. Same posture as Wikimedia in
// the equipment-photo pipeline.
const FETCH_MIN_GAP_MS = 1000;
let lastFetchAt = 0;

export async function fetchIttfProfile(
  ittfid: number,
  fetchImpl: typeof fetch = fetch
): Promise<IttfProfile> {
  const url = ittfProfileUrl(ittfid);

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const wait = lastFetchAt + FETCH_MIN_GAP_MS - Date.now();
    if (wait > 0) await new Promise(r => setTimeout(r, wait));
    lastFetchAt = Date.now();

    const res = await fetchImpl(url, {
      headers: { "User-Agent": USER_AGENT, Accept: "text/html" },
    });

    if (res.ok) {
      const html = await res.text();
      return parseIttfProfile(html);
    }

    if (res.status !== 429 && res.status < 500) {
      throw new Error(`ITTF profile ${ittfid} → ${res.status}`);
    }

    const retryAfter = Number(res.headers.get("retry-after")) || 0;
    const backoff = Math.max(retryAfter * 1000, 2000 * Math.pow(2, attempt));
    await new Promise(r => setTimeout(r, backoff));
  }

  throw new Error(`ITTF profile ${ittfid} → exhausted retries`);
}

export function toIttfCandidate(
  ittfid: number,
  profile: IttfProfile
): IttfProfileCandidate {
  return {
    source: "ittf",
    ittfid,
    handedness: profile.handedness ?? undefined,
    style: profile.style ?? undefined,
    grip: profile.grip ?? undefined,
    birth_year: profile.birth_year ?? undefined,
    peak_world_rank: profile.peak_world_rank ?? undefined,
    peak_rank_year: profile.peak_rank_year ?? undefined,
    ittf_profile_url: ittfProfileUrl(ittfid),
    fetched_at: new Date().toISOString(),
  };
}

// Test-only: reset the rate-limit clock between unit tests.
export function __resetIttfRateLimitForTests(): void {
  lastFetchAt = 0;
}

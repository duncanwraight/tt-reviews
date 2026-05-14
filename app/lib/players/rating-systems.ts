// Amateur-rating label lookup + career-best renderer (TT-222).
//
// Two responsibilities:
//   1. Map an ISO-3 country code to the rating-system label its players
//      know themselves by (TTR / Points / USATT / Ranking / etc.).
//   2. Render a player's career-best for display, branching on
//      `player_kind`: professional rows render as "World #N (YYYY)"
//      with a fixed label; amateur rows render as "<value> <label>
//      (<year>)" with a country-derived label.
//
// The label is a RENDER-time derivation only — never a stored column.
// That means flipping a player's `represents` (or correcting their
// birth_country) re-labels their rating immediately without a write,
// and a future "self-claim profile" flow doesn't need a schema
// migration to support a new country.

// 12-country label map, locked in by the TT-220 parent description.
// Order is alphabetical for diff stability; ordering doesn't affect
// behaviour. Notes on country choices:
//   - DE/AT/CH share the DTTB-developed TTR system (Tischtennis-Rating).
//   - FR is the FFTT "Points" system (top-1000 N-prefix nuance is out
//     of scope per the parent — render plain "Points" here).
//   - GB / Nordics use English-language "Ranking" since their national
//     systems don't have a globally recognised acronym.
//   - US/CA are kept as USATT for now (parent: "Canada → TTCAN re-label
//     — kept as USATT for now").
//   - IN/AU use the suffix "rating" since "TTFI rating" / "TTA rating"
//     reads more naturally than the bare acronym for those federations.
export const COUNTRY_TO_RATING_LABEL: Record<string, string> = {
  AT: "TTR",
  AU: "TTA rating",
  CA: "USATT",
  CH: "TTR",
  CN: "CTTA",
  DE: "TTR",
  DK: "Ranking",
  FI: "Ranking",
  FR: "Points",
  GB: "Ranking",
  IN: "TTFI rating",
  JP: "JTTA",
  KR: "KTTA",
  NO: "Ranking",
  SE: "Ranking",
  US: "USATT",
};

// ISO-3 → ISO-2 fallback for the few country codes used in this app
// that come from the existing `players.birth_country` / `represents`
// columns (3-letter codes per app conventions). Only the codes that
// map to entries in COUNTRY_TO_RATING_LABEL need to be here; anything
// else falls back to the default label and doesn't need a mapping.
const ISO3_TO_ISO2: Record<string, string> = {
  AUS: "AU",
  AUT: "AT",
  CAN: "CA",
  CHE: "CH",
  CHN: "CN",
  DEU: "DE",
  GER: "DE",
  DNK: "DK",
  DEN: "DK",
  FIN: "FI",
  FRA: "FR",
  GBR: "GB",
  IND: "IN",
  JPN: "JP",
  KOR: "KR",
  NOR: "NO",
  SWE: "SE",
  USA: "US",
};

const DEFAULT_LABEL = "Rating";

/**
 * Resolve the rating-system label for an amateur player's country.
 * Accepts either ISO-2 or the app's prevailing ISO-3 codes (DEU, JPN,
 * KOR, …); falls back to "Rating" for any country not in the explicit
 * 12-country map. Returns the fallback for null/undefined input — the
 * caller is responsible for deciding whether to render the value at
 * all when country is unknown.
 */
export function getRatingLabel(country: string | null | undefined): string {
  if (!country) return DEFAULT_LABEL;
  const upper = country.toUpperCase();
  if (upper.length === 2) {
    return COUNTRY_TO_RATING_LABEL[upper] ?? DEFAULT_LABEL;
  }
  if (upper.length === 3) {
    const iso2 = ISO3_TO_ISO2[upper];
    if (iso2) return COUNTRY_TO_RATING_LABEL[iso2] ?? DEFAULT_LABEL;
  }
  return DEFAULT_LABEL;
}

// Minimal player shape `renderCareerBest` needs. Keeps this module
// decoupled from the wider Player interface so server code (Discord
// embeds, OG cards) can construct a literal and call in.
export interface CareerBestInput {
  player_kind?: "professional" | "amateur" | null;
  peak_world_rank?: number | null;
  peak_rank_year?: number | null;
  peak_rating_value?: number | null;
  peak_rating_year?: number | null;
  // Country fields. `represents` wins when present — that's the
  // federation the player competes for; falls back to birth_country
  // when an amateur hasn't moved (most amateurs).
  represents?: string | null;
  birth_country?: string | null;
}

export interface CareerBest {
  label: string;
  value: string;
}

/**
 * Render a player's career-best for display, or `null` if the kind-
 * appropriate peak fields are missing.
 *
 * Professional: "Career-best ranking" / "World #N (YYYY)".
 * Amateur: "Peak rating" / "<value> <countryLabel> (<year>)".
 *
 * Amateur country sourcing: `represents ?? birth_country`. Surfaces
 * that don't carry country (e.g. a minimal Discord embed) can pass
 * undefined — the label falls back to "Rating".
 */
export function renderCareerBest(input: CareerBestInput): CareerBest | null {
  const kind = input.player_kind ?? "professional";
  if (kind === "amateur") {
    const value = input.peak_rating_value;
    const year = input.peak_rating_year;
    if (typeof value !== "number" || typeof year !== "number") return null;
    const country = input.represents ?? input.birth_country;
    const label = getRatingLabel(country);
    return {
      label: "Peak rating",
      value: `${value} ${label} (${year})`,
    };
  }
  const rank = input.peak_world_rank;
  const year = input.peak_rank_year;
  if (typeof rank !== "number" || typeof year !== "number") return null;
  return {
    label: "Career-best ranking",
    value: `World #${rank} (${year})`,
  };
}

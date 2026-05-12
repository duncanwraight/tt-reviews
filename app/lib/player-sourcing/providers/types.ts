// Player sourcing providers (TT-168 / TT-197).
//
// Each provider exposes a single `fetchCandidates` entry point that
// returns one `PlayerCandidate` per upstream-known professional player.
// Providers are pure — no DB writes — and don't know about
// `player_proposals`; the orchestrator in `source.server.ts` (TT-198)
// is the only thing that writes.
//
// Fields are optional except `ittfid`, `name`, and `wtt_profile_url`
// (or the source-equivalent identifier). Different providers fill
// different subsets; the orchestrator merges them per ittfid.

export interface PlayerCandidate {
  source: "wtt";
  ittfid: number;
  name: string;
  represents?: string;
  birth_country?: string;
  gender?: "M" | "F";
  handedness?: "left" | "right";
  grip?: "shakehand" | "penhold";
  highest_rating?: string;
  active_years?: string;
  wtt_profile_url: string;
  image_source_url?: string;
  fetched_at: string;
}

export type ProviderStatus = "ok" | "rate_limited" | "out_of_budget";

export interface ProviderResult {
  status: ProviderStatus;
  candidates: PlayerCandidate[];
}

export interface ProviderOptions {
  limit?: number;
  fetchImpl?: typeof fetch;
}

export interface PlayerProvider {
  name: string;
  fetchCandidates(options?: ProviderOptions): Promise<ProviderResult>;
}

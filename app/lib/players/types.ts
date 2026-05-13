// Player importer types (TT-201).
//
// Two-source merge model: each provider returns its own slice keyed on
// ittfid, the orchestrator merges them into MergedPlayer for review/apply.
// PerSourceCandidate is stored verbatim in player_proposals.candidates
// JSONB so the detail UI can show "which source said what".

export interface WttRosterCandidate {
  source: "wtt";
  ittfid: number;
  name: string;
  raw_name: string;
  represents?: string;
  gender?: "M" | "F";
  headshot_url?: string;
  wtt_profile_url: string;
  fetched_at: string;
}

export interface IttfProfileCandidate {
  source: "ittf";
  ittfid: number;
  handedness?: "left" | "right";
  grip?: "shakehand" | "penhold";
  birth_year?: number;
  ittf_profile_url: string;
  fetched_at: string;
}

export type PerSourceCandidate = WttRosterCandidate | IttfProfileCandidate;

export interface MergedPlayer {
  ittfid: number;
  name: string;
  represents?: string;
  gender?: "M" | "F";
  handedness?: "left" | "right";
  grip?: "shakehand" | "penhold";
  birth_year?: number;
  headshot_url?: string;
  wtt_profile_url: string;
  ittf_profile_url?: string;
  per_field_source: Record<string, "wtt" | "ittf">;
}

// Completeness gate: auto-apply when all four enrichments are present.
// Missing any of them → queue for admin review.
export function isComplete(p: MergedPlayer): boolean {
  return Boolean(p.handedness && p.grip && p.birth_year && p.headshot_url);
}

export interface ImporterSummary {
  auto_applied: number;
  queued: number;
  skipped_existing: number;
  remaining: number;
  errors: Array<{ ittfid: number; message: string }>;
}

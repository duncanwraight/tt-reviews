// Player importer types (TT-201).
//
// Two-source merge model: each provider returns its own slice keyed on
// ittfid, the orchestrator merges them into MergedPlayer for review/apply.
// PerSourceCandidate is stored verbatim in player_proposals.candidates
// JSONB so the detail UI can show "which source said what".

// ITTF Style: block emits a "style" token between handedness and grip:
// e.g. Right-Hand Attack (ShakeHand). We narrow to attack/defence and
// surface "other" as a passthrough for surprising values so the
// orchestrator can log + leave playing_style NULL rather than coerce.
export type IttfStyle = "attack" | "defence" | "other";

// Subset of players.playing_style. Existing values seen in the DB:
// shakehand_attacker, penhold_rpb, classical_defender, short_pips_hitter.
// The importer can only confidently set the first three; short_pips_hitter
// requires manual classification.
export type PlayingStyle =
  | "shakehand_attacker"
  | "penhold_rpb"
  | "classical_defender";

export interface WttRosterCandidate {
  source: "wtt";
  ittfid: number;
  name: string;
  raw_name: string;
  represents?: string;
  gender?: "M" | "F";
  ranking?: number;
  headshot_url?: string;
  wtt_profile_url: string;
  fetched_at: string;
}

export interface IttfProfileCandidate {
  source: "ittf";
  ittfid: number;
  handedness?: "left" | "right";
  style?: IttfStyle;
  grip?: "shakehand" | "penhold";
  birth_year?: number;
  // Career-best world ranking parsed from the ITTF profile's "Career
  // Best**:" line. Both undefined when the line is absent or fails the
  // sanity bounds in parseIttfProfile (they share a parse pass).
  peak_world_rank?: number;
  peak_rank_year?: number;
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
  playing_style?: PlayingStyle;
  birth_year?: number;
  peak_world_rank?: number;
  peak_rank_year?: number;
  // TT-221: importer is pro-only by definition; this stays
  // 'professional' on every importer-merged row. Amateurs only enter
  // the database via the submission flow, never via WTT/ITTF scrape.
  player_kind: "professional";
  headshot_url?: string;
  wtt_profile_url: string;
  ittf_profile_url?: string;
  per_field_source: Record<string, "wtt" | "ittf">;
}

// Completeness gate: auto-apply when all four required enrichments are
// present. playing_style + peak ranking are nice-to-have but not gating
// — admin can fix them later via player_edits.
export function isComplete(p: MergedPlayer): boolean {
  return Boolean(p.handedness && p.grip && p.birth_year && p.headshot_url);
}

// (grip, style) → players.playing_style enum. Conservative: only
// commits to values we know exist in the column; everything else stays
// NULL so the admin can pick via player_edits.
export function derivePlayingStyle(
  grip: "shakehand" | "penhold" | undefined,
  style: IttfStyle | undefined
): PlayingStyle | undefined {
  if (!grip || !style) return undefined;
  if (style === "attack" && grip === "shakehand") return "shakehand_attacker";
  if (style === "attack" && grip === "penhold") return "penhold_rpb";
  if (style === "defence" && grip === "shakehand") return "classical_defender";
  // (defence, penhold) and any "other" style → leave for admin.
  return undefined;
}

// TT-204: producer-side summary. The action no longer processes
// candidates inline — each truly-new ittfid is enqueued onto
// `player-import-queue` and drained asynchronously by the queue
// consumer (processOnePlayerImport). `auto_applied` / `queued` /
// `remaining` from the pre-TT-204 inline shape are gone; the operator
// reads consumer outcomes from `recent` (auto-applied) and the
// pending-review queue on /admin/import-players.
export interface ImporterSummary {
  skipped_existing: number;
  // Number of queue messages successfully enqueued for the consumer
  // to drain. One message = one ittfid. Includes both freshly-
  // inserted candidates and recovered orphans (TT-206).
  queued_for_processing: number;
  // TT-206: number of pre-existing proposal stubs whose queue
  // messages were re-sent because a previous Run import click
  // inserted the stub but never landed the queue message (e.g. a
  // too-large sendBatch payload). Optional — undefined when zero.
  recovered_orphans?: number;
  errors: Array<{ ittfid: number; message: string }>;
}

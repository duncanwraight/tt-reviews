// Append-only diagnostic log for one player-import message (TT-204).
//
// Persisted on player_proposals.run_log so the admin proposal-detail
// page can show why the importer made the choices it made — which
// roster-dedupe outcome enqueued the message, which fields ITTF
// returned, whether the headshot fetch succeeded, where it landed in
// R2, and what terminal verdict the consumer reached (auto_applied,
// queued_for_review, retry, error).
//
// Lifecycle:
//   - Producer (runImport) seeds the array with one `roster_match`
//     entry per truly-new ittfid and inserts the pending_review row
//     before enqueuing. The "Pending in queue" tile on /admin/import-
//     players counts rows whose last log entry is still roster_match.
//   - Consumer (processOnePlayerImport) appends ittf_fetch /
//     photo_fetch / r2_upload / merge / terminal entries and patches
//     the proposal row in one update. Transient retries also persist
//     so the operator can see "tried, hit retry, will reattempt" —
//     the next attempt appends fresh entries onto whatever survived.
//
// Mirrors app/lib/spec-sourcing/run-log.ts. Kept as a separate module
// because the entry shapes are pipeline-specific (no shared
// vocabulary worth abstracting).

interface BaseEntry {
  // ISO timestamp of when the entry was appended. Test seam via the
  // `now` constructor option.
  at: string;
}

export type RunLogEntry =
  | (BaseEntry & {
      step: "roster_match";
      // Outcome of the in-memory dedupe pass in the producer. For the
      // queue path this is always `truly_new`; the other branches
      // (ittfid / name / ambiguous) short-circuit before enqueuing.
      // The shape stays unioned so a future direct-enqueue or
      // re-scan path can record one of the skip outcomes too.
      outcome: "truly_new" | "ittfid" | "name" | "ambiguous";
      ittfid: number;
      // WTT data carried in the queue message so the consumer doesn't
      // need to re-fetch the roster per ittfid.
      wtt_name?: string;
      wtt_headshot_url?: string;
      wtt_profile_url?: string;
      // Triggered by whom — `admin` (manual Run import) is the only
      // value right now; a future cron path would use `cron`.
      triggered_by?: string;
    })
  | (BaseEntry & {
      step: "ittf_fetch";
      ittfid: number;
      url: string;
      status: "ok" | "transient" | "error";
      // Populated on `ok`. The four enrichment fields the importer
      // cares about; missing keys mean the ITTF profile didn't carry
      // that data point.
      handedness?: "left" | "right";
      grip?: "shakehand" | "penhold";
      style?: "attack" | "defence" | "other";
      birth_year?: number;
      highest_rating?: string;
      // TT-219: the numeric peak captured alongside the display
      // string. Both undefined when the Career Best line didn't
      // parse; otherwise both set so the admin UI can spot a
      // legacy text-only entry.
      peak_world_rank?: number;
      peak_rank_year?: number;
      // Populated on `transient` or `error`.
      reason?: string;
    })
  | (BaseEntry & {
      step: "photo_fetch";
      ittfid: number;
      url: string | null;
      // `skipped` covers "no headshot URL on the WTT row"; the rest
      // map to fetch outcomes.
      status: "ok" | "skipped" | "not_found" | "error";
      content_type?: string;
      byte_length?: number;
      reason?: string;
      // TT-208: when the upstream returned a non-OK HTTP code, the
      // numeric status is captured here so the admin UI can render
      // "not_found · 403" instead of bare "not_found". Populated on
      // status='not_found' (HTTP 4xx/5xx) and status='error' when
      // the failure was an upstream HTTP error rather than a
      // transport-layer throw.
      http_status?: number;
    })
  | (BaseEntry & {
      step: "r2_upload";
      ittfid: number;
      image_key: string | null;
      content_type?: string;
      status: "ok" | "skipped" | "error";
      reason?: string;
    })
  | (BaseEntry & {
      step: "merge";
      ittfid: number;
      // Field count on the merged record (excluding per_field_source).
      // Mirrors spec-sourcing's `merged_field_count` for parity.
      field_count: number;
      complete: boolean;
      // Which fields the completeness gate flagged missing. Empty when
      // `complete=true`.
      missing_fields: string[];
    })
  | (BaseEntry & {
      step: "terminal";
      ittfid: number;
      status: "auto_applied" | "queued_for_review" | "retry" | "error";
      // Populated on auto_applied.
      player_id?: string;
      player_slug?: string;
      // Populated on retry.
      retry_after_seconds?: number;
      attempts?: number;
      // Populated on retry / error.
      reason?: string;
    });

export interface RunLogOptions {
  now?: () => Date;
}

// Distributive Omit so the record() argument keeps its discriminated-
// union shape — `Omit<RunLogEntry, "at">` would collapse to a single
// shape and reject branch-specific fields like `ittfid`.
type RunLogEntryInput = RunLogEntry extends infer U
  ? U extends RunLogEntry
    ? Omit<U, "at">
    : never
  : never;

export class RunLog {
  private entries: RunLogEntry[];
  private readonly now: () => Date;

  constructor(opts: RunLogOptions = {}, seed: RunLogEntry[] = []) {
    this.now = opts.now ?? (() => new Date());
    this.entries = [...seed];
  }

  record(entry: RunLogEntryInput): void {
    this.entries.push({
      ...entry,
      at: this.now().toISOString(),
    } as RunLogEntry);
  }

  toJSON(): RunLogEntry[] {
    return [...this.entries];
  }
}

// Helper for the "Pending in queue" tile loader: did the consumer
// touch this proposal yet? True when the last entry is the producer's
// roster_match seed (no ittf_fetch / photo_fetch / merge appended).
export function isQueuedNotYetProcessed(log: RunLogEntry[]): boolean {
  const last = log[log.length - 1];
  return last?.step === "roster_match";
}

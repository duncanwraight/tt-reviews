// Admin-side renderer for player_proposals.run_log (TT-204).
// Read-only view of the per-message importer pipeline: roster dedupe
// outcome, ITTF fetch, headshot download, R2 upload, completeness
// verdict, terminal outcome (auto_applied / queued_for_review /
// retry / error).
//
// One entry per step in walk order — no source grouping (the
// importer only has one upstream pipeline per message). Each entry
// gets a colored pill for its status so a moderator can skim the
// chain and see where it terminated.

import type { RunLogEntry } from "~/lib/players/run-log";

interface PlayerImportRunLogProps {
  entries: RunLogEntry[];
}

function StepBadge({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-block text-[10px] uppercase tracking-wider font-semibold text-gray-500 bg-gray-100 rounded px-1.5 py-0.5">
      {children}
    </span>
  );
}

function StatusPill({
  tone,
  children,
}: {
  tone: "ok" | "warn" | "fail";
  children: React.ReactNode;
}) {
  const cls =
    tone === "ok"
      ? "bg-green-100 text-green-800"
      : tone === "warn"
        ? "bg-amber-100 text-amber-800"
        : "bg-red-100 text-red-800";
  return (
    <span
      className={`inline-block text-[10px] uppercase tracking-wider font-semibold rounded px-1.5 py-0.5 ${cls}`}
    >
      {children}
    </span>
  );
}

function formatStamp(at: string): string {
  return at.replace("T", " ").replace(/\..*$/, "");
}

function renderEntry(entry: RunLogEntry, idx: number): React.ReactNode {
  const stamp = (
    <span className="text-[10px] text-gray-500 tabular-nums">
      {formatStamp(entry.at)}
    </span>
  );

  switch (entry.step) {
    case "roster_match":
      return (
        <div key={idx} className="flex flex-col gap-1">
          <div className="flex items-baseline gap-2 flex-wrap">
            <StepBadge>Roster match</StepBadge>
            <StatusPill tone={entry.outcome === "ambiguous" ? "fail" : "ok"}>
              {entry.outcome}
            </StatusPill>
            {stamp}
          </div>
          <div className="text-xs text-gray-700">
            ittfid <code className="bg-gray-100 px-1">{entry.ittfid}</code>
            {entry.wtt_name ? ` · ${entry.wtt_name}` : ""}
            {entry.triggered_by ? ` · trigger: ${entry.triggered_by}` : ""}
          </div>
        </div>
      );
    case "ittf_fetch": {
      const tone =
        entry.status === "ok"
          ? "ok"
          : entry.status === "transient"
            ? "warn"
            : "fail";
      return (
        <div key={idx} className="flex flex-col gap-1">
          <div className="flex items-baseline gap-2 flex-wrap">
            <StepBadge>ITTF fetch</StepBadge>
            <StatusPill tone={tone}>{entry.status}</StatusPill>
            {stamp}
          </div>
          {entry.status === "ok" ? (
            <div className="text-xs text-gray-700">
              {entry.handedness ? `handedness: ${entry.handedness}` : "—"} ·{" "}
              {entry.grip ? `grip: ${entry.grip}` : "—"} ·{" "}
              {entry.style ? `style: ${entry.style}` : "—"} ·{" "}
              {entry.birth_year ? `birth ${entry.birth_year}` : "—"}
            </div>
          ) : (
            <div className="text-xs text-red-700 break-words">
              {entry.reason ?? "no reason"}
            </div>
          )}
        </div>
      );
    }
    case "photo_fetch": {
      const tone =
        entry.status === "ok"
          ? "ok"
          : entry.status === "skipped" || entry.status === "not_found"
            ? "warn"
            : "fail";
      return (
        <div key={idx} className="flex flex-col gap-1">
          <div className="flex items-baseline gap-2 flex-wrap">
            <StepBadge>Photo fetch</StepBadge>
            <StatusPill tone={tone}>
              {entry.status}
              {entry.http_status ? ` · ${entry.http_status}` : ""}
            </StatusPill>
            {stamp}
          </div>
          {entry.url ? (
            <div className="text-xs text-gray-700 break-all">{entry.url}</div>
          ) : null}
          {entry.byte_length != null ? (
            <div className="text-xs text-gray-500">
              {entry.byte_length} bytes ·{" "}
              {entry.content_type ?? "no content-type"}
            </div>
          ) : null}
          {entry.reason ? (
            <div className="text-xs text-red-700">{entry.reason}</div>
          ) : null}
        </div>
      );
    }
    case "r2_upload": {
      const tone =
        entry.status === "ok"
          ? "ok"
          : entry.status === "skipped"
            ? "warn"
            : "fail";
      return (
        <div key={idx} className="flex flex-col gap-1">
          <div className="flex items-baseline gap-2 flex-wrap">
            <StepBadge>R2 upload</StepBadge>
            <StatusPill tone={tone}>{entry.status}</StatusPill>
            {stamp}
          </div>
          {entry.image_key ? (
            <div className="text-xs text-gray-700 break-all">
              <code className="bg-gray-100 px-1">{entry.image_key}</code>
            </div>
          ) : null}
          {entry.reason ? (
            <div className="text-xs text-red-700">{entry.reason}</div>
          ) : null}
        </div>
      );
    }
    case "merge":
      return (
        <div key={idx} className="flex flex-col gap-1">
          <div className="flex items-baseline gap-2 flex-wrap">
            <StepBadge>Merge</StepBadge>
            <StatusPill tone={entry.complete ? "ok" : "warn"}>
              {entry.complete ? "complete" : "incomplete"}
            </StatusPill>
            {stamp}
          </div>
          <div className="text-xs text-gray-700">
            {entry.field_count} fields populated
            {entry.missing_fields.length > 0 ? (
              <> · missing: {entry.missing_fields.join(", ")}</>
            ) : null}
          </div>
        </div>
      );
    case "terminal": {
      const tone =
        entry.status === "auto_applied"
          ? "ok"
          : entry.status === "queued_for_review"
            ? "warn"
            : entry.status === "retry"
              ? "warn"
              : "fail";
      return (
        <div key={idx} className="flex flex-col gap-1">
          <div className="flex items-baseline gap-2 flex-wrap">
            <StepBadge>Terminal</StepBadge>
            <StatusPill tone={tone}>{entry.status}</StatusPill>
            {stamp}
          </div>
          {entry.player_slug ? (
            <div className="text-xs text-gray-700 break-all">
              applied as{" "}
              <code className="bg-gray-100 px-1">{entry.player_slug}</code>
            </div>
          ) : null}
          {entry.reason ? (
            <div className="text-xs text-gray-700 break-words">
              {entry.reason}
            </div>
          ) : null}
          {entry.retry_after_seconds ? (
            <div className="text-xs text-gray-500">
              retry in {entry.retry_after_seconds}s (attempt {entry.attempts})
            </div>
          ) : null}
        </div>
      );
    }
  }
}

export function PlayerImportRunLog({ entries }: PlayerImportRunLogProps) {
  if (entries.length === 0) {
    return (
      <div
        className="bg-white rounded-lg shadow p-6 text-sm text-gray-500"
        data-testid="player-import-run-log-empty"
      >
        No run log recorded — this proposal pre-dates TT-204 or was queued
        directly into the legacy inline-processing path.
      </div>
    );
  }

  return (
    <section
      className="bg-white rounded-lg shadow p-6"
      data-testid="player-import-run-log"
    >
      <h2 className="text-sm font-semibold text-gray-900 mb-3">
        Importer run log
      </h2>
      <ol className="space-y-3">
        {entries.map((entry, idx) => (
          <li
            key={idx}
            className="border-l-2 border-gray-200 pl-3"
            data-testid={`player-import-run-log-entry-${entry.step}`}
          >
            {renderEntry(entry, idx)}
          </li>
        ))}
      </ol>
    </section>
  );
}

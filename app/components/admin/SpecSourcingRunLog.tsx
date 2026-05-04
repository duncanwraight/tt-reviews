// Admin-side renderer for equipment_spec_proposals.run_log (TT-162).
// Read-only view of every decision the queue consumer made for the
// run that produced this proposal — which sources were considered,
// brand-skipped, search counts, prefilter decisions, LLM match
// verdicts, fetch outcomes, extract results, merge summary, terminal
// outcome.
//
// Grouped by source in walk order, with cross-cutting entries (brand
// skips, merge, outcome) at the top and bottom respectively. The
// design priority is "give the moderator enough to understand a
// black-box pipeline they can't otherwise see" — token sets,
// per-candidate prefilter reasons, raw HTML excerpts, and the
// canonical query URL the source actually hit are all in here.

import { Fragment } from "react";

import type { RunLogEntry } from "~/lib/spec-sourcing/run-log";

interface SpecSourcingRunLogProps {
  entries: RunLogEntry[];
}

interface SourceGroup {
  sourceId: string;
  entries: RunLogEntry[];
}

function groupBySource(entries: RunLogEntry[]): {
  pre: RunLogEntry[];
  groups: SourceGroup[];
  post: RunLogEntry[];
} {
  const pre: RunLogEntry[] = [];
  const post: RunLogEntry[] = [];
  const groupsByOrder: SourceGroup[] = [];
  const groupIndex = new Map<string, SourceGroup>();

  for (const entry of entries) {
    if (entry.step === "source_skipped_brand") {
      pre.push(entry);
      continue;
    }
    if (entry.step === "merge" || entry.step === "outcome") {
      post.push(entry);
      continue;
    }
    if ("source_id" in entry && typeof entry.source_id === "string") {
      let group = groupIndex.get(entry.source_id);
      if (!group) {
        group = { sourceId: entry.source_id, entries: [] };
        groupIndex.set(entry.source_id, group);
        groupsByOrder.push(group);
      }
      group.entries.push(entry);
    }
  }

  return { pre, groups: groupsByOrder, post };
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
    <span className={`text-xs font-medium rounded px-1.5 py-0.5 ${cls}`}>
      {children}
    </span>
  );
}

function TokenList({ label, tokens }: { label: string; tokens: string[] }) {
  if (tokens.length === 0) {
    return (
      <span className="text-xs text-gray-400">
        {label}: <em>none</em>
      </span>
    );
  }
  return (
    <span className="text-xs text-gray-600">
      {label}:{" "}
      {tokens.map((t, i) => (
        <Fragment key={t + i}>
          {i > 0 && " "}
          <code className="bg-gray-100 rounded px-1">{t}</code>
        </Fragment>
      ))}
    </span>
  );
}

function ExcerptBlock({ excerpt }: { excerpt: string }) {
  return (
    <pre className="mt-2 text-[11px] leading-snug bg-gray-50 border border-gray-200 rounded p-2 overflow-x-auto whitespace-pre-wrap break-words text-gray-700 max-h-48">
      {excerpt}
    </pre>
  );
}

// LLM failure indicator. "ok" / undefined → nothing rendered.
// auth_failed / missing_api_key are visually loud (red) because they
// also fire a Discord alert; everything else is amber (per-page glitch).
function LlmFailurePill({
  failureReason,
  httpStatus,
}: {
  failureReason?: string;
  httpStatus?: number;
}) {
  if (!failureReason || failureReason === "ok") return null;
  const fatal =
    failureReason === "auth_failed" || failureReason === "missing_api_key";
  return (
    <StatusPill tone={fatal ? "fail" : "warn"}>
      llm: {failureReason}
      {typeof httpStatus === "number" ? ` (${httpStatus})` : ""}
    </StatusPill>
  );
}

function EntryRow({ entry }: { entry: RunLogEntry }) {
  switch (entry.step) {
    case "source_started":
      return (
        <div className="flex items-center gap-2 text-sm text-gray-700">
          <StepBadge>start</StepBadge>
          <span>
            tier {entry.source_tier} {entry.source_kind}
          </span>
        </div>
      );
    case "search":
      return (
        <div className="text-sm text-gray-700">
          <div className="flex items-center gap-2">
            <StepBadge>search</StepBadge>
            {entry.status === "ok" ? (
              <StatusPill tone="ok">{entry.count ?? 0} results</StatusPill>
            ) : (
              <StatusPill tone="fail">failed</StatusPill>
            )}
          </div>
          {entry.query_url ? (
            <div className="mt-1 text-xs">
              <a
                href={entry.query_url}
                target="_blank"
                rel="noreferrer noopener"
                className="text-purple-700 hover:underline break-all"
              >
                {entry.query_url}
              </a>
            </div>
          ) : null}
          {entry.error ? (
            <div className="mt-1 text-xs text-red-700">
              error: {entry.error}
            </div>
          ) : null}
          {entry.candidates && entry.candidates.length > 0 ? (
            <ul className="mt-2 space-y-1 text-xs text-gray-600">
              {entry.candidates.map(c => (
                <li key={c.url} className="flex flex-col">
                  <span className="font-medium text-gray-700">{c.title}</span>
                  <a
                    href={c.url}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="text-purple-700 hover:underline break-all"
                  >
                    {c.url}
                  </a>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      );
    case "prefilter":
      return (
        <div className="text-sm text-gray-700">
          <div className="flex items-center gap-2">
            <StepBadge>prefilter</StepBadge>
            <StatusPill tone={entry.kept.length > 0 ? "ok" : "warn"}>
              {entry.kept.length} kept · {entry.dropped.length} dropped
            </StatusPill>
          </div>
          <div className="mt-1 flex flex-col gap-0.5">
            <TokenList label="seed tokens" tokens={entry.seed_tokens} />
            <TokenList label="brand tokens" tokens={entry.brand_tokens} />
          </div>
          {entry.dropped.length > 0 ? (
            <details className="mt-2">
              <summary className="text-xs cursor-pointer text-gray-600 hover:text-gray-800">
                Why each dropped candidate was rejected
              </summary>
              <ul className="mt-1 ml-2 space-y-1 text-xs text-gray-600">
                {entry.dropped.map(d => (
                  <li key={d.url} className="flex flex-col">
                    <span className="font-medium text-gray-700">{d.title}</span>
                    <a
                      href={d.url}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="text-purple-700 hover:underline break-all"
                    >
                      {d.url}
                    </a>
                    {d.missing_tokens.length > 0 ? (
                      <span>
                        missing seed tokens:{" "}
                        {d.missing_tokens.map((t, i) => (
                          <code
                            key={t + i}
                            className="bg-red-50 rounded px-1 mr-1"
                          >
                            {t}
                          </code>
                        ))}
                      </span>
                    ) : null}
                    {d.extra_tokens.length > 0 ? (
                      <span>
                        extra tokens not in seed/brand:{" "}
                        {d.extra_tokens.map((t, i) => (
                          <code
                            key={t + i}
                            className="bg-amber-50 rounded px-1 mr-1"
                          >
                            {t}
                          </code>
                        ))}
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </div>
      );
    case "match":
      return (
        <div className="text-sm text-gray-700">
          <div className="flex items-center gap-2 flex-wrap">
            <StepBadge>match</StepBadge>
            {entry.status === "transient" ? (
              <StatusPill tone="warn">transient: {entry.reason}</StatusPill>
            ) : entry.result_null ? (
              <StatusPill tone="fail">null result</StatusPill>
            ) : entry.matches ? (
              <StatusPill tone="ok">
                matches · confidence {entry.confidence?.toFixed(2)}
              </StatusPill>
            ) : (
              <StatusPill tone="fail">
                no match · confidence {entry.confidence?.toFixed(2)}
              </StatusPill>
            )}
            <LlmFailurePill
              failureReason={entry.failure_reason}
              httpStatus={entry.http_status}
            />
            {typeof entry.tokens === "number" ? (
              <span className="text-xs text-gray-500">
                {entry.tokens.toLocaleString()} tokens
              </span>
            ) : null}
          </div>
          <div className="mt-1 text-xs text-gray-600 break-all">
            <a
              href={entry.candidate_url}
              target="_blank"
              rel="noreferrer noopener"
              className="text-purple-700 hover:underline"
            >
              {entry.candidate_url}
            </a>
          </div>
          {entry.validation_detail ? (
            <div className="mt-1 text-xs text-red-700">
              detail: {entry.validation_detail}
            </div>
          ) : null}
          {entry.probe_excerpt ? (
            <details className="mt-1">
              <summary className="text-xs cursor-pointer text-gray-600 hover:text-gray-800">
                HTML excerpt sent to the LLM
              </summary>
              <ExcerptBlock excerpt={entry.probe_excerpt} />
            </details>
          ) : null}
          {entry.raw_response ? (
            <details className="mt-1">
              <summary className="text-xs cursor-pointer text-gray-600 hover:text-gray-800">
                Raw response from the LLM
              </summary>
              <ExcerptBlock excerpt={entry.raw_response} />
            </details>
          ) : null}
        </div>
      );
    case "match_summary":
      return (
        <div className="flex items-center gap-2 text-sm text-gray-700">
          <StepBadge>match summary</StepBadge>
          <span className="text-xs text-gray-600">
            tried {entry.survivors_attempted} ·{" "}
            {entry.winner_url ? (
              <>
                winner:{" "}
                <a
                  href={entry.winner_url}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="text-purple-700 hover:underline break-all"
                >
                  {entry.winner_url}
                </a>
              </>
            ) : (
              <em>no winner</em>
            )}
          </span>
        </div>
      );
    case "fetch":
      return (
        <div className="text-sm text-gray-700">
          <div className="flex items-center gap-2 flex-wrap">
            <StepBadge>fetch</StepBadge>
            {entry.status === "ok" ? (
              <StatusPill tone="ok">
                {entry.html_length?.toLocaleString() ?? "?"} bytes
              </StatusPill>
            ) : (
              <StatusPill tone="fail">failed</StatusPill>
            )}
          </div>
          <div className="mt-1 text-xs text-gray-600 break-all">
            <a
              href={entry.candidate_url}
              target="_blank"
              rel="noreferrer noopener"
              className="text-purple-700 hover:underline"
            >
              {entry.candidate_url}
            </a>
            {entry.final_url && entry.final_url !== entry.candidate_url ? (
              <span className="block">
                redirected →{" "}
                <a
                  href={entry.final_url}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="text-purple-700 hover:underline"
                >
                  {entry.final_url}
                </a>
              </span>
            ) : null}
          </div>
          {entry.error ? (
            <div className="mt-1 text-xs text-red-700">
              error: {entry.error}
            </div>
          ) : null}
        </div>
      );
    case "extract":
      return (
        <div className="text-sm text-gray-700">
          <div className="flex items-center gap-2 flex-wrap">
            <StepBadge>extract</StepBadge>
            {entry.status === "ok" ? (
              <StatusPill tone="ok">
                {entry.fields_count ?? 0} fields
                {entry.has_description ? " + description" : ""}
              </StatusPill>
            ) : entry.status === "transient" ? (
              <StatusPill tone="warn">transient: {entry.reason}</StatusPill>
            ) : (
              <StatusPill tone="fail">null result</StatusPill>
            )}
            <LlmFailurePill
              failureReason={entry.failure_reason}
              httpStatus={entry.http_status}
            />
            {typeof entry.tokens === "number" ? (
              <span className="text-xs text-gray-500">
                {entry.tokens.toLocaleString()} tokens
              </span>
            ) : null}
          </div>
          {entry.validation_detail ? (
            <div className="mt-1 text-xs text-red-700">
              detail: {entry.validation_detail}
            </div>
          ) : null}
          {entry.uncertain_fields && entry.uncertain_fields.length > 0 ? (
            <div className="mt-1 text-xs text-amber-700">
              uncertain:{" "}
              {entry.uncertain_fields.map((f, i) => (
                <code key={f + i} className="bg-amber-50 rounded px-1 mr-1">
                  {f}
                </code>
              ))}
            </div>
          ) : null}
          {entry.excerpt ? (
            <details className="mt-1">
              <summary className="text-xs cursor-pointer text-gray-600 hover:text-gray-800">
                HTML excerpt sent to the LLM
              </summary>
              <ExcerptBlock excerpt={entry.excerpt} />
            </details>
          ) : null}
          {entry.raw_response ? (
            <details className="mt-1">
              <summary className="text-xs cursor-pointer text-gray-600 hover:text-gray-800">
                Raw response from the LLM
              </summary>
              <ExcerptBlock excerpt={entry.raw_response} />
            </details>
          ) : null}
        </div>
      );
    case "contribution":
      return (
        <div className="text-sm text-gray-700">
          <div className="flex items-center gap-2 flex-wrap">
            <StepBadge>contribution</StepBadge>
            <StatusPill tone="ok">
              {entry.fields.length} fields
              {entry.description ? " + description" : ""}
            </StatusPill>
          </div>
          {entry.fields.length > 0 ? (
            <div className="mt-1 text-xs text-gray-600">
              {entry.fields.map((f, i) => (
                <code key={f + i} className="bg-green-50 rounded px-1 mr-1">
                  {f}
                </code>
              ))}
            </div>
          ) : null}
        </div>
      );
    case "source_done":
      return (
        <div className="flex items-center gap-2 text-sm text-gray-600 italic">
          <StepBadge>done</StepBadge>
          <span>{entry.reason.replace(/_/g, " ")}</span>
        </div>
      );
    default:
      return null;
  }
}

export function SpecSourcingRunLog({ entries }: SpecSourcingRunLogProps) {
  if (!entries || entries.length === 0) {
    return (
      <p
        className="text-sm text-gray-500"
        data-testid="spec-sourcing-run-log-empty"
      >
        No run log persisted for this proposal. (Predates TT-162 or transient
        halt with no proposal upsert.)
      </p>
    );
  }

  const { pre, groups, post } = groupBySource(entries);
  const merge = post.find(e => e.step === "merge");
  const outcome = post.find(e => e.step === "outcome");

  return (
    <div className="space-y-4" data-testid="spec-sourcing-run-log">
      {pre.length > 0 ? (
        <div className="bg-gray-50 border border-gray-200 rounded p-3">
          <h3 className="text-xs font-semibold text-gray-600 uppercase tracking-wider mb-2">
            Brand-mismatch skips
          </h3>
          <ul className="space-y-1 text-xs text-gray-600">
            {pre.map((e, i) =>
              e.step === "source_skipped_brand" ? (
                <li key={i}>
                  Skipped{" "}
                  <code className="bg-white border rounded px-1">
                    {e.source_id}
                  </code>{" "}
                  (brand {e.source_brand}) — equipment brand is{" "}
                  {e.equipment_brand}
                </li>
              ) : null
            )}
          </ul>
        </div>
      ) : null}

      {groups.map(group => (
        <section
          key={group.sourceId}
          className="bg-white border border-gray-200 rounded-lg p-4"
          data-testid={`run-log-source-${group.sourceId}`}
        >
          <h3 className="text-sm font-semibold text-gray-900 mb-3">
            <code className="bg-gray-100 rounded px-1.5 py-0.5">
              {group.sourceId}
            </code>
          </h3>
          <div className="space-y-3">
            {group.entries.map((entry, i) => (
              <div
                key={i}
                className="border-l-2 border-gray-200 pl-3"
                data-testid={`run-log-entry-${entry.step}`}
              >
                <EntryRow entry={entry} />
              </div>
            ))}
          </div>
        </section>
      ))}

      {merge && merge.step === "merge" ? (
        <section className="bg-purple-50 border border-purple-200 rounded-lg p-4">
          <h3 className="text-sm font-semibold text-purple-900 mb-2">
            Merge summary
          </h3>
          <p className="text-sm text-purple-800">
            {merge.merged_field_count} fields kept across sources.
          </p>
          {Object.keys(merge.per_field_winners).length > 0 ? (
            <ul className="mt-2 text-xs text-purple-800 grid grid-cols-2 gap-x-4 gap-y-1">
              {Object.entries(merge.per_field_winners).map(([field, src]) => (
                <li key={field}>
                  <code className="bg-white rounded px-1 mr-1">{field}</code>→{" "}
                  <code className="font-medium">{src}</code>
                </li>
              ))}
            </ul>
          ) : null}
          {merge.description_source_id ? (
            <p className="mt-2 text-xs text-purple-800">
              description from{" "}
              <code className="font-medium">{merge.description_source_id}</code>
            </p>
          ) : null}
        </section>
      ) : null}

      {outcome && outcome.step === "outcome" ? (
        <section
          className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-sm text-gray-700"
          data-testid="run-log-outcome"
        >
          <span className="font-semibold">Outcome:</span> {outcome.status}
          {outcome.merged_field_count !== undefined
            ? ` (${outcome.merged_field_count} fields merged)`
            : ""}
          {outcome.reason ? ` — ${outcome.reason}` : ""}
        </section>
      ) : null}
    </div>
  );
}

// Unified player importer admin UI (TT-201).
//
// One page replaces the three deleted routes from TT-200's pre-shape:
//   - /admin/players-import (run trigger)
//   - /admin/player-proposals (queue list)
//   - /admin/player-proposals/$id (detail review)
// (Detail view still exists as admin.import-players.$id.tsx — this
// route is the run trigger + inline queue.)
//
// Run import action (TT-204): walks the WTT roster, dedupes against
// existing players + open proposals (cheap, inline), and enqueues one
// `player-import-queue` message per truly-new ittfid. The queue
// consumer (app/lib/players/queue.server.ts) drains each in its own
// Worker invocation, enriches via ITTF, downloads the headshot, and
// either auto-applies or leaves the proposal in pending_review. The
// "Pending in queue" tile counts proposals whose last run_log entry
// is still `roster_match` (enqueued, not yet picked up).

import type { Route } from "./+types/admin.import-players._index";
import { data, Form, Link, useNavigation } from "react-router";
import { Inbox, PlayCircle, Loader2 } from "lucide-react";

import {
  ensureAdminAction,
  ensureAdminLoader,
} from "~/lib/admin/middleware.server";
import { rejectPlayerProposal } from "~/lib/admin/player-proposal-applier.server";
import { runImport } from "~/lib/players/importer.server";
import { formatRelativeTime } from "~/lib/date";
import { Logger, createLogContext } from "~/lib/logger.server";
import type { ImporterSummary, MergedPlayer } from "~/lib/players/types";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Import Players | Admin | TT Reviews" },
    {
      name: "description",
      content: "Run the WTT/ITTF player importer and review queued proposals.",
    },
    { name: "robots", content: "noindex, nofollow" },
  ];
}

// TT-207: the page now drives off lifecycle status derived from
// (proposal.status, last run_log step), not just proposal.status.
// "Enqueued" / "Processing" / "Needs review" all share status=
// 'pending_review' on the row — what separates them is whether the
// consumer has appended any log entries past `roster_match` and
// whether it terminated.
type LifecycleStatus =
  | "enqueued" // producer inserted stub; consumer hasn't run
  | "processing" // consumer started but didn't terminate yet
  | "needs_review" // consumer terminated, incomplete data
  | "auto_applied"
  | "applied"
  | "rejected"
  | "no_results";

interface NeedsReviewRow {
  id: string;
  ittfid: number;
  created_at: string;
  merged: MergedPlayer;
  // Fields the merge entry flagged missing — drives the inline
  // "needs: handedness, grip" hint so the moderator can see what
  // they're being asked to fill in before clicking through.
  missing_fields: string[];
}

interface ActivityRow {
  id: string;
  ittfid: number;
  created_at: string;
  lifecycle: LifecycleStatus;
  merged: MergedPlayer;
  // Set when the proposal materialised a players row (auto_applied
  // or applied). The activity feed links straight to the live page.
  applied_slug: string | null;
  applied_name: string | null;
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const gate = await ensureAdminLoader(request, context);
  if (gate instanceof Response) return gate;
  const { sbServerClient, supabaseAdmin, csrfToken } = gate;

  // TT-207: pull a single ordered slice of proposals + classify each
  // by lifecycle (status + last run_log step). Splits in-memory into
  // "needs review" (actionable) vs. "activity log" (everything).
  // One PostgREST read for all rows on the page + one head-only
  // count for the queue tile.
  const ACTIVITY_LIMIT = 50;
  const [proposalsRes, queuedRes] = await Promise.all([
    supabaseAdmin
      .from("player_proposals")
      .select(
        "id, ittfid, created_at, status, applied_player_id, merged, run_log, applied_player:applied_player_id(slug, name)"
      )
      .order("created_at", { ascending: false })
      .limit(ACTIVITY_LIMIT),
    supabaseAdmin
      .from("player_proposals")
      .select("ittfid", { count: "exact", head: true })
      .eq("status", "pending_review")
      .filter("run_log->-1->>step", "eq", "roster_match"),
  ]);
  const queuedInPipeline = queuedRes.count ?? 0;

  if (proposalsRes.error) {
    Logger.error(
      "import-players.proposals.failed",
      createLogContext("admin-import-players"),
      new Error(proposalsRes.error.message)
    );
  }

  // PostgREST's typed output models nested FK embeds as arrays even
  // when the relationship is many-to-one, so unwrap via `unknown` and
  // accept either shape at runtime.
  type ProposalRaw = {
    id: string;
    ittfid: number;
    created_at: string;
    status: string;
    applied_player_id: string | null;
    merged: MergedPlayer;
    run_log: Array<{
      step: string;
      status?: string;
      missing_fields?: string[];
    }>;
    applied_player:
      | { slug: string; name: string }
      | Array<{ slug: string; name: string }>
      | null;
  };

  const raw = (proposalsRes.data ?? []) as unknown as ProposalRaw[];

  const activity: ActivityRow[] = [];
  const needsReview: NeedsReviewRow[] = [];

  for (const r of raw) {
    const player = Array.isArray(r.applied_player)
      ? (r.applied_player[0] ?? null)
      : r.applied_player;
    const lifecycle = classifyLifecycle(r.status, r.run_log ?? []);
    activity.push({
      id: r.id,
      ittfid: r.ittfid,
      created_at: r.created_at,
      lifecycle,
      merged: r.merged,
      applied_slug: player?.slug ?? null,
      applied_name: player?.name ?? null,
    });
    if (lifecycle === "needs_review") {
      // Pull missing-field hints from the merge entry so the row
      // tells the moderator at a glance what's incomplete.
      const merge = (r.run_log ?? []).find(e => e.step === "merge");
      const missing = Array.isArray(merge?.missing_fields)
        ? (merge!.missing_fields as string[])
        : [];
      needsReview.push({
        id: r.id,
        ittfid: r.ittfid,
        created_at: r.created_at,
        merged: r.merged,
        missing_fields: missing,
      });
    }
  }

  return data(
    {
      needsReview,
      activity,
      queuedInPipeline,
      csrfToken,
    },
    { headers: sbServerClient.headers }
  );
}

// In-memory lifecycle classifier — mirrors LifecycleStatus.
// pending_review splits three ways depending on consumer progress;
// terminal statuses pass through unchanged.
function classifyLifecycle(
  status: string,
  runLog: Array<{ step: string; status?: string }>
): LifecycleStatus {
  if (status === "auto_applied") return "auto_applied";
  if (status === "applied") return "applied";
  if (status === "rejected") return "rejected";
  if (status === "no_results") return "no_results";
  // pending_review fan-out
  const last = runLog[runLog.length - 1];
  if (!last || last.step === "roster_match") return "enqueued";
  if (last.step === "terminal") {
    if (last.status === "queued_for_review") return "needs_review";
    // terminal + retry / error: still pending until consumer succeeds
    return "processing";
  }
  // mid-pipeline (ittf_fetch / photo_fetch / r2_upload / merge)
  return "processing";
}

interface RunResult {
  kind: "run";
  summary: ImporterSummary;
  error?: string;
}

interface RejectResult {
  kind: "reject";
  error?: string;
}

type ActionResult = RunResult | RejectResult | { kind: "noop"; error: string };

export async function action({ request, context }: Route.ActionArgs) {
  const gate = await ensureAdminAction(request, context);
  if (gate instanceof Response) return gate;
  const { sbServerClient, user, supabaseAdmin } = gate;

  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "run-import") {
    const env = context.cloudflare.env as unknown as {
      IMAGE_BUCKET: import("~/lib/players/photo.server").R2PutBucket;
      PLAYER_IMPORT_QUEUE: import("~/lib/players/importer.server").PlayerImportQueueProducer;
    };
    try {
      const summary = await runImport(
        supabaseAdmin,
        env.IMAGE_BUCKET,
        env.PLAYER_IMPORT_QUEUE
      );
      return data<ActionResult>(
        { kind: "run", summary },
        { headers: sbServerClient.headers }
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      Logger.error(
        "import-players.run.failed",
        createLogContext("admin-import-players"),
        err instanceof Error ? err : undefined
      );
      return data<ActionResult>(
        {
          kind: "run",
          summary: {
            skipped_existing: 0,
            queued_for_processing: 0,
            errors: [],
          },
          error: message,
        },
        { status: 500, headers: sbServerClient.headers }
      );
    }
  }

  if (intent === "reject") {
    const proposalId = formData.get("proposal_id");
    if (typeof proposalId !== "string" || proposalId.length === 0) {
      return data<ActionResult>(
        { kind: "reject", error: "missing proposal_id" },
        { status: 400, headers: sbServerClient.headers }
      );
    }
    const result = await rejectPlayerProposal(
      supabaseAdmin,
      proposalId,
      user.id
    );
    if (!result.ok) {
      Logger.error(
        "import-players.reject.failed",
        createLogContext("admin-import-players", { proposalId }),
        new Error(result.error ?? "reject failed")
      );
      return data<ActionResult>(
        { kind: "reject", error: result.error ?? "reject failed" },
        { status: 400, headers: sbServerClient.headers }
      );
    }
    return data<ActionResult>(
      { kind: "reject" },
      { headers: sbServerClient.headers }
    );
  }

  return data<ActionResult>(
    { kind: "noop", error: "Unknown action" },
    { status: 400, headers: sbServerClient.headers }
  );
}

function describeMerged(m: MergedPlayer): string {
  const bits: string[] = [];
  if (m.represents) bits.push(m.represents);
  if (m.gender) bits.push(m.gender === "M" ? "Men" : "Women");
  if (m.birth_year) bits.push(`b. ${m.birth_year}`);
  if (m.handedness)
    bits.push(`${m.handedness[0].toUpperCase()}${m.handedness.slice(1)}-hand`);
  if (m.grip) bits.push(`${m.grip[0].toUpperCase()}${m.grip.slice(1)}`);
  return bits.join(" · ");
}

export default function AdminImportPlayersIndex({
  loaderData,
  actionData,
}: Route.ComponentProps) {
  const { needsReview, activity, queuedInPipeline, csrfToken } = loaderData;
  const navigation = useNavigation();
  const isRunning =
    navigation.state === "submitting" &&
    navigation.formData?.get("intent") === "run-import";

  const runSummary =
    actionData && actionData.kind === "run" ? actionData.summary : null;
  const runError =
    actionData && "error" in actionData ? actionData.error : null;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Import Players</h1>
        <p className="text-sm text-gray-600 mt-1">
          Pulls the WTT roster, enriches each new entry via ITTF (handedness,
          grip, birth year), downloads the headshot, and either auto-applies
          (complete data) or queues for review.
        </p>
      </header>

      <section
        className="bg-white rounded-lg shadow p-6 mb-6"
        data-testid="import-players-run"
      >
        <Form method="post">
          <input type="hidden" name="_csrf" value={csrfToken} />
          <input type="hidden" name="intent" value="run-import" />
          <button
            type="submit"
            disabled={isRunning}
            className="inline-flex items-center gap-2 px-4 py-2 bg-purple-600 text-white text-sm font-medium rounded-md hover:bg-purple-700 disabled:bg-purple-400 disabled:cursor-not-allowed"
            data-testid="import-players-run-button"
          >
            {isRunning ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : (
              <PlayCircle className="size-4" aria-hidden />
            )}
            {isRunning ? "Running…" : "Run import"}
          </button>
        </Form>

        <dl
          className="mt-4 grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm"
          data-testid="import-players-queue-stats"
        >
          <SummaryStat
            label="Pending in queue"
            value={queuedInPipeline}
            testId="import-players-queue-pending"
          />
          {runSummary ? (
            <>
              <SummaryStat
                label="Queued this run"
                value={runSummary.queued_for_processing}
                testId="import-players-queued-for-processing"
              />
              <SummaryStat
                label="Skipped (already known)"
                value={runSummary.skipped_existing}
                testId="import-players-skipped-existing"
              />
              {runSummary.recovered_orphans ? (
                <SummaryStat
                  label="Recovered orphans"
                  value={runSummary.recovered_orphans}
                  testId="import-players-recovered-orphans"
                />
              ) : null}
            </>
          ) : null}
        </dl>

        {runError ? (
          <div
            className="mt-4 bg-red-50 border border-red-200 text-red-700 rounded-md p-3 text-sm"
            data-testid="import-players-run-error"
            role="alert"
          >
            {runError}
          </div>
        ) : null}

        {runSummary && !runError && runSummary.errors.length > 0 ? (
          <div
            className="mt-4 text-xs text-red-700"
            data-testid="import-players-run-errors"
          >
            Errors:{" "}
            {runSummary.errors.map(e => `${e.ittfid}: ${e.message}`).join("; ")}
          </div>
        ) : null}
      </section>

      <section className="mb-10" data-testid="import-players-needs-review">
        <header className="mb-3 flex items-baseline justify-between">
          <h2 className="text-lg font-semibold text-gray-900">
            Needs your review ({needsReview.length})
          </h2>
          <p className="text-xs text-gray-500">
            Importer finished but data was incomplete.
          </p>
        </header>
        {needsReview.length === 0 ? (
          <div
            className="bg-white rounded-lg shadow p-6 text-center text-gray-500"
            data-testid="import-players-needs-review-empty"
          >
            <Inbox className="size-6 mx-auto mb-2 text-gray-400" aria-hidden />
            <p className="text-sm">Nothing waiting on you.</p>
          </div>
        ) : (
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Player
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Missing
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Queued
                  </th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {needsReview.map(p => (
                  <tr
                    key={p.id}
                    data-testid={`import-players-needs-review-row-${p.id}`}
                  >
                    <td className="px-4 py-3 text-sm text-gray-900">
                      <div className="font-medium">{p.merged.name}</div>
                      <div className="text-xs text-gray-500">
                        ittfid {p.ittfid}
                        {describeMerged(p.merged)
                          ? ` · ${describeMerged(p.merged)}`
                          : ""}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-amber-700">
                      {p.missing_fields.length > 0
                        ? p.missing_fields.join(", ")
                        : "—"}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500">
                      {formatRelativeTime(p.created_at)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Link
                          to={`/admin/import-players/${p.id}`}
                          className="inline-flex items-center px-3 py-1.5 bg-purple-600 text-white text-xs font-medium rounded-md hover:bg-purple-700"
                          data-testid={`import-players-review-${p.id}`}
                        >
                          Review
                        </Link>
                        <Form method="post" className="inline-block">
                          <input type="hidden" name="_csrf" value={csrfToken} />
                          <input type="hidden" name="intent" value="reject" />
                          <input
                            type="hidden"
                            name="proposal_id"
                            value={p.id}
                          />
                          <button
                            type="submit"
                            className="inline-flex items-center px-3 py-1.5 bg-white border border-gray-300 text-gray-700 text-xs font-medium rounded-md hover:bg-gray-50"
                            data-testid={`import-players-reject-${p.id}`}
                          >
                            Reject
                          </button>
                        </Form>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section data-testid="import-players-activity">
        <header className="mb-3">
          <h2 className="text-lg font-semibold text-gray-900">Activity log</h2>
          <p className="text-xs text-gray-500">
            Latest 50 proposals across every status. Click a row for the
            importer run log.
          </p>
        </header>
        {activity.length === 0 ? (
          <div className="bg-white rounded-lg shadow p-6 text-center text-gray-500">
            <p className="text-sm">No proposals yet.</p>
          </div>
        ) : (
          <ul className="bg-white rounded-lg shadow divide-y divide-gray-200">
            {activity.map(r => (
              <li
                key={r.id}
                className="px-4 py-3 flex items-baseline justify-between gap-3 text-sm"
                data-testid={`import-players-activity-row-${r.id}`}
              >
                <div className="min-w-0 flex-1">
                  <Link
                    to={`/admin/import-players/${r.id}`}
                    className="font-medium text-gray-900 hover:text-purple-700"
                  >
                    {r.merged.name}
                  </Link>
                  <span className="ml-2 text-xs text-gray-500">
                    ittfid {r.ittfid}
                  </span>
                  {r.applied_slug ? (
                    <>
                      {" · "}
                      <Link
                        to={`/players/${r.applied_slug}`}
                        className="text-xs text-purple-700 hover:underline"
                      >
                        view player
                      </Link>
                    </>
                  ) : null}
                </div>
                <div className="flex items-baseline gap-3 shrink-0">
                  <LifecyclePill
                    status={r.lifecycle}
                    testId={`import-players-activity-pill-${r.id}`}
                  />
                  <span className="text-xs text-gray-500 tabular-nums">
                    {formatRelativeTime(r.created_at)}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

// Per-lifecycle visual pill. Colors mirror the run-log component's
// status tones (ok → green, warn → amber, fail → red, neutral → gray)
// so the page reads consistently.
function LifecyclePill({
  status,
  testId,
}: {
  status: LifecycleStatus;
  testId?: string;
}) {
  const { label, tone } = LIFECYCLE_DISPLAY[status];
  const cls =
    tone === "ok"
      ? "bg-green-100 text-green-800"
      : tone === "warn"
        ? "bg-amber-100 text-amber-800"
        : tone === "fail"
          ? "bg-red-100 text-red-800"
          : "bg-gray-100 text-gray-700";
  return (
    <span
      className={`inline-block text-[10px] uppercase tracking-wider font-semibold rounded px-1.5 py-0.5 ${cls}`}
      data-testid={testId}
    >
      {label}
    </span>
  );
}

const LIFECYCLE_DISPLAY: Record<
  LifecycleStatus,
  { label: string; tone: "ok" | "warn" | "fail" | "neutral" }
> = {
  enqueued: { label: "Enqueued", tone: "neutral" },
  processing: { label: "Processing", tone: "neutral" },
  needs_review: { label: "Needs review", tone: "warn" },
  auto_applied: { label: "Auto-applied", tone: "ok" },
  applied: { label: "Approved", tone: "ok" },
  rejected: { label: "Rejected", tone: "fail" },
  no_results: { label: "No results", tone: "warn" },
};

function SummaryStat({
  label,
  value,
  testId,
}: {
  label: string;
  value: number;
  testId?: string;
}) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-gray-500">{label}</dt>
      <dd
        className="text-2xl font-semibold text-gray-900 tabular-nums"
        data-testid={testId}
      >
        {value}
      </dd>
    </div>
  );
}

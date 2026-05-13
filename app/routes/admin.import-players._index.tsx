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

interface PendingProposalRow {
  id: string;
  ittfid: number;
  created_at: string;
  merged: MergedPlayer;
}

interface RecentImportRow {
  id: string;
  ittfid: number;
  created_at: string;
  status: "applied" | "auto_applied";
  applied_player_id: string | null;
  applied_slug: string | null;
  applied_name: string | null;
  merged: MergedPlayer;
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const gate = await ensureAdminLoader(request, context);
  if (gate instanceof Response) return gate;
  const { sbServerClient, supabaseAdmin, csrfToken } = gate;

  // TT-204 "Pending in queue" count: proposals whose last run_log
  // entry is still the producer's `roster_match` seed (the consumer
  // hasn't appended ittf_fetch yet). Uses the JSONB path `run_log->-1
  // ->>'step'` so the read is one PostgREST round-trip.
  const [pendingRes, recentRes, queuedRes] = await Promise.all([
    supabaseAdmin
      .from("player_proposals")
      .select("id, ittfid, created_at, merged")
      .eq("status", "pending_review")
      .order("created_at", { ascending: true })
      .limit(50),
    supabaseAdmin
      .from("player_proposals")
      .select(
        "id, ittfid, created_at, status, applied_player_id, merged, applied_player:applied_player_id(slug, name)"
      )
      .in("status", ["applied", "auto_applied"])
      .order("created_at", { ascending: false })
      .limit(20),
    supabaseAdmin
      .from("player_proposals")
      .select("ittfid", { count: "exact", head: true })
      .eq("status", "pending_review")
      .filter("run_log->-1->>step", "eq", "roster_match"),
  ]);
  const queuedInPipeline = queuedRes.count ?? 0;

  if (pendingRes.error) {
    Logger.error(
      "import-players.pending.failed",
      createLogContext("admin-import-players"),
      new Error(pendingRes.error.message)
    );
  }
  if (recentRes.error) {
    Logger.error(
      "import-players.recent.failed",
      createLogContext("admin-import-players"),
      new Error(recentRes.error.message)
    );
  }

  // PostgREST's typed output models nested FK embeds as arrays even
  // when the relationship is many-to-one, so unwrap via `unknown` and
  // accept either shape at runtime.
  type RecentRaw = {
    id: string;
    ittfid: number;
    created_at: string;
    status: "applied" | "auto_applied";
    applied_player_id: string | null;
    merged: MergedPlayer;
    applied_player:
      | { slug: string; name: string }
      | Array<{ slug: string; name: string }>
      | null;
  };
  const rawRecent = (recentRes.data ?? []) as unknown as RecentRaw[];
  const recent: RecentImportRow[] = rawRecent.map(r => {
    const player = Array.isArray(r.applied_player)
      ? (r.applied_player[0] ?? null)
      : r.applied_player;
    return {
      id: r.id,
      ittfid: r.ittfid,
      created_at: r.created_at,
      status: r.status,
      applied_player_id: r.applied_player_id,
      applied_slug: player?.slug ?? null,
      applied_name: player?.name ?? null,
      merged: r.merged,
    };
  });

  return data(
    {
      pending: (pendingRes.data ?? []) as PendingProposalRow[],
      recent,
      queuedInPipeline,
      csrfToken,
    },
    { headers: sbServerClient.headers }
  );
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
  const { pending, recent, queuedInPipeline, csrfToken } = loaderData;
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

      <section className="mb-10" data-testid="import-players-pending">
        <header className="mb-3 flex items-baseline justify-between">
          <h2 className="text-lg font-semibold text-gray-900">
            Pending review ({pending.length})
          </h2>
          <p className="text-xs text-gray-500">Oldest first.</p>
        </header>
        {pending.length === 0 ? (
          <div
            className="bg-white rounded-lg shadow p-6 text-center text-gray-500"
            data-testid="import-players-pending-empty"
          >
            <Inbox className="size-6 mx-auto mb-2 text-gray-400" aria-hidden />
            <p className="text-sm">No pending proposals.</p>
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
                    Details
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
                {pending.map(p => (
                  <tr
                    key={p.id}
                    data-testid={`import-players-pending-row-${p.id}`}
                  >
                    <td className="px-4 py-3 text-sm text-gray-900">
                      <div className="font-medium">{p.merged.name}</div>
                      <div className="text-xs text-gray-500">
                        ittfid {p.ittfid}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700">
                      {describeMerged(p.merged) || "—"}
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

      <section data-testid="import-players-recent">
        <header className="mb-3">
          <h2 className="text-lg font-semibold text-gray-900">
            Recent imports
          </h2>
          <p className="text-xs text-gray-500">
            Last 20 auto-applied or admin-approved.
          </p>
        </header>
        {recent.length === 0 ? (
          <div className="bg-white rounded-lg shadow p-6 text-center text-gray-500">
            <p className="text-sm">No imports yet.</p>
          </div>
        ) : (
          <ul className="bg-white rounded-lg shadow divide-y divide-gray-200">
            {recent.map(r => (
              <li
                key={r.id}
                className="px-4 py-3 flex items-baseline justify-between text-sm"
                data-testid={`import-players-recent-row-${r.id}`}
              >
                <div>
                  {r.applied_slug ? (
                    <Link
                      to={`/players/${r.applied_slug}`}
                      className="font-medium text-purple-700 hover:underline"
                    >
                      {r.applied_name ?? r.merged.name}
                    </Link>
                  ) : (
                    <span className="font-medium text-gray-900">
                      {r.merged.name}
                    </span>
                  )}
                  <span className="ml-2 text-xs text-gray-500">
                    ittfid {r.ittfid}
                  </span>
                </div>
                <div className="text-xs text-gray-500">
                  <span
                    className={
                      r.status === "auto_applied"
                        ? "text-green-700 mr-2"
                        : "text-blue-700 mr-2"
                    }
                  >
                    {r.status === "auto_applied" ? "auto" : "approved"}
                  </span>
                  {formatRelativeTime(r.created_at)}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

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

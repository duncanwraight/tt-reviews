// Player proposal detail / review (TT-201).
//
// Loads one row from `player_proposals`, shows the merged fields with
// per-source attribution, and offers Approve / Reject. Approve goes
// through applyPlayerProposal which (re-)downloads the headshot if
// needed, inserts a `players` row, and stamps `applied_player_id` on
// the proposal. Reject stamps `status='rejected'`.

import type { Route } from "./+types/admin.import-players.$id";
import { data, Form, Link, redirect } from "react-router";

import {
  ensureAdminAction,
  ensureAdminLoader,
} from "~/lib/admin/middleware.server";
import {
  applyPlayerProposal,
  rejectPlayerProposal,
} from "~/lib/admin/player-proposal-applier.server";
import type { R2PutBucket } from "~/lib/players/photo.server";
import { retryPlayerImportPhoto } from "~/lib/players/queue.server";
import type { RunLogEntry } from "~/lib/players/run-log";
import type {
  IttfProfileCandidate,
  MergedPlayer,
  WttRosterCandidate,
} from "~/lib/players/types";
import { Logger, createLogContext } from "~/lib/logger.server";
import { PlayerImportRunLog } from "~/components/admin/PlayerImportRunLog";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Review Import | Admin | TT Reviews" },
    {
      name: "description",
      content: "Review a queued player proposal from the importer.",
    },
    { name: "robots", content: "noindex, nofollow" },
  ];
}

interface ProposalDetail {
  id: string;
  ittfid: number;
  status: string;
  created_at: string;
  merged: MergedPlayer;
  candidates: {
    wtt?: WttRosterCandidate;
    ittf?: IttfProfileCandidate;
  };
  run_log: RunLogEntry[];
  // TT-207: when applied / auto_applied, the linked players row's
  // slug + name drive the "view player" CTA on the page banner.
  applied_slug: string | null;
  applied_name: string | null;
}

export async function loader({ request, context, params }: Route.LoaderArgs) {
  const gate = await ensureAdminLoader(request, context);
  if (gate instanceof Response) return gate;
  const { sbServerClient, supabaseAdmin, csrfToken } = gate;

  const { data: proposal, error } = await supabaseAdmin
    .from("player_proposals")
    .select(
      "id, ittfid, status, created_at, merged, candidates, run_log, applied_player:applied_player_id(slug, name)"
    )
    .eq("id", params.id)
    .maybeSingle();

  if (error || !proposal) {
    throw new Response("Not found", { status: 404 });
  }

  // PostgREST embeds resolve as either { ... } or [{...}] depending
  // on the typed schema; unwrap via `unknown`.
  const raw = proposal as unknown as {
    id: string;
    ittfid: number;
    status: string;
    created_at: string;
    merged: MergedPlayer;
    candidates: ProposalDetail["candidates"];
    run_log: RunLogEntry[] | null;
    applied_player:
      | { slug: string; name: string }
      | Array<{ slug: string; name: string }>
      | null;
  };
  const player = Array.isArray(raw.applied_player)
    ? (raw.applied_player[0] ?? null)
    : raw.applied_player;

  const detail: ProposalDetail = {
    id: raw.id,
    ittfid: raw.ittfid,
    status: raw.status,
    created_at: raw.created_at,
    merged: raw.merged,
    candidates: raw.candidates,
    run_log: Array.isArray(raw.run_log) ? raw.run_log : [],
    applied_slug: player?.slug ?? null,
    applied_name: player?.name ?? null,
  };

  return data(
    {
      proposal: detail,
      csrfToken,
    },
    { headers: sbServerClient.headers }
  );
}

export async function action({ request, context, params }: Route.ActionArgs) {
  const gate = await ensureAdminAction(request, context);
  if (gate instanceof Response) return gate;
  const { sbServerClient, user, supabaseAdmin } = gate;

  const formData = await request.formData();
  const intent = formData.get("intent");
  const proposalId = params.id;

  if (intent === "approve") {
    const bucket = (
      context.cloudflare.env as unknown as { IMAGE_BUCKET: R2PutBucket }
    ).IMAGE_BUCKET;
    const result = await applyPlayerProposal(
      supabaseAdmin,
      bucket,
      proposalId,
      user.id
    );
    if (!result.ok) {
      Logger.error(
        "import-players.approve.failed",
        createLogContext("admin-import-players-detail", { proposalId }),
        new Error(result.error ?? "approve failed")
      );
      return data(
        { error: result.error ?? "Approve failed" },
        { status: 400, headers: sbServerClient.headers }
      );
    }
    return redirect(`/players/${result.playerSlug}`, {
      headers: sbServerClient.headers,
    });
  }

  if (intent === "reject") {
    const result = await rejectPlayerProposal(
      supabaseAdmin,
      proposalId,
      user.id
    );
    if (!result.ok) {
      Logger.error(
        "import-players.reject.failed",
        createLogContext("admin-import-players-detail", { proposalId }),
        new Error(result.error ?? "reject failed")
      );
      return data(
        { error: result.error ?? "Reject failed" },
        { status: 400, headers: sbServerClient.headers }
      );
    }
    return redirect("/admin/import-players", {
      headers: sbServerClient.headers,
    });
  }

  // TT-208: single-step photo retry. Re-runs photo fetch + R2
  // upload; on success the proposal auto-finalises and we redirect
  // to the live /players/<slug>. On failure we stay on the detail
  // page so the operator can see the new run-log entry.
  if (intent === "retry-photo") {
    const bucket = (
      context.cloudflare.env as unknown as { IMAGE_BUCKET: R2PutBucket }
    ).IMAGE_BUCKET;
    const result = await retryPlayerImportPhoto(
      supabaseAdmin,
      bucket,
      proposalId
    );
    if (result.status === "auto_applied") {
      return redirect(`/players/${result.playerSlug}`, {
        headers: sbServerClient.headers,
      });
    }
    if (result.status === "still_failing") {
      // 200 — the action is "complete," it just didn't materialise a
      // player. The re-loaded detail page will surface the appended
      // run-log entry so the operator can see what changed.
      return data(
        { retried: true, reason: result.reason },
        { headers: sbServerClient.headers }
      );
    }
    Logger.error(
      "import-players.retry-photo.failed",
      createLogContext("admin-import-players-detail", { proposalId }),
      new Error(result.message)
    );
    return data(
      { error: result.message },
      { status: 400, headers: sbServerClient.headers }
    );
  }

  return data(
    { error: "Unknown action" },
    { status: 400, headers: sbServerClient.headers }
  );
}

function fieldRow(
  label: string,
  value: string | number | undefined,
  source?: string,
  sourceUrl?: string
) {
  return (
    <div className="grid grid-cols-3 gap-3 py-2 border-b border-gray-100 text-sm">
      <dt className="font-medium text-gray-700">{label}</dt>
      <dd className="col-span-2 text-gray-900">
        {value !== undefined && value !== null && value !== "" ? (
          <span
            data-testid={`field-${label.toLowerCase().replace(/\s+/g, "-")}`}
          >
            {value}
          </span>
        ) : (
          <span className="text-gray-400">missing</span>
        )}
        {source ? (
          <span className="ml-2 text-xs text-gray-500">
            {sourceUrl ? (
              <a
                href={sourceUrl}
                target="_blank"
                rel="noreferrer noopener"
                className="text-purple-700 hover:underline"
              >
                from {source}
              </a>
            ) : (
              <>from {source}</>
            )}
          </span>
        ) : null}
      </dd>
    </div>
  );
}

export default function AdminImportPlayerDetail({
  loaderData,
  actionData,
}: Route.ComponentProps) {
  const { proposal, csrfToken } = loaderData;
  const error = actionData && "error" in actionData ? actionData.error : null;
  const { merged, candidates } = proposal;

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <header className="mb-6">
        <Link
          to="/admin/import-players"
          className="text-sm text-purple-700 hover:underline"
        >
          ← Back to queue
        </Link>
        <h1
          className="text-2xl font-bold text-gray-900 mt-2"
          data-testid="import-player-detail-name"
        >
          {merged.name}
        </h1>
        <p className="text-sm text-gray-600 mt-1">
          ittfid <code className="bg-gray-100 px-1">{proposal.ittfid}</code> ·
          status <code className="bg-gray-100 px-1">{proposal.status}</code>
        </p>
      </header>

      {error ? (
        <div
          className="bg-red-50 border border-red-200 text-red-700 rounded-md p-3 mb-4 text-sm"
          data-testid="import-player-detail-error"
          role="alert"
        >
          {error}
        </div>
      ) : null}

      <section
        className="bg-white rounded-lg shadow p-6 mb-6"
        data-testid="import-player-detail-merged"
      >
        <h2 className="text-lg font-semibold text-gray-900 mb-3">
          Merged fields
        </h2>
        <dl>
          {fieldRow("Name", merged.name, "wtt", merged.wtt_profile_url)}
          {fieldRow(
            "Represents",
            merged.represents,
            "wtt",
            merged.wtt_profile_url
          )}
          {fieldRow(
            "Gender",
            merged.gender === "M"
              ? "Men"
              : merged.gender === "F"
                ? "Women"
                : undefined,
            "wtt",
            merged.wtt_profile_url
          )}
          {fieldRow(
            "Handedness",
            merged.handedness,
            "ittf",
            merged.ittf_profile_url
          )}
          {fieldRow("Grip", merged.grip, "ittf", merged.ittf_profile_url)}
          {fieldRow(
            "Birth year",
            merged.birth_year,
            "ittf",
            merged.ittf_profile_url
          )}
          {fieldRow(
            "Highest rating",
            merged.highest_rating,
            "ittf",
            merged.ittf_profile_url
          )}
          {fieldRow(
            "Headshot URL",
            merged.headshot_url,
            "wtt",
            merged.wtt_profile_url
          )}
        </dl>
        {merged.headshot_url ? (
          <div className="mt-4">
            <p className="text-xs uppercase tracking-wide text-gray-500 mb-1">
              Headshot preview
            </p>
            <img
              src={merged.headshot_url}
              alt={`Headshot of ${merged.name} from WTT`}
              className="w-32 h-32 object-cover rounded-md bg-gray-100"
              referrerPolicy="no-referrer"
              data-testid="import-player-detail-headshot"
            />
          </div>
        ) : null}
      </section>

      <div className="mb-6">
        <PlayerImportRunLog entries={proposal.run_log} />
      </div>

      <section
        className="bg-white rounded-lg shadow p-6 mb-6 text-xs"
        data-testid="import-player-detail-raw"
      >
        <h2 className="text-sm font-semibold text-gray-900 mb-3">
          Per-source candidates
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <p className="font-medium text-gray-600 mb-1">WTT</p>
            <pre className="bg-gray-50 p-2 rounded overflow-auto whitespace-pre-wrap break-all">
              {candidates.wtt ? JSON.stringify(candidates.wtt, null, 2) : "—"}
            </pre>
          </div>
          <div>
            <p className="font-medium text-gray-600 mb-1">ITTF</p>
            <pre className="bg-gray-50 p-2 rounded overflow-auto whitespace-pre-wrap break-all">
              {candidates.ittf ? JSON.stringify(candidates.ittf, null, 2) : "—"}
            </pre>
          </div>
        </div>
      </section>

      <TerminalOrReviewActions proposal={proposal} csrfToken={csrfToken} />
    </div>
  );
}

// TT-207: replace the always-rendered Approve/Reject form with a
// status-aware banner. Only pending_review proposals that the
// consumer terminated as queued_for_review should still show the
// review form. Everything else gets a banner explaining what
// happened + (where relevant) a link to the live player page.
function TerminalOrReviewActions({
  proposal,
  csrfToken,
}: {
  proposal: {
    id: string;
    status: string;
    run_log: RunLogEntry[];
    applied_slug: string | null;
    applied_name: string | null;
  };
  csrfToken: string;
}) {
  // Mirror admin.import-players._index.tsx's classifier — terminal
  // statuses pass through, pending_review fans out by last run_log
  // step.
  const last = proposal.run_log[proposal.run_log.length - 1];

  if (proposal.status === "auto_applied" || proposal.status === "applied") {
    const label =
      proposal.status === "auto_applied" ? "Auto-applied" : "Approved";
    return (
      <section
        className="bg-green-50 border border-green-200 rounded-md p-4 flex items-baseline justify-between gap-3"
        data-testid="import-player-banner-applied"
      >
        <div>
          <p className="text-sm font-semibold text-green-900">
            ✓ {label} — this player is live
          </p>
          <p className="text-xs text-green-800 mt-1">
            No further action needed. The proposal stays here as an audit trail.
          </p>
        </div>
        {proposal.applied_slug ? (
          <Link
            to={`/players/${proposal.applied_slug}`}
            className="inline-flex items-center shrink-0 px-3 py-1.5 bg-green-700 text-white text-xs font-medium rounded-md hover:bg-green-800"
            data-testid="import-player-banner-view"
          >
            View player →
          </Link>
        ) : null}
      </section>
    );
  }

  if (proposal.status === "rejected") {
    return (
      <section
        className="bg-gray-50 border border-gray-200 rounded-md p-4 text-sm text-gray-700"
        data-testid="import-player-banner-rejected"
      >
        <p className="font-semibold">Rejected</p>
        <p className="text-xs mt-1 text-gray-600">
          No player row was materialised. The proposal stays here as an audit
          trail.
        </p>
      </section>
    );
  }

  // pending_review — distinguish "still working" from "needs you".
  if (!last || last.step === "roster_match") {
    return (
      <section
        className="bg-blue-50 border border-blue-200 rounded-md p-4 text-sm text-blue-900"
        data-testid="import-player-banner-enqueued"
      >
        <p className="font-semibold">Enqueued — waiting for the importer</p>
        <p className="text-xs mt-1 text-blue-800">
          The consumer hasn't picked this message up yet. Refresh in a minute or
          two; if it's still here later, check Worker logs.
        </p>
      </section>
    );
  }

  if (last.step !== "terminal") {
    return (
      <section
        className="bg-blue-50 border border-blue-200 rounded-md p-4 text-sm text-blue-900"
        data-testid="import-player-banner-processing"
      >
        <p className="font-semibold">
          Processing — partway through the pipeline
        </p>
        <p className="text-xs mt-1 text-blue-800">
          The consumer started but didn't reach a terminal verdict. This is
          rare; refresh shortly.
        </p>
      </section>
    );
  }

  if (last.status !== "queued_for_review") {
    // terminal: retry / error — still pending_review on the row but the
    // last consumer pass didn't terminate cleanly. Show a banner that
    // makes the failure obvious; reject is still allowed.
    return (
      <section
        className="space-y-3"
        data-testid="import-player-banner-terminal-failed"
      >
        <div className="bg-amber-50 border border-amber-200 rounded-md p-4 text-sm text-amber-900">
          <p className="font-semibold">
            Consumer hit a {last.status === "retry" ? "transient" : "hard"}{" "}
            error
          </p>
          <p className="text-xs mt-1 text-amber-800">
            See the run log above for the cause. The proposal will retry
            automatically; you can also reject it manually.
          </p>
        </div>
        <Form method="post" className="flex items-center gap-3">
          <input type="hidden" name="_csrf" value={csrfToken} />
          <button
            type="submit"
            name="intent"
            value="reject"
            className="inline-flex items-center px-4 py-2 bg-white border border-gray-300 text-gray-700 text-sm font-medium rounded-md hover:bg-gray-50"
            data-testid="import-player-reject"
          >
            Reject
          </button>
        </Form>
      </section>
    );
  }

  // The actionable case: terminal=queued_for_review. Show the full
  // approve/reject form, plus (TT-208) a Retry photo button when the
  // merge entry's missing_fields is exactly ["headshot_url"] — that's
  // the "outlier flake" case where everything else is good and a
  // single re-fetch should auto-finalise.
  const merge = proposal.run_log.find(e => e.step === "merge");
  const missing =
    merge?.step === "merge" && Array.isArray(merge.missing_fields)
      ? merge.missing_fields
      : [];
  const photoOnlyMiss = missing.length === 1 && missing[0] === "headshot_url";
  return (
    <Form
      method="post"
      className="flex items-center gap-3"
      data-testid="import-player-review-form"
    >
      <input type="hidden" name="_csrf" value={csrfToken} />
      <button
        type="submit"
        name="intent"
        value="approve"
        className="inline-flex items-center px-4 py-2 bg-purple-600 text-white text-sm font-medium rounded-md hover:bg-purple-700"
        data-testid="import-player-approve"
      >
        Approve
      </button>
      {photoOnlyMiss ? (
        <button
          type="submit"
          name="intent"
          value="retry-photo"
          className="inline-flex items-center px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700"
          data-testid="import-player-retry-photo"
          title="Re-run the headshot fetch + R2 upload. On success the proposal auto-finalises."
        >
          Retry photo
        </button>
      ) : null}
      <button
        type="submit"
        name="intent"
        value="reject"
        className="inline-flex items-center px-4 py-2 bg-white border border-gray-300 text-gray-700 text-sm font-medium rounded-md hover:bg-gray-50"
        data-testid="import-player-reject"
      >
        Reject
      </button>
    </Form>
  );
}
